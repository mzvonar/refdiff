import { describe, expect, it } from "vitest";

import {
  anchorFor,
  createAnnotation,
  describeAnchor,
  digestSvg,
  digestText,
  editNote,
  emptySet,
  parseAnnotationSet,
  reproject,
  reprojectAll,
  resolveAnchor,
  setReply,
  snapToElement,
  transition,
  type Annotation,
  type AnnotationSet,
  type ElementLike,
} from "../src/annotations.js";

const T0 = "2026-08-27T10:00:00.000Z";
const T1 = "2026-08-27T10:05:00.000Z";
const T2 = "2026-08-27T10:10:00.000Z";

const elements: ElementLike[] = [
  { id: "div-0", box: { x: 0, y: 0, w: 400, h: 300 }, role: "box" },
  { id: "button-1", box: { x: 100, y: 100, w: 80, h: 32 }, role: "text", text: "Save" },
  { id: "span-2", box: { x: 112, y: 108, w: 40, h: 16 }, role: "text", text: "Save" },
  { id: "svg-3", box: { x: 300, y: 20, w: 16, h: 16 }, role: "icon" },
];

const note = (over: Partial<Annotation> = {}): Annotation => ({
  id: "a1",
  side: "impl",
  shape: { kind: "point", x: 120, y: 110 },
  anchor: { elementId: "span-2", role: "text", text: "Save", box: { x: 112, y: 108, w: 40, h: 16 } },
  note: "Make the label bolder",
  status: "open",
  createdAt: T0,
  updatedAt: T0,
  ...over,
});

describe("snapToElement / anchorFor", () => {
  it("points take the smallest element under them; regions take the element they outline best", () => {
    expect(snapToElement({ kind: "point", x: 120, y: 110 }, elements)?.id).toBe("span-2");
    // A loose rectangle around the button: its centre is over the label, but the
    // button has the largest overlap → the button.
    expect(snapToElement({ kind: "rect", x: 95, y: 95, w: 90, h: 40 }, elements)?.id).toBe("button-1");
    // A tight rectangle over the label picks the label.
    expect(snapToElement({ kind: "rect", x: 110, y: 106, w: 44, h: 20 }, elements)?.id).toBe("span-2");
    // A region over nothing falls back to the point rule (nearest).
    expect(snapToElement({ kind: "rect", x: 320, y: 30, w: 10, h: 10 }, elements.filter((e) => e.id !== "div-0"))?.id).toBe("svg-3");
  });

  it("falls back to the nearest element within the snap distance, else none", () => {
    expect(snapToElement({ kind: "point", x: 330, y: 28 }, elements.filter((e) => e.id !== "div-0"))?.id).toBe("svg-3");
    expect(snapToElement({ kind: "point", x: 900, y: 900 }, elements)).toBeUndefined();
  });

  it("never anchors to a backdrop — it contains everything and outlines nothing", () => {
    const withBackdrop: ElementLike[] = [{ id: "div-bd", box: { x: 0, y: 0, w: 760, h: 740 }, role: "backdrop" }, ...elements.filter((e) => e.id !== "div-0")];
    // Empty space: only the backdrop contains the point → no anchor (not the backdrop).
    expect(snapToElement({ kind: "point", x: 600, y: 600 }, withBackdrop)).toBeUndefined();
    // Near the icon: the icon wins over the containing backdrop.
    expect(snapToElement({ kind: "point", x: 330, y: 28 }, withBackdrop)?.id).toBe("svg-3");
    expect(snapToElement({ kind: "rect", x: 0, y: 0, w: 760, h: 740 }, withBackdrop)?.id).toBe("button-1");
  });

  it("records identity AND box in the anchor and describes it for humans", () => {
    const a = anchorFor({ kind: "point", x: 120, y: 110 }, elements)!;
    expect(a).toEqual({ elementId: "span-2", role: "text", text: "Save", box: { x: 112, y: 108, w: 40, h: 16 } });
    expect(describeAnchor(a)).toBe("text “Save” at 112,108 40×16");
    expect(describeAnchor(undefined)).toBe("no element nearby");
  });

  it("createAnnotation snaps and starts open", () => {
    const a = createAnnotation({ id: "n1", side: "design", shape: { kind: "point", x: 305, y: 25 }, note: "icon too small", now: T0 }, elements);
    expect(a).toMatchObject({ status: "open", side: "design", anchor: { elementId: "svg-3" }, createdAt: T0, updatedAt: T0 });
  });
});

