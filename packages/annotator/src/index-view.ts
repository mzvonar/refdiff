/**
 * The Library: one card per run dir, built from the summaries the server
 * hands out at `/api/pairs`, laid out the way the RefDiff Library comp draws
 * it (a thumbnail card grid on desktop, a row list under 640px).
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
  /** What the impl side captured — the route or the story — shown in mono. */
  implRef: string
  /**
   * The run's own impl screenshot, relative to the served root
   * (`<dir>/impl.png`), when the file exists. The card's thumbnail is the
   * real capture (plan, decision D6); a run whose capture hard-stopped has
   * none and gets the comp's placeholder plate.
   */
  implPng?: string
  /** Against the previous run of this pair; absent on a first run. */
  delta?: { introduced: number; resolved: number; regressions: number }
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
  /** What could still be read off the broken file — the name and route the comp's card shows, and when it ran. */
  pair?: string
  createdAt?: string
  implRef?: string
}

export type PairEntry = PairSummary | BrokenPair

export const isBroken = (p: PairEntry): p is BrokenPair => (p as BrokenPair).broken === true

export const CONFIDENCE_GATE = 0.5

/** Desktop = the thumbnail card grid; mobile = the row list (the comp switches at 640px). */
export type LibraryLayout = "desktop" | "mobile"

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )
}

/* ------------------------------------------------------------ filters -- */

/**
 * The source chips name the DESIGN side (decision D7): refdiff's `figma` and
 * `dc-html` design sources are the comp's Figma / Claude Design. Anything
 * else (a future source) is shown under its own name behind "Both sources".
 */
export const SOURCE_CHIPS: readonly { id: string; label: string }[] = [
  { id: "all", label: "Both sources" },
  { id: "figma", label: "Figma" },
  { id: "dc-html", label: "Claude Design" },
]

const SOURCE_LABELS: Record<string, [label: string, icon: string]> = {
  figma: ["Figma", "design_services"],
  "dc-html": ["Claude Design", "auto_awesome"],
}

/**
 * The state chips, in refdiff's own terms. The comp also offers `Pending`
 * (Processing / Queued runs); refdiff has no run-in-progress state — a run dir
 * exists once `compare` wrote it — so that chip is not drawn (plan, gap 24).
 */
export const STATE_CHIPS: readonly { id: LibraryFilter["state"]; label: string }[] = [
  { id: "all", label: "Any state" },
  { id: "fail", label: "Failing" },
  { id: "critical", label: "Critical" },
  { id: "diverging", label: "Diverging" },
  { id: "lowconf", label: "Low confidence" },
  { id: "comments", label: "Has comments" },
]

export interface LibraryFilter {
  query: string
  /** A `SOURCE_CHIPS` id. */
  source: string
  state: "all" | "fail" | "critical" | "diverging" | "lowconf" | "comments"
}

export const DEFAULT_FILTER: LibraryFilter = { query: "", source: "all", state: "all" }

/** The comp's `match`: source, then text, then state — a broken run only under "Any state". */
export function matchesFilter(entry: PairEntry, f: LibraryFilter): boolean {
  const q = f.query.trim().toLowerCase()
  if (isBroken(entry)) {
    if (f.source !== "all") return false
    if (q && !entry.dir.toLowerCase().includes(q)) return false
    return f.state === "all"
  }
  if (f.source !== "all" && entry.designSource !== f.source) return false
  if (q && !(entry.pair.toLowerCase().includes(q) || entry.implRef.toLowerCase().includes(q)))
    return false
  switch (f.state) {
    case "fail":
      return !entry.pass
    case "critical":
      return entry.critical > 0
    case "diverging":
      return !!entry.delta && entry.delta.introduced > entry.delta.resolved
    case "lowconf":
      return entry.confidence < CONFIDENCE_GATE
    case "comments":
      return entry.notes > 0
    default:
      return true
  }
}

