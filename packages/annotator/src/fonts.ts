/**
 * Self-hosted type — the comps' families, served by the annotator itself.
 *
 * The comps load IBM Plex Sans / IBM Plex Mono / Material Symbols Outlined
 * from Google Fonts; the app is not allowed that excuse (it must look right
 * offline, and a review page must not phone home), so the same faces ship as
 * woff2 under `assets/fonts/` and are served on `fonts/<file>` by the CLI's
 * request handler. This module is the pure half: WHICH files exist, the
 * `@font-face` rules that name them, and the route → file mapping (a
 * whitelist, so the handler can never be walked out of the fonts dir).
 *
 * Provenance (2026-08-28, Google Fonts CSS API): IBM Plex Sans is served as
 * ONE variable file per script subset (100–700), IBM Plex Mono as static 400
 * and 500, both in the `latin` and `latin-ext` subsets (Slovak diacritics
 * live in latin-ext). Material Symbols Outlined is Google's own subset of
 * the 52 glyphs the comps use (`icon_names=` — regenerate the list from the
 * comps if one changes: the static `class="msi"` markup AND the quoted names
 * in the comps' script arrays, which hold a third of them; a missed glyph
 * renders as its name in letters), variable on FILL / wght / GRAD / opsz like
 * the original, so the comps' `font-variation-settings` apply unchanged.
 *
 * The emitted (`--emit`) report.html has no server behind it: its `fonts/`
 * URLs resolve to nothing on disk and the stacks below fall through to the
 * system families. That is deliberate — inlining ~200 KB of base64 into every
 * per-run report.html is the "app baked into every artifact" bloat the app
 * shell exists to avoid, and the emitted file is the offline READING copy,
 * not the measured surface.
 */

export interface FontFile {
  /** File name under `assets/fonts/`, and the last segment of its URL. */
  readonly file: string
  readonly family: string
  /** A `font-weight` descriptor: one weight or a variable range. */
  readonly weight: string
  readonly unicodeRange?: string
  readonly display: "swap" | "block"
}

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF"

export const FONT_FILES: readonly FontFile[] = [
  { file: "ibm-plex-sans-latin.woff2", family: "IBM Plex Sans", weight: "100 700", unicodeRange: LATIN, display: "swap" },
  { file: "ibm-plex-sans-latin-ext.woff2", family: "IBM Plex Sans", weight: "100 700", unicodeRange: LATIN_EXT, display: "swap" },
  { file: "ibm-plex-mono-400-latin.woff2", family: "IBM Plex Mono", weight: "400", unicodeRange: LATIN, display: "swap" },
  { file: "ibm-plex-mono-400-latin-ext.woff2", family: "IBM Plex Mono", weight: "400", unicodeRange: LATIN_EXT, display: "swap" },
  { file: "ibm-plex-mono-500-latin.woff2", family: "IBM Plex Mono", weight: "500", unicodeRange: LATIN, display: "swap" },
  { file: "ibm-plex-mono-500-latin-ext.woff2", family: "IBM Plex Mono", weight: "500", unicodeRange: LATIN_EXT, display: "swap" },
  // `block`, like Google's own rule: an icon ligature drawn in the fallback
  // face is its NAME in letters ("light_mode"), worse than a short blank.
  { file: "material-symbols-outlined.woff2", family: "Material Symbols Outlined", weight: "300 600", display: "block" },
]

/** URL prefix the faces are served under, relative to the app root. */
export const FONTS_ROUTE = "fonts/"

const faceRule = (f: FontFile): string =>
  `@font-face { font-family:'${f.family}'; font-style:normal; font-weight:${f.weight}; font-display:${f.display};` +
  ` src:url(${FONTS_ROUTE}${f.file}) format('woff2');` +
  (f.unicodeRange ? ` unicode-range:${f.unicodeRange};` : "") +
  " }"

/** The `@font-face` block for the page CSS — relative URLs, nothing remote. */
export const FONT_FACE_CSS: string = FONT_FILES.map(faceRule).join("\n")

/** The comps' `.msi` rule, verbatim, so an icon measures the same on both sides. */
export const ICON_CSS =
  ".msi { font-family:'Material Symbols Outlined'; font-weight:normal; font-style:normal; line-height:1; letter-spacing:normal; text-transform:none; display:inline-block; white-space:nowrap; direction:ltr; -webkit-font-smoothing:antialiased; font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20; }"

/**
 * The file a request path names, or undefined when it is not one of ours.
 * A whitelist, not a path join: `/fonts/../cli.js` must never resolve.
 */
export function fontFile(pathname: string): FontFile | undefined {
  const m = /^\/fonts\/([a-z0-9-]+\.woff2)$/.exec(pathname)
  return m ? FONT_FILES.find((f) => f.file === m[1]) : undefined
}
