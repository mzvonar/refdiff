/**
 * The focus region: a rectangle of the shared world space (impl CSS px) that scopes what the
 * annotator lists and draws — "work in the content column, never mind the sidebar".
 *
 * It is persisted per run dir (focus.json) and digested (focus.md) for one reason: so a person can
 * point at a region on their phone and then say "work in the focused region" to the agent, which
 * reads the SAME rectangle and the findings inside it. A region that lives only in the browser's
 * memory cannot be handed over.
 *
 * Pure and import-free like the other embedded modules, so the browser and the CLI agree on which
 * findings a region contains — the alternative is two overlap tests that drift.
 */

export interface FocusRect {
  x: number
  y: number
  w: number
  h: number
}

export interface FocusSet {
  version: 1
  pair: string
  /** null = no region; the whole capture is in scope. */
  region: FocusRect | null
  /** What the person calls this region ("content", "row 3") — free text, may be empty. */
  label: string
  updatedAt: string
}

/**
 * Corner handles, in the order they are drawn, plus the `move` grip. Editing a drawn region beats
 * redrawing it. The corners sit OUTSIDE the rectangle (see `handlePoints`) so they never cover the
 * content the region exists to show; the grip is in the centre, where a thumb expects it, and is
 * only ever on screen while the region is being adjusted.
 */
export const FOCUS_HANDLES = ["nw", "ne", "se", "sw", "move"] as const
export type FocusHandle = (typeof FOCUS_HANDLES)[number]

export const emptyFocus = (pair: string): FocusSet => ({
  version: 1,
  pair,
  region: null,
  label: "",
  updatedAt: new Date(0).toISOString(),
})

/** Normalised: a drag that ends up-left of where it started is still a rectangle. */
export function rectFromCorners(
  a: { x: number; y: number },
  b: { x: number; y: number },
): FocusRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/**
 * How much of a box the region must cover for the box to be IN the region.
 *
 * Any-touch was the first rule and it read as a broken filter: a full-width row that merely runs
 * THROUGH the region is drawn at its own top-left corner, i.e. a badge hundreds of px outside the
 * rectangle the person drew. The share is measured against the SMALLER of the two areas, so a big
 * element that CONTAINS the region (you focused part of a drop zone) still counts — its overlap is
 * all of the region — while one that only clips an edge does not.
 */
export const FOCUS_MIN_OVERLAP = 0.8

export function boxInFocus(
  box: FocusRect | undefined,
  region: FocusRect | null,
  minOverlap = FOCUS_MIN_OVERLAP,
): boolean {
  if (!region) return true
  if (!box) return false
  const w = Math.min(box.x + box.w, region.x + region.w) - Math.max(box.x, region.x)
  const h = Math.min(box.y + box.h, region.y + region.h) - Math.max(box.y, region.y)
  if (w < 0 || h < 0) return false
  // A comment pin is a 0x0 box and a hairline has no area: there is no share to measure, so
  // landing inside the rectangle at all is the whole test.
  const smaller = Math.min(box.w * box.h, region.w * region.h)
  if (smaller <= 0) return true
  return (w * h) / smaller >= minOverlap
}

/**
 * Apply a handle drag. `min` keeps a region from collapsing to nothing mid-drag, which would make
 * the handles unreachable and the region unrecoverable except by drawing a new one.
 */
