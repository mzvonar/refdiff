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
  /** The manifest entry's title, when the report carries one. */
  title?: string
  /**
   * Which entry and breakpoint this run dir measures, when the entry declared
   * `viewports` — the fact that makes two dirs "one screen at two widths"
   * without parsing their names. Absent on single-width pairs and on reports
   * written before core recorded it.
   */
  breakpoint?: { entry: string; viewport: string; width: number; height: number }
  /**
   * Set by `collapseBreakpoints` on the one card that stands for an entry's widths: every
   * width the entry was measured at, wide to narrow, each with its run dir. The Library shows
   * one item per screen; the comparison tool's viewport menu is where the widths are switched.
   */
  widths?: { viewport: string; width: number; height: number; dir: string }[]
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
 *
 * TWO were RENAMED by the Library-groups comp, and both changed what the
 * filter MEANS rather than only how it reads:
 *
 *   `Diverging`       -> `Regressed`    `introduced > resolved` became
 *                                       `delta.regressions > 0`
 *   `Low confidence`  -> `Stale cells`  an alignment property became a
 *                                       per-group RUN property
 *
 * The second is why `matchesFilter` takes a third argument. Staleness is not a
 * property of a cell — it is `run < max(run) over its GROUP` — and run ordinals
 * count PER PAIR, so there is no global newest to compare against (the DS root
 * measured r2 for eleven `ds-button-icon` cells against r10 for
 * `ds-button-fill`; a global max would call all eleven stale against a run they
 * were never behind). `staleCells` does the grouping once; the predicate only
 * asks whether this dir is in the answer.
 */
export const STATE_CHIPS: readonly { id: LibraryFilter["state"]; label: string }[] = [
  { id: "all", label: "Any state" },
  { id: "fail", label: "Failing" },
  { id: "critical", label: "Critical" },
  { id: "regressed", label: "Regressed" },
  { id: "stale", label: "Stale cells" },
  { id: "comments", label: "Has comments" },
]

export interface LibraryFilter {
  query: string
  /** A `SOURCE_CHIPS` id. */
  source: string
  state: "all" | "fail" | "critical" | "regressed" | "stale" | "comments"
}

export const DEFAULT_FILTER: LibraryFilter = { query: "", source: "all", state: "all" }

const NO_STALE: ReadonlySet<string> = new Set()

/**
 * Which cells are BEHIND their own group's newest run — the `Stale cells`
 * chip's corpus, and the `N stale` the Measured column counts.
 *
 * Grouped by `entryIdOf`, exactly as the Library groups, so a lone item is its
 * own group of one and is never stale. A cell with no `run` at all is NOT
 * stale: a dir written before runs were numbered has no ordinal, and treating
 * "unknown" as "behind" would mark every pre-numbering run stale forever.
 */
export function staleCells(entries: readonly PairEntry[]): Set<string> {
  const newest = new Map<string, number>()
  for (const e of entries) {
    if (isBroken(e) || e.run === undefined) continue
    const id = entryIdOf(e.dir) ?? e.dir
    const n = newest.get(id)
    if (n === undefined || e.run > n) newest.set(id, e.run)
  }
  const out = new Set<string>()
  for (const e of entries) {
    if (isBroken(e) || e.run === undefined) continue
    const n = newest.get(entryIdOf(e.dir) ?? e.dir)
    if (n !== undefined && e.run < n) out.add(e.dir)
  }
  return out
}

/**
 * One Library item per SCREEN: the run dirs that share a `breakpoint.entry` collapse into the
 * widest one, which carries `widths` for the rest. Measured 2026-09-17: four widths of one
 * workbench read as four unrelated cards, and the viewport menu on the opened pair already
 * switches between them, so the Library listing them all was clutter, not information. Order
 * is the first sibling's place in the list; a broken dir stays its own item (it has no
 * `breakpoint` to collapse under).
 */
export function collapseBreakpoints(entries: readonly PairEntry[]): PairEntry[] {
  const widest = new Map<string, PairSummary>()
  for (const e of entries) {
    if (isBroken(e) || e.breakpoint === undefined) continue
    const cur = widest.get(e.breakpoint.entry)
    if (cur === undefined || e.breakpoint.width > cur.breakpoint!.width) widest.set(e.breakpoint.entry, e)
  }
  const out: PairEntry[] = []
  const placed = new Set<string>()
  for (const e of entries) {
    if (isBroken(e) || e.breakpoint === undefined) { out.push(e); continue }
    const key = e.breakpoint.entry
    if (placed.has(key)) continue
    placed.add(key)
    const lead = widest.get(key)!
    const widths = entries
      .filter((s): s is PairSummary => !isBroken(s) && s.breakpoint !== undefined && s.breakpoint.entry === key)
      .map((s) => ({ viewport: s.breakpoint!.viewport, width: s.breakpoint!.width, height: s.breakpoint!.height, dir: s.dir }))
      .sort((a, b) => b.width - a.width)
    out.push(widths.length > 1 ? { ...lead, widths } : lead)
  }
  return out
}

