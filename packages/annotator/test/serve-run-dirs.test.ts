import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

/**
 * The wiring half of run-dirs.ts, through the real binary.
 *
 * run-dirs.test.ts proves the SCAN re-reads the disk. That is not the bug that
 * shipped: `collectRunDirs` was always correct, and the server called it once at
 * startup and froze the result into the API's options, so a pair measured for
 * the first time while the server was up never appeared. A unit test of the scan
 * reproduces exactly the blind spot that let it ship — which is why this one
 * spawns `dist/cli.js`, adds a run dir to a LIVE server's root, and asks the
 * server. Against the pre-fix code the third fetch returns two pairs and the new
 * pair's annotations endpoint answers 404.
 *
 * The reports are deliberately unparseable `{}`: this is a test about which
 * dirs the server can SEE, and an unreadable report is listed as a broken pair
 * with its dir name, which is the fact under test. Building a valid
 * ComparisonReport here would test the parser instead.
 */

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url))

let root: string
let proc: ChildProcessWithoutNullStreams | undefined

const addRunDir = async (name: string): Promise<void> => {
  await mkdir(join(root, name), { recursive: true })
  await writeFile(join(root, name, "findings.json"), "{}", "utf8")
}

/** Start the served app on an ephemeral port and resolve its origin. */
const serve = async (): Promise<string> => {
  proc = spawn(process.execPath, [CLI, root, "--serve", "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  let out = ""
  let err = ""
  proc.stderr.on("data", (c: Buffer) => (err += c.toString()))
  return new Promise((resolveOrigin, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`server did not start in 20s\nstdout:\n${out}\nstderr:\n${err}`)),
      20_000,
    )
    proc!.stdout.on("data", (c: Buffer) => {
      out += c.toString()
      const m = /(http:\/\/127\.0\.0\.1:\d+)\//.exec(out)
      if (m) {
        clearTimeout(timer)
        resolveOrigin(m[1]!)
      }
    })
    proc!.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`server exited with ${code}\nstdout:\n${out}\nstderr:\n${err}`))
    })
  })
}

const pairDirs = async (origin: string): Promise<string[]> => {
  const res = await fetch(`${origin}/api/pairs`)
  expect(res.status).toBe(200)
  const body = (await res.json()) as { pairs: { dir: string }[] }
  return body.pairs.map((p) => p.dir).sort()
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "refdiff-serve-"))
})
afterEach(async () => {
  proc?.kill("SIGKILL")
  proc = undefined
  await rm(root, { force: true, recursive: true })
})

describe("the served app lists a pair added AFTER it started", () => {
  it("serves the new run dir without a restart, and answers for it by name", async () => {
    await addRunDir("alert--default")
    await addRunDir("alert--danger")
    const origin = await serve()

    expect(await pairDirs(origin)).toEqual(["alert--danger", "alert--default"])

    await addRunDir("alert--warning")

    // The assertion the frozen startup listing failed: same process, same
    // request, one more pair on disk.
    expect(await pairDirs(origin)).toEqual([
      "alert--danger",
      "alert--default",
      "alert--warning",
    ])

    // …and the per-pair endpoints resolve the new name too, which is the other
    // half of the frozen listing: `dirFor` read the same map. 404 is "unknown
    // pair"; anything else means the server found the dir (here 500, because
    // the fixture's report is deliberately unparseable).
    const res = await fetch(`${origin}/api/pairs/alert--warning/annotations`)
    expect(res.status).not.toBe(404)
  }, 30_000)

  it("still refuses a name that is not a run dir under the root", async () => {
    await addRunDir("alert--default")
    const origin = await serve()

    for (const name of ["nope", "..", "%2e%2e%2f%2e%2e%2fetc", "..%2f..%2fetc"]) {
      const res = await fetch(`${origin}/api/pairs/${name}/annotations`)
      expect(res.status, `name ${name} must not resolve`).toBe(404)
    }
  }, 30_000)
})
