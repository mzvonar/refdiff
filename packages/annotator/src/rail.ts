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
 * What a refused save on a read-only server says. Shown on the FIRST write the
 * viewer attempts, never up front: an announcement would be an element the
 * comp does not draw, shifting the rail under a measurement — the one thing
 * `--read-only` exists to keep identical to the writable app (measured: +6
 * findings on the compare pair with an up-front line).
 */
export const READ_ONLY_STATUS =
  "read-only server (--read-only) — not saved; serve without --read-only to persist notes, verdicts and regions"

/**
 * The rail's status line: failed saves first (each names its endpoint, or the
 * read-only refusal), then the one standing condition — no server at all
 * (notes stay in this browser). Empty when there is nothing to say.
 */
export function railStatusLine(errors: readonly string[], storage: string): string {
  const parts = [...errors]
  if (parts.length === 0 && storage !== "api")
    parts.push("not served — notes stay in this browser; serve the run dir (--serve) to persist them to annotations.json")
  return parts.join(" · ")
}

/** The save error to show for a failed write: the read-only refusal in the app's words, else the endpoint + status. */
export function saveErrorText(readOnly: boolean, endpoint: string, message: string): string {
  return readOnly ? READ_ONLY_STATUS : "PUT " + endpoint + " · " + message
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

/**
 * A remembered dismissal of the delta strip — the banner over the canvas that states this run
 * against the previous one, and shouts when a fixed finding is back (`delta.regressions`).
 *
 * The × was "for this run" and lived in memory only, so a reload put the banner straight back and
 * the reader dismissed it again, and again. Persisting it (per pair, `vc-delta-dismissed:<pair>`
 * in localStorage) needs an expiry that is not a clock: it is the CONTENT that must expire the
 * rule, so the record names the regressions that were ON SCREEN when it was dismissed. A
 * regression the reader has never seen is not covered by it and brings the strip back — the one
 * thing that must not be missed (docs, gap 15) always breaks through, while the +introduced /
 * −resolved counts, which are in findings.json and the run's own output, stay put once waved away.
 */
export interface DeltaDismissal {
  version: 1
  /** `ComparisonReport.createdAt` of the run whose strip was dismissed — provenance, not the test. */
  run: string
  /** Run-stable identity (`Finding.key`, else the id) of every regression that strip showed. */
  regKeys: string[]
  at: string
}

/** A stored record, or null for anything that is not one — a bad record must never hide a strip. */
export function parseDeltaDismissal(raw: unknown): DeltaDismissal | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 || typeof r.run !== "string") return null
  if (!Array.isArray(r.regKeys) || r.regKeys.some((k) => typeof k !== "string")) return null
  return { version: 1, run: r.run, regKeys: r.regKeys as string[], at: typeof r.at === "string" ? r.at : "" }
}

/**
 * Does `stored` still cover a strip whose regressions are `regKeys`?
 *
 * Every regression now on the strip must be one the dismissal already saw. No regressions at all
 * (a delta of plain counts) is covered by any dismissal — that is what "dismissed" means for
 * information the reader has judged uninteresting. One new key and the strip is back, whole.
 */
export function deltaStripDismissed(
  stored: DeltaDismissal | null,
  regKeys: readonly string[],
): boolean {
  if (!stored) return false
  return regKeys.every((k) => stored.regKeys.includes(k))
}