/**
 * The pair route, `#/<id>?vp=<viewport>`: the id is the LIBRARY item — a run dir, or the entry
 * an item's widths share — and the width is a query parameter, so the URL stays 1:1 with the
 * Library and switching widths changes only `vp`. Resolves to the run dir to open and the
 * canonical hash for it (a link to a width's dir by name still opens, and is rewritten to the
 * entry form). `null` when nothing in the list answers to the id.
 */
export function resolvePairRoute(
  entries: readonly PairEntry[],
  id: string,
  vp: string | null,
): { dir: string; hash: string } | null {
  const summaries = entries.filter((e): e is PairSummary => !isBroken(e))
  const byDir = entries.find((e) => e.dir === id)
  const entryOf = (e: PairEntry) => (!isBroken(e) && e.breakpoint ? e.breakpoint.entry : null)
  const entry = byDir ? entryOf(byDir) : summaries.some((e) => e.breakpoint?.entry === id) ? id : null
  if (entry === null) return byDir ? { dir: byDir.dir, hash: "#/" + encodeURIComponent(byDir.dir) } : null
  const widths = summaries.filter((e) => e.breakpoint?.entry === entry).sort((a, b) => b.breakpoint!.width - a.breakpoint!.width)
  const wanted = vp ?? (byDir && !isBroken(byDir) && byDir.breakpoint ? byDir.breakpoint.viewport : null)
  const pick = widths.find((e) => e.breakpoint!.viewport === wanted) ?? widths[0]
  if (!pick) return null
  return { dir: pick.dir, hash: "#/" + encodeURIComponent(entry) + "?vp=" + encodeURIComponent(pick.breakpoint!.viewport) }
}

/** `#/<id>?vp=<viewport>` → its two parts; `null` for the index. */
export function parsePairRoute(hash: string): { id: string; vp: string | null } | null {
  const raw = hash.replace(/^#\/?/, "")
  if (!raw) return null
  const q = raw.indexOf("?")
  const id = decodeURIComponent(q < 0 ? raw : raw.slice(0, q))
  const vp = q < 0 ? null : new URLSearchParams(raw.slice(q + 1)).get("vp")
  return { id, vp }
}

/** The Library link of an item: the entry for a width's card, the dir for everything else. */
export function pairHref(p: PairEntry): string {
  return "#/" + encodeURIComponent(!isBroken(p) && p.breakpoint ? p.breakpoint.entry : p.dir)
}

/** "Desktop 1440×900 · Laptop 1280×800" — the card's tooltip when it stands for several widths. */
export function widthsLabel(widths: readonly { viewport: string; width: number; height: number }[]): string {
  return widths.map((w) => w.viewport.charAt(0).toUpperCase() + w.viewport.slice(1) + " " + w.width + "×" + w.height).join(" · ")
}

/** The comp's `match`: source, then text, then state — a broken run only under "Any state". */
export function matchesFilter(
  entry: PairEntry,
  f: LibraryFilter,
  stale: ReadonlySet<string> = NO_STALE,
): boolean {
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
    case "regressed":
      // The comp's own words: "cells whose findings were fixed in an earlier
      // run and are back". Deliberately NOT the retired `Diverging` test
      // (`introduced > resolved`) — a reader can see that on every row's own
      // trend; a fix coming undone they cannot.
      return !!entry.delta && entry.delta.regressions > 0
    case "stale":
      return stale.has(entry.dir)
    case "comments":
      return entry.notes > 0
    default:
      return true
  }
}

export function filterEntries(entries: PairEntry[], f: LibraryFilter): PairEntry[] {
  const stale = staleCells(entries)
  return entries.filter((e) => matchesFilter(e, f, stale))
}

/**
 * The head-row count, in the comp's shape: it counts CELLS, and names the
 * groups they sit in.
 *
 *   unfiltered   `194 cells in 14 groups`
 *   filtered     `12 of 194 cells · 3 of 14 groups`
 *
 * `total` counts the unreadable runs too — a pair that cannot be read is still
 * a cell the root holds, and dropping it from the denominator would make the
 * list look complete when it is not.
 */
