/**
 * Which of a `.dc.html` frame's CONDITIONAL BRANCHES the captured state drew.
 *
 * A comp is a live page: `<sc-if value="{{ r.isDoc }}">` renders only when the
 * comp's own state makes it true. A branch that is never true in any captured
 * state is invisible to the comparison — it has no design element, so it
 * produces no `missing-element`, and a PASS and a FAIL look identical. The
 * implementation of that branch then ships undesigned and nothing says so.
 *
 * Measured witness: `messages.dc.html` has five row renderers
 * (`isDay` / `isSys` / `isReq` / `isMsg` / `isDoc`) and its `sel` state opens
 * only threads t1 and t2. t3 and t4 are the only threads carrying `doc` or
 * `sys` rows, so no captured frame drew either, on either side — verified
 * across all four run dirs' `elements.json`. Two of five row types were
 * invisible to a PASS and to a FAIL alike; both shipped undesigned.
 *
 * This is a property of the COMP ALONE: no pairing, no alignment, nothing to
 * be wrong about. It cannot be a finding for the same reason — there is no
 * implementation claim in it — so it is reported as capture metadata.
 */

/** One `<sc-if>` in the template, with the template indices it can render. */
export interface BranchRecord {
  /** The condition as authored, braces stripped: „r.isDoc". */
  name: string
  /** Its own `data-dc-tpl` index — what disambiguates two `sc-if`s on one condition. */
  index: number
  /** `data-dc-tpl` indices of its descendants; any of them in the DOM means it ran. */
  descendants: number[]
}

export interface BranchCoverage {
  /** `<sc-if>` elements inside the captured frame. */
  total: number
  /** Distinct conditions none of whose `<sc-if>`s rendered, in document order. */
  uncovered: string[]
}

/**
 * Cover a branch when ANY of its descendants reached the DOM. A branch with no
 * descendants (an empty `<sc-if>`) can never be observed, so it is not counted
 * — reporting it would be a permanent false positive.
 *
 * Conditions are collapsed by NAME: a row renderer appears once per frame's
 * list and per responsive twin, and „r.isDoc (×3)" in the uncovered list says
 * nothing „r.isDoc" does not. A name is uncovered only when EVERY `<sc-if>`
 * carrying it stayed false.
 */
export function branchCoverage(
  branches: readonly BranchRecord[],
  renderedIndices: Iterable<number>,
): BranchCoverage {
  const rendered = new Set(renderedIndices)
  const observable = branches.filter((b) => b.descendants.length > 0 && b.name.length > 0)
  const covered = new Map<string, boolean>()
  for (const branch of observable) {
    const ran = branch.descendants.some((i) => rendered.has(i))
    covered.set(branch.name, (covered.get(branch.name) ?? false) || ran)
  }
  return {
    total: observable.length,
    uncovered: [...covered.entries()].filter(([, ran]) => !ran).map(([name]) => name),
  }
}

/** Most names to print before eliding — a long list stops being read. */
const MAX_NAMED = 8

/**
 * „16 conditional branches, 2 never true in this captured state: r.isSys, r.isDoc"
 *
 * Null when there is nothing to say: no branches, or all of them drew.
 */
export function describeBranchCoverage(coverage: BranchCoverage): string | null {
  if (coverage.total === 0 || coverage.uncovered.length === 0) return null
  const named = coverage.uncovered.slice(0, MAX_NAMED).join(", ")
  const rest =
    coverage.uncovered.length > MAX_NAMED ? ` (+${coverage.uncovered.length - MAX_NAMED} more)` : ""
  return `${coverage.total} conditional branches, ${coverage.uncovered.length} never true in this captured state: ${named}${rest}`
}
