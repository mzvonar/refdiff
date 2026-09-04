/**
 * The Library: one card per run dir, GROUPED by the entry its pair id names,
 * built from the summaries the server hands out at `/api/pairs` and laid out
 * the way the RefDiff Library comp draws it (a thumbnail card grid on desktop,
 * a row list under 640px).
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
  /**
   * 1-based ordinal of this run OF THIS PAIR (`ComparisonReport.run`), which
   * is what makes a group's `r<min> → r<max>` span and per-cell staleness
   * expressible at all.
   *
   * PER PAIR, and that is the whole caveat: ordinals count independently, so
   * two cells of one variant set legitimately sit at r2 and r10. There is no
   * global newest run to compare against, and taking the largest ordinal on
   * screen for one would mark every cell of a young pair stale against a run
   * it was never behind. Both ends of a span, and the staleness test, are
   * computed WITHIN a group.
   *
   * Optional because `ComparisonReport.run` is: every run dir written before
   * runs were numbered has none, and inventing one would print a confident
   * ordinal over a result that was never counted.
   */
  run?: number
  /**
   * The pair's captured frame, in impl CSS px: the MAX of the design and impl
   * sides on each axis.
   *
   * A variant sheet needs it and nothing else can supply it. Cells differ
   * wildly — a button 76x40, a checkbox row 120x20, an alert ~1300x72 — so a
   * grid whose tracks are sized from the widest and tallest cell must know each
   * cell's size, and until now that lived only inside each pair's own
   * findings.json. A 41-cell sheet fetching 41 reports to lay itself out is a
   * layout that cannot be drawn before every capture has been read.
   *
   * The per-side MAX is taken here, where both are known: a cell whose impl is
   * wider than its design has to show both, so one number per axis is all a
   * track needs and carrying two would invite a consumer to pick one.
   *
   * Optional for the same reason `run` is: an unreadable or older report has
   * none, and a sheet floors a size-less cell at its minimum rather than
   * collapsing the track.
   */
  frame?: { w: number; h: number }
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