export function countMessage(
  shownCells: number,
  totalCells: number,
  shownGroups: number,
  totalGroups: number,
): string {
  if (shownCells === totalCells && shownGroups === totalGroups)
    return totalCells + " cells in " + totalGroups + " groups"
  return (
    shownCells + " of " + totalCells + " cells · " + shownGroups + " of " + totalGroups + " groups"
  )
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
  /** Over `cells`, so the header's numbers reconcile with the rows under it. */
  roll: GroupRollup
  /** The Measured column: `r<min> -> r<max>` over this group's OWN cells. */
  span: GroupRunSpan
}

/**
 * The Measured column, computed WITHIN one group — which is the only place it
 * is computable. `ComparisonReport.run` is the ordinal of a run OF THAT PAIR,
 * so ordinals are incomparable across groups and there is no global newest.
 * (The comp's module-level `NEWEST = 47` is fixture scaffolding and must not be
 * read as data: measured on the DS root, `ds-button-icon`'s eleven cells all
 * sit at r2 while `ds-button-fill` is at r9/r10.)
 *
 * `mixed` is what decides which of the comp's two shapes the column draws: a
 * span with a `history` glyph on the older end, or a single `r<n>` with its
 * `when` underneath. Both ends absent means no cell in the group carried an
 * ordinal, and the column then says nothing rather than inventing an `r0`.
 */
export interface GroupRunSpan {
  min?: number | undefined
  max?: number | undefined
  /** Cells strictly behind `max` — the `N stale` the column prints. */
  stale: number
  /** `min !== max`: the group genuinely mixes vintages. */
  mixed: boolean
}

export function groupRunSpan(cells: readonly PairEntry[]): GroupRunSpan {
  let min: number | undefined
  let max: number | undefined
  for (const c of cells) {
    if (isBroken(c) || c.run === undefined) continue
    if (min === undefined || c.run < min) min = c.run
    if (max === undefined || c.run > max) max = c.run
  }
  let stale = 0
  if (max !== undefined)
    for (const c of cells) if (!isBroken(c) && c.run !== undefined && c.run < max) stale++
  return { min, max, stale, mixed: min !== undefined && max !== undefined && min !== max }
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
 * data.
 *
 * **Groups come out ALPHABETICALLY, ascending** (repo owner, 2026-09-07). They
 * used to come out in the order their first cell arrived, which — with
 * `sortEntries` feeding this newest-run-first — meant the group that finished
 * most recently led the list. That read well for a flat list of runs and badly
 * for a library: the Library's job is to let a reader FIND a component set, and
 * a list whose order changes every time a subset re-runs cannot be scanned. The
 * row that just finished is still findable by the `Measured` column, which is
 * what that column is for.
 *
 * `sortEntries` still decides the order of the CELLS inside a group, where
 * newest-first is right — those are runs of one thing, not things.
 *
 * Comparison is `localeCompare` pinned to `en` with numeric collation, so
 * `ds-button-2` precedes `ds-button-10`, plus a codepoint tiebreak so two ids
 * differing only in case have a deterministic order rather than the engine's.
 *
 * The filter applies INSIDE a group and a group with nothing left disappears;
 * `total` remembers what it held, so its count can read `3 of 41`.
 */
export function groupEntries(
  entries: PairEntry[],
  f: LibraryFilter = DEFAULT_FILTER,
): LibraryGroup[] {
  // Staleness is per GROUP, so it is resolved over the whole list before the
  // filter runs — a `Stale cells` filter that computed it over the survivors
  // would answer a different question each time it narrowed.
  const stale = staleCells(entries)
  const order: string[] = []
  const byId = new Map<string, { set: boolean; cells: PairEntry[]; all: PairEntry[] }>()
  for (const e of entries) {
    const entryId = entryIdOf(e.dir)
    const id = entryId ?? e.dir
    let g = byId.get(id)
    if (!g) {
      g = { set: false, cells: [], all: [] }
      byId.set(id, g)
      order.push(id)
    }
    if (entryId !== null) g.set = true
    g.all.push(e)
    if (matchesFilter(e, f, stale)) g.cells.push(e)
  }
  const out: LibraryGroup[] = []
  for (const id of order) {
    const g = byId.get(id)
    if (!g || g.cells.length === 0) continue
    // The span reads off ALL the group's cells, not the surviving ones: the
    // column answers "when was this SET measured", which a filter does not move.
    out.push({
      id,
      set: g.set,
      cells: g.cells,
      total: g.all.length,
      roll: rollUp(g.cells),
      span: groupRunSpan(g.all),
    })
  }
  out.sort((a, b) => byGroupName(a.id, b.id))
  return out
}

/** Alphabetical, numeric-aware, and deterministic on a case-only difference. */
const byGroupName = (a: string, b: string): number =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) ||
  (a < b ? -1 : a > b ? 1 : 0)

