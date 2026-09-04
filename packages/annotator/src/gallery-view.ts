/**
 * The variant sheet's pure logic: resolve a set's `gallery` declaration against
 * its real axes, place every cell, and say what each cell IS.
 *
 * `view-math.ts` owns the geometry (`galleryLayout`, `cellOrigin`); this owns
 * the meaning. The split is the same one the Library has: `index-view.ts`
 * decides what a row says, `view-math.ts` decides where things are.
 *
 * Like every module embedded into the app shell, this compiles to plain JS with
 * no imports — the types below are structural copies of core's, on purpose.
 */

/* ------------------------------------------------------- core's shapes -- */

/** Structural copy of core's `VariantAxes`. */
export interface GAxes {
  /**
   * `definitions` is the designer's own option order; `child-names` is the
   * fallback's TRAVERSAL order. The distinction is why this field exists at
   * all, and why the sheet warns when it is reading the fallback (below).
   */
  source: "definitions" | "child-names"
  properties: Record<string, string[]>
}

/** Structural copy of core's `GalleryConfig` — the manifest's declaration. */
export interface GConfig {
  columns?: string
  rows?: string
  order?: Record<string, string[]>
  labels?: Record<string, Record<string, string>>
}

/** Structural copy of core's `SetIndex`, only the fields a sheet reads. */
export interface GSetIndex {
  entryId: string
  title?: string
  setName: string
  createdAt: string
  axes: GAxes
  gallery?: GConfig
  pairs: { slug: string; dir: string; props: Record<string, string> }[]
  skipped: { nodeId: string; name: string; reason: string; props: Record<string, string> }[]
}

/* --------------------------------------------- resolving the declaration -- */

/** One axis of the resolved grid: a property and the options along it, in order. */
export interface GAxis {
  property: string
  options: string[]
  /** `labels` applied, so a renderer never re-reads the declaration. */
  labels: string[]
}

export interface GResolved {
  columns: GAxis
  /**
   * The row axes, outermost first. A sheet's rows are the cross-product of
   * every property that is NOT the column axis — the comps draw tone x size
   * down the rows against state across — so this is a LIST, not one axis.
   */
  rows: GAxis[]
  /** Every row, as the option tuple of `rows`, outermost first. */
  rowTuples: string[][]
  /** Non-fatal: the declaration asked for something the set does not have. */
  warnings: string[]
}

export type GResolveResult =
  | { ok: true; value: GResolved }
  | { ok: false; error: string }

/**
 * WHAT AN UNRESOLVABLE NAME MEANS — chunk 3's decision, and the reasoning that
 * decided it, because the next reader's instinct will be to soften it.
 *
 * Chunk 4 carried `gallery` VERBATIM into the set index and resolved nothing:
 * the manifest parser holds no Figma node, so `columns: "Stat"` is shape-valid
 * there and travels intact. THIS is the first place in the pipeline that holds
 * both the declaration and the axes, so it is the first place the name can be
 * checked at all — and a checkable error that nothing checks is worse than an
 * uncheckable one, because everything downstream now looks validated.
 *
 * The call is graded by what a miss can BREAK, and the grade is the argument:
 *
 *  - `columns` / `rows` naming a property the set does not define is FATAL.
 *    There is no correct sheet to draw: the grid's whole shape came from that
 *    name. Falling back to the axes' order would draw a plausible grid in which
 *    the declaration did nothing, and nobody could see it — precisely the
 *    "loses a label in silence while the library still draws, looking finished"
 *    failure chunk 4 refused for the manifest. So the sheet refuses, and names
 *    the properties that DO exist, which is the one thing the reader needs.
 *  - `order` naming an option no cell carries is a WARNING and the option is
 *    dropped. Membership of an axis belongs to the SET, never to a declaration
 *    ordering it; an option that does not exist cannot be positioned, and
 *    honouring it would open an empty track that reads as a hole in the data.
 *    Partial pinning is NOT a warning — pinning the first three of nine and
 *    letting the rest follow is the documented use.
 *  - `labels` naming an unknown property or option is a WARNING and ignored.
 *    It is cosmetic by construction: the grid is already correct, one header
 *    merely keeps its raw name.
 *
 * And one warning that no declaration causes: when `axes.source` is
 * `child-names` the option order is TRAVERSAL order, not the designer's, so any
 * sheet drawn from it is ordered by an accident of the file. That is the state
 * `variantAxes` was split in two to make visible, and a sheet is exactly where
 * someone would otherwise read it as intent. `order` silences it per property,
 * by pinning what the fallback could only guess.
 */
