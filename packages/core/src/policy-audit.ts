/**
 * Auditing the policy itself (pure): which suppressions are hiding more than
 * their author meant to hide.
 *
 * The real-world case, 2026-09-02: `COMPARE_IGNORE.textPatterns` excused the
 * delta strip's COPY, and `textPatterns` removes every finding type about a
 * matching string — geometry included. The strip's run label was 77px wider in
 * the implementation than in the comp, which wrapped the strip and shoved the
 * Review button 84px sideways. All of it suppressed; the run reported nothing;
 * a person found it by eye. A rule that says "the wording of this element is
 * demo data" should not also say "and I do not care where it is".
 *
 * So: a suppressed finding that MOVED or RESIZED beyond a threshold is worth
 * naming, with the rule that hid it, and — when that rule is a text pattern —
 * with the narrower tool that would have kept the geometry compared
 * (`dataSlots: { patterns }` masks the volatile value and compares the rest).
 * This never un-suppresses anything: the policy still wins, it just stops being
 * silent about the size of what it swallowed.
 */

import type { SuppressedFinding } from "./types.js"

/** Types whose `expected`/`actual` describe geometry rather than appearance. */
const GEOMETRIC = new Set(["position", "size", "spacing"])

export interface HiddenMovement {
  /** The suppressed finding's id. */
  id: string
  type: string
  /** How far it moved / resized, in impl CSS px — the largest single axis. */
  px: number
  rule: string
  suppressedBy: SuppressedFinding["suppressedBy"]
  /** Only for a text-pattern rule: the narrower policy that keeps geometry compared. */
  advice?: string
  message: string
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)

/**
 * The largest single-axis geometric delta a finding describes, or undefined when
 * it does not describe one. Deliberately per-AXIS rather than a diagonal: a
 * reader thinks in "it moved 77px to the right", and hypot would under-report a
 * pure-x shift against a threshold chosen in px.
 */
export function movementPx(f: Pick<SuppressedFinding, "type" | "expected" | "actual">): number | undefined {
  if (!GEOMETRIC.has(f.type)) return undefined
  const e = f.expected ?? {}
  const a = f.actual ?? {}
  let worst: number | undefined
  for (const k of ["x", "y", "w", "h", "gap"]) {
    const ev = num(e[k])
    const av = num(a[k])
    if (ev === undefined || av === undefined) continue
    const d = Math.abs(av - ev)
    if (worst === undefined || d > worst) worst = d
  }
  return worst
}

/**
 * Suppressed findings whose geometry moved at least `thresholdPx`, worst first.
 *
 * `accepted` rules are EXCLUDED: an accepted deviation is built from the
 * measurement itself and lapses when either value changes, so its size was
 * already read and signed off by a person. This is about rules that hid a
 * number nobody looked at — text patterns, roles and regions.
 */
export function hiddenMovement(
  suppressed: readonly SuppressedFinding[],
  thresholdPx = 8,
): HiddenMovement[] {
  const out: HiddenMovement[] = []
  for (const f of suppressed) {
    if (f.suppressedBy === "accepted") continue
    const px = movementPx(f)
    if (px === undefined || px < thresholdPx) continue
    out.push({
      id: f.id,
      type: f.type,
      px: Math.round(px * 10) / 10,
      rule: f.rule,
      suppressedBy: f.suppressedBy,
      ...(f.suppressedBy === "text-pattern"
        ? {
            advice:
              "a text pattern also hides geometry — `dataSlots: { patterns }` masks the volatile value and keeps position, size, colour and typography compared",
          }
        : {}),
      message: f.message,
    })
  }
  return out.sort((x, y) => y.px - x.px)
}
