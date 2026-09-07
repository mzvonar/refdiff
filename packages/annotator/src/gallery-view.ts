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
  skipped: {
    nodeId: string
    name: string
    reason: string
    /** `filtered` | `unmapped`, from core. Absent on an index written before it. */
    kind?: string
    props: Record<string, string>
  }[]
}

/**
 * WHY a declared variant was not measured — and the two answers mean opposite
 * things, which is why the sheet must not draw them the same.
 *
 * `filtered`  the manifest narrowed the set on purpose (`only` / `omit`). The
 *             design defines it and nobody looked.
 * `unmapped`  the story has no cell for it. The design defines it and the
 *             IMPLEMENTATION does not have it — a real coverage gap, and the
 *             only kind the sheet marks as missing.
 *
 * Prefers core's structured `kind`. The fallback reads the `only:` / `omit:`
 * PREFIX, because an index written before the field existed has no kind and
 * re-expanding a root needs Figma plus a running Storybook — measured across
 * the DS's fourteen sets, every one of the 281 skip reasons starts with either
 * `only: ` / `omit: ` (191) or names a missing story cell (90), so the prefix
 * separates them exactly. It reads the START of the string on purpose: the
 * prose tail varies ("no cell mapping for …", "no state mapping for …", "no
 * tone mapping for …") and the prefix does not. Delete the fallback once every
 * root has been re-expanded.
 */
export function skipKind(entry: { reason: string; kind?: string }): "filtered" | "unmapped" {
  if (entry.kind === "filtered" || entry.kind === "unmapped") return entry.kind
  return /^\s*(only|omit):/.test(entry.reason) ? "filtered" : "unmapped"
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
  /**
   * Properties that are NOT axes because they carry no information here: every
   * cell the sheet draws has the same value, so a row or column per option
   * would repeat it. The sheet states them ONCE instead. Set by
   * `pruneToOccupied`; `resolveGallery` cannot know it, having no cells.
   */
  pinned?: GPinned[]
}

/** A property with ONE value across every cell the sheet draws. */
export interface GPinned {
  property: string
  option: string
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

/**
 * Drop rows and columns the SET never populates — and this is a correction, not
 * a convenience.
 *
 * `absent` was defined as the axes' cross-product minus pairs minus skipped: "a
 * hole nobody declared". That definition came from the Gallery comp's demo set,
 * where the cross-product happens to be about the size of the set. **A real
 * Figma variant set is SPARSE.** `ds-select-field` defines 7x2x7x2 = 196
 * combinations and has 64 children; `ds-text-field` 168 and 57. So the
 * cross-product is not the expectation, and treating it as one generated 132 and
 * 111 "absent" cells that are simply combinations nobody ever drew. The sheet
 * read as almost entirely empty, which is how the defect was reported.
 *
 * A hole is a gap in an OCCUPIED row or column. A row with nothing in it at all
 * is not a hole in the design — it is a corner of a hypercube the designer never
 * visited, and drawing it buries the real holes. Measured over the DS's fourteen
 * sets, pruning takes absent from 132 -> 6, 111 -> 6, 132 -> 0, 72 -> 0, and
 * leaves the cases where the cross-product WAS the expectation almost untouched
 * (ds-alert 9 -> 1), which is the check that this does not simply hide absence.
 *
 * What it deliberately does NOT touch: `skipped`. On this DS most cells are
 * skipped because the manifest's `only:` filter measures 6 of 57 variants on
 * purpose, and every one carries its reason. That is the coverage story the set
 * index exists to tell, and it stays on the sheet.
 */
export function pruneToOccupied(set: GSetIndex, resolved: GResolved): GResolved {
  // What the sheet DRAWS decides what survives, and `filtered` is not drawn.
  //
  // This used to be every declared variant, skipped ones included, and that is
  // what put six all-`Out of scope` rows on `ds-button-stroke`: the manifest
  // narrows it to `Theme=Dark, variant=light, Size=md`, so 36 of its 60
  // declared cells are out of scope and were taking up rows nobody asked to
  // see. Repo owner, 2026-09-07: "i don't want to see these out of scope cells,
  // i want to only see the ones that i can actually see in figma. so i want you
  // to hide rows and columns that a human cant see in figma, so not all props
  // needs to be visible".
  //
  // `unmapped` DOES keep a row alive — the design declares it and the impl
  // lacks it, which is the coverage gap the sheet exists to show.
  const present = [
    ...set.pairs.map((p) => p.props),
    ...set.skipped.filter((sk) => skipKind(sk) === "unmapped").map((sk) => sk.props),
  ]
  if (present.length === 0) return resolved

  const colProp = resolved.columns.property
  const usedCols = new Set(present.map((c) => c[colProp]))
  const rowKey = (c: Record<string, string>): string =>
    resolved.rows.map((a) => c[a.property] ?? "").join("\u0000")
  const usedRows = new Set(present.map(rowKey))

  const columns: GAxis = {
    property: colProp,
    options: [],
    labels: [],
  }
  resolved.columns.options.forEach((o, i) => {
    if (!usedCols.has(o)) return
    columns.options.push(o)
    columns.labels.push(resolved.columns.labels[i] ?? o)
  })

  const rowTuples = resolved.rowTuples.filter(
    (t) => usedRows.has(t.join("\u0000")),
  )
  // An axis whose options no longer appear in any kept row is dropped entirely,
  // so its label stops taking gutter width for a value nothing carries.
  const rows = resolved.rows
    .map((axis, i) => {
      const used = new Set(rowTuples.map((t) => t[i]))
      const kept = axis.options.filter((o) => used.has(o))
      return {
        property: axis.property,
        options: kept,
        labels: kept.map((o) => axis.labels[axis.options.indexOf(o)] ?? o),
      }
    })
    .filter((a) => a.options.length > 0)

  // Re-project the tuples onto the surviving axes, in their order.
  const keptIdx = resolved.rows
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => rows.some((r) => r.property === a.property))
    .map(({ i }) => i)
  const tuples = rowTuples.map((t) => keptIdx.map((i) => t[i]!))