export function resolveGallery(axes: GAxes, gallery?: GConfig): GResolveResult {
  const props = Object.keys(axes.properties)
  if (props.length === 0) return { ok: false, error: "the set defines no variant properties" }

  const warnings: string[] = []
  const known = (name: string): boolean => Object.hasOwn(axes.properties, name)
  const namesFor = (bad: string, field: string): string =>
    `gallery.${field} names "${bad}", which this set does not define — it has ${props.map((p) => `"${p}"`).join(", ")}`

  const declaredCols = gallery?.columns
  if (declaredCols !== undefined && !known(declaredCols)) {
    return { ok: false, error: namesFor(declaredCols, "columns") }
  }
  const declaredRows = gallery?.rows
  if (declaredRows !== undefined && !known(declaredRows)) {
    return { ok: false, error: namesFor(declaredRows, "rows") }
  }
  if (declaredCols !== undefined && declaredCols === declaredRows) {
    return {
      ok: false,
      error: `gallery.columns and gallery.rows both name "${declaredCols}" — one property cannot be both axes`,
    }
  }

  // No declaration: the axes' own order, applied without reinterpretation —
  // the first property across, the rest down. Arbitrary but STABLE and
  // explainable, and it is what `gallery` exists to override. Most sets declare
  // nothing (the DS manifest declares none at all), so this is the common path,
  // not the degenerate one.
  const colProp = declaredCols ?? props[0]!
  const rest = props.filter((p) => p !== colProp)
  // `rows` names which of the remaining properties LEADS the row nesting; the
  // others follow in the axes' order under it.
  const rowProps = declaredRows ? [declaredRows, ...rest.filter((p) => p !== declaredRows)] : rest

  if (axes.source === "child-names") {
    const unpinned = [colProp, ...rowProps].filter((p) => !gallery?.order?.[p])
    if (unpinned.length > 0) {
      warnings.push(
        `option order for ${unpinned.map((p) => `"${p}"`).join(", ")} is the set's CHILD-NAME traversal order, not the designer's — Figma defined no variantOptions for it. Pin it with gallery.order to state the order you mean`,
      )
    }
  }

  const axisFor = (property: string): GAxis => {
    const own = axes.properties[property] ?? []
    const pinned = gallery?.order?.[property]
    let options: string[]
    if (pinned) {
      const phantom = pinned.filter((o) => !own.includes(o))
      for (const o of phantom) {
        warnings.push(
          `gallery.order["${property}"] pins "${o}", which no cell of this set carries — dropped`,
        )
      }
      const kept = pinned.filter((o) => own.includes(o))
      options = [...kept, ...own.filter((o) => !kept.includes(o))]
    } else {
      options = [...own]
    }
    const map = gallery?.labels?.[property]
    if (map) {
      for (const o of Object.keys(map)) {
        if (!own.includes(o)) {
          warnings.push(
            `gallery.labels["${property}"] labels "${o}", which no cell of this set carries — ignored`,
          )
        }
      }
    }
    return { property, options, labels: options.map((o) => map?.[o] ?? o) }
  }

  for (const property of Object.keys(gallery?.labels ?? {})) {
    if (!known(property)) {
      warnings.push(
        `gallery.labels names "${property}", which this set does not define — ignored`,
      )
    }
  }
  for (const property of Object.keys(gallery?.order ?? {})) {
    if (!known(property)) {
      warnings.push(`gallery.order names "${property}", which this set does not define — ignored`)
    }
  }

  const columns = axisFor(colProp)
  const rows = rowProps.map(axisFor)

  // The row tuples, outermost axis varying slowest — the nesting the comps draw.
  let rowTuples: string[][] = [[]]
  for (const axis of rows) {
    const next: string[][] = []
    for (const prefix of rowTuples) for (const o of axis.options) next.push([...prefix, o])
    rowTuples = next
  }

  return { ok: true, value: { columns, rows, rowTuples, warnings } }
}

