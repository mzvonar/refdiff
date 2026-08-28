/**
 * Pure annotation model for the split-screen viewer.
 *
 * A human drops a note (point) or a region (rect) on EITHER pane. The shape is
 * stored in world space (impl CSS px — the space every Finding box uses) and
 * snapped to the nearest leaf `ElementNode` of that side from `elements.json`
 * (both trees there are already in world space). The anchor keeps the element's
 * identity (id, role, text) AND its box, so a later recapture re-projects the
 * note through element identity instead of fragile geometry.
 *
 * State machine (population-registry annotator, kept): `open` (designer wrote
 * it) → `implemented` (the agent claims it acted) → `done` (designer verified).
 * Editing the note resets `implemented` to `open` — the spec changed.
 *
 * This module is compiled to plain JS with no imports and embedded verbatim
 * into report.html (see render.ts), and imported normally by cli.ts — keep it
 * free of runtime dependencies. Types are structural copies of core's.
 */

export type Side = "design" | "impl";
export type AnnotationStatus = "open" | "implemented" | "done";

export interface ABox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointShape {
  kind: "point";
  x: number;
  y: number;
}
export interface RectShape extends ABox {
  kind: "rect";
}
export type Shape = PointShape | RectShape;

/** The leaf the shape was dropped on — identity AND geometry at annotation time. */
export interface Anchor {
  elementId: string;
  role?: string;
  text?: string;
  /** Element box in world space when the anchor was taken. */
  box: ABox;
}

export interface Annotation {
  id: string;
  side: Side;
  shape: Shape;
  anchor?: Anchor;
  note: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt: string;
  implementedAt?: string;
  doneAt?: string;
  /** Set by `reproject` when the anchor is missing from the current elements. */
  stale?: boolean;
  /**
   * The model's answer to the note (plan, gap 19): what it did, or why not —
   * written by `--mark-implemented … --reply`, shown under the comment as the
   * comps draw it. A later instruction (`Send`) keeps the reply as history.
   */
  reply?: string;
}

export interface AnnotationSet {
  version: 1;
  pair: string;
  annotations: Annotation[];
}

/** Structural copy of core's ElementNode — the parts the anchor logic reads. */
export interface ElementLike {
  id: string;
  box: ABox;
  role?: string;
  text?: string;
}

export type ParseResult = { ok: true; value: AnnotationSet } | { ok: false; error: string };

export const STATUSES: readonly AnnotationStatus[] = ["open", "implemented", "done"];

export const emptySet = (pair: string): AnnotationSet => ({ version: 1, pair, annotations: [] });

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isBox = (v: unknown): v is ABox => isRecord(v) && isNum(v["x"]) && isNum(v["y"]) && isNum(v["w"]) && isNum(v["h"]);

function parseShape(v: unknown): Shape | undefined {
  if (!isRecord(v)) return undefined;
  if (v["kind"] === "point" && isNum(v["x"]) && isNum(v["y"])) return { kind: "point", x: v["x"], y: v["y"] };
  if (v["kind"] === "rect" && isBox(v)) return { kind: "rect", x: v.x, y: v.y, w: v.w, h: v.h };
  return undefined;
}

function parseAnchor(v: unknown): Anchor | undefined {
  if (!isRecord(v) || typeof v["elementId"] !== "string" || !isBox(v["box"])) return undefined;
  const a: Anchor = { elementId: v["elementId"], box: { x: v["box"].x, y: v["box"].y, w: v["box"].w, h: v["box"].h } };
  if (typeof v["role"] === "string") a.role = v["role"];
  if (typeof v["text"] === "string") a.text = v["text"];
  return a;
}

/**
 * Validate untrusted JSON (a PUT body, a file on disk) into an AnnotationSet.
 * Unknown fields are dropped, bad entries are an error — never a half-set.
 */
