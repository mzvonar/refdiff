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
 * findings a region contains — the alternative is two intersection tests that drift.
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

/** Corner handles, in the order they are drawn. Editing a drawn region beats redrawing it. */
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

export function boxIntersectsRect(box: FocusRect | undefined, region: FocusRect | null): boolean {
  if (!region) return true
  if (!box) return false
  return (
    box.x < region.x + region.w &&
    box.x + box.w > region.x &&
    box.y < region.y + region.h &&
    box.y + box.h > region.y
  )
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

/** Handle centres in world space, in FOCUS_HANDLES order. */
export function handlePoints(region: FocusRect): { handle: FocusHandle; x: number; y: number }[] {
  return [
    { handle: "nw", x: region.x, y: region.y },
    { handle: "ne", x: region.x + region.w, y: region.y },
    { handle: "se", x: region.x + region.w, y: region.y + region.h },
    { handle: "sw", x: region.x, y: region.y + region.h },
    { handle: "move", x: region.x + region.w / 2, y: region.y + region.h / 2 },
  ]
}

/** Which handle is under this point, given a hit radius in WORLD units (screen px / zoom). */
export function handleAt(
  region: FocusRect | null,
  point: { x: number; y: number },
  radius: number,
): FocusHandle | null {
  if (!region) return null
  for (const h of handlePoints(region)) {
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
    return boxes.some((b) => boxIntersectsRect(b, r))
  })
  const head = [
    `# Focus — ${set.pair}`,
    "",
    set.label.trim() ? `**${set.label.trim()}**` : "",
    `Region (impl CSS px): x ${round(r.x)}, y ${round(r.y)}, ${round(r.w)}×${round(r.h)}`,
    `${inside.length} of ${findings.length} findings fall inside it.`,
    "",
    "Only these are in scope; anything outside the rectangle is deliberately out of scope.",
    "",
  ].filter((line) => line !== "")
  const rows = inside.map(
    (f) => `- [${f.severity}] #${f.mark} ${f.message}${f.key ? ` \`${f.key}\`` : ""}`,
  )
  return `${[...head, ...rows].join("\n")}\n`
}

const round = (n: number): number => Math.round(n * 10) / 10
