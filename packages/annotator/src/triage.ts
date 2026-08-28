/**
 * Human triage of FINDINGS: fix / ignore / snooze, plus a note.
 *
 * Distinct from annotations (annotations.ts), which are notes a person DRAWS on the canvas at a
 * place. A triage entry is a verdict on a finding the harness already reported — "yes, fix this",
 * "no, that is intended", "not now" — so the next run's list can be read down to what is left.
 *
 * Keyed by `Finding.key` (core's `identityKey`), never by `id`/`mark`: those are renumbered every
 * run, so an id-keyed decision would silently attach to a different finding after a recapture. A
 * key survives realignment and renumbering; when a finding genuinely changes (its text or its
 * expected/actual move) the key changes with it and the old verdict correctly stops applying.
 *
 * Pure and import-free like view-math/annotations, so the same tested functions run in the browser.
 */

export const TRIAGE_STATES = ["fix", "ignore", "snooze"] as const
export type TriageState = (typeof TRIAGE_STATES)[number]

export interface TriageEntry {
  /** `Finding.key` — stable across runs. */
  key: string
  state: TriageState
  note: string
  /** ISO date; a snooze is over when this is in the past (`isSnoozeElapsed`). */
  snoozeUntil?: string
  updatedAt: string
}

export interface TriageSet {
  version: 1
  pair: string
  entries: TriageEntry[]
}

/** Days a snooze lasts unless the caller says otherwise. */
export const SNOOZE_DAYS = 7

export const emptyTriage = (pair: string): TriageSet => ({ version: 1, pair, entries: [] })

export const findTriage = (set: TriageSet, key: string | undefined): TriageEntry | undefined =>
  key === undefined ? undefined : set.entries.find((e) => e.key === key)

/** A snooze that has run out behaves as untriaged — that is the point of snoozing. */
export function isSnoozeElapsed(entry: TriageEntry, now: string): boolean {
  return entry.state === "snooze" && entry.snoozeUntil !== undefined && entry.snoozeUntil <= now
}

/** The state a reader should act on: an elapsed snooze reads as untriaged. */
export function effectiveState(
  entry: TriageEntry | undefined,
  now: string,
): TriageState | undefined {
  if (!entry) return undefined
  return isSnoozeElapsed(entry, now) ? undefined : entry.state
}

/** Upsert one verdict. Returns a NEW set — the caller persists it. */
export function setTriage(
  set: TriageSet,
  key: string,
  state: TriageState,
  options: { note?: string; now: string; snoozeUntil?: string } = {
    now: new Date(0).toISOString(),
  },
): TriageSet {
  const existing = findTriage(set, key)
  const entry: TriageEntry = {
    key,
    state,
    note: options.note ?? existing?.note ?? "",
    ...(state === "snooze"
      ? { snoozeUntil: options.snoozeUntil ?? addDays(options.now, SNOOZE_DAYS) }
      : {}),
    updatedAt: options.now,
  }
  return {
    ...set,
    entries: existing
      ? set.entries.map((e) => (e.key === key ? entry : e))
      : [...set.entries, entry],
  }
}

/** Drop a verdict entirely (back to untriaged). */
export function clearTriage(set: TriageSet, key: string): TriageSet {
  return { ...set, entries: set.entries.filter((e) => e.key !== key) }
}

/** Edit only the note, keeping the verdict. A note on an untriaged finding files it as "fix". */
export function setTriageNote(set: TriageSet, key: string, note: string, now: string): TriageSet {
  const existing = findTriage(set, key)
  if (!existing) return setTriage(set, key, "fix", { note, now })
  return {
    ...set,
    entries: set.entries.map((e) => (e.key === key ? { ...e, note, updatedAt: now } : e)),
  }
}

export function triageCounts(
  set: TriageSet,
  now: string,
): { fix: number; ignore: number; snooze: number } {
  const counts = { fix: 0, ignore: 0, snooze: 0 }
  for (const entry of set.entries) {
    const state = effectiveState(entry, now)
    if (state) counts[state] += 1
  }
  return counts
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString()
}

export interface TriageParseResult {
  ok: boolean
  value: TriageSet
  error?: string
}

/**
 * Validate a stored set. Unknown states and malformed entries are DROPPED rather than failing the
 * whole file: a triage file is a convenience, and losing one bad row beats refusing to load.
 */
export function parseTriageSet(raw: unknown, pair: string): TriageParseResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, value: emptyTriage(pair), error: "not an object" }
  }
  const candidate = raw as Partial<TriageSet>
  if (candidate.pair !== undefined && candidate.pair !== pair) {
    return {
      ok: false,
      value: emptyTriage(pair),
      error: `triage is for pair "${String(candidate.pair)}", not "${pair}"`,
    }
  }
  const entries = Array.isArray(candidate.entries) ? candidate.entries : []
  const kept: TriageEntry[] = []
  for (const raw_ of entries) {
    const e = raw_ as Partial<TriageEntry>
    if (typeof e.key !== "string" || e.key.length === 0) continue
    if (typeof e.state !== "string") continue
    if (!TRIAGE_STATES.includes(e.state as TriageState)) continue
    kept.push({
      key: e.key,
      state: e.state as TriageState,
      note: typeof e.note === "string" ? e.note : "",
      ...(typeof e.snoozeUntil === "string" ? { snoozeUntil: e.snoozeUntil } : {}),
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : new Date(0).toISOString(),
    })
  }
  return { ok: true, value: { version: 1, pair, entries: kept } }
}

/** Markdown for the model: what a human decided, so the loop can skip what was refused. */
export function triageDigest(set: TriageSet, now: string): string {
  if (set.entries.length === 0) return `# Triage — ${set.pair}\n\nNo findings triaged yet.\n`
  const lines = [`# Triage — ${set.pair}`, ""]
  for (const state of TRIAGE_STATES) {
    const rows = set.entries.filter((e) => effectiveState(e, now) === state)
    if (rows.length === 0) continue
    lines.push(`## ${state} (${rows.length})`, "")
    for (const row of rows) {
      const note = row.note.trim() ? ` — ${row.note.trim()}` : ""
      const until = row.snoozeUntil ? ` (until ${row.snoozeUntil})` : ""
      lines.push(`- \`${row.key}\`${until}${note}`)
    }
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}