  // A property with ONE value across the survivors is not an axis. It would
  // draw a row or column per option and repeat the same value in each, which is
  // exactly the "not all props needs to be visible" half of the ask: measured
  // on the DS, dropping them takes `ds-select-field` from 7x10 to 7x1 and
  // `ds-button-stroke` from 6x10 to 6x4, both to 100% fill. The values are not
  // lost — they come back as `pinned` and the sheet states them once.
  const pinned: GPinned[] = []
  const keptRows: GAxis[] = []
  const keptIdx2: number[] = []
  rows.forEach((axis, i) => {
    if (axis.options.length === 1) {
      pinned.push({ property: axis.property, option: axis.options[0] as string })
      return
    }
    keptRows.push(axis)
    keptIdx2.push(i)
  })
  const finalTuples = uniqueTuples(tuples.map((t) => keptIdx2.map((i) => t[i] as string)))
  // The COLUMN axis is never dropped, even single-valued: something has to be
  // the columns, and a sheet of one column is the honest shape for a set with
  // one cell (the three `ds-dialog-starter-*` entries are exactly that). It is
  // reported as pinned as well when it says nothing, so the reader still sees
  // the value.
  if (columns.options.length === 1)
    pinned.push({ property: columns.property, option: columns.options[0] as string })

  return {
    columns,
    rows: keptRows,
    rowTuples: finalTuples.length > 0 ? finalTuples : [[]],
    warnings: resolved.warnings,
    ...(pinned.length > 0 ? { pinned } : {}),
  }
}

/** Distinct tuples, order preserved — a row set collapses once an axis goes. */
function uniqueTuples(tuples: readonly string[][]): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const t of tuples) {
    const k = t.join("\u0000")
    if (seen.has(k)) continue
    seen.add(k)
    out.push([...t])
  }
  return out
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
/**
 * `skipped` became TWO kinds (repo owner, 2026-09-07: "use only what is in
 * figma, and only mark what's missing in impl that figma defines"):
 *
 *   `unmapped`  the design defines it, the impl has no cell — MARKED missing
 *   `filtered`  the design defines it, the manifest chose not to measure it
 *
 * They used to share one kind and one note, "Skipped · no impl cell", which is
 * a false statement about the 191 of 281 that were never looked for.
 *
 * `absent` survives in the MODEL and is no longer DRAWN. It is the axes'
 * cross-product minus what the design declares — a corner of a hypercube the
 * designer never visited — and the sheet drew 58 dotted slots for it across the
 * DS's fourteen sets, which is what "too many holes" was. The count stays,
 * because the sparsity is a fact about the set worth reporting; the tile goes.
 */
export type GCellKind = "measured" | "unmapped" | "filtered" | "absent" | "pending"

