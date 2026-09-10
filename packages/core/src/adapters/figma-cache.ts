/**
 * On-disk cache for the two Figma responses that dominate a run's API budget,
 * keyed by the file's own VERSION so it can never serve stale bytes.
 *
 * The budget, measured on a 14-entry / 208-pair manifest (2026-09-10): 83 calls
 * for one full run — 14 `/v1/files/nodes`, 14 `/v1/files/variables/local`, and
 * 55 `/v1/images` chunks. Two runs back to back exhausted the `high` limit-type
 * and nine entries failed to expand mid-A/B, which is what this exists to stop.
 *
 * **What is NOT cached, deliberately: `/v1/files/nodes`.** That call returns the
 * document AND the file's `version`, and the version is what every key below is
 * built from — so it is the freshness probe, and a cached probe is not a probe.
 * One live call per entry (14 of 83) buys the guarantee that everything else is
 * either current or a miss. A file edited in Figma gets a new version, every key
 * changes, and the next run refetches without anyone remembering to clear
 * anything.
 *
 * That is the opposite of a file-existence cache (`does refs/foo.png exist?`),
 * which is what the consuming repo's older tooling used and which goes stale in
 * silence: its `dialog-starter` PNGs are pinned to a Figma version that no longer
 * exists, and nothing noticed for three days.
 *
 * **No version, no cache.** When Figma returns no version — or a caller pins one
 * we cannot confirm — the entry is simply not cacheable and the call goes out.
 * A cache without a freshness key is the failure mode, not a degraded mode.
 */

import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/** Everything that changes the bytes Figma renders for one node. */
export interface ImageKey {
  fileKey: string
  version: string
  nodeId: string
  scale: number
  /** `use_absolute_bounds`: the node's layout box (true) or its render bounds. */
  absoluteBounds: boolean
}

/**
 * `$REFDIFF_FIGMA_CACHE_DIR` wins, then `~/.cache/refdiff/figma`.
 *
 * The override is not a convenience. `captureFigma` caches by DEFAULT, so
 * without one every adapter test that injects a fake fetch writes its fixtures
 * into the developer's real cache — and then serves them to the next test,
 * which is how a suite goes from green to five failures that look like the
 * feature is broken (observed, 2026-09-10). The suite pins this to a temp dir.
 */
export const defaultFigmaCacheRoot = (): string =>
  process.env["REFDIFF_FIGMA_CACHE_DIR"] ?? join(homedir(), ".cache", "refdiff", "figma")

/**
 * A path segment that survives every filesystem: a Figma node id is `8329:4320`
 * and a version is a 19-digit integer, but neither is guaranteed, and `:` is
 * illegal on Windows. Anything outside the safe set is replaced, with a short
 * hash appended so two different ids can never collapse onto one file.
 */
export function safeSegment(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "_")
  if (cleaned === raw) return raw
  return `${cleaned}-${createHash("sha256").update(raw).digest("hex").slice(0, 8)}`
}

/** `<root>/<fileKey>/<version>/<nodeId>@<scale>x[-rb].png` */
export function imageCachePath(root: string, k: ImageKey): string {
  const bounds = k.absoluteBounds ? "" : "-rb"
  return join(
    root,
    safeSegment(k.fileKey),
    safeSegment(k.version),
    `${safeSegment(k.nodeId)}@${k.scale}x${bounds}.png`,
  )
}

/** `<root>/<fileKey>/<version>/variables.json` */
export function variablesCachePath(root: string, fileKey: string, version: string): string {
  return join(root, safeSegment(fileKey), safeSegment(version), "variables.json")
}

/** A version string we can key on: present, non-empty, not whitespace. */
export function isCacheable(version: string | undefined): version is string {
  return typeof version === "string" && version.trim() !== ""
}

/** Read cached bytes, or `undefined` for any miss — a cache never throws. */
export async function readCache(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch {
    return undefined
  }
}

/**
 * Write bytes, ignoring every failure. A full disk, a read-only home or a race
 * with another run must slow a run down, never fail one: the caller already has
 * the value it was going to cache.
 */
export async function writeCache(path: string, bytes: Buffer | string): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
  } catch {
    /* the caller has the value; caching is an optimisation */
  }
}

/**
 * Delete every version of `fileKey` except `keep`.
 *
 * Bounded growth is the lesser reason. The real one: a stale directory is a
 * loaded gun for the next person who "fixes" a cache miss by relaxing the key.
 * Nothing under this root should ever be servable for a version the file has
 * moved past. Returns how many were removed, so a caller can say so.
 */
export async function pruneOtherVersions(root: string, fileKey: string, keep: string): Promise<number> {
  const dir = join(root, safeSegment(fileKey))
  const keepSeg = safeSegment(keep)
  let removed = 0
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === keepSeg) continue
      await rm(join(dir, entry.name), { recursive: true, force: true })
      removed++
    }
  } catch {
    /* nothing cached for this file yet, or the root is unreadable */
  }
  return removed
}