/**
 * The leading `-`-delimited segment EVERY group shares, or `""` when they do
 * not all share one — the prefix a row's name can drop because it carries no
 * information (repo owner: "it's all ds").
 *
 * **Only when every group shares it, and that is what makes it safe.** Removing
 * one common prefix from a set of unique ids is a bijection, so the labels stay
 * unique and no two rows can end up with the same name. A hardcoded `ds-` strip
 * would not be safe: the demo root holds a flat `button` dir AND a `ds-button`
 * set — deliberately, per `fixtures/make-demo-root.ts` — and stripping there
 * would draw two rows called `button`. That root is heterogeneous, so this
 * returns `""` for it and nothing is stripped.
 *
 * **One segment, never more.** The longest shared run would strip `ds-button-`
 * from a root of `ds-button-fill` / `ds-button-ghost` / `ds-button-icon` and
 * leave `fill` / `ghost` / `icon`, which loses the component the reader is
 * looking for. One segment removes the vendor tag and stops.
 *
 * Computed over the WHOLE root, never over the filtered groups: a label that
 * changed as the reader narrowed would be a different name for the same row.
 * A root with fewer than two groups has no redundancy to remove and keeps its
 * full ids.
 */
export function commonIdPrefix(ids: readonly string[]): string {
  if (ids.length < 2) return ""
  const head = ids[0]?.split("-")[0]
  if (head === undefined || head === "" || head === ids[0]) return ""
  const prefix = head + "-"
  return ids.every((id) => id.startsWith(prefix) && id.length > prefix.length) ? prefix : ""
}

/** What a row calls itself: its id, less a prefix every row shares. */
export const groupLabel = (id: string, prefix: string): string =>
  prefix !== "" && id.startsWith(prefix) && id.length > prefix.length
    ? id.slice(prefix.length)
    : id

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
  const open =
    '<a class="card" data-pair="' + escapeHtml(pair.dir) + '" href="' + escapeHtml(href) + '"' +
    (pair.widths ? ' title="' + escapeHtml(widthsLabel(pair.widths)) + '"' : "") + ">"
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
/* --------------------------------------------------- the grouped table -- */

/**
 * The Library IS a table now, and that is a REBUILD rather than a delta.
 *
 * Chunk 1 grouped the existing thumbnail card grid; `RefDiff Library
 * Groups.dc.html` replaces the grid with a six-column table
 * (`Component set | Source | Cells | Findings roll-up | Measured | .`), so
 * `groupHeader`, `libraryList` and `groupSheetLink` went and these took their
 * place. **The whole PURE layer survived** — `entryIdOf`, `groupEntries`,
 * `cellsShown`, `isFoldable`, `isFilterActive`, `openGroups`, `groupWhen` and
 * the roll-up all keep their contracts, because the comp confirms every
 * semantic they encode. What changed is the markup and two filter meanings.
 *
 * Why the group row is a `div role="button"` and not a `<button>`: `Open
 * sheet` is one of the row's six COLUMNS in this comp, and an anchor inside a
 * button is invalid HTML. Chunk 1 solved the same problem by making the sheet
 * link a SIBLING of the `.ghead` button inside a `.ghead-row`, which was right
 * for a card grid and cannot work for a table row. As a div the anchor nests
 * legally; the cost is that the keyboard handling is ours (Enter / Space in
 * `app-shell.ts`) rather than the browser's.
 *
 * The header row sits OUTSIDE the `bg1` card, as the comp draws it, so neither
 * claims an ARIA table role: a table role whose header row is not inside it
 * describes a structure that is not there, which is worse for a screen reader
 * than the plain group of rows this actually is. (Do not write that role name
 * as a quoted token in here — `icon-subset.mjs` scans every quoted lowercase
 * word in this file against Google's glyph list, and it is one of them.)
 */

/** The comp caps an expanded group at TEN rows and offers `Show N more`. */
export const ROW_CAP = 10

/** The six column headers; the action column is deliberately unlabelled. */
export const TABLE_HEAD =
  '<div class="lthead" aria-hidden="true">' +
  ["Component set", "Source", "Cells", "Findings roll-up", "Measured", ""]
    .map((h) => "<span>" + h + "</span>")
    .join("") +
  "</div>"

/**
 * The comp's 44x34 mini variant-sheet plate: a three-column grid of six tiles.
 * Static art, not data — it reads as "this is a SET" at a glance, and no
 * per-cell information would survive at 9x10px. The real per-cell captures are
 * in the rows underneath, and in the sheet the `Open sheet` column opens.
 */
