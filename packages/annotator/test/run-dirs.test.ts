import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { discoverRunDirs, isRunDir, runsForRequest, type RunDir } from "../src/run-dirs.js"

let root: string

const runDir = async (name: string): Promise<string> => {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "findings.json"), '{"pair":"' + name + '"}', "utf8")
  return dir
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "refdiff-run-dirs-"))
})
afterEach(async () => {
  await rm(root, { force: true, recursive: true })
})

describe("discoverRunDirs — the pair list is not a startup fact", () => {
  it("SEES a run dir created after an earlier scan — the bug this module exists for", async () => {
    await runDir("alert--default")
    await runDir("alert--danger")

    const before = await discoverRunDirs(root)
    expect(before.ok && before.runs.map((r) => r.name)).toEqual([
      "alert--danger",
      "alert--default",
    ])

    await runDir("alert--warning")

    const after = await discoverRunDirs(root)
    expect(after.ok && after.runs.map((r) => r.name)).toEqual([
      "alert--danger",
      "alert--default",
      "alert--warning",
    ])
  })

  it("counts an EXACT set, not a superset: a directory with no findings.json is not a pair", async () => {
    await runDir("alert--default")
    await mkdir(join(root, "crops"), { recursive: true })
    await writeFile(join(root, "summary.json"), "{}", "utf8")

    const found = await discoverRunDirs(root)
    expect(found.ok && found.runs).toHaveLength(1)
    expect(found.ok && found.runs[0]!.name).toBe("alert--default")
  })

  it("reports an unreadable root as a reason rather than as an empty set", async () => {
    const found = await discoverRunDirs(join(root, "does-not-exist"))
    expect(found.ok).toBe(false)
    expect(!found.ok && found.reason).toContain("cannot read")
  })

  it("does not follow a symlinked run dir — the listing is what names are resolved against", async () => {
    const real = await mkdtemp(join(tmpdir(), "refdiff-elsewhere-"))
    await writeFile(join(real, "findings.json"), "{}", "utf8")
    await symlink(real, join(root, "linked"), "dir")
    await runDir("alert--default")

    const found = await discoverRunDirs(root)
    expect(found.ok && found.runs.map((r) => r.name)).toEqual(["alert--default"])
    await rm(real, { force: true, recursive: true })
  })
})

describe("isRunDir — existence, so the report is read once and not twice", () => {
  it("is true for a dir holding findings.json and false otherwise", async () => {
    const dir = await runDir("alert--default")
    expect(await isRunDir(dir)).toBe(true)
    expect(await isRunDir(root)).toBe(false)
    expect(await isRunDir(join(root, "nope"))).toBe(false)
  })
})

describe("runsForRequest — a failed re-scan never empties the page", () => {
  const lastGood: RunDir[] = [{ name: "alert--default", dir: "/out/alert--default" }]

  it("serves the fresh list when the scan worked, empty included", () => {
    expect(runsForRequest({ ok: true, runs: [] }, lastGood)).toEqual([])
    const fresh: RunDir[] = [{ name: "b", dir: "/out/b" }]
    expect(runsForRequest({ ok: true, runs: fresh }, lastGood)).toBe(fresh)
  })

  it("falls back to the last good list when the scan failed", () => {
    expect(runsForRequest({ ok: false, reason: "cannot read /out" }, lastGood)).toBe(lastGood)
  })
})