export function filterEntries(entries: PairEntry[], f: LibraryFilter): PairEntry[] {
  return entries.filter((e) => matchesFilter(e, f))
}

/** The head-row count: `N of M comparisons` — M counts the unreadable ones too. */
export function countMessage(shown: number, total: number): string {
  return shown + " of " + total + " comparisons"
}

/* ------------------------------------------------------------ pieces -- */

/**
 * How long ago a run finished, against the clock the reader is looking at
 * (`now` is injectable for tests). The comp's vocabulary: `just now`, `N min
 * ago`, `N h ago`, `yesterday`, `N d ago`. An unparseable timestamp prints
 * as-is rather than as "NaN min ago".
 */
export function relativeWhen(createdAt: string, now: number): string {
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return createdAt
  const min = Math.floor((now - t) / 60000)
  if (min < 1) return "just now"
  if (min < 60) return min + " min ago"
  const h = Math.floor(min / 60)
  if (h < 24) return h + " h ago"
  const d = Math.floor(h / 24)
  return d === 1 ? "yesterday" : d + " d ago"
}

function sourceChip(source: string): string {
  const [label, icon] = SOURCE_LABELS[source] ?? [source, "description"]
  // The label sits in its own span, as the comp's runtime renders every
  // interpolation — so the chip's border belongs to the chip, not the text.
  return (
    '<span class="src"><span class="msi" aria-hidden="true">' +
    icon +
    "</span><span>" +
    escapeHtml(label) +
    "</span></span>"
  )
}

function severityBadges(p: PairSummary): string {
  const out: string[] = []
  for (const [sev, n, label] of [
    ["critical", p.critical, "Critical"],
    ["major", p.major, "Major"],
    ["minor", p.minor, "Minor"],
  ] as const) {
    if (n > 0) out.push('<span class="badge ' + sev + '"><i class="dot"></i>' + label + " " + n + "</span>")
  }
  if (out.length === 0) out.push('<span class="badge none">No findings</span>')
  return out.join("")
}

function commentsCount(p: PairSummary, iconPx: number): string {
  return (
    '<span class="comments"><span class="msi" aria-hidden="true" style="font-size:' +
    iconPx +
    'px">chat_bubble</span>' +
    p.notes +
    "</span>"
  )
}

/**
 * The trend + delta pair. A first run has no previous run to be converging
 * from, so it says so instead of pretending `+0 / −0` (plan, gap 23).
 */
function trendAndDelta(p: PairSummary): string {
  if (!p.delta) return '<span class="delta mono">first run</span>'
  const { introduced, resolved } = p.delta
  const [cls, icon, label] =
    introduced > resolved
      ? ["diverging", "trending_up", "Diverging"]
      : resolved > introduced
        ? ["converging", "trending_down", "Converging"]
        : ["steady", "trending_flat", "Steady"]
  return (
    '<span class="trend ' +
    cls +
    '"><span class="msi" aria-hidden="true">' +
    icon +
    "</span>" +
    label +
    '</span><span class="delta mono">+' +
    introduced +
    " new / −" +
    resolved +
    " resolved</span>"
  )
}

/** The confidence WARNING (gap 2): a state, never a number the reader ranks by. */
function lowConfidenceLine(p: PairSummary): string {
  if (p.confidence >= CONFIDENCE_GATE) return ""
  return (
    '<div class="lowconf"><span class="msi" aria-hidden="true">warning</span>Positions unreliable · <span class="pct">' +
    Math.round(p.confidence * 100) +
    "%</span> anchor match</div>"
  )
}

/** The real screenshot when the run has one (decision D6), the comp's plate when it does not (gap 25). */
function thumbnail(p: PairSummary, layout: LibraryLayout): string {
  const cls = layout === "mobile" ? "tile" : "shot"
  if (p.implPng)
    return '<img class="' + cls + '" src="' + escapeHtml(p.implPng) + '" alt="" loading="lazy">'
  // The mobile plate IS the tile (same 44×56 slot); the desktop plate sits on the band.
  return '<div class="' + (layout === "mobile" ? "tile plate" : "plate") + '"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>'
}