function groupThumb(): string {
  let t = ""
  for (let i = 0; i < 6; i++) t += '<i class="t' + (i % 3) + '"></i>'
  return '<div class="lthumb" aria-hidden="true">' + t + "</div>"
}

/** The comp's roll-up: a dot and the COUNT in the severity colour, or a green `Clean`. */
function rollupBadges(c: GroupRollup): string {
  const out: string[] = []
  for (const [sev, n, label] of [
    ["critical", c.critical, "Critical"],
    ["major", c.major, "Major"],
    ["minor", c.minor, "Minor"],
  ] as const)
    if (n > 0)
      out.push(
        '<span class="rb ' + sev + '" title="' + label + " " + n + '"><i class="dot"></i>' + n + "</span>",
      )
  if (out.length === 0) out.push('<span class="rb clean" title="No findings">Clean</span>')
  return out.join("")
}

/** A cell's own verdict: the severity WORD, as the comp's sub-rows read. */
function cellBadge(c: PairSummary): string {
  const [sev, label] =
    c.critical > 0
      ? ["critical", "Critical"]
      : c.major > 0
        ? ["major", "Major"]
        : c.minor > 0
          ? ["minor", "Minor"]
          : ["none", "No findings"]
  return '<span class="cb ' + sev + '">' + label + "</span>"
}

/** Filled by severity, a hollow green ring when the cell is clean. */
function verdictDot(c: PairSummary): string {
  const sev =
    c.critical > 0 ? "critical" : c.major > 0 ? "major" : c.minor > 0 ? "minor" : "clean"
  return '<i class="vdot ' + sev + '" aria-hidden="true"></i>'
}

const regressedPill = (n: number, word: string): string =>
  n > 0
    ? '<span class="lreg" title="Cells whose findings were fixed in an earlier run and are back">' +
      '<span class="msi" aria-hidden="true">undo</span>' +
      word +
      "</span>"
    : ""

const commentsNote = (n: number): string =>
  n > 0
    ? '<span class="lcm"><span class="msi" aria-hidden="true">chat_bubble</span>' + n + "</span>"
    : ""

/** Unreadable runs are COUNTED in the open — the app's own column, no comp counterpart. */
const brokenNote = (n: number): string =>
  n > 0
    ? '<span class="warn"><span class="msi" aria-hidden="true">warning</span>' +
      n +
      " unreadable</span>"
    : ""

/** The real capture at 34x24 (decision D6), the comp's plate when the run has none. */
function cellThumb(c: PairSummary): string {
  if (c.implPng)
    return '<div class="lcthumb"><img src="' + escapeHtml(c.implPng) + '" alt="" loading="lazy"></div>'
  return '<div class="lcthumb blank" aria-hidden="true"></div>'
}

/**
 * The Measured column for a GROUP: the comp's two shapes, chosen by
 * `span.mixed` — a `r<min> -> r<max>` range with a `history` glyph on the older
 * end and `<when> . N stale` underneath, or a single `r<n>` with its `when`.
 *
 * A group no cell of which carried an ordinal prints nothing but a dash: the
 * ordinals are optional (`PairSummary.run`) and an invented `r0` would be a
 * confident number over a result that was never counted.
 */
function measuredGroup(g: LibraryGroup, now: number): string {
  const when = groupWhen(g.cells, now)
  const whenLine = (extra: string): string =>
    when || extra ? '<span class="lwhen">' + escapeHtml(when) + extra + "</span>" : ""
  if (g.span.max === undefined) return '<span class="lwhen">' + escapeHtml(when || "never") + "</span>"
  if (g.span.mixed)
    return (
      '<div class="lspan mono" title="' +
      escapeHtml(
        g.span.stale +
          " of " +
          g.total +
          " cells were last measured in run r" +
          g.span.min +
          "; the rest in r" +
          g.span.max,
      ) +
      '"><span class="lrun old"><span class="msi" aria-hidden="true">history</span>r' +
      g.span.min +
      '</span><span class="msi arrow" aria-hidden="true">arrow_right_alt</span>' +
      '<span class="lrun new">r' +
      g.span.max +
      "</span></div>" +
      whenLine(g.span.stale > 0 ? " · " + g.span.stale + " stale" : "")
    )
  return '<span class="lrun-flat mono">r' + g.span.max + "</span>" + whenLine("")
}