describe("state machine", () => {
  it("open → implemented → done, and reopen from either", () => {
    const a = note();
    const impl = transition(a, "implement", T1);
    expect(impl).toMatchObject({ status: "implemented", implementedAt: T1, updatedAt: T1 });
    const done = transition(impl, "done", T2);
    expect(done).toMatchObject({ status: "done", implementedAt: T1, doneAt: T2 });
    const reopened = transition(done, "reopen", T2);
    expect(reopened.status).toBe("open");
    expect(reopened.implementedAt).toBeUndefined();
    expect(reopened.doneAt).toBeUndefined();
  });

  it("ignores actions that do not apply and never mutates the input", () => {
    const a = note();
    expect(transition(a, "reopen", T1)).toBe(a);
    const done = transition(a, "done", T1);
    expect(transition(done, "implement", T2)).toBe(done); // a done note is not re-claimed
    expect(a.status).toBe("open");
  });

  it("keeps the model's reply (gap 19): set, cleared when empty, kept across a later instruction", () => {
    const impl = transition(note(), "implement", T1);
    const replied = setReply(impl, "  Bumped the weight to 600.  ", T2);
    expect(replied).toMatchObject({ reply: "Bumped the weight to 600.", updatedAt: T2, status: "implemented" });
    expect(setReply(replied, "Bumped the weight to 600.", T2)).toBe(replied);
    // The designer sends another instruction: the note reopens, the reply stays as history.
    const again = editNote(replied, "Make the label bolder — and larger", T2);
    expect(again).toMatchObject({ status: "open", reply: "Bumped the weight to 600." });
    const cleared = setReply(replied, "", T2);
    expect(cleared.reply).toBeUndefined();
    expect(cleared.status).toBe("implemented");
  });

  it("editing the note of an implemented annotation reopens it (the spec changed)", () => {
    const impl = transition(note(), "implement", T1);
    const edited = editNote(impl, "Make the label bolder AND larger", T2);
    expect(edited).toMatchObject({ status: "open", note: "Make the label bolder AND larger", updatedAt: T2 });
    expect(edited.implementedAt).toBeUndefined();
    expect(editNote(impl, impl.note, T2)).toBe(impl);
    const done = transition(note(), "done", T1);
    expect(editNote(done, "x", T2).status).toBe("done");
  });
});

describe("reprojection through element identity", () => {
  it("resolves by id when the text agrees, by text otherwise, by geometry for textless leaves", () => {
    const moved: ElementLike[] = [
      { id: "div-0", box: { x: 0, y: 0, w: 400, h: 300 }, role: "box" },
      { id: "button-1", box: { x: 100, y: 140, w: 80, h: 32 }, role: "text", text: "Save" },
      { id: "span-2", box: { x: 112, y: 148, w: 40, h: 16 }, role: "text", text: "Save" },
      { id: "svg-3", box: { x: 304, y: 24, w: 16, h: 16 }, role: "icon" },
    ];
    expect(resolveAnchor(note().anchor!, moved)?.id).toBe("span-2");
    // ids renumbered: span-2 is now a different text → fall back to the same text, nearest.
    const renumbered: ElementLike[] = [
      { id: "span-2", box: { x: 10, y: 10, w: 30, h: 12 }, role: "text", text: "Cancel" },
      { id: "span-9", box: { x: 112, y: 148, w: 40, h: 16 }, role: "text", text: "Save" },
    ];
    expect(resolveAnchor(note().anchor!, renumbered)?.id).toBe("span-9");
    // textless: nearest same-role box within drift; too far → undefined.
    const icon = { elementId: "svg-3", role: "icon", box: { x: 300, y: 20, w: 16, h: 16 } };
    expect(resolveAnchor(icon, moved)?.id).toBe("svg-3");
    expect(resolveAnchor(icon, [{ id: "svg-7", box: { x: 600, y: 600, w: 16, h: 16 }, role: "icon" }])).toBeUndefined();
  });

  it("moves the shape by the element's delta and refreshes the anchor; marks orphans stale", () => {
    const a = note({ shape: { kind: "rect", x: 110, y: 106, w: 50, h: 20 } });
    const moved = reproject(a, [{ id: "span-4", box: { x: 212, y: 158, w: 40, h: 16 }, role: "text", text: "Save" }]);
    expect(moved.shape).toEqual({ kind: "rect", x: 210, y: 156, w: 50, h: 20 });
    expect(moved.anchor).toEqual({ elementId: "span-4", role: "text", text: "Save", box: { x: 212, y: 158, w: 40, h: 16 } });
    expect(moved.stale).toBeUndefined();
    const orphan = reproject(a, []);
    expect(orphan.stale).toBe(true);
    expect(orphan.shape).toEqual(a.shape); // keeps its last known place
    // Unchanged capture → the very same object (no spurious writes).
    expect(reproject(a, elements)).toBe(a);
    const set: AnnotationSet = { ...emptySet("p"), annotations: [a] };
    expect(reprojectAll(set, { design: [], impl: elements })).toBe(set);
    expect(reprojectAll(set, { design: [], impl: [] }).annotations[0]!.stale).toBe(true);
  });
});

