/**
 * Occluded elements — in the page, not on the screen (pure).
 *
 * The adapters' visibility filter asks only whether an element hid ITSELF
 * (`display:none`, `visibility:hidden`, `opacity:0`). Nothing in CSS answers
 * "is something painted on top of this", so an element under a full-screen
 * overlay — a phone thread takeover, a modal, a drawer — is extracted like any
 * other: `display:block`, `visibility:visible`, `opacity:1`, and invisible.
 *
 * Comparing those is worse than useless, because the two sides of a pair cover
 * DIFFERENT things. A comp's thread arm covers its own rail without removing
 * it; an implementation's takeover covers the app chrome. Neither ghost has a
 * counterpart on the other side, so every one of them becomes a
 * missing-element or extra-element finding about pixels no one can see — and
 * they inflate the unmatched ratio, which is what decides the phase. One real
 * pair (`messages-owner--mobile-question`) matched 31 of 51 leaves and was put
 * into `reconcile` at confidence 0.15 while the two screenshots agreed on
 * everything visible: 57 of its 58 unmatched elements were chrome that neither
 * side drew, and exactly one was a real difference.
 *
 * Dropping them here rather than suppressing the findings later is deliberate.
 * A suppressed finding still counts as a leaf, so it still moves
 * `designLeaves` / `implLeaves`, the matched ratio and therefore the phase —
 * the reader would get a quieter report that still refused to read itself.
 *
 * Only an explicit `true` is dropped. `undefined` is an adapter saying it
 * cannot tell (Figma has no hit test), and the whole point is to never hide a
 * finding on a guess.
 */

import type { ElementNode } from "../types.js"

/** What `dropOccluded` removed, for the run log and the result metadata. */
export interface OcclusionFilter {
  design: ElementNode[]
  impl: ElementNode[]
  designDropped: number
  implDropped: number
}

/** Elements painted over at capture time, removed from both sides. */
export function dropOccluded(design: ElementNode[], impl: ElementNode[]): OcclusionFilter {
  const visible = (els: ElementNode[]): ElementNode[] => els.filter((el) => el.occluded !== true)
  const d = visible(design)
  const i = visible(impl)
  return {
    design: d,
    impl: i,
    designDropped: design.length - d.length,
    implDropped: impl.length - i.length,
  }
}

/** One line for the run log, or null when nothing was painted over. */
export function describeOcclusion(f: OcclusionFilter): string | null {
  if (f.designDropped === 0 && f.implDropped === 0) return null
  return `excluded ${f.designDropped} design + ${f.implDropped} impl element(s) painted over at capture time (--include-occluded to compare them anyway)`
}