/** The Measured column for one CELL: a run behind the group's newest gets the pill. */
function measuredCell(c: PairSummary, span: GroupRunSpan, now: number): string {
  const behind = c.run !== undefined && span.max !== undefined && c.run < span.max
  const run =
    c.run === undefined
      ? ""
      : '<span class="lrun ' +
        (behind ? "old" : "new") +
        '" title="' +
        escapeHtml(
          behind
            ? "Measured in run r" +
                c.run +
                " — " +
                ((span.max as number) - c.run) +
                " runs behind this set's newest"
            : "Measured in the newest run of this pair",
        ) +
        '">' +
        (behind ? '<span class="msi" aria-hidden="true">history</span>' : "") +
        "r" +
        c.run +
        "</span>"
  return run + '<span class="lwhen">' + escapeHtml(relativeWhen(c.createdAt, now)) + "</span>"
}

/**
 * What a sub-row calls itself. The comp names a cell by its VARIANT PROPS
 * (`Primary . md . Default`) rather than by its pair id, which is what chunk
 * 2's `props` in `<entryId>.set.json` made expressible — `/api/pairs` carries
 * none, so the join is by run dir and the app fetches the set index for a
 * group only once that group is OPEN.
 *
 * Falls back to the pair id, which is what the card showed. A fallback rather
 * than a blank: a root with no set index still lists its cells, and the row
 * stays clickable.
 */
function cellName(c: PairSummary, names: ReadonlyMap<string, string>): string {
  return names.get(c.dir) ?? c.pair
}

/** One expanded sub-row. An anchor: the whole row opens the pair. */
export function cellRow(
  cell: PairEntry,
  href: string,
  span: GroupRunSpan,
  layout: LibraryLayout,
  now: number,
  names: ReadonlyMap<string, string> = new Map(),
): string {
  if (isBroken(cell)) {
    const nm = escapeHtml(cell.pair ?? cell.dir)
    const body =
      '<i class="vdot unreadable" aria-hidden="true"></i><div class="lcthumb blank broken" aria-hidden="true">' +
      '<span class="msi" aria-hidden="true">broken_image</span></div><span class="lcn mono">' +
      nm +
      "</span>"
    if (layout === "mobile")
      return (
        '<div class="lcell broken" data-pair="' +
        escapeHtml(cell.dir) +
        '">' +
        body +
        '<div class="lcbody"><span class="warn"><span class="msi" aria-hidden="true">warning</span>Couldn’t read this run</span>' +
        '<span class="tech mono">' +
        escapeHtml(cell.reason) +
        "</span></div></div>"
      )
    return (
      '<div class="lcell broken" data-pair="' +
      escapeHtml(cell.dir) +
      '"><div class="lcname">' +
      body +
      '</div><div></div><div></div><div class="lroll"><span class="warn">' +
      '<span class="msi" aria-hidden="true">warning</span>Couldn’t read this run</span>' +
      '<span class="tech mono">' +
      escapeHtml(cell.reason) +
      '</span></div><div class="lmeas"><span class="lwhen">' +
      escapeHtml(cell.createdAt ? relativeWhen(cell.createdAt, now) : "never") +
      "</span></div><div></div></div>"
    )
  }
  const open =
    '<a class="lcell" data-pair="' + escapeHtml(cell.dir) + '" href="' + escapeHtml(href) + '">'
  const name = '<span class="lcn mono">' + escapeHtml(cellName(cell, names)) + "</span>"
  const marks =
    cellBadge(cell) +
    regressedPill(cell.delta && cell.delta.regressions > 0 ? 1 : 0, "Regression") +
    commentsNote(cell.notes)
  if (layout === "mobile")
    return (
      open +
      verdictDot(cell) +
      cellThumb(cell) +
      '<div class="lcbody">' +
      name +
      '<div class="lcmarks">' +
      marks +
      measuredCell(cell, span, now) +
      '</div></div><span class="msi go" aria-hidden="true">chevron_right</span></a>'
    )
  return (
    open +
    '<div class="lcname">' +
    verdictDot(cell) +
    cellThumb(cell) +
    name +
    '</div><div></div><div></div><div class="lroll">' +
    marks +
    '</div><div class="lmeas lmeas-cell">' +
    measuredCell(cell, span, now) +
    '</div><div class="lgo">Compare<span class="msi" aria-hidden="true">chevron_right</span></div></a>'
  )
}

/** The comp's `Show N more`, which lifts the ten-row cap for that group only. */
export function moreRow(g: LibraryGroup, hidden: number): string {
  return (
    '<button type="button" class="lmore" data-more="' +
    escapeHtml(g.id) +
    '"><span class="msi" aria-hidden="true">unfold_more</span>Show ' +
    hidden +
    " more</button>"
  )
}