/* --------------------------------------------------------- the cells ---- */

/**
 * What a cell IS. The first three are the states the comps draw and the plan
 * specified; `pending` is the case none of them covers.
 *
 * A cell the set index lists under `pairs` with NO run dir in the root was
 * declared, expanded and expected — and simply not measured (a failed capture
 * writes no findings.json, so the dir is missing or holds a stale one). Drawing
 * it as `absent` would say "nobody declared this", which is false, and absence
 * of the wrong kind is the exact defect this workstream exists to remove. It
 * renders like `skipped` — greyed, with its reason — and reads as its own thing.
 */
export type GCellKind = "measured" | "skipped" | "absent" | "pending"

export interface GCell {
  /** `prop=opt` pairs joined — stable across runs, independent of position. */
  key: string
  props: Record<string, string>
  row: number
  col: number
  kind: GCellKind
  pairDir?: string
  /** Why a `skipped` cell was skipped, or what a `pending` one is waiting on. */
  reason?: string
  /** Present for `measured`: the run summary the sheet badges. */
  summary?: GPairSummary
  /** `summary.run < ` the sheet's newest — read PER SET, never globally. */
  stale?: boolean
}

/** Structural copy of the `/api/pairs` row, only what a cell badges. */
export interface GPairSummary {
  dir: string
  pair?: string
  pass?: boolean
  critical?: number
  major?: number
  minor?: number
  findings?: number
  run?: number
  createdAt?: string
  frame?: { w: number; h: number }
  broken?: boolean
}

/**
 * A cell's identity, and it is deliberately NOT the grid's order.
 *
 * The properties are sorted, so the key survives a transpose: flipping
 * `gallery.columns` from `tone` to `State` rearranges the sheet and must not
 * rename a single cell. Keying in arrangement order made every cell a new cell
 * the moment the declaration changed — which is a per-cell selection, lit state
 * and (worst) any per-cell record silently detaching from its subject on a
 * layout preference. Scoped to the resolved axes on purpose: a `props` parsed
 * out of a variant name can carry more than the axes define, and those extras
 * are not part of the cell's place in this grid.
 */
const propsKey = (props: Record<string, string>, order: readonly string[]): string =>
  [...order].sort().map((p) => `${p}=${props[p] ?? ""}`).join("/")

/**
 * Place every declared cell of the set on the resolved grid.
 *
 * Total over the AXES, not over the run root: the cross-product is the
 * authority, so a cell in neither `pairs` nor `skipped` is emitted as `absent`
 * rather than omitted. That is what makes a hole nobody declared visible —
 * measured on the DS, 30 of Button/Fill's cells and 9 of Alert's.
 */
export function galleryCells(
  set: GSetIndex,
  resolved: GResolved,
  pairs: readonly GPairSummary[],
): GCell[] {
  const order = [resolved.columns.property, ...resolved.rows.map((r) => r.property)]
  const byDir = new Map(pairs.map((p) => [p.dir, p]))
  const pairByKey = new Map(set.pairs.map((p) => [propsKey(p.props, order), p]))
  const skipByKey = new Map(set.skipped.map((s) => [propsKey(s.props, order), s]))

  const cells: GCell[] = []
  resolved.rowTuples.forEach((tuple, row) => {
    resolved.columns.options.forEach((colOption, col) => {
      const props: Record<string, string> = { [resolved.columns.property]: colOption }
      resolved.rows.forEach((axis, i) => {
        props[axis.property] = tuple[i]!
      })
      const key = propsKey(props, order)
      const pair = pairByKey.get(key)
      const skip = skipByKey.get(key)
      if (pair) {
        const summary = byDir.get(pair.dir)
        cells.push(
          summary
            ? { key, props, row, col, kind: "measured", pairDir: pair.dir, summary }
            : {
                key,
                props,
                row,
                col,
                kind: "pending",
                pairDir: pair.dir,
                reason: `expanded as ${pair.dir} but the run root holds no readable report for it`,
              },
        )
        return
      }
      if (skip) {
        cells.push({ key, props, row, col, kind: "skipped", reason: skip.reason })
        return
      }
      cells.push({ key, props, row, col, kind: "absent" })
    })
  })
  return markStale(cells)
}

