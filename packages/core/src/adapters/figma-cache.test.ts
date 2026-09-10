import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  imageCachePath,
  isCacheable,
  pruneOtherVersions,
  readCache,
  safeSegment,
  variablesCachePath,
  writeCache,
} from "./figma-cache.js"

const ROOT = "/cache"
const KEY = { fileKey: "FILE", version: "111", nodeId: "8329:4320", scale: 2, absoluteBounds: true }

describe("the cache key", () => {
  /**
   * The whole guarantee. A file edited in Figma gets a new version, so every
   * key changes and every read misses — nobody has to remember to clear
   * anything. This is the row that fails if someone "simplifies" the version
   * out of the path to improve the hit rate.
   */
  it("changes with the file VERSION, so an edited file cannot hit", () => {
    const before = imageCachePath(ROOT, KEY)
    const after = imageCachePath(ROOT, { ...KEY, version: "222" })
    expect(after).not.toBe(before)
    expect(before).toContain("111")
    expect(after).toContain("222")
  })

  // The same node renders to two different pictures under the two settings,
  // and one set can ask for both (a Focus column paints outside its box while
  // Default does not). Sharing a key would serve the wrong picture.
  it("changes with absoluteBounds and with scale", () => {
    expect(imageCachePath(ROOT, { ...KEY, absoluteBounds: false })).not.toBe(imageCachePath(ROOT, KEY))
    expect(imageCachePath(ROOT, { ...KEY, scale: 3 })).not.toBe(imageCachePath(ROOT, KEY))
  })

  it("separates files, nodes and the variables map", () => {
    expect(imageCachePath(ROOT, { ...KEY, fileKey: "OTHER" })).not.toBe(imageCachePath(ROOT, KEY))
    expect(imageCachePath(ROOT, { ...KEY, nodeId: "1:1" })).not.toBe(imageCachePath(ROOT, KEY))
    expect(variablesCachePath(ROOT, "FILE", "111")).not.toBe(variablesCachePath(ROOT, "FILE", "222"))
  })
})

describe("safeSegment", () => {
  it("leaves an already-safe segment untouched", () => {
    expect(safeSegment("111")).toBe("111")
    expect(safeSegment("FILE-key_1.2")).toBe("FILE-key_1.2")
  })

  /**
   * `:` is illegal on Windows, so node ids are rewritten — but rewriting alone
   * would collapse `8329:4320` and `8329_4320` onto one file and serve one
   * node's render for the other. The hash suffix is what makes that impossible.
   */
  it("rewrites unsafe characters WITHOUT letting two ids collide", () => {
    const a = safeSegment("8329:4320")
    const b = safeSegment("8329_4320")
    expect(a).not.toContain(":")
    expect(a).not.toBe(b)
  })
})

describe("isCacheable", () => {
  // No version means no freshness key, and a cache without one is the failure
  // mode this module exists to avoid — so it must read as NOT cacheable.
  it.each([undefined, "", "   "])("refuses %o", (v) => {
    expect(isCacheable(v as string | undefined)).toBe(false)
  })

  it("accepts a real version", () => {
    expect(isCacheable("2397139771824355645")).toBe(true)
  })
})

describe("on disk", () => {
  const tmp = () => mkdtemp(join(tmpdir(), "refdiff-cache-"))

  it("round-trips bytes, and a miss is undefined rather than a throw", async () => {
    const root = await tmp()
    const path = imageCachePath(root, KEY)
    expect(await readCache(path)).toBeUndefined()
    await writeCache(path, Buffer.from("png-bytes"))
    expect((await readCache(path))?.toString()).toBe("png-bytes")
  })

  it("never throws when the destination cannot be written", async () => {
    // A directory where a file should go: the write must be swallowed, because
    // the caller already holds the value it was going to cache.
    const root = await tmp()
    const path = imageCachePath(root, KEY)
    await mkdir(path, { recursive: true })
    await expect(writeCache(path, Buffer.from("x"))).resolves.toBeUndefined()
  })

  /**
   * Pruning is not housekeeping. A directory for a version the file has moved
   * past is a loaded gun for the next person who "fixes" a miss by relaxing the
   * key — the consuming repo has exactly that bug in its older tooling, where
   * PNGs are pinned to a Figma version that no longer exists and nothing
   * noticed for three days.
   */
  it("prunes every version except the one in hand", async () => {
    const root = await tmp()
    for (const v of ["111", "222", "333"]) {
      await writeCache(imageCachePath(root, { ...KEY, version: v }), Buffer.from(v))
    }
    await writeCache(imageCachePath(root, { fileKey: "OTHER", version: "999", nodeId: "1:1", scale: 2, absoluteBounds: true }), Buffer.from("other"))
    const removed = await pruneOtherVersions(root, "FILE", "222")
    expect(removed).toBe(2)
    expect(await readdir(join(root, "FILE"))).toEqual(["222"])
    // Another file's cache is untouched — pruning is per file, not global.
    expect(await readdir(join(root, "OTHER"))).toEqual(["999"])
  })

  it("is a no-op, not an error, when nothing is cached for the file yet", async () => {
    const root = await tmp()
    await expect(pruneOtherVersions(root, "NEVER-SEEN", "111")).resolves.toBe(0)
  })

  it("treats a corrupt entry as a miss", async () => {
    const root = await tmp()
    const path = variablesCachePath(root, "FILE", "111")
    await mkdir(join(root, "FILE", "111"), { recursive: true })
    await writeFile(path, "{ not json")
    // readCache returns the bytes; the CALLER parses, and figma.ts falls back to
    // a live fetch on a parse failure rather than crashing the capture.
    const raw = (await readCache(path))!.toString()
    expect(() => JSON.parse(raw)).toThrow()
  })
})