export interface GCell {
  /** `prop=opt` pairs joined — stable across runs, independent of position. */
  key: string
  props: Record<string, string>
  row: number
  col: number
  kind: GCellKind
  pairDir?: string
  /** Why an `unmapped` / `filtered` cell was not measured, or what a `pending` one waits on. */
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
  // A sheet with PINNED properties is a SLICE of the set, and only variants in
  // that slice belong on it. Without this the reduced key is ambiguous: drop
  // `hasLabel` / `Type` / `hasDescription` as axes and `ds-select-field`'s key
  // becomes `State=Active` alone, which 58 of its skipped variants share — the
  // Map then keeps whichever came LAST and the cell was drawn `filtered` when
  // `pruneToOccupied` had classified the very same combination `unmapped`. One
  // entry, two answers, and the coverage gap disappeared. Measured: it cost
  // select-field, text-field and date-field one cell each.
  const pinned = resolved.pinned ?? []
  const inSlice = (props: Record<string, string>): boolean =>
    pinned.every((pin) => props[pin.property] === pin.option)
  const pairByKey = new Map(
    set.pairs.filter((p) => inSlice(p.props)).map((p) => [propsKey(p.props, order), p]),
  )
  const skipByKey = new Map(
    set.skipped.filter((sk) => inSlice(sk.props)).map((sk) => [propsKey(sk.props, order), sk]),
  )

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
        cells.push({ key, props, row, col, kind: skipKind(skip), reason: skip.reason })
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
  /** The design defines it, the impl has no cell — the coverage gap. */
  unmapped: number
  /** The design defines it, the manifest chose not to measure it. */
  filtered: number
  /** In the axes' cross-product, declared by neither side. NOT drawn. */
  absent: number
  pending: number
  /**
   * Cells the DESIGN defines — everything but `absent`.
   */
  defined: number
  /**
   * Cells the sheet DRAWS: `measured` + `unmapped` + `pending`. Neither
   * `absent` (nobody declared it) nor `filtered` (declared, deliberately out
   * of scope) is drawn, so this and not `defined` is what the headline counts.
   */
  drawn: number
  /** Every slot in the resolved grid, `defined` + `absent`. */
  total: number
}