/**
 * Staleness, PER SET. `ComparisonReport.run` is the per-PAIR ordinal, so the
 * newest run on this sheet is the max over ITS OWN cells and nothing else — the
 * comp's module-level `NEWEST` must not be read as data. Measured on the DS
 * root: `ds-button-icon`'s eleven cells are all r2 while `ds-button-fill` spans
 * r9-r10, so a global newest would mark all eleven stale against a run they
 * were never behind.
 */
export function markStale(cells: GCell[]): GCell[] {
  const runs = cells.flatMap((c) => (c.kind === "measured" && c.summary?.run ? [c.summary.run] : []))
  if (runs.length === 0) return cells
  const newest = Math.max(...runs)
  for (const c of cells) {
    if (c.kind === "measured" && c.summary?.run !== undefined) c.stale = c.summary.run < newest
  }
  return cells
}

/** The sheet's own run span — `oldest → newest` over its cells, or null. */
export function runSpan(cells: readonly GCell[]): { min: number; max: number } | null {
  const runs = cells.flatMap((c) => (c.summary?.run !== undefined ? [c.summary.run] : []))
  if (runs.length === 0) return null
  return { min: Math.min(...runs), max: Math.max(...runs) }
}

export interface GCensus {
  measured: number
  skipped: number
  absent: number
  pending: number
  total: number
}

/** What the sheet CONTAINS — the numbers a run root structurally cannot show. */
export function census(cells: readonly GCell[]): GCensus {
  const of = (k: GCellKind) => cells.filter((c) => c.kind === k).length
  return {
    measured: of("measured"),
    skipped: of("skipped"),
    absent: of("absent"),
    pending: of("pending"),
    total: cells.length,
  }
}

/**
 * A cell's severity badge: the worst severity it carries, or null when it is
 * clean. `broken` outranks everything — an unreadable report is not a pass.
 */
export function cellSeverity(cell: GCell): "critical" | "major" | "minor" | null {
  const s = cell.summary
  if (!s) return null
  if (s.critical) return "critical"
  if (s.major) return "major"
  if (s.minor) return "minor"
  return null
}

/**
 * FRAME-LEVEL findings render as a cell BADGE, never a box.
 *
 * `pixel-region/frame`'s box IS the whole frame, so translated into a cell it
 * paints the cell solid — and it fires on 194/194 pairs of the DS root, which
 * would paint the entire sheet and make highlight, dim and strobe useless at
 * sheet scale. The test is geometric, not by type: any box covering most of its
 * cell tells the reader nothing about WHERE, whatever produced it.
 */
export const FRAME_COVERAGE = 0.9

export function isFrameLevel(box: { w: number; h: number }, cell: { w: number; h: number }): boolean {
  if (cell.w <= 0 || cell.h <= 0) return false
  return (box.w * box.h) / (cell.w * cell.h) >= FRAME_COVERAGE
}

/* --------------------------------------------------------- the markup --- */

/**
 * Module-local, and the NAME is the point: every embedded module is
 * concatenated into ONE `<script type="module">`, so their top-level scopes are
 * shared and any repeated declaration — exported or not — is a SyntaxError that
 * takes the whole app down. `index-view.ts` already declares `escapeHtml`.
 * `EmbeddedModuleCollisionTest` is the guard; this is why it exists.
 */
const gEscape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )

/** The sheet's own summary line: what it contains, and over how many runs. */
export function sheetSummary(c: GCensus, span: { min: number; max: number } | null): string {
  const parts = [`${c.measured} measured`]
  if (c.skipped) parts.push(`${c.skipped} skipped`)
  if (c.absent) parts.push(`${c.absent} absent`)
  if (c.pending) parts.push(`${c.pending} not measured`)
  const runs = !span ? "" : span.min === span.max ? ` · run ${span.max}` : ` · runs ${span.min}→${span.max}`
  return `${c.total} cells · ${parts.join(" · ")}${runs}`
}

const CELL_NOTE: Record<GCellKind, string> = {
  measured: "",
  skipped: "Skipped · no impl cell",
  absent: "Declared by neither side",
  pending: "Declared, not measured",
}