/**
 * Newest run first — the order the comp lists in, and the one a reader wants
 * (what just finished is what they are about to open). Ties keep the
 * server's dir order; a run whose time could not be read goes last.
 */
export function sortEntries(entries: PairEntry[]): PairEntry[] {
  const time = (e: PairEntry) => (e.createdAt ? Date.parse(e.createdAt) || -Infinity : -Infinity)
  return entries
    .map((e, i) => ({ e, i, t: time(e) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.e)
}

/* -------------------------------------------------------------- cards -- */

/** The degraded card: nothing to open, the reason in the open. */
export function brokenCard(pair: BrokenPair, layout: LibraryLayout): string {
  const dir = escapeHtml(pair.dir)
  const name = '<span class="name">' + escapeHtml(pair.pair ?? pair.dir) + "</span>"
  const warn = '<span class="warn"><span class="msi" aria-hidden="true">warning</span>Couldn’t read this run</span>'
  const tech = '<span class="tech mono">' + escapeHtml(pair.reason) + "</span>"
  if (layout === "mobile") {
    return (
      '<div class="card broken" data-pair="' +
      dir +
      '"><div class="tile"><span class="msi" aria-hidden="true">broken_image</span></div><div class="col">' +
      name +
      warn +
      tech +
      "</div></div>"
    )
  }
  return (
    '<div class="card broken" data-pair="' +
    dir +
    '"><div class="thumb"><span class="msi" aria-hidden="true">broken_image</span></div><div class="body">' +
    name +
    (pair.implRef ? '<span class="route mono">' + escapeHtml(pair.implRef) + "</span>" : "") +
    warn +
    tech +
    "</div></div>"
  )
}

/**
 * One pair. `href` is the route (app) or the file (emitted index). Desktop is
 * the comp's thumbnail card: verdict pill top-left and state pill top-right
 * on the 132px band, then name + source chip, mono route, severity
 * dot-badges + comment count, and the trend / delta / when footer. Mobile is
 * the row: 44×56 tile, name + verdict, source + badges + comments, trend +
 * delta — no state pill, no route, no "when" (the comp draws none).
 */
export function pairCard(pair: PairEntry, href: string, layout: LibraryLayout = "desktop", now: number = Date.now()): string {
  if (isBroken(pair)) return brokenCard(pair, layout)
  const verdict =
    '<span class="verdict ' + (pair.pass ? "pass" : "fail") + '">' + (pair.pass ? "Pass" : "Fail") + "</span>"
  const open = '<a class="card" data-pair="' + escapeHtml(pair.dir) + '" href="' + escapeHtml(href) + '">'
  const name = '<span class="name">' + escapeHtml(pair.pair) + "</span>"
  if (layout === "mobile") {
    return (
      open +
      thumbnail(pair, "mobile") +
      '<div class="col"><div class="crow name-row">' +
      name +
      verdict +
      '</div><div class="crow cmeta">' +
      sourceChip(pair.designSource) +
      severityBadges(pair) +
      commentsCount(pair, 13) +
      '</div><div class="crow foot">' +
      trendAndDelta(pair) +
      "</div>" +
      lowConfidenceLine(pair) +
      "</div></a>"
    )
  }
  // The state pill is the comp's run-state vocabulary; refdiff knows two of
  // its four words (gap 24): Clean = a passing run with nothing found.
  const clean = pair.pass && pair.findings === 0
  const state = '<span class="state ' + (clean ? "clean" : "analyzed") + '">' + (clean ? "Clean" : "Analyzed") + "</span>"
  return (
    open +
    '<div class="thumb">' +
    thumbnail(pair, "desktop") +
    verdict +
    state +
    '</div><div class="body"><div class="crow name-row">' +
    name +
    sourceChip(pair.designSource) +
    '</div><span class="route mono">' +
    escapeHtml(pair.implRef) +
    '</span><div class="crow badges">' +
    severityBadges(pair) +
    commentsCount(pair, 14) +
    '</div><div class="crow foot">' +
    trendAndDelta(pair) +
    '<span class="when">' +
    escapeHtml(relativeWhen(pair.createdAt, now)) +
    "</span></div>" +
    lowConfidenceLine(pair) +
    "</div></a>"
  )
}

export function pairCards(
  pairs: PairEntry[],
  href: (pair: PairSummary) => string,
  layout: LibraryLayout = "desktop",
  now: number = Date.now(),
): string {
  return pairs.map((p) => pairCard(p, isBroken(p) ? "" : href(p), layout, now)).join("")
}

/* -------------------------------------------------------- error states -- */

/**
 * The two typed list-load failures the comp draws (plan, section C). `server`
 * is the common one — the CLI was stopped, the terminal closed, the machine
 * slept, so `fetch` fails at the network layer; `endpoint` is a response that
 * is not a list, usually a findings.json mid-write. Both keep retrying: the
 * page reconnecting once the CLI is back is the right behaviour.
 */
export interface ListError {
  kind: "server" | "endpoint"
  /** The REAL error, the way the box prints it: `Failed to fetch · /api/pairs · 14:22:05`. */
  tech: string
  /** The out root being served — the copy target for `endpoint`. */
  root: string
  /** `refdiff-annotator <root> --serve --port <n>` — the copy target for `server`. */
  restartCommand: string
  retries: number
  /** Seconds until the next automatic retry. */
  secs: number
  copied: boolean
}

const ERROR_COPY = {
  server: {
    icon: "power_off",
    head: "Can’t reach the annotator",
    body: "The refdiff-annotator process serving this directory isn’t responding. Nothing is lost — findings, comments and triage are files on disk in the out root, not in this page.",
    copyLabel: "Copy restart command",
  },
  endpoint: {
    icon: "description",
    head: "The pair list couldn’t be read",
    body: "A run may be writing to the out root. This usually clears on its own.",
    copyLabel: "Copy out root path",
  },
} as const

/** What the copy button puts on the clipboard for this error. */
export function errorCopyText(e: ListError): string {
  return e.kind === "server" ? e.restartCommand : e.root
}

export function autoRetryMessage(retries: number, secs: number): string {
  return "Retried " + retries + "× · next attempt in " + secs + "s"
}

export function errorBox(e: ListError): string {
  const c = ERROR_COPY[e.kind]
  return (
    '<div class="errbox" data-kind="' +
    e.kind +
    '"><div class="err-icon"><span class="msi" aria-hidden="true">' +
    c.icon +
    '</span></div><div class="err-head">' +
    c.head +
    '</div><div class="err-body">' +
    c.body +
    '</div><div class="err-lines"><div class="err-line tech"><span class="msi" aria-hidden="true">error</span><span>' +
    escapeHtml(e.tech) +
    '</span></div><div class="err-line root"><span class="msi" aria-hidden="true">folder_open</span><span>' +
    escapeHtml(e.root) +
    '</span></div></div><div class="err-actions"><button type="button" class="err-retry" id="lib-retry"><span class="msi" aria-hidden="true">refresh</span>Retry</button><button type="button" class="err-copy" id="lib-copy" title="' +
    escapeHtml(errorCopyText(e)) +
    '"><span class="msi" aria-hidden="true">' +
    (e.copied ? "check" : "content_copy") +
    "</span>" +
    (e.copied ? "Copied" : c.copyLabel) +
    '</button></div><div class="err-auto" id="lib-retry-msg">' +
    autoRetryMessage(e.retries, e.secs) +
    "</div></div>"
  )
}

/** Which typed failure a thrown fetch error is: no response at all = the server is gone. */
export function classifyListError(e: unknown): ListError["kind"] {
  return e instanceof TypeError ? "server" : "endpoint"
}
