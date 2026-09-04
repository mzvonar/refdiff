import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * The app shell concatenates the embedded modules into ONE `<script
 * type="module">` (app-shell.ts), so their top-level scopes are SHARED. A name
 * declared in two of them — exported or not — is a `SyntaxError`, the module
 * never executes, and every route renders an empty body.
 *
 * The reason this is a guard and not a code review note is HOW it presents.
 * Chunk 3 added `escapeHtml` to `gallery-view.ts`, which `index-view.ts` already
 * declared. Nothing failed in typecheck, in the 266 unit tests, or in the build:
 * each module is valid alone. It surfaced as a refdiff CAPTURE ERROR —
 * `{"kind":"selector-not-found"}` on the new pair — which reads as a wrong
 * selector or an unbuilt route, i.e. as an ENVIRONMENT failure, and sends you
 * looking in the wrong place. The whole app was down and the only symptom was
 * one pair's selector.
 */

/** A top-level declaration and where it came from. */
export interface Declaration {
  name: string
  module: string
}

export interface DeclarationScan {
  declarations: Declaration[]
  /**
   * Top-level bindings the scanner could not NAME (a destructuring pattern).
   * Reported rather than skipped: a scanner blind to a binding form is
   * indistinguishable from a clean tree, which is the fail-open shape.
   */
  unnameable: { module: string; line: number; text: string }[]
}

/**
 * Every top-level value declaration in one compiled-to-plain-JS module.
 *
 * Column 0 IS the test for "top level" — these modules are flat by construction
 * (no imports, no wrapping IIFE), and tsc preserves their indentation. `interface`
 * and `type` are deliberately absent: they erase, so two modules may share them.
 */
