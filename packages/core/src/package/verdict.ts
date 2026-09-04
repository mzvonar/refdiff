import type { Finding, Severity } from "../types.js"

const RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 }

/** At or above the threshold in severity (critical is "above" major). */
export const atOrAbove = (s: Severity, threshold: Severity): boolean => RANK[s] <= RANK[threshold]

/**
 * The run's gate: pass when no finding at or above `failThreshold` is left UNEXPLAINED.
 *
 * An explained finding carries a diagnosed cause that is not the implementation's (see
 * `ExplainRule`), so failing on it asks a person to fix something they have already diagnosed and
 * cannot reach — which is how a number stops being read at all. It is still reported, still counted
 * and still in the delta: a NEW one inside an explained region shows up as introduced on the run it
 * appears, and the summary calls out any cause whose count moved, so the explanation cannot quietly
 * absorb something new.
 */
export function verdictOf(
  findings: readonly Finding[],
  failThreshold: Severity,
): { pass: boolean; failThreshold: Severity } {
  return {
    pass: !findings.some((f) => f.explained === undefined && atOrAbove(f.severity, failThreshold)),
    failThreshold,
  }
}
