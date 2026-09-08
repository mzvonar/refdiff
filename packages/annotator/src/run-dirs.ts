/**
 * Which run dirs a served out root CONTAINS — re-read on every request, never
 * cached, because the set of pairs is not a startup fact.
 *
 * The served app is pointed at a root that a `compare` is still writing into,
 * so the list changes underneath it in two different ways. A re-run of an
 * existing pair REWRITES its `findings.json`, which the server picked up all
 * along (every handler loads the file per request). A run that measures a pair
 * for the FIRST time — a new manifest entry, a variant that stopped being
 * skipped — ADDS a directory, and that one was invisible until the process was
 * restarted, because the directory listing was taken once at startup and
 * frozen into the API's options.
 *
 * The two are indistinguishable from the outside: the page renders, every cell
 * on it is current, and the missing one looks exactly like a cell the run never
 * measured. Measured on a DS root (2026-09-08): four newly-paired
 * `dialog-header` cells sat on disk while `/api/pairs` kept serving `204 pairs`
 * and the entry's four old cells; a restart served `208` and eight. Nothing
 * reported it, and the reading it invites — "the story still has no panel for
 * those variants" — is the opposite of what happened.
 */

import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

/** A run dir: the name it is addressed by in the API and on disk, and its path. */
export interface RunDir {
  name: string
  dir: string
}

export type Discovery = { ok: true; runs: RunDir[] } | { ok: false; reason: string }

/**
 * Does this directory hold a report?
 *
 * An existence check, not a read: the file is read in full by `loadReport` a
 * moment later, and doing it twice per dir per request is the whole listing's
 * cost doubled for nothing. The consequence is deliberate — a `findings.json`
 * that exists but cannot be READ (permissions, mid-write truncation) now makes
 * its directory a listed pair, which the caller reports as broken with a
 * reason. That is this module's standing rule: a pair that silently vanishes
 * from the list is the failure the list exists to prevent.
 */
export async function isRunDir(dir: string): Promise<boolean> {
  try {
    await access(join(dir, "findings.json"))
    return true
  } catch {
    return false
  }
}

/**
 * Every run dir directly under `root`, sorted by name.
 *
 * Symlinked entries are not followed — `withFileTypes` reports a symlink as a
 * symlink rather than a directory, so a linked run dir is not listed. That is
 * the pre-existing behaviour and the reason callers resolve a NAME by looking
 * it up in this list rather than by joining it onto the root: every name the
 * API accepts came from a filesystem listing of the root, so no request can
 * address a directory outside it, and the listing and the lookup cannot drift
 * apart because there is only one of them.
 */
export async function discoverRunDirs(root: string): Promise<Discovery> {
  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch (e) {
    return { ok: false, reason: `cannot read ${root}: ${(e as Error).message}` }
  }
  const runs: RunDir[] = []
  for (const name of names) {
    const dir = join(root, name)
    if (await isRunDir(dir)) runs.push({ name, dir })
  }
  return { ok: true, runs }
}

/**
 * The list a request should serve, given the last one that worked.
 *
 * A re-scan that FAILS (the root renamed or unmounted while serving) must not
 * empty the page: an empty list reads as "this set measured nothing", which is
 * a statement about the run rather than about the disk. Serving the previous
 * list instead keeps the failure loud where it is legible — each dir is still
 * loaded per request, so every row comes back marked broken with the real
 * reason, which is what actually happened.
 */
export function runsForRequest(discovery: Discovery, lastGood: RunDir[]): RunDir[] {
  return discovery.ok ? discovery.runs : lastGood
}