export function parseAnnotationSet(raw: unknown, pair?: string): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "annotation set must be an object" };
  if (raw["version"] !== 1) return { ok: false, error: "unsupported annotation set version " + String(raw["version"]) };
  if (typeof raw["pair"] !== "string") return { ok: false, error: "annotation set needs a pair id" };
  if (pair !== undefined && raw["pair"] !== pair) return { ok: false, error: "annotation set is for pair " + raw["pair"] + ", not " + pair };
  if (!Array.isArray(raw["annotations"])) return { ok: false, error: "annotations must be an array" };
  const out: Annotation[] = [];
  const seen = new Set<string>();
  for (const [i, v] of (raw["annotations"] as unknown[]).entries()) {
    const where = "annotations[" + i + "]";
    if (!isRecord(v)) return { ok: false, error: where + " must be an object" };
    if (typeof v["id"] !== "string" || v["id"] === "") return { ok: false, error: where + " needs an id" };
    if (seen.has(v["id"])) return { ok: false, error: where + " duplicates id " + v["id"] };
    seen.add(v["id"]);
    if (v["side"] !== "design" && v["side"] !== "impl") return { ok: false, error: where + " side must be design|impl" };
    const shape = parseShape(v["shape"]);
    if (!shape) return { ok: false, error: where + " has no valid shape (point x,y | rect x,y,w,h)" };
    if (typeof v["note"] !== "string") return { ok: false, error: where + " needs a note string" };
    if (!STATUSES.includes(v["status"] as AnnotationStatus)) return { ok: false, error: where + " status must be open|implemented|done" };
    if (typeof v["createdAt"] !== "string" || typeof v["updatedAt"] !== "string") return { ok: false, error: where + " needs createdAt/updatedAt" };
    const a: Annotation = {
      id: v["id"],
      side: v["side"],
      shape,
      note: v["note"],
      status: v["status"] as AnnotationStatus,
      createdAt: v["createdAt"],
      updatedAt: v["updatedAt"],
    };
    const anchor = parseAnchor(v["anchor"]);
    if (anchor) a.anchor = anchor;
    if (typeof v["implementedAt"] === "string") a.implementedAt = v["implementedAt"];
    if (typeof v["doneAt"] === "string") a.doneAt = v["doneAt"];
    if (v["stale"] === true) a.stale = true;
    if (typeof v["reply"] === "string" && v["reply"] !== "") a.reply = v["reply"];
    out.push(a);
  }
  return { ok: true, value: { version: 1, pair: raw["pair"], annotations: out } };
}

/* ------------------------------------------------------------ geometry -- */

export const shapeBox = (s: Shape): ABox => (s.kind === "point" ? { x: s.x, y: s.y, w: 0, h: 0 } : { x: s.x, y: s.y, w: s.w, h: s.h });

export const shapeCenter = (s: Shape): { x: number; y: number } =>
  s.kind === "point" ? { x: s.x, y: s.y } : { x: s.x + s.w / 2, y: s.y + s.h / 2 };

const contains = (b: ABox, p: { x: number; y: number }): boolean => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Euclidean distance from a point to a box (0 when inside). */
export function boxDistance(b: ABox, p: { x: number; y: number }): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

const area = (b: ABox): number => Math.max(b.w, 0.5) * Math.max(b.h, 0.5);

/** Intersection-over-union of two boxes (0 when disjoint or degenerate). */
export function iou(a: ABox, b: ABox): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  if (inter <= 0) return 0;
  return inter / (a.w * a.h + b.w * b.h - inter);
}

/**
 * The leaf a shape refers to. A region → the element it outlines best
 * (largest intersection-over-union, so a loose rectangle around a button
 * means the button, not the label under its centre). A point (or a region
 * overlapping nothing) → the SMALLEST element containing the centre, else
 * the nearest one within `maxDistance` world px. Nothing close → no anchor
 * (the note keeps its raw position).
 */
