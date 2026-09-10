/**
 * The ground rule: a capture photographs its node's own subtree, never the
 * paint behind it.
 *
 * Figma already works this way and cannot be made to do otherwise — `/v1/images`
 * renders the node subtree onto transparency and takes no background parameter,
 * so an ancestor frame's fill is never in the export. A browser screenshot is
 * the opposite: it is a composite of the page, so every ancestor's paint is in
 * the bytes. The two sides of a pair were therefore photographing different
 * things, and the difference landed in the frame-level `pixel-region` residual
 * where it reads as generic noise.
 *
 * Measured on a consuming repo's dark-surface component gallery (2026-09-10),
 * one variant cell of a ghost button — the design node paints nothing but its
 * label, the story's panel paints the page surface behind it:
 *
 *   as captured           RGB, no alpha, 91.6% of the frame one flat colour
 *                         -> 60.76% unexplained frame difference
 *   ground transparent    RGBA, 95.1% transparent
 *                         -> 1.12%
 *
 * Across that repo's entries: ghost 28.4% -> 1.1%, stroke 25.5% -> 7.4%,
 * checkbox 50.8% -> 3.5%, and fill 11.2% -> 11.0% — fill being the control,
 * because its own fill covers the frame, so its residual was real drift all
 * along and correctly survives.
 *
 * **The halfway version does nothing, and looks like it should.** Making the
 * page ground white instead of dark moves the same cell 60.76% -> 59.66%:
 * pixelmatch 7 defaults `checkerboard: true`, so a transparent pixel is blended
 * against a position-varying 48/207 pattern rather than a flat colour and can
 * never agree with ANY uniform ground. Only real alpha on both sides collapses
 * it, which needs `omitBackground` on the shot as well as a non-painting
 * ancestry. Do not "simplify" either half away.
 *
 * Scope, deliberately: ELEMENT shots only. A viewport or full-page shot has no
 * ancestry to speak of — its root is `body`, whose ground IS the page's own and
 * is part of what that capture is for. Same boundary `bleed` already draws, for
 * the same reason.
 */

/** What a capture does with the paint behind its node. */
export type Ground = "transparent" | "keep"

/**
 * Transparent by default: it makes the browser sides behave like the Figma side,
 * which is the only side whose behaviour cannot be changed. `keep` is the
 * opt-out for a pair that is genuinely ABOUT its ground — a full page rendered
 * into a `.dc.html` artboard that paints its own background, say, where the two
 * sides already agree about what is behind the node.
 */
export const DEFAULT_GROUND: Ground = "transparent"

export const GROUND_ATTR = "data-refdiff-ground"
export const GROUND_STYLE_ID = "refdiff-ground"

/**
 * One rule, applied through a marker attribute rather than inline styles.
 *
 * The inline-style version needs a saved value per element and a reverse-order
 * restore, and it gets `<body>` wrong the moment an element is registered twice
 * (measured while prototyping: `body` came back `rgba(0, 0, 0, 0)` after a
 * "successful" revert). That matters more than it sounds — every adapter
 * extracts its element tree AFTER the shot, so a botched revert does not spoil
 * a screenshot, it silently rewrites `backgroundColor` on every ancestor in
 * `elements.json`. One stylesheet and one attribute have no such state.
 *
 * `background` and `background-image` and nothing else: what is being removed
 * is the GROUND, the fill behind the node. An ancestor's border and shadow are
 * left alone — they paint at the ancestor's own edge, rarely inside a bleed
 * margin, and each extra property here is another claim to defend.
 */
export const GROUND_CSS = `[${GROUND_ATTR}]{background:transparent !important;background-image:none !important}`

/** Pure: read a manifest/CLI value, or `undefined` when it is not one. */
export function readGround(v: unknown): Ground | undefined {
  return v === "transparent" || v === "keep" ? v : undefined
}
