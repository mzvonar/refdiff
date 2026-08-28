/**
 * `--read-only` (pure): what the served app refuses when the root under it
 * must not change — a committed fixture, or the very thing a `compare` run is
 * measuring. The served app otherwise WRITES `annotations.json` /
 * `triage.json` / `focus.json` (+ digests) into the run dir on every note,
 * verdict or region, so a measure against a served fixture was a measure of
 * a dirtied fixture (refdiff.bindings.md trap, harness item 16).
 */

/** The refusal a read-only server gives a write under /api/, or nothing. Reads pass. */
export function readOnlyRefusal(
  readOnly: boolean | undefined,
  method: string | undefined,
  path: string,
): { status: number; error: string } | undefined {
  if (readOnly !== true || !path.startsWith("/api/")) return undefined
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return undefined
  return {
    status: 405,
    error: `read-only server: ${method ?? "write"} ${path} refused (--read-only); serve without it to save`,
  }
}
