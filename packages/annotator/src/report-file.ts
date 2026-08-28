/**
 * Reading a run dir's `findings.json` without trusting it.
 *
 * A run dir is not always a finished run: `refdiff compare` may be writing it
 * right now, a disk may have filled mid-write, a hand-edit may have broken it.
 * The fifth project principle — one bad pair never kills a run — applies to
 * the LIST as much as to the set: an unreadable report is a typed reason the
 * Library can show on a degraded card, never an exception that 500s
 * `/api/pairs` or (worse) a `process.exit` from inside a request handler.
 *
 * Pure: text in, report or reason out. The reason is written the way the
 * Library prints it — `findings.json · <what went wrong>` — so the card and
 * the CLI say the same thing.
 */

import type { ComparisonReport } from "@refdiff/core"

export type ReportParse =
  | { ok: true; value: ComparisonReport }
  | { ok: false; reason: string }

/** What a report must carry before the annotator can draw it. */
const REQUIRED = ["pair", "findings", "alignment", "design", "impl", "artifacts"] as const

/**
 * Parse `findings.json` text. A report written before `suppressed` / `policy`
 * existed is normalised, not rejected — the old runs still open.
 */
export function parseReport(text: string): ReportParse {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, reason: `findings.json · ${(e as Error).message}` }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { ok: false, reason: "findings.json · not an object" }
  const r = parsed as Record<string, unknown>
  const missing = REQUIRED.filter((k) => {
    const v = r[k]
    if (k === "pair") return typeof v !== "string"
    if (k === "findings") return !Array.isArray(v)
    return typeof v !== "object" || v === null
  })
  if (missing.length)
    return {
      ok: false,
      reason: `findings.json · not a ComparisonReport (missing ${missing.join(", ")})`,
    }
  const raw = r as unknown as Partial<ComparisonReport>
  return {
    ok: true,
    value: { ...raw, suppressed: raw.suppressed ?? [], policy: raw.policy ?? {} } as ComparisonReport,
  }
}