export function resizeRect(
  region: FocusRect,
  handle: FocusHandle,
  point: { x: number; y: number },
  min = 8,
): FocusRect {
  if (handle === "move") {
    return { ...region, x: point.x - region.w / 2, y: point.y - region.h / 2 }
  }
  const left = region.x
  const top = region.y
  const right = region.x + region.w
  const bottom = region.y + region.h
  const west = handle === "nw" || handle === "sw"
  const north = handle === "nw" || handle === "ne"
  const x0 = west ? Math.min(point.x, right - min) : left
  const x1 = west ? right : Math.max(point.x, left + min)
  const y0 = north ? Math.min(point.y, bottom - min) : top
  const y1 = north ? bottom : Math.max(point.y, top + min)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Handle centres in world space, in FOCUS_HANDLES order.
 *
 * `offset` pushes the CORNER handles outward along their diagonals (world units), so they sit just
 * outside the region instead of on the content it was drawn around; the centre grip ignores it.
 * Drawing and hit-testing take the same offset: a handle you can see but not grab is worse than one
 * that covers something.
 */
export function handlePoints(
  region: FocusRect,
  offset = 0,
): { handle: FocusHandle; x: number; y: number }[] {
  const [l, t, r, b] = [region.x - offset, region.y - offset, region.x + region.w + offset, region.y + region.h + offset]
  return [
    { handle: "nw", x: l, y: t },
    { handle: "ne", x: r, y: t },
    { handle: "se", x: r, y: b },
    { handle: "sw", x: l, y: b },
    // The grip stays in the CENTRE and takes no offset: it only exists while adjusting, and the
    // corners are what needed to get off the content.
    { handle: "move", x: region.x + region.w / 2, y: region.y + region.h / 2 },
  ]
}

/** Which handle is under this point, given a hit radius in WORLD units (screen px / zoom). */
export function handleAt(
  region: FocusRect | null,
  point: { x: number; y: number },
  radius: number,
  offset = 0,
): FocusHandle | null {
  if (!region) return null
  for (const h of handlePoints(region, offset)) {
    if (Math.abs(h.x - point.x) <= radius && Math.abs(h.y - point.y) <= radius) return h.handle
  }
  return null
}

export interface FocusParseResult {
  ok: boolean
  value: FocusSet
  error?: string
}

export function parseFocusSet(raw: unknown, pair: string): FocusParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, value: emptyFocus(pair), error: "not an object" }
  }
  const candidate = raw as Partial<FocusSet>
  if (candidate.pair !== undefined && candidate.pair !== pair) {
    return {
      ok: false,
      value: emptyFocus(pair),
      error: `focus is for pair "${String(candidate.pair)}", not "${pair}"`,
    }
  }
  const r = candidate.region as Partial<FocusRect> | null | undefined
  const numeric =
    r !== null &&
    r !== undefined &&
    ["x", "y", "w", "h"].every((k) => Number.isFinite((r as Record<string, unknown>)[k] as number))
  return {
    ok: true,
    value: {
      version: 1,
      pair,
      region: numeric ? { x: r!.x!, y: r!.y!, w: r!.w!, h: r!.h! } : null,
      label: typeof candidate.label === "string" ? candidate.label : "",
      updatedAt:
        typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date(0).toISOString(),
    },
  }
}

/**
 * The handover artifact. Written whenever the region changes, so "work in the focused region" is a
 * complete instruction: the rectangle, and every finding inside it by mark, key and message.
 */
export function focusDigest(
  set: FocusSet,
  findings: readonly {
    mark: number
    key?: string
    message: string
    severity: string
    designBox?: FocusRect
    implBox?: FocusRect
    members?: { designBox?: FocusRect; implBox?: FocusRect }[]
  }[],
): string {
  if (!set.region) {
    return `# Focus — ${set.pair}\n\nNo region focused: the whole capture is in scope.\n`
  }
  const r = set.region
  const inside = findings.filter((f) => {
    const boxes = [
      f.designBox,
      f.implBox,
      ...(f.members ?? []).flatMap((m) => [m.designBox, m.implBox]),
    ]
    return boxes.some((b) => boxInFocus(b, r))
  })
  const head = [
    `# Focus — ${set.pair}`,
    "",
    set.label.trim() ? `**${set.label.trim()}**` : "",
    `Region (impl CSS px): x ${round(r.x)}, y ${round(r.y)}, ${round(r.w)}×${round(r.h)}`,
    `${inside.length} of ${findings.length} findings fall inside it.`,
    "",
    `In scope means the region covers at least ${Math.round(FOCUS_MIN_OVERLAP * 100)} % of the finding's box (or the box contains the region); a box that only clips an edge is out.`,
    "Only these are in scope; anything outside the rectangle is deliberately out of scope.",
    "",
  ].filter((line) => line !== "")
  const rows = inside.map(
    (f) => `- [${f.severity}] #${f.mark} ${f.message}${f.key ? ` \`${f.key}\`` : ""}`,
  )
  return `${[...head, ...rows].join("\n")}\n`
}

const round = (n: number): number => Math.round(n * 10) / 10