export function snapToElement<T extends ElementLike>(shape: Shape, candidates: readonly T[], maxDistance = 48): T | undefined {
  const c = shapeCenter(shape);
  // A viewport-filling backdrop/scrim contains every point and outlines nothing — never an anchor.
  const elements = candidates.filter((el) => el.role !== "backdrop");
  let best: T | undefined;
  if (shape.kind === "rect" && shape.w > 0 && shape.h > 0) {
    let bestIou = 0;
    for (const el of elements) {
      const v = iou(shape, el.box);
      if (v > bestIou) {
        bestIou = v;
        best = el;
      }
    }
    if (best) return best;
  }
  let bestArea = Infinity;
  for (const el of elements) {
    if (contains(el.box, c) && area(el.box) < bestArea) {
      best = el;
      bestArea = area(el.box);
    }
  }
  if (best) return best;
  let bestDist = maxDistance;
  for (const el of elements) {
    const d = boxDistance(el.box, c);
    if (d <= bestDist) {
      bestDist = d;
      best = el;
    }
  }
  return best;
}

export function anchorOf(el: ElementLike): Anchor {
  const a: Anchor = { elementId: el.id, box: { ...el.box } };
  if (el.role !== undefined) a.role = el.role;
  if (el.text !== undefined) a.text = el.text;
  return a;
}

export function anchorFor(shape: Shape, elements: readonly ElementLike[], maxDistance = 48): Anchor | undefined {
  void iou;
  const el = snapToElement(shape, elements, maxDistance);
  return el ? anchorOf(el) : undefined;
}

const r0 = (n: number): number => Math.round(n);

export function describeAnchor(a: Anchor | undefined): string {
  if (!a) return "no element nearby";
  const what = a.text !== undefined ? (a.role ?? "text") + " “" + (a.text.length > 40 ? a.text.slice(0, 37) + "…" : a.text) + "”" : (a.role ?? "element") + " " + a.elementId;
  return what + " at " + r0(a.box.x) + "," + r0(a.box.y) + " " + r0(a.box.w) + "×" + r0(a.box.h);
}

/* ------------------------------------------------------- state machine -- */

export type Action = "implement" | "done" | "reopen";

/**
 * open → implemented (agent) → done (designer). `reopen` sends anything back
 * to open. Actions that do not apply return the annotation unchanged, so a
 * stale click is never an error.
 */
export function transition(a: Annotation, action: Action, now: string): Annotation {
  switch (action) {
    case "implement":
      if (a.status !== "open") return a;
      return { ...a, status: "implemented", implementedAt: now, updatedAt: now };
    case "done":
      if (a.status === "done") return a;
      return { ...a, status: "done", doneAt: now, updatedAt: now };
    case "reopen": {
      if (a.status === "open") return a;
      const { implementedAt: _i, doneAt: _d, ...rest } = a;
      void _i;
      void _d;
      return { ...rest, status: "open", updatedAt: now };
    }
  }
}

/** Editing the text changes the spec: an `implemented` note goes back to open. */
export function editNote(a: Annotation, note: string, now: string): Annotation {
  if (note === a.note) return a;
  if (a.status === "implemented") {
    const { implementedAt: _i, ...rest } = a;
    void _i;
    return { ...rest, note, status: "open", updatedAt: now };
  }
  return { ...a, note, updatedAt: now };
}

/** The model's reply to a note. An empty reply clears it. */
export function setReply(a: Annotation, reply: string, now: string): Annotation {
  const trimmed = reply.trim();
  if ((a.reply ?? "") === trimmed) return a;
  if (trimmed === "") {
    const { reply: _r, ...rest } = a;
    void _r;
    return { ...rest, updatedAt: now };
  }
  return { ...a, reply: trimmed, updatedAt: now };
}