/** Takes the counts, not the pair: a group's roll-up prints the same badges. */
function severityBadges(c: { critical: number; major: number; minor: number }): string {
  const out: string[] = []
  for (const [sev, n, label] of [
    ["critical", c.critical, "Critical"],
    ["major", c.major, "Major"],
    ["minor", c.minor, "Minor"],
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

/* ------------------------------------------------------------- groups -- */

/**
 * The entry a pair id belongs to, or null when it belongs to none.
 *
 * Every variant pair `compare` writes is `${entryId}--${slug}`
 * (`ds-button-fill--state-default_variant-default`), so the first level of the
 * tree is already in the data — no new artifact, no core change. Split on the
 * FIRST `--` only: a slug may carry more of them (`a--b--c` is entry `a`), and
 * an id with none at all is a LONE ITEM — the annotator's own
 * `refdiff-library-desktop` and the demo root's twelve are exactly that shape
 * and must keep listing as bare cards. An id that starts with `--` names no
 * entry, so it is a lone item too.
 */
export function entryIdOf(dir: string): string | null {
  const i = dir.indexOf("--")
  return i > 0 ? dir.slice(0, i) : null
}

/** What a group header adds up over the cells it is showing. */
export interface GroupRollup {
  critical: number
  major: number
  minor: number
  /**
   * Cells whose delta carries a REGRESSION — a finding an earlier run had
   * resolved and this one found again. Deliberately not the `Diverging`
   * chip's `introduced > resolved`: that one a reader can see on every card's
   * trend already, a fix coming undone they cannot.
   */
  regressed: number
  /** Cells whose findings.json could not be read — counted, never hidden. */
  broken: number
}

/**
 * One entry's cells, or a lone top-level item.
 *
 * `set === false` means no member's pair id carried a `--`, and then `total`
 * is always 1: a dir name is unique under the root, so a lone item cannot
 * share its group with anything.
 */
export interface LibraryGroup {
  /** The entry id (`ds-button-fill`), or the lone item's own dir. */
  id: string
  /** True when at least one member's pair id named this group as its entry. */
  set: boolean
  /** The cells the filter kept, in the order they arrived. */
  cells: PairEntry[]
  /**
   * Cells BEFORE the filter. The header's count reads off it, and a group of
   * one draws as its card either way — so a search that leaves one match
   * inside a 45-cell set still names the set the match is in.
   */
  total: number
  /** Over `cells`, so the header's numbers reconcile with the cards under it. */
  roll: GroupRollup
}

function rollUp(cells: PairEntry[]): GroupRollup {
  const roll: GroupRollup = { critical: 0, major: 0, minor: 0, regressed: 0, broken: 0 }
  for (const c of cells) {
    if (isBroken(c)) {
      roll.broken++
      continue
    }
    roll.critical += c.critical
    roll.major += c.major
    roll.minor += c.minor
    if (c.delta && c.delta.regressions > 0) roll.regressed++
  }
  return roll
}

/**
 * The Library's one derived level: 194 flat rows become 14 groups with no new
 * data. Groups come out in the order their FIRST cell arrived, so a sorted
 * list (`sortEntries`, newest run first) puts the group that finished most
 * recently first — the same decision the flat list already made.
 *
 * The filter applies INSIDE a group and a group with nothing left disappears;
 * `total` remembers what it held, so its count can read `3 of 41 comparisons`.
 */
export function groupEntries(
  entries: PairEntry[],
  f: LibraryFilter = DEFAULT_FILTER,
): LibraryGroup[] {
  const order: string[] = []
  const byId = new Map<string, { set: boolean; cells: PairEntry[]; total: number }>()
  for (const e of entries) {
    const entryId = entryIdOf(e.dir)
    const id = entryId ?? e.dir
    let g = byId.get(id)
    if (!g) {
      g = { set: false, cells: [], total: 0 }
      byId.set(id, g)
      order.push(id)
    }
    if (entryId !== null) g.set = true
    g.total++
    if (matchesFilter(e, f)) g.cells.push(e)
  }
  const out: LibraryGroup[] = []
  for (const id of order) {
    const g = byId.get(id)
    if (!g || g.cells.length === 0) continue
    out.push({ id, set: g.set, cells: g.cells, total: g.total, roll: rollUp(g.cells) })
  }
  return out
}

/** The head row keeps counting COMPARISONS, not groups. */
export function cellsShown(groups: LibraryGroup[]): number {
  return groups.reduce((n, g) => n + g.cells.length, 0)
}

/**
 * A group draws a header only when it has more than one cell to fold away. A
 * set of one would put a card's thumbnail, route, trend and comment count
 * behind a click and save no room at all, and its entry id is already the
 * first half of that card's own name.
 */
export const isFoldable = (g: LibraryGroup): boolean => g.set && g.total > 1

/** Anything but the defaults — the reader has already narrowed the list. */
export function isFilterActive(f: LibraryFilter): boolean {
  return (
    f.query.trim() !== "" || f.source !== DEFAULT_FILTER.source || f.state !== DEFAULT_FILTER.state
  )
}

/** What the reader has expanded and collapsed by hand, over the default. */
export interface GroupToggles {
  opened: ReadonlySet<string>
  closed: ReadonlySet<string>
}

const NO_TOGGLES: GroupToggles = { opened: new Set(), closed: new Set() }

/**
 * Which groups are drawn expanded. **Always collapsed** (plan, open question
 * 3), with no cell-count threshold: a variant set is ONE design artefact and
 * the Library's job is to pick one of them, so 14 headers is the overview and
 * one click is the set — the click chunk 3 turns into the gallery. A
 * threshold would answer "why is this one open and that one shut?" with a
 * tuned number no reader can predict.
 *
 * Two rules bend it, and both are structural rather than tuned: a group of
 * one is its card (`isFoldable`), and an ACTIVE FILTER expands everything
 * that survived it — the reader has already narrowed, so hiding the matches
 * behind a click would be hostile. An explicit toggle wins over both.
 */
export function openGroups(
  groups: LibraryGroup[],
  f: LibraryFilter,
  t: GroupToggles = NO_TOGGLES,
): Set<string> {
  const base = isFilterActive(f)
  const out = new Set<string>()
  for (const g of groups) {
    if (!isFoldable(g)) continue
    const open = t.opened.has(g.id) ? true : t.closed.has(g.id) ? false : base
    if (open) out.add(g.id)
  }
  return out
}

/**
 * When a group's cells ran, in the words its cards use — a span
 * `oldest → newest` when those words DIFFER, which is exactly when a reader
 * comparing two of its cells would read two different times.
 *
 * Why not a tolerance in minutes: `createdAt` is stamped per PAIR, so a
 * single `compare` over a big set already spreads (measured on a 194-pair DS
 * root, 2026-09-04: 66s across `ds-checkbox`'s 45 cells, 59s across
 * `ds-button-fill`'s 41), while a subset re-run mixes vintages HOURS apart
 * (06:29 against 10:04 in that same root). No fixed tolerance separates those
 * two without a magic number that a slower set breaks — `relativeWhen`'s own
 * buckets do it for free, and they decay: a one-minute spread reads as two
 * words for the first hour and as one word after it. It errs toward SHOWING a
 * span, because the failure this exists to prevent is a sheet that mixes
 * vintages silently.
 *
 * Empty when no cell has a time that parses, rather than `NaN`.
 */
export function groupWhen(cells: PairEntry[], now: number): string {
  let oldest = Infinity
  let newest = -Infinity
  for (const c of cells) {
    const t = c.createdAt ? Date.parse(c.createdAt) : NaN
    if (Number.isNaN(t)) continue
    if (t < oldest) oldest = t
    if (t > newest) newest = t
  }
  if (newest === -Infinity) return ""
  const from = relativeWhen(new Date(oldest).toISOString(), now)
  const to = relativeWhen(new Date(newest).toISOString(), now)
  return from === to ? to : from + " → " + to
}

/**
 * The group row: the entry id, how many comparisons it holds, the roll-up of
 * their severities, a regressed and an unreadable count when there are any,
 * and when they ran. A button, because it is the control that expands the
 * group — `aria-expanded` carries the state, and the caret is ROTATED by CSS
 * rather than swapped for a second glyph (the icon face is a subset of
 * `icon-names.ts`, and `chevron_right` is not in it).
 */
export function groupHeader(g: LibraryGroup, open: boolean, now: number = Date.now()): string {
  const id = escapeHtml(g.id)
  const count =
    g.cells.length === g.total
      ? g.total + " comparisons"
      : countMessage(g.cells.length, g.total)
  const when = groupWhen(g.cells, now)
  return (
    '<button type="button" class="ghead" data-group="' +
    id +
    '" aria-expanded="' +
    (open ? "true" : "false") +
    '"><span class="msi caret" aria-hidden="true">expand_more</span><span class="gname">' +
    id +
    '</span><span class="gcount">' +
    count +
    '</span><span class="badges">' +
    severityBadges(g.roll) +
    "</span>" +
    (g.roll.regressed > 0
      ? '<span class="gregressed"><span class="msi" aria-hidden="true">trending_up</span>' +
        g.roll.regressed +
        " regressed</span>"
      : "") +
    (g.roll.broken > 0
      ? '<span class="warn"><span class="msi" aria-hidden="true">warning</span>' +
        g.roll.broken +
        " unreadable</span>"
      : "") +
    (when ? '<span class="gwhen">' + escapeHtml(when) + "</span>" : "") +
    "</button>"
  )
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
/**
 * The Library's list: a foldable section per variant set, everything else the
 * bare cards it always was. A root whose pair ids carry no `--` renders byte
 * for byte what `pairCards` renders — which is what keeps the annotator's own
 * self-measurement (twelve lone items in the demo root) a real assertion
 * about this change rather than one nobody can see.
 *
 * A collapsed group renders NO cells: not hidden ones, none at all. On a
 * 194-cell root that is 194 lazy images the browser never has to make.
 */
/**
 * The way INTO a set's sheet, and the only one there is.
 *
 * Chunk 3 shipped the sheet at `#/set/<entryId>` and nothing linked to it, so the
 * surface was reachable only by typing a URL — which on a phone is not reachable
 * at all. An unlinked feature is indistinguishable from an unbuilt one, and it
 * was reported as "click any set group" by the very session that skipped the
 * link.
 *
 * A SIBLING of the `.ghead` button, never a child: nesting an anchor inside a
 * button is invalid, and the group's click handler resolves `closest('.ghead')`,
 * so a link inside the header would toggle the group as well as follow itself.
 * As a sibling it bubbles past `.ghead` and only changes the hash.
 *
 * Every group that gets a header is a SET (`libraryList` renders one only for a
 * foldable group), so the link is always meaningful. It is offered even when the
 * root holds no `<entryId>.set.json` — the route answers that with a named error
 * naming the command that writes one, which is a better answer than hiding the
 * affordance and leaving the reader to wonder whether a sheet exists.
 */
export function groupSheetLink(g: LibraryGroup): string {
  const id = escapeHtml(g.id)
  return (
    '<a class="gsheet-link" href="#/set/' +
    encodeURIComponent(g.id) +
    '" title="Open ' +
    id +
    ' as a variant sheet" aria-label="Open ' +
    id +
    ' as a variant sheet"><span class="msi" aria-hidden="true">grid_view</span><span class="gsheet-label">Sheet</span></a>'
  )
}

export function libraryList(
  groups: LibraryGroup[],
  href: (pair: PairSummary) => string,
  layout: LibraryLayout = "desktop",
  now: number = Date.now(),
  open: ReadonlySet<string> = new Set(),
): string {
  let out = ""
  for (const g of groups) {
    if (!isFoldable(g)) {
      out += pairCards(g.cells, href, layout, now)
      continue
    }
    const isOpen = open.has(g.id)
    out +=
      '<section class="grp' +
      (isOpen ? " open" : "") +
      '" data-group="' +
      escapeHtml(g.id) +
      '"><div class="ghead-row">' +
      groupHeader(g, isOpen, now) +
      groupSheetLink(g) +
      "</div>" +
      (isOpen ? '<div class="gcells">' + pairCards(g.cells, href, layout, now) + "</div>" : "") +
      "</section>"
  }
  return out
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