/**
 * One group row. Six columns on desktop; on the phone the comp folds the same
 * fields into a `bg1` card with a 44px sheet button.
 *
 * `Open sheet` is offered whenever the group IS a set (`g.set`), not only when
 * it is foldable: a set that measured exactly one variant still has a sheet
 * worth opening, and the route answers a missing set index with a named error
 * rather than a blank. A LONE item (`set: false`) is not a set and gets no
 * button — it is one comparison that happens to sit in the same table.
 */
export function groupRow(
  g: LibraryGroup,
  open: boolean,
  layout: LibraryLayout,
  now: number,
  /**
   * What the row is CALLED — `g.id` less a prefix every row shares
   * (`commonIdPrefix`). Display only: `data-group`, the `#/set/` route and the
   * set-index fetch all key on the real id, and a label is not unique across
   * roots. Defaults to the id, which is the pre-2026-09-07 behaviour, so a
   * caller that forgets it degrades to the full name rather than to a blank.
   */
  label: string = g.id,
  /**
   * A LONE item's way into its own comparison. A set is reached through its cells (expand the
   * group) or its sheet; a lone item has neither — it is never foldable, so `libraryTable` renders
   * no `cellRow` for it, and it is not a set, so it gets no sheet button. Before this it rendered
   * with NO link at all, which on a root of lone items meant the Library could not open a single
   * pair (measured: four lone items, zero hrefs in the whole table). Empty for a set, whose cells
   * carry their own links.
   */
  pairHref: string = "",
): string {
  const id = escapeHtml(g.id)
  const name = escapeHtml(label)
  const expandable = isFoldable(g)
  // "1 cells" read as a bug on every lone-item row of the demo root (ten of
  // them in run 2's extra-element list), and a lone item is the common case on
  // any root that is not all variant sets.
  const cellsLabel =
    g.cells.length === g.total
      ? g.total + (g.total === 1 ? " cell" : " cells")
      : g.cells.length + " of " + g.total
  let comments = 0
  for (const c of g.cells) if (!isBroken(c)) comments += c.notes
  // One chip when the group agrees on its design source, and nothing when it
  // does not: a set's cells come from one Figma node or one comp, so a mixed
  // group is a surprise worth showing as a blank rather than as a guess.
  const sources = new Set<string>()
  for (const c of g.cells) if (!isBroken(c)) sources.add(c.designSource)
  const only = sources.size === 1 ? sources.values().next().value : undefined
  const src = only === undefined ? "" : sourceChip(only)
  const marks =
    rollupBadges(g.roll) +
    regressedPill(g.roll.regressed, g.roll.regressed + " regressed") +
    brokenNote(g.roll.broken) +
    commentsNote(comments)
  const sheet = g.set
    ? '<a class="lsheet" href="#/set/' +
      encodeURIComponent(g.id) +
      '" title="Open ' +
      name +
      ' as a variant sheet" aria-label="Open ' +
      name +
      ' as a variant sheet"><span class="msi" aria-hidden="true">grid_view</span>' +
      '<span class="lsheet-label">Open sheet</span></a>'
    : pairHref === ""
      ? ""
      : // NOT an anchor: the whole row already is one (see `head`), and an <a> inside an <a> is
        // invalid HTML that browsers silently un-nest. This is the same affordance a cell row
        // carries, rendered as the row's own trailing chevron.
        '<span class="lsheet"><span class="lsheet-label">Compare</span>' +
        '<span class="msi" aria-hidden="true">chevron_right</span></span>'
  // The comp swaps GLYPHS; chunk 1 rotated ONE because `chevron_right` was not
  // in the icon subset. Re-running icon-subset.mjs for these comps put it there
  // (101 -> 112 glyphs), so the rotation goes. It was never only cosmetic: a
  // rotated `expand_more` is 18x22 where `chevron_right` is 15x19, so the
  // extractor saw a size mismatch on every collapsed row.
  const caret = expandable
    ? '<span class="msi caret" aria-hidden="true">' +
      (open ? "expand_more" : "chevron_right") +
      "</span>"
    : '<span class="caret-gap" aria-hidden="true"></span>'
  // A foldable group's whole row TOGGLES, so it stays a div with role=button. A lone item's whole
  // row NAVIGATES, so it is a real anchor: the hit target is the row rather than a small trailing
  // link, and middle-click, cmd-click, "copy link" and keyboard focus all come for free — none of
  // which a click handler on a div would give.
  const rowIsLink = !expandable && pairHref !== ""
  const head = rowIsLink
    ? '<a class="lrow flat lrow-link" data-group="' +
      id +
      '" data-pair="' +
      id +
      '" href="' +
      escapeHtml(pairHref) +
      '" title="Compare ' +
      name +
      '">'
    : '<div class="lrow' +
      (open ? " open" : "") +
      (expandable ? "" : " flat") +
      '" data-group="' +
      id +
      '"' +
      (expandable ? ' role="button" tabindex="0" aria-expanded="' + (open ? "true" : "false") + '"' : "") +
      ">"
  const headClose = rowIsLink ? "</a>" : "</div>"
  if (layout === "mobile")
    return (
      head +
      '<div class="lrhead">' +
      caret +
      '<div class="lrcol"><div class="lrline">' +
      groupThumb() +
      '<span class="lname">' +
      name +
      '</span><span class="lcount mono">' +
      cellsLabel +
      '</span></div><div class="lrline wrap">' +
      src +
      marks +
      '</div><div class="lrline meas">' +
      measuredGroup(g, now) +
      "</div></div>" +
      sheet +
      "</div>" +
      headClose
    )
  return (
    head +
    '<div class="lset">' +
    caret +
    groupThumb() +
    '<div class="lnames"><span class="lname">' +
    name +
    '</span></div></div><div class="lsrc">' +
    src +
    '</div><div class="lcount mono">' +
    cellsLabel +
    '</div><div class="lroll">' +
    marks +
    '</div><div class="lmeas">' +
    measuredGroup(g, now) +
    '</div><div class="lact">' +
    sheet +
    "</div>" +
    headClose
  )
}