export function topLevelDeclarations(module: string, source: string): DeclarationScan {
  const declarations: Declaration[] = []
  const unnameable: DeclarationScan["unnameable"] = []
  const named = /^(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
  const destructured = /^(?:export\s+)?(?:const|let|var)\s+[[{]/
  source.split("\n").forEach((line, i) => {
    if (/^\s/.test(line)) return
    const m = named.exec(line)
    if (m) {
      declarations.push({ name: m[1]!, module })
      return
    }
    if (destructured.test(line)) unnameable.push({ module, line: i + 1, text: line.trim() })
  })
  return { declarations, unnameable }
}

export interface Collision {
  name: string
  modules: string[]
}

/** Pure: names declared by more than one module, with who declared them. */
export function declarationCollisions(scans: readonly DeclarationScan[]): Collision[] {
  const where = new Map<string, string[]>()
  for (const scan of scans) {
    for (const d of scan.declarations) {
      const seen = where.get(d.name) ?? []
      if (!seen.includes(d.module)) seen.push(d.module)
      where.set(d.name, seen)
    }
  }
  return [...where.entries()]
    .filter(([, modules]) => modules.length > 1)
    .map(([name, modules]) => ({ name, modules: [...modules].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/* --------------------------------------------------------- the scanner --- */

describe("topLevelDeclarations", () => {
  it("names every top-level value form, exported or not", () => {
    const { declarations } = topLevelDeclarations(
      "m",
      [
        "export function a() {}",
        "function b() {}",
        "export const c = 1",
        "const d = 2",
        "let e = 3",
        "var f = 4",
        "export class G {}",
        "export async function h() {}",
        "function* i() {}",
      ].join("\n"),
    )
    expect(declarations.map((d) => d.name)).toEqual(["a", "b", "c", "d", "e", "f", "G", "h", "i"])
  })

  it("ignores anything indented — only the shared top-level scope collides", () => {
    const { declarations } = topLevelDeclarations(
      "m",
      ["export function outer() {", "  const inner = 1", "  function nested() {}", "}"].join("\n"),
    )
    expect(declarations.map((d) => d.name)).toEqual(["outer"])
  })

  // These erase, so two modules sharing one is not a collision. A scanner that
  // flagged them would make the guard cry wolf on every structural copy of a
  // core type — which is the documented pattern in these modules.
  it("ignores type-only declarations", () => {
    const { declarations } = topLevelDeclarations(
      "m",
      [
        "export interface Size { w: number }",
        "interface Local { x: number }",
        "export type Mode = 'a' | 'b'",
        "type Local2 = string",
      ].join("\n"),
    )
    expect(declarations).toEqual([])
  })

  it("REPORTS a top-level destructuring it cannot name, rather than skipping it", () => {
    const scan = topLevelDeclarations("m", "const { a, b } = thing\nconst [x] = list\nconst ok = 1")
    expect(scan.declarations.map((d) => d.name)).toEqual(["ok"])
    expect(scan.unnameable).toHaveLength(2)
    expect(scan.unnameable[0]!.line).toBe(1)
  })
})

describe("declarationCollisions", () => {
  // The real bug, reproduced: the exact shape chunk 3 shipped and had to fix.
  it("names a function two modules both export", () => {
    const c = declarationCollisions([
      topLevelDeclarations("index-view", "export function escapeHtml(s) { return s }"),
      topLevelDeclarations("gallery-view", "export function escapeHtml(s) { return s }"),
    ])
    expect(c).toEqual([{ name: "escapeHtml", modules: ["gallery-view", "index-view"] }])
  })

  // The case an exported-only scan MISSES, and it is the more likely one: making
  // the second copy module-private feels like the fix and changes nothing.
  it("collides even when one side is not exported", () => {
    const c = declarationCollisions([
      topLevelDeclarations("a", "export const PAD = 12"),
      topLevelDeclarations("b", "const PAD = 8"),
    ])
    expect(c).toEqual([{ name: "PAD", modules: ["a", "b"] }])
  })

  it("does not collide a name with itself inside one module", () => {
    expect(
      declarationCollisions([topLevelDeclarations("a", "const x = 1\nfunction y() {}")]),
    ).toEqual([])
  })

  it("lists every colliding name, not just the first", () => {
    const c = declarationCollisions([
      topLevelDeclarations("a", "const x = 1\nconst y = 2\nconst z = 3"),
      topLevelDeclarations("b", "const y = 9\nconst z = 8"),
    ])
    expect(c.map((k) => k.name)).toEqual(["y", "z"])
  })
})

/* ------------------------------------------------------ the real modules -- */

/** The list app-shell.ts embeds, in the order it concatenates them. */
const EMBEDDED = [
  "view-math",
  "annotations",
  "index-view",
  "gallery-view",
  "triage",
  "focus",
  "rail",
] as const

describe("the embedded modules", () => {
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url))

  it("declare no name twice across the shared top-level scope", async () => {
    const scans = await Promise.all(
      EMBEDDED.map(async (m) => topLevelDeclarations(m, await readFile(`${srcDir}${m}.ts`, "utf8"))),
    )
    // Guard the guard: an empty scan makes the assertion vacuous, which is how a
    // renamed module or a moved src dir reads as all-green.
    const total = scans.reduce((n, s) => n + s.declarations.length, 0)
    expect(total).toBeGreaterThan(100)
    for (const [i, scan] of scans.entries()) {
      expect(scan.declarations.length, `${EMBEDDED[i]} declares nothing — did it move?`).toBeGreaterThan(0)
    }

    expect(
      declarationCollisions(scans),
      "two embedded modules declare the same top-level name — they are concatenated into ONE module, so this is a SyntaxError that takes the whole app down and surfaces as a refdiff capture error. Rename one (gallery-view.ts's gEscape is the worked example)",
    ).toEqual([])
  })

  it("holds no top-level destructuring the collision scan cannot see", async () => {
    const scans = await Promise.all(
      EMBEDDED.map(async (m) => topLevelDeclarations(m, await readFile(`${srcDir}${m}.ts`, "utf8"))),
    )
    expect(scans.flatMap((s) => s.unnameable)).toEqual([])
  })

  // app-shell.ts is the only place that says which modules are embedded. If it
  // grows a seventh source and this list does not, the new module is unguarded —
  // and unguarded is exactly how the escapeHtml collision shipped.
  it("is the same set app-shell.ts actually embeds", async () => {
    const shell = await readFile(`${srcDir}app-shell.ts`, "utf8")
    const embedded = [...shell.matchAll(/options\.(\w+)Source,?\n/g)].map((m) => m[1]!)
    const declared = [...new Set(embedded)].sort()
    const expected = EMBEDDED.map((m) =>
      m.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
    ).sort()
    expect(declared).toEqual(expected)
  })
})
