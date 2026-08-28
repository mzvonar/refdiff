/**
 * Pure helpers for the review rail (docs/plan-annotator-redesign.md, phase 4):
 * the text the rail prints, derived from a finding's data — never guessed in
 * the DOM code.
 *
 * Compiled to plain JS with no imports and embedded verbatim into the page
 * (see render.ts / app-shell.ts), like view-math.ts and annotations.ts — keep
 * it free of runtime dependencies.
 */

export interface PropRow {
  /** The measured property, in CSS spelling (`backgroundColor` → `background-color`). */
  prop: string
  expected: string
  actual: string
}

/**
 * Keys whose numeric values are CSS px in refdiff's checks. Everything else
 * numeric (`fontWeight`, `diffRatio`, `alignmentConfidence`, a ΔE) prints bare.
 */
const PX_KEYS: ReadonlySet<string> = new Set([
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "borderWidth",
  "borderRadius",
  "w",
  "h",
  "x",
  "y",
  "gap",
  "padding",
  "margin",
])

const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())

const trimNumber = (n: number): string => String(Math.round(n * 100) / 100)

export function formatValue(key: string, value: string | number | undefined): string {
  if (value === undefined) return "—"
  if (typeof value === "number") return PX_KEYS.has(key) ? trimNumber(value) + "px" : trimNumber(value)
  return value
}

/** `w`/`h` on a size finding read as the CSS properties they measure. */
const SIZE_NAMES: Record<string, string> = { w: "width", h: "height" }

/**
 * The comps' `prop expected → actual` line, one row per value that differs.
 * Keys the two sides agree on (`axis: "x"` beside a `gap`) are context, not
 * a delta, and are left out; a finding with no values (a missing element)
 * yields no rows and the row shows its message alone.
 *
 * A `position` finding carries the two coordinates; the row shows the SHIFT
 * (`translateY 0px → 23px`) — the vocabulary refdiff's own message uses
 * ("offset by (0, 23)px") and the transform that would undo it — rather
 * than absolute coordinates nobody can act on.
 */
export function propRows(
  expected: Record<string, string | number> | undefined,
  actual: Record<string, string | number> | undefined,
  type?: string,
): PropRow[] {
  if (type === "position") {
    const out: PropRow[] = []
    for (const [axis, name] of [["x", "translateX"], ["y", "translateY"]] as const) {
      const e = expected?.[axis]
      const a = actual?.[axis]
      if (typeof e !== "number" || typeof a !== "number" || e === a) continue
      out.push({ prop: name, expected: "0px", actual: trimNumber(a - e) + "px" })
    }
    return out
  }
  const keys: string[] = []
  for (const side of [expected, actual]) {
    for (const k of Object.keys(side ?? {})) if (!keys.includes(k)) keys.push(k)
  }
  const out: PropRow[] = []
  for (const k of keys) {
    const e = expected?.[k]
    const a = actual?.[k]
    if (e === a) continue
    const prop = type === "size" && SIZE_NAMES[k] !== undefined ? SIZE_NAMES[k]! : kebab(k)
    out.push({ prop, expected: formatValue(k, e), actual: formatValue(k, a) })
  }
  return out
}

/** The collapsed rail's one line: what it is hiding, and whether a save is pending. */
export function railSummary(findings: number, comments: number, unsaved = 0): string {
  return (
    findings +
    (findings === 1 ? " finding" : " findings") +
    " · " +
    comments +
    (comments === 1 ? " comment" : " comments") +
    (unsaved > 0 ? " · " + unsaved + " unsaved" : "")
  )
}

/**
 * The instance chip above the findings (gap 12): the comps' `Primary only · N`
 * / `All instances · M`, where M counts every place an aggregate repeats.
 * `instances` on a refdiff finding is the total number of members, primary
 * included — so a ×14 aggregate contributes 14, not 15.
 */
export function instanceChipLabel(allInstances: boolean, listed: readonly { instances?: number }[]): string {
  if (!allInstances) return "Primary only · " + listed.length
  const total = listed.reduce((n, f) => n + Math.max(1, f.instances ?? 1), 0)
  return "All instances · " + total
}

/** How many listed findings are aggregates (the chip exists only when one is). */
export const aggregateCount = (listed: readonly { instances?: number }[]): number =>
  listed.filter((f) => (f.instances ?? 1) > 1).length

export const SUPPRESSED_LABEL = (n: number): string => n + " suppressed by policy rules"
