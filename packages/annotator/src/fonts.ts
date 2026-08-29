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
 * the glyphs the comps and the app use (`icon_names=`; the list is the
 * generated `icon-names.ts`), variable on FILL / wght / GRAD / opsz like
 * the original, so the comps' `font-variation-settings` apply unchanged.
 * A missed glyph renders as its NAME in letters (2026-08-29: "settings"
 * measured 152×23 against the comp's 19×23), so the list is DERIVED, never
 * typed — `node packages/annotator/scripts/icon-subset.mjs` reads the static
 * `class="msi"` markup and every quoted token in the comps' script arrays
 * (a third of their icons live there) and this package's source, keeps the
 * ones in Google's codepoints list, and fetches the face; `--check` says
 * whether the committed list is current. Run it whenever a comp or the app
 * gains an icon.
 *
 * The emitted (`--emit`) report.html has no server behind it: its `fonts/`
 * URLs resolve to nothing on disk and the stacks below fall through to the
 * system families. That is deliberate — inlining ~200 KB of base64 into every
 * per-run report.html is the "app baked into every artifact" bloat the app
 * shell exists to avoid, and the emitted file is the offline READING copy,
 * not the measured surface.
 */

import { ICON_NAMES } from "./icon-names.js"

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

/**
 * The faces are served under a VERSIONED prefix, `fonts/<v>/`, where `<v>`
 * hashes the icon glyph list and the file names: the CLI sends them with a
 * day-long `Cache-Control`, so a re-subsetted icon face under the same URL
 * kept rendering the OLD subset on a phone that had the page open the day
 * before (2026-08-29 — "the settings icon is text"). A new list is a new URL.
 */
export const FONTS_VERSION = fnv1a(ICON_NAMES.join(",") + "|" + FONT_FILES.map((f) => f.file).join(","))
export const FONTS_ROUTE = `fonts/${FONTS_VERSION}/`

function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

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
  // Any version segment resolves: a page rendered before a restart still gets its faces.
  const m = /^\/fonts\/(?:[a-z0-9]+\/)?([a-z0-9-]+\.woff2)$/.exec(pathname)
  return m ? FONT_FILES.find((f) => f.file === m[1]) : undefined
}