/**
 * The Library's list: the comp's table, one row per group and — when the group
 * is open — one sub-row per cell, capped at `ROW_CAP` with a `Show N more`.
 *
 * A collapsed group renders NO sub-rows: not hidden ones, none at all. On a
 * 194-cell root that is 194 lazy images the browser never has to make, and it
 * is the same decision chunk 1 made for the card grid.
 *
 * `more` names the groups whose cap the reader has lifted; `names` maps a run
 * dir to its variant props, and an empty map is the honest default (the label
 * falls back to the pair id).
 */
export function libraryTable(
  groups: LibraryGroup[],
  href: (pair: PairSummary) => string,
  layout: LibraryLayout = "desktop",
  now: number = Date.now(),
  open: ReadonlySet<string> = new Set(),
  more: ReadonlySet<string> = new Set(),
  names: ReadonlyMap<string, string> = new Map(),
  /**
   * The shared id prefix rows may drop, from `commonIdPrefix` over the WHOLE
   * root rather than over `groups` — these are already filtered, and a label
   * that moved as the reader narrowed would rename the row under them.
   */
  prefix: string = "",
): string {
  let out = ""
  for (const g of groups) {
    const isOpen = open.has(g.id) && isFoldable(g)
    // A lone item is one comparison sitting in the group table: nothing to expand and no sheet, so
    // the row itself has to carry the link or the pair is unreachable. A group with cells is left
    // alone — its cells carry their own.
    const lone = !g.set && g.cells.length === 1 ? g.cells[0] : undefined
    let body = groupRow(
      g,
      isOpen,
      layout,
      now,
      groupLabel(g.id, prefix),
      lone === undefined || isBroken(lone) ? "" : href(lone),
    )
    if (isOpen) {
      const cap = more.has(g.id) ? g.cells.length : ROW_CAP
      const shown = g.cells.slice(0, cap)
      body +=
        shown
          .map((c) => cellRow(c, isBroken(c) ? "" : href(c), g.span, layout, now, names))
          .join("") +
        (g.cells.length > shown.length ? moreRow(g, g.cells.length - shown.length) : "")
    }
    out += '<div class="lgcard" data-group="' + escapeHtml(g.id) + '">' + body + "</div>"
  }
  return layout === "mobile" ? out : TABLE_HEAD + '<div class="ltable">' + out + "</div>"
}

/**
 * The comp's filter-semantics explainer, shown only while a filter is active.
 * Its wording is the comp's own, and it is the sentence that confirms chunk 1's
 * filter design rather than describing a new one: the filter applies to CELLS,
 * a group with no matching cell disappears, and a matching group opens to show
 * only its matches (`openGroups`).
 */
export function filterExplainer(f: LibraryFilter): string {
  if (!isFilterActive(f)) return ""
  return (
    '<div class="lfx"><span class="msi" aria-hidden="true">filter_alt</span><span>' +
    "Filters apply to cells. Groups with no matching cell are hidden; matching groups open to show only their matches." +
    '</span><button type="button" class="lclear" id="lib-clear">Clear</button></div>'
  )
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
