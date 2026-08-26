/**
 * Design-frame scoping — the pure part of choosing WHICH node of an
 * artboard frame is the component under test.
 *
 * Every `.dc.html` frame is an artboard: label strip, demo-state chips,
 * designer notes and, somewhere among them, the actual UI (a backdrop
 * holding a modal, a phone shell, a card). Without an explicit selector we
 * pick the frame's largest direct child by area — chrome is thin strips of
 * text, the UI is the big box.
 */

export interface ScopeCandidate {
  /** Index among the frame's element children (selector is built from it). */
  index: number;
  w: number;
  h: number;
}

/** Minimum area (CSS px²) for a child to count as a UI candidate at all. */
export const MIN_SCOPE_AREA = 96 * 96;

/**
 * Pick the largest candidate by area; ties resolve to the earlier child.
 * `undefined` when no candidate is big enough to be UI — callers then fall
 * back to the frame itself.
 */
export function pickLargestChild(
  candidates: readonly ScopeCandidate[],
): ScopeCandidate | undefined {
  let best: ScopeCandidate | undefined;
  for (const c of candidates) {
    const area = c.w * c.h;
    if (area < MIN_SCOPE_AREA) continue;
    if (!best || area > best.w * best.h) best = c;
  }
  return best;
}
