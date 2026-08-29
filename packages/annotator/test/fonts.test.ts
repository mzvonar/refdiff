import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { FONTS_ROUTE, FONTS_VERSION, FONT_FACE_CSS, FONT_FILES, ICON_CSS, fontFile } from "../src/fonts.js"
import { ICON_NAMES } from "../src/icon-names.js"

describe("self-hosted fonts", () => {
  it("ships every face it declares, and declares every face it ships", async () => {
    // The package `files` list carries assets/; a rule pointing at a file that
    // is not there degrades silently to system-ui — exactly the family
    // mismatch phase 1 exists to remove.
    const dir = fileURLToPath(new URL("../assets/fonts/", import.meta.url))
    const onDisk = (await readdir(dir)).filter((f) => f.endsWith(".woff2")).sort()
    expect(onDisk).toEqual(FONT_FILES.map((f) => f.file).sort())
  })

  it("covers the comps' three families, latin AND latin-ext, with relative URLs only", () => {
    expect(new Set(FONT_FILES.map((f) => f.family))).toEqual(
      new Set(["IBM Plex Sans", "IBM Plex Mono", "Material Symbols Outlined"]),
    )
    for (const f of FONT_FILES) expect(FONT_FACE_CSS).toContain(`src:url(${FONTS_ROUTE}${f.file}) format('woff2')`)
    // Slovak diacritics ("Služby") are latin-ext; a latin-only subset would
    // draw them in the fallback face mid-word.
    expect(FONT_FILES.filter((f) => f.unicodeRange?.startsWith("U+0100-02BA"))).toHaveLength(3)
    expect(FONT_FACE_CSS).not.toMatch(/https?:/)
    // The icon face keeps its axes: the comps set FILL/wght/GRAD/opsz on it.
    expect(FONT_FACE_CSS).toContain("font-family:'Material Symbols Outlined'; font-style:normal; font-weight:300 600; font-display:block")
    expect(ICON_CSS).toContain("'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20")
  })

  it("maps only whitelisted names — no traversal, no other extension", () => {
    expect(fontFile(`/${FONTS_ROUTE}ibm-plex-sans-latin.woff2`)?.file).toBe("ibm-plex-sans-latin.woff2")
    expect(fontFile("/fonts/material-symbols-outlined.woff2")?.family).toBe("Material Symbols Outlined")
    // A page rendered under an older version still resolves its faces after a restart.
    expect(fontFile("/fonts/abc123/material-symbols-outlined.woff2")?.family).toBe("Material Symbols Outlined")
    expect(fontFile("/fonts/../cli.js")).toBeUndefined()
    expect(fontFile("/fonts/a/../cli.js")).toBeUndefined()
    expect(fontFile("/fonts/nope.woff2")).toBeUndefined()
    expect(fontFile("/fonts/ibm-plex-sans-latin.ttf")).toBeUndefined()
    expect(fontFile("/ibm-plex-sans-latin.woff2")).toBeUndefined()
  })

  it("versions the font URL by the icon glyph list — a re-subsetted face is a new URL, never a stale cache hit", () => {
    // 2026-08-29: the served face gained four glyphs, the URL did not, and a phone kept rendering
    // "settings" as letters from its day-old cache (the CLI sends max-age=86400).
    expect(FONTS_ROUTE).toBe(`fonts/${FONTS_VERSION}/`)
    expect(FONTS_VERSION).toMatch(/^[a-z0-9]{4,}$/)
    expect(ICON_NAMES.length).toBeGreaterThan(50)
    // The glyphs the 2026-08-29 comps added — the ones that measured as words.
    for (const g of ["settings", "tune", "list_alt", "swap_horiz", "light_mode", "arrow_back"]) expect(ICON_NAMES).toContain(g)
  })
})
