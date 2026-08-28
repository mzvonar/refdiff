/**
 * The pair list: one card per run dir, built from the summaries the server
 * hands out at `/api/pairs`.
 *
 * Pure and import-free on purpose — like view-math.ts and annotations.ts it is
 * compiled and embedded verbatim into the served page, so the same tested
 * function draws the list in the browser. Strings are escaped here because a
 * pair name comes from a directory on disk.
 */

export interface PairSummary {
  /** Directory under the out root — the route and the artifact path prefix. */
  dir: string
  pair: string
  pass: boolean
  critical: number
  major: number
  minor: number
  findings: number
  suppressed: number
  /** Alignment confidence: under 0.5 the findings stop meaning much. */
  confidence: number
  createdAt: string
  designSource: string
  implSource: string
  openNotes: number
  notes: number
}

/**
 * A run dir whose findings.json could not be read — cut off mid-write, or not
 * a report at all. Listed, never dropped: a pair that silently vanishes from
 * the Library is the one outcome the list exists to prevent (one bad pair
 * never kills a run).
 */
export interface BrokenPair {
  dir: string
  broken: true
  /** Written the way the card prints it: `findings.json · <what went wrong>`. */
  reason: string
}

export type PairEntry = PairSummary | BrokenPair

export const isBroken = (p: PairEntry): p is BrokenPair => (p as BrokenPair).broken === true

export const CONFIDENCE_GATE = 0.5

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )
}

/** The degraded card: nothing to open, the reason in the open. */
export function brokenCard(pair: BrokenPair): string {
  return (
    '<li class="card broken" data-pair="' +
    escapeHtml(pair.dir) +
    '"><div class="hit"><div class="row1"><span class="name">' +
    escapeHtml(pair.dir) +
    '</span><span class="pill broken">UNREADABLE</span></div><div class="row2"><span class="kv">Couldn\'t read this run</span></div><div class="row3"><span class="kv mono">' +
    escapeHtml(pair.reason) +
    "</span></div></div></li>"
  )
}

/** `href` is the route (app) or the file (emitted index) for this pair. */
export function pairCard(pair: PairEntry, href: string): string {
  if (isBroken(pair)) return brokenCard(pair)
  const weak = pair.confidence < CONFIDENCE_GATE
  return (
    '<li class="card" data-pair="' +
    escapeHtml(pair.dir) +
    '"><a class="hit" href="' +
    escapeHtml(href) +
    '"><div class="row1"><span class="name">' +
    escapeHtml(pair.pair) +
    '</span><span class="pill ' +
    (pair.pass ? "pass" : "fail") +
    '">' +
    (pair.pass ? "PASS" : "FAIL") +
    '</span></div><div class="row2"><span class="nums"><span class="n critical">' +
    pair.critical +
    '</span><span class="n major">' +
    pair.major +
    '</span><span class="n minor">' +
    pair.minor +
    "</span></span>" +
    '<span class="kv">' +
    pair.findings +
    " findings" +
    (pair.suppressed ? " · " + pair.suppressed + " suppressed" : "") +
    "</span>" +
    (pair.openNotes
      ? '<span class="notes">' +
        pair.openNotes +
        " note" +
        (pair.openNotes === 1 ? "" : "s") +
        "</span>"
      : "") +
    '<span class="kv conf' +
    (weak ? " weak" : "") +
    '">confidence ' +
    pair.confidence.toFixed(2) +
    '</span></div><div class="row3"><span class="kv">' +
    escapeHtml(pair.designSource) +
    " → " +
    escapeHtml(pair.implSource) +
    '</span><span class="kv">' +
    escapeHtml(pair.createdAt) +
    "</span></div></a></li>"
  )
}

export function pairCards(pairs: PairEntry[], href: (pair: PairSummary) => string): string {
  return pairs.map((p) => pairCard(p, isBroken(p) ? "" : href(p))).join("")
}

/** The line above the list: what is failing, what cannot be trusted, what is waiting, what could not be read. */
export function pairsSummaryLine(entries: PairEntry[]): string {
  const pairs = entries.filter((p): p is PairSummary => !isBroken(p))
  const broken = entries.length - pairs.length
  const failing = pairs.filter((p) => !p.pass).length
  const weak = pairs.filter((p) => p.confidence < CONFIDENCE_GATE).length
  const notes = pairs.reduce((n, p) => n + p.openNotes, 0)
  return (
    failing +
    " failing · " +
    weak +
    " under the " +
    CONFIDENCE_GATE.toFixed(2) +
    " confidence gate" +
    (notes ? " · " + notes + " open note" + (notes === 1 ? "" : "s") : "") +
    (broken ? " · " + broken + " unreadable" : "")
  )
}