/** What the sheet CONTAINS — the numbers a run root structurally cannot show. */
export function census(cells: readonly GCell[]): GCensus {
  const of = (k: GCellKind) => cells.filter((c) => c.kind === k).length
  const absent = of("absent")
  return {
    measured: of("measured"),
    unmapped: of("unmapped"),
    filtered: of("filtered"),
    absent,
    pending: of("pending"),
    defined: cells.length - absent,
    drawn: of("measured") + of("unmapped") + of("pending"),
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
/**
 * The headline counts what the DESIGN defines, not the grid. `absent` is a
 * property of the axes — the cross-product minus everything declared — so
 * leading with it said "555 cells" about a set with 497, and the sheet drew 58
 * dotted holes to match. It keeps a tail mention because sparsity is worth
 * knowing; it is no longer a cell.
 */
export function sheetSummary(c: GCensus, span: { min: number; max: number } | null): string {
  const parts = [`${c.measured} measured`]
  if (c.unmapped) parts.push(`${c.unmapped} missing in impl`)
  if (c.pending) parts.push(`${c.pending} not measured`)
  const runs = !span ? "" : span.min === span.max ? ` · run ${span.max}` : ` · runs ${span.min}→${span.max}`
  // Out of scope and undeclared are FACTS ABOUT THE SET, in the tail, because
  // neither is a cell on this sheet any more. Kept because "24 cells" over a
  // 60-variant set is only honest if the other 36 are accounted for somewhere.
  const tail: string[] = []
  if (c.filtered) tail.push(`${c.filtered} out of scope`)
  if (c.absent) tail.push(`${c.absent} of ${c.total} combinations undeclared`)
  return `${c.drawn} cells · ${parts.join(" · ")}${runs}${tail.length ? " · " + tail.join(" · ") : ""}`
}

/**
 * The properties every drawn cell shares, stated once — "Theme=Dark ·
 * variant=light · Size=md" for a `ds-button-stroke` narrowed to those.
 *
 * This is the other half of dropping a single-valued axis: the value is not
 * noise, it is context, and a reader looking at 24 stroke buttons needs to know
 * they are all the dark light-variant md ones. It just does not need saying in
 * every row label.
 */
export function pinnedLine(pinned: readonly GPinned[] = []): string {
  if (pinned.length === 0) return ""
  return pinned.map((p) => `${p.property}=${p.option}`).join(" · ")
}

/**
 * What a cell of each kind SAYS, in the comp's words — exported because the
 * canvas draws it too (render.ts's renderCellShots) and two copies of a user-
 * facing string is two copies that drift. It is also why they must not be
 * re-declared there: every embedded module and both page templates concatenate
 * into ONE module scope, so a second `CELL_NOTE` is a `SyntaxError` that takes
 * the whole app down — which is exactly how this was found.
 */
export const CELL_NOTE: Record<GCellKind, string> = {
  measured: "",
  // The only note that claims anything about the implementation, and now the
  // only kind entitled to: the design declares this variant and the story has
  // no cell for it. It used to be said of all 281 skipped cells, 191 of which
  // were simply out of scope.
  unmapped: "Missing in impl",
  filtered: "Out of scope",
  // Never rendered — an absent cell draws no tile at all. Kept so the record
  // is exhaustive over GCellKind rather than silently partial.
  absent: "",
  pending: "Declared, not measured",
}

/**
 * One cell, positioned by the solved layout it is given — and NOTHING for an
 * absent one. A combination the design never declared is not a cell, so it gets
 * no tile, no border and no note; the grid slot is simply empty. That is the
 * whole of "use only what is in figma" on this surface.
 */
export function cellTile(cell: GCell, rect: { x: number; y: number; w: number; h: number }): string {
  if (cell.kind === "absent" || cell.kind === "filtered") return ""
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

/* ------------------------------------------------- causes across cells --- */

/** One recurring cause, and the cells that carry it. */
export interface GCause {
  /** Stable identity: the cause, not its position or its cell. */
  key: string
  type: string
  role?: string
  severity: "critical" | "major" | "minor"
  /** The property names the two sides disagree about (`font-family`). */
  property?: string
  /** The values, as the comp's rows show them (`Oswald 500` → `Montserrat 700`). */
  expected?: string
  actual?: string
  /**
   * A representative message. Same convention as `summary.json`'s `sample`, and
   * for the same reason: the app's messages name the ELEMENT, so members of one
   * cause differ in their text while the cause does not.
   */
  sample: string
  /** Distinct cells carrying it, which is what the comp counts ("36 cells"). */
  cells: string[]
  findingIds: string[]
}

const SEV_RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 }

const valueOf = (v: unknown): string =>
  v && typeof v === "object"
    ? Object.values(v as Record<string, unknown>)
        .map((x) => String(x))
        .join(" ")
    : ""

const propOf = (a: unknown, b: unknown): string => {
  const keys = new Set<string>()
  for (const o of [a, b]) {
    if (o && typeof o === "object") for (const k of Object.keys(o as object)) keys.add(k)
  }
  // camelCase → the CSS-ish names the comp's rows use (`fontFamily` → font-family).
  return [...keys].map((k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())).join(", ")
}

/**
 * Group a sheet's findings by CAUSE, and split the recurring ones from the
 * one-offs — which is how the Gallery comp's rail is organised
 * ("Recurring causes" over "Other findings") and the single biggest thing
 * between the app's rail and the comp's: measured on the dogfooded pair, the
 * app listed 183 findings individually where the comp shows five causes and
 * three one-offs, and 1111 of 1163 impl-only elements were in the rail.
 *
 * The key is `type|role|severity|expected|actual`, which is FINER than
 * `summary.json`'s `groups` (type, role, severity) on purpose, and the plan's
 * "do not recompute `groups`" does not cover this: those groups carry no
 * expected/actual, and a sheet's rail has to tell two different colour drifts
 * apart — they are the same type, role and severity and a different cause. What
 * is not recomputed is the ROOT roll-up; this is per-sheet and value-keyed.
 *
 * Text is deliberately NOT in the key: the same cause lands on many cells with
 * a different element text in each, which is exactly what makes it recurring.
 */
export function causeGroups(
  findings: readonly (GProjectedFinding | undefined)[],
): { recurring: GCause[]; oneOffs: GCause[] } {
  const by = new Map<string, GCause>()
  for (const f of findings) {
    if (!f || !f.cell) continue
    const expected = valueOf(f.expected)
    const actual = valueOf(f.actual)
    const key = [f.type, f.role ?? "", f.severity, expected, actual].join("|")
    let c = by.get(key)
    if (!c) {
      const property = propOf(f.expected, f.actual)
      c = {
        key,
        type: f.type,
        ...(f.role !== undefined ? { role: f.role } : {}),
        severity: f.severity,
        ...(property ? { property } : {}),
        ...(expected ? { expected } : {}),
        ...(actual ? { actual } : {}),
        sample: f.message ?? "",
        cells: [],
        findingIds: [],
      }
      by.set(key, c)
    }
    if (!c.cells.includes(f.cell)) c.cells.push(f.cell)
    c.findingIds.push(f.id)
  }
  const all = [...by.values()].sort(
    (a, b) =>
      b.cells.length - a.cells.length ||
      (SEV_RANK[a.severity] ?? 3) - (SEV_RANK[b.severity] ?? 3) ||
      a.key.localeCompare(b.key),
  )
  return {
    recurring: all.filter((c) => c.cells.length > 1),
    oneOffs: all.filter((c) => c.cells.length === 1),
  }
}

/** A finding after `projectCellBox`, carrying the cell it came from. */
export interface GProjectedFinding {
  id: string
  cell?: string
  type: string
  role?: string
  severity: "critical" | "major" | "minor"
  message?: string
  expected?: Record<string, unknown>
  actual?: Record<string, unknown>
}

/** `36 cells` / `1 cell` — the count the comp puts on a cause row. */
export const cellCountLabel = (n: number): string => n + (n === 1 ? " cell" : " cells")