export function createAnnotation(
  input: { id: string; side: Side; shape: Shape; note: string; now: string },
  elements: readonly ElementLike[] = [],
): Annotation {
  const anchor = anchorFor(input.shape, elements);
  return {
    id: input.id,
    side: input.side,
    shape: input.shape,
    ...(anchor ? { anchor } : {}),
    note: input.note,
    status: "open",
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/* -------------------------------------------------------- reprojection -- */

/**
 * Find the element an anchor refers to in a NEW capture: same id with the
 * same text (ids are sequence numbers — only trusted when the text agrees),
 * else the closest element with the same text and role, else the closest one
 * with the same role within `maxDrift` px of the remembered box.
 */
export function resolveAnchor<T extends ElementLike>(anchor: Anchor, elements: readonly T[], maxDrift = 40): T | undefined {
  const c = { x: anchor.box.x + anchor.box.w / 2, y: anchor.box.y + anchor.box.h / 2 };
  const nearest = (cands: readonly T[], limit: number): T | undefined => {
    let best: T | undefined;
    let bestD = limit;
    for (const el of cands) {
      const d = Math.hypot(el.box.x + el.box.w / 2 - c.x, el.box.y + el.box.h / 2 - c.y);
      if (d <= bestD) {
        bestD = d;
        best = el;
      }
    }
    return best;
  };
  const byId = elements.find((e) => e.id === anchor.elementId);
  if (byId && byId.text === anchor.text && (anchor.text !== undefined || byId.role === anchor.role)) return byId;
  if (anchor.text !== undefined) {
    const sameText = elements.filter((e) => e.text === anchor.text && (anchor.role === undefined || e.role === anchor.role));
    if (sameText.length === 1) return sameText[0];
    const n = nearest(sameText, Infinity);
    if (n) return n;
  }
  return nearest(
    elements.filter((e) => e.text === undefined && (anchor.role === undefined || e.role === anchor.role)),
    maxDrift,
  );
}

/** Move a shape by the delta between the remembered anchor box and the element's current box. */
export function reproject(a: Annotation, elements: readonly ElementLike[]): Annotation {
  if (!a.anchor) return a;
  const el = resolveAnchor(a.anchor, elements);
  if (!el) return a.stale ? a : { ...a, stale: true };
  const dx = el.box.x - a.anchor.box.x;
  const dy = el.box.y - a.anchor.box.y;
  const moved = dx !== 0 || dy !== 0;
  const shape: Shape = moved ? (a.shape.kind === "point" ? { ...a.shape, x: a.shape.x + dx, y: a.shape.y + dy } : { ...a.shape, x: a.shape.x + dx, y: a.shape.y + dy }) : a.shape;
  const anchor = anchorOf(el);
  const same = !moved && !a.stale && anchor.elementId === a.anchor.elementId && anchor.box.w === a.anchor.box.w && anchor.box.h === a.anchor.box.h;
  if (same) return a;
  const { stale: _s, ...rest } = a;
  void _s;
  return { ...rest, shape, anchor };
}

export function reprojectAll(set: AnnotationSet, elements: { design: readonly ElementLike[]; impl: readonly ElementLike[] }): AnnotationSet {
  const annotations = set.annotations.map((a) => reproject(a, elements[a.side]));
  return annotations.every((a, i) => a === set.annotations[i]) ? set : { ...set, annotations };
}

/* ------------------------------------------------------------- digest -- */

export const counts = (set: AnnotationSet): Record<AnnotationStatus, number> =>
  set.annotations.reduce((acc, a) => ({ ...acc, [a.status]: acc[a.status] + 1 }), { open: 0, implemented: 0, done: 0 });

const shapeText = (s: Shape): string =>
  s.kind === "point" ? "point " + r0(s.x) + "," + r0(s.y) : "region " + r0(s.x) + "," + r0(s.y) + " " + r0(s.w) + "×" + r0(s.h);

/**
 * The model-facing text digest: one numbered line per annotation (the number
 * matches the marker on the digest PNGs), grouped open → implemented → done.
 * Coordinates are world = impl CSS px, like every Finding box.
 */
export function digestText(set: AnnotationSet, meta: { runCreatedAt?: string; designPng?: string; implPng?: string } = {}): string {
  const c = counts(set);
  const lines: string[] = [
    "# Annotations — " + set.pair,
    "",
    c.open + " open · " + c.implemented + " implemented · " + c.done + " done" + (meta.runCreatedAt ? " · run " + meta.runCreatedAt : ""),
    "",
    "Numbers match the markers on " + (meta.designPng ?? "annotations-design.png") + " / " + (meta.implPng ?? "annotations-impl.png") + ". Coordinates are impl CSS px (world space).",
    "Act on `open` notes, then mark them: refdiff-annotator <run-dir> --mark-implemented <id,…> --reply \"what you did\". The designer closes them as done.",
    "",
  ];
  for (const status of STATUSES) {
    const items = set.annotations.map((a, i) => [a, i + 1] as const).filter(([a]) => a.status === status);
    if (items.length === 0) continue;
    lines.push("## " + status + " (" + items.length + ")", "");
    for (const [a, n] of items) {
      lines.push(
        n + ". [" + a.id + "] " + a.side + " · " + shapeText(a.shape) + " · " + describeAnchor(a.anchor) + (a.stale ? " (STALE: element not found in the current capture)" : ""),
      );
      lines.push("   " + (a.note.trim() === "" ? "(no text)" : a.note.trim().replace(/\r?\n/g, "\n   ")));
      if (a.reply) lines.push("   ↳ reply: " + a.reply.replace(/\r?\n/g, "\n     "));
      lines.push("");
    }
  }
  return lines.join("\n");
}

export const STATUS_COLORS: Record<AnnotationStatus, string> = { open: "#a855f7", implemented: "#f59e0b", done: "#22c55e" };

/**
 * SVG markup for one side's digest overlay at native PNG resolution. `toNative`
 * maps world → that PNG's pixel space (the design side goes through the
 * inverse Alignment and its DPR; the impl side through its DPR only).
 */
export function digestSvg(
  set: AnnotationSet,
  side: Side,
  size: { w: number; h: number },
  toNative: (p: { x: number; y: number }) => { x: number; y: number },
  scale = 1,
): string {
  const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch] ?? ch);
  const parts: string[] = [];
  set.annotations.forEach((a, i) => {
    if (a.side !== side) return;
    const color = STATUS_COLORS[a.status];
    const n = String(i + 1);
    const sw = 2 * scale;
    let lx: number;
    let ly: number;
    if (a.shape.kind === "rect") {
      const p = toNative({ x: a.shape.x, y: a.shape.y });
      const q = toNative({ x: a.shape.x + a.shape.w, y: a.shape.y + a.shape.h });
      parts.push(
        '<rect x="' + p.x + '" y="' + p.y + '" width="' + Math.max(q.x - p.x, 1) + '" height="' + Math.max(q.y - p.y, 1) + '" fill="' + color + '" fill-opacity="0.12" stroke="' + color + '" stroke-width="' + sw + '"' + (a.stale ? ' stroke-dasharray="6 4"' : "") + "/>",
      );
      lx = p.x;
      ly = p.y;
    } else {
      const p = toNative({ x: a.shape.x, y: a.shape.y });
      parts.push('<circle cx="' + p.x + '" cy="' + p.y + '" r="' + 7 * scale + '" fill="' + color + '" fill-opacity="0.35" stroke="' + color + '" stroke-width="' + sw + '"' + (a.stale ? ' stroke-dasharray="4 3"' : "") + "/>");
      lx = p.x + 9 * scale;
      ly = p.y - 9 * scale;
    }
    const w = (10 + 7 * n.length) * scale;
    const h = 16 * scale;
    parts.push(
      '<rect x="' + lx + '" y="' + (ly - h) + '" width="' + w + '" height="' + h + '" rx="' + 3 * scale + '" fill="' + color + '"/>' +
        '<text x="' + (lx + w / 2) + '" y="' + (ly - 4 * scale) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="' + 11 * scale + '" fill="#fff">' + esc(n) + "</text>",
    );
  });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size.w + '" height="' + size.h + '" viewBox="0 0 ' + size.w + " " + size.h + '">' + parts.join("") + "</svg>";
}