/** One cell, positioned by the solved layout it is given. */
export function cellTile(cell: GCell, rect: { x: number; y: number; w: number; h: number }): string {
  const sev = cellSeverity(cell)
  const cls = ["gcell", `k-${cell.kind}`, sev ? `sev-${sev}` : "", cell.stale ? "stale" : ""]
    .filter(Boolean)
    .join(" ")
  const label = Object.entries(cell.props)
    .map(([, v]) => v)
    .join(" · ")
  const tip = cell.reason ? `${label} — ${cell.reason}` : label
  const count = cell.summary?.findings
  const badge =
    cell.kind === "measured" && count
      ? `<span class="gbadge">${count}</span>`
      : cell.kind === "measured"
        ? '<span class="gbadge ok">✓</span>'
        : ""
  const note = CELL_NOTE[cell.kind]
  const stale = cell.stale ? `<span class="gstale">r${cell.summary?.run}</span>` : ""
  return (
    `<div class="${cls}" data-cell="${gEscape(cell.key)}"` +
    (cell.pairDir ? ` data-pair="${gEscape(cell.pairDir)}"` : "") +
    ` title="${gEscape(tip)}"` +
    ` style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px">` +
    badge +
    stale +
    (note ? `<span class="gnote">${gEscape(note)}</span>` : "") +
    "</div>"
  )
}

export interface SheetInput {
  set: GSetIndex
  resolved: GResolved
  cells: readonly GCell[]
  layout: {
    cells: readonly { key: string; rect: { x: number; y: number; w: number; h: number } }[]
    columns: readonly { index: number; at: number; extent: number }[]
    rows: readonly { index: number; at: number; extent: number }[]
    world: { w: number; h: number }
  }
  gutter: { w: number; h: number }
}

/**
 * The sheet, in SHEET WORLD px — the caller puts it under `worldLayerTransform`,
 * exactly as the pair view does with its marks. Nothing here knows about zoom.
 */
export function sheetMarkup(input: SheetInput): string {
  const { resolved, layout, gutter } = input
  const rectOf = new Map(input.layout.cells.map((c) => [c.key, c.rect]))
  let out = `<div class="gsheet" style="width:${layout.world.w}px;height:${layout.world.h}px">`

  for (const tick of layout.columns) {
    const text = resolved.columns.labels[tick.index] ?? ""
    out +=
      `<div class="gcol" style="left:${tick.at}px;top:0;width:${tick.extent}px;height:${gutter.h}px">` +
      gEscape(text) +
      "</div>"
  }
  for (const tick of layout.rows) {
    const tuple = resolved.rowTuples[tick.index] ?? []
    const text = tuple
      .map((o, i) => {
        const axis = resolved.rows[i]
        const at = axis ? axis.options.indexOf(o) : -1
        return (at >= 0 && axis ? axis.labels[at] : o) ?? o
      })
      .join(" · ")
    out +=
      `<div class="grow" style="left:0;top:${tick.at}px;width:${gutter.w}px;height:${tick.extent}px">` +
      gEscape(text) +
      "</div>"
  }
  for (const cell of input.cells) {
    const rect = rectOf.get(cell.key)
    if (rect) out += cellTile(cell, rect)
  }
  return out + "</div>"
}

/**
 * The whole surface, error state included. A refused declaration renders INSTEAD
 * of a grid, per `resolveGallery`'s decision — a plausible grid the declaration
 * did not shape is the failure it exists to prevent.
 */
export function galleryError(entryId: string, error: string): string {
  return (
    '<div class="gerror"><p class="gerr-t">This sheet cannot be laid out.</p>' +
    `<p class="gerr-m">${gEscape(error)}</p>` +
    `<p class="gerr-h">Fix <code>gallery</code> on <code>${gEscape(entryId)}</code> in the manifest, then re-run <code>refdiff compare</code>.</p></div>`
  )
}

/** The declaration's non-fatal complaints, kept on the page rather than a log. */
export function warningList(warnings: readonly string[]): string {
  if (warnings.length === 0) return ""
  return (
    '<ul class="gwarn">' +
    warnings.map((w) => `<li>${gEscape(w)}</li>`).join("") +
    "</ul>"
  )
}
