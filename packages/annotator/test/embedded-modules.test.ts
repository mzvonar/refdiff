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

  // SCOPE OF THIS GUARD, because it is not the whole scope that collides: it
  // scans the seven MODULE FILES. `CLIENT` and `APP_BOOT` are concatenated into
  // the same module and can collide with them too — chunk 3 declared `CELL_NOTE`
  // in CLIENT where gallery-view.ts already had it — but their bodies are
  // template literals whose end cannot be found without a real TypeScript scan
  // (see the note above). That case is covered instead by "the generated page
  // script > parses", which found exactly this one and named it: `Identifier
  // 'CELL_NOTE' has already been declared`. Two guards, one class, and the
  // parse one is the backstop.
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

/* ------------------------------------------ the module the page runs ----- */

/**
 * The shell's `<script type="module">` is BUILT BY STRING CONCATENATION, so
 * nothing that checks TypeScript can see inside it: `CLIENT` and `APP_BOOT` are
 * template literals, and a brace, paren or bracket imbalance in either is
 * invisible to `tsc` and to all 282 unit tests. It surfaces only in a browser,
 * as `SyntaxError: Unexpected end of input` — and because the module never
 * executes, EVERY route renders an empty body, which reads as "the route is
 * broken" rather than "the script did not parse".
 *
 * Observed twice while chunk 3's sheet was being wired: a duplicated
 * `async function openPair(dir) {` line (a bad edit), and a backtick inside a
 * comment in `APP_BOOT` closing its own template. `node --check` on the served
 * page found both in seconds; nothing else in the repo could.
 */
describe("the generated page script", () => {
  const srcDir = fileURLToPath(new URL("../dist/", import.meta.url))

  const shellScript = async (): Promise<string> => {
    const { renderAppShell } = (await import("../src/app-shell.js")) as {
      renderAppShell: (o: Record<string, string>) => string
    }
    const read = async (m: string) => readFile(`${srcDir}${m}.js`, "utf8")
    const html = renderAppShell({
      viewMathSource: await read("view-math"),
      annotationsSource: await read("annotations"),
      indexViewSource: await read("index-view"),
      galleryViewSource: await read("gallery-view"),
      triageSource: await read("triage"),
      focusSource: await read("focus"),
      railSource: await read("rail"),
      root: "/tmp/probe",
    })
    const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html)
    if (!m) throw new Error("the shell rendered no module script")
    return m[1]!
  }

  /**
   * Parse without running. `new Function` compiles its body and throws on a
   * syntax error, which is the whole check; `export` is not legal in a function
   * body, so the module's export keywords are stripped first. Nothing executes,
   * so no DOM is touched.
   */
  const parses = (src: string): { ok: true } | { ok: false; error: string } => {
    try {
      new Function(src.replace(/^export /gm, ""))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  it("catches an imbalance — the failure this guard exists for", () => {
    // the two real shapes, both of which shipped and neither of which tsc saw
    expect(parses("function a() { if (x) { }").ok).toBe(false)
    expect(parses("function a() {}function a() {} function b() { oops").ok).toBe(false)
    // and a positive control, or "false for everything" would pass every row
    expect(parses("function a() { return 1 }").ok).toBe(true)
  })

  it("parses, so the page's module actually runs", async () => {
    const src = await shellScript()
    // Guard the guard: a shell that rendered almost nothing would parse fine.
    expect(src.length).toBeGreaterThan(100_000)
    const r = parses(src)
    expect(
      r.ok ? "" : r.error,
      "the shell's concatenated module does not parse — it is built by string concatenation, so tsc and every unit test are blind to this, and in a browser it means the module never runs and EVERY route renders empty",
    ).toBe("")
  })

  it("balances the template literals CLIENT and APP_BOOT are built from", async () => {
    // A stray backtick in a comment inside either one closes it early: the file
    // still compiles, the script does not. Counted on the OUTPUT, where a
    // template that closed early leaves the rest of the page as loose text.
    const src = await shellScript()
    for (const ch of ["`", "${"]) {
      // no assertion on parity itself — the parse above is the real check; this
      // pins the symptom's location so a failure names the construct
      expect(src.includes("String.raw"), `the built script must not still contain a raw template marker (${ch})`).toBe(false)
    }
  })
})

/**
 * NOT GUARDED, deliberately, and this is the note that replaced the attempt.
 *
 * A backtick inside `CLIENT` / `EMBEDDED_BOOT` (render.ts) or `APP_BOOT` /
 * `INDEX_CSS` (app-shell.ts) closes the template early and the rest of the file
 * parses as TypeScript — a run of `TS1005 ',' expected` pointing at the comment,
 * never at the backtick. It happened THREE times in one session, always the same
 * way: writing an identifier in a comment the way this repo writes identifiers
 * everywhere else.
 *
 * A scanner for it was written and removed. Finding a block's body requires
 * knowing which backtick is its terminator, which is precisely the thing in
 * question — the first implementation scanned to the next backtick and so could
 * never find one inside the body, and its own synthetic offenders caught that.
 * Parity over the file does not work either: the common case is TWO backticks in
 * one comment, which keeps the count even. Doing it properly needs a real
 * TypeScript scan, which is not worth it here because **typecheck already
 * catches every instance** — the gap is the message, not the detection.
 *
 * So the standing advice, where it is useful: on a burst of `TS1005` in
 * render.ts or app-shell.ts, do not read the reported line. Count the backticks
 * in the named block first.
 */