describe("parseAnnotationSet", () => {
  it("accepts a round-tripped set and rejects malformed input with a located error", () => {
    const set: AnnotationSet = { ...emptySet("doc-detail"), annotations: [note(), transition(note({ id: "a2", side: "design", shape: { kind: "rect", x: 1, y: 2, w: 3, h: 4 } }), "done", T1)] };
    const parsed = parseAnnotationSet(JSON.parse(JSON.stringify(set)), "doc-detail");
    expect(parsed).toEqual({ ok: true, value: set });
    expect(parseAnnotationSet({ version: 1, pair: "other", annotations: [] }, "doc-detail")).toMatchObject({ ok: false });
    expect(parseAnnotationSet({ version: 2, pair: "p", annotations: [] })).toMatchObject({ ok: false });
    expect(parseAnnotationSet({ version: 1, pair: "p", annotations: [{ id: "x" }] })).toMatchObject({ ok: false, error: expect.stringContaining("annotations[0]") });
    expect(parseAnnotationSet({ version: 1, pair: "p", annotations: [note(), note()] })).toMatchObject({ ok: false, error: expect.stringContaining("duplicates") });
    // Unknown fields are dropped, not kept — the reply is a known one (gap 28: the fixture's
    // replies used to vanish on the first PUT from the browser).
    const loose = parseAnnotationSet({ version: 1, pair: "p", annotations: [{ ...note(), extra: 1, reply: "done it" }] });
    expect(loose.ok && "extra" in loose.value.annotations[0]!).toBe(false);
    expect(loose.ok && loose.value.annotations[0]!.reply).toBe("done it");
  });
});

describe("digest", () => {
  const set: AnnotationSet = {
    ...emptySet("figma-button-fill-default"),
    annotations: [
      note({ id: "n1", note: "Use Montserrat here" }),
      setReply(transition(note({ id: "n2", side: "design", shape: { kind: "rect", x: 10, y: 20, w: 30, h: 40 }, anchor: undefined, note: "whole button" }), "implement", T1), "Made the whole button fluid.", T1),
      transition(note({ id: "n3", stale: true, note: "" }), "done", T1),
    ],
  };

  it("writes a numbered, status-grouped text digest whose numbers match the markers", () => {
    const text = digestText(set, { runCreatedAt: T0 });
    expect(text).toContain("1 open · 1 implemented · 1 done · run " + T0);
    expect(text).toContain("## open (1)\n\n1. [n1] impl · point 120,110 · text “Save” at 112,108 40×16\n   Use Montserrat here");
    expect(text).toContain("## implemented (1)\n\n2. [n2] design · region 10,20 30×40 · no element nearby\n   whole button\n   ↳ reply: Made the whole button fluid.");
    expect(text).toContain("3. [n3] impl · point 120,110 · text “Save” at 112,108 40×16 (STALE: element not found in the current capture)\n   (no text)");
    expect(text).toContain("--mark-implemented <id,…> --reply");
  });

  it("draws only that side's annotations, at native resolution through toNative", () => {
    const toNative = (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 });
    const impl = digestSvg(set, "impl", { w: 800, h: 600 }, toNative, 2);
    expect(impl).toContain('<circle cx="240" cy="220"');
    expect(impl).toContain(">1</text>");
    expect(impl).toContain(">3</text>");
    expect(impl).not.toContain(">2</text>");
    expect(impl).toContain('stroke-dasharray="4 3"'); // the stale one
    const design = digestSvg(set, "design", { w: 800, h: 600 }, toNative);
    expect(design).toContain('<rect x="20" y="40" width="60" height="80"');
    expect(design).toContain(">2</text>");
    expect(design).not.toContain(">1</text>");
    expect(design.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"')).toBe(true);
  });
});
