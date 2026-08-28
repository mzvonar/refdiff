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

/**
 * Slack (CSS px) the canvas is opened wider than the pair viewport so a FIXED-size
 * frame never reflows against the window edge.
 */
export const CANVAS_SLACK = 120;

/**
 * Does the frame take its width from the viewport (a fluid, full-bleed comp —
 * `width:100%`, `min-height:100vh`, no fixed size) rather than from itself?
 *
 * The canvas is opened `CANVAS_SLACK` wider than the pair viewport so a fixed
 * frame never reflows; a fluid frame simply grows into that slack and then
 * captures 120px wider than the implementation it is compared with (the RefDiff
 * Library comp measured 1300px against an 1180px impl — every right-aligned
 * control offset by the slack, alignment confidence gone). A frame whose width
 * reaches the canvas edge (±`tolerance`) is fluid; the caller then resizes the
 * viewport to the pair's exact size so both sides render at the same width.
 */
export function isFluidFrame(
  frameWidth: number,
  canvasWidth: number,
  tolerance = 2,
): boolean {
  return frameWidth >= canvasWidth - tolerance;
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
