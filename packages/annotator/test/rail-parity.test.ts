import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/*
 * A sheet and a pair share one `select()`, one marks layer and one rail container — which
 * is the design, and is what makes every tool work on both. The cost is a failure shape
 * with no symptom: `select()` scrolled the rail by asking for `.frow.sel`, a SHEET's rail
 * emits `.causerow` rows and no `.frow` at all, so selecting a finding on a sheet canvas
 * updated the state, lit the canvas, and did nothing whatsoever in the rail. No error, no
 * console line, and correct behaviour in the mode anyone testing by hand reaches first.
 *
 * Derived from the source, not asserted as literals: a renderer that stops emitting one of
 * these classes, or a `select()` that goes back to one selector for both modes, fails HERE
 * rather than going quiet in whichever mode the author was not looking at.
 */
const SRC = readFileSync(new URL("../src/render.ts", import.meta.url), "utf8")

/** The body of a top-level `function NAME(` up to its closing brace at column 0. */
function bodyOf(name: string): string {
  const start = SRC.indexOf(`function ${name}(`)
  expect(start, `${name} should exist in render.ts`).toBeGreaterThan(-1)
  const end = SRC.indexOf("\n}", start)
  return SRC.slice(start, end === -1 ? undefined : end)
}

describe("rail selection parity between a pair and a sheet", () => {
  it("asks for a row class the ACTIVE rail renderer actually emits, in BOTH modes", () => {
    const q = SRC.match(/querySelector\(sheet \? '([^']+)' : '([^']+)'\)/)
    expect(q, "select() must choose its rail-row selector per mode").toBeTruthy()
    const [, sheetSel, pairSel] = q as RegExpMatchArray

    for (const [selector, renderer] of [
      [sheetSel, "causeRowHtml"],
      [pairSel, "findingRowHtml"],
    ] as const) {
      const [base, marker] = selector.replace(/^\./u, "").split(".")
      expect(base, `${selector} should name a base class`).toBeTruthy()
      expect(marker, `${selector} should name a selected-state class`).toBeTruthy()
      const body = bodyOf(renderer)
      expect(body, `${renderer} should emit the ${base} class ${selector} asks for`).toContain(
        `class="${base}`,
      )
      expect(body, `${renderer} should mark the selected row with ' ${marker}'`).toContain(
        `' ${marker}'`,
      )
    }
  })

  it("keeps the two rail renderers distinct — a sheet lists causes, a pair lists findings", () => {
    expect(bodyOf("sheetRailHtml")).toContain("causeRowHtml")
    expect(bodyOf("findingRowHtml")).toContain('class="frow')
    // The positive control: without it, a predicate that matched nothing would pass
    // every row above by finding nothing to disagree with.
    expect(bodyOf("causeRowHtml")).not.toContain('class="frow')
  })
})
