import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { FONT_FACE_CSS, FONT_FILES, ICON_CSS, fontFile } from "../src/fonts.js"

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
    for (const f of FONT_FILES) expect(FONT_FACE_CSS).toContain(`src:url(fonts/${f.file}) format('woff2')`)
    // Slovak diacritics ("Služby") are latin-ext; a latin-only subset would
    // draw them in the fallback face mid-word.
    expect(FONT_FILES.filter((f) => f.unicodeRange?.startsWith("U+0100-02BA"))).toHaveLength(3)
    expect(FONT_FACE_CSS).not.toMatch(/https?:/)
    // The icon face keeps its axes: the comps set FILL/wght/GRAD/opsz on it.
    expect(FONT_FACE_CSS).toContain("font-family:'Material Symbols Outlined'; font-style:normal; font-weight:300 600; font-display:block")
    expect(ICON_CSS).toContain("'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 20")
  })

  it("maps only whitelisted names — no traversal, no other extension", () => {
    expect(fontFile("/fonts/ibm-plex-sans-latin.woff2")?.file).toBe("ibm-plex-sans-latin.woff2")
    expect(fontFile("/fonts/material-symbols-outlined.woff2")?.family).toBe("Material Symbols Outlined")
    expect(fontFile("/fonts/../cli.js")).toBeUndefined()
    expect(fontFile("/fonts/nope.woff2")).toBeUndefined()
    expect(fontFile("/fonts/ibm-plex-sans-latin.ttf")).toBeUndefined()
    expect(fontFile("/ibm-plex-sans-latin.woff2")).toBeUndefined()
  })
})
