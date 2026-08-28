import { describe, expect, it } from "vitest"

import {
  clearTriage,
  effectiveState,
  emptyTriage,
  findTriage,
  isSnoozeElapsed,
  parseTriageSet,
  setTriage,
  setTriageNote,
  SNOOZE_DAYS,
  triageCounts,
  triageDigest,
} from "../src/triage.js"

const NOW = "2026-08-27T12:00:00.000Z"
const LATER = "2026-09-30T12:00:00.000Z"
const KEY = "text-content|text|{}|{}|text:Doklady"

describe("setTriage", () => {
  it("files a verdict against the finding KEY, not its id", () => {
    const set = setTriage(emptyTriage("p"), KEY, "ignore", { now: NOW })
    expect(set.entries).toHaveLength(1)
    expect(findTriage(set, KEY)?.state).toBe("ignore")
    // ids and marks are renumbered every run and must not appear anywhere in the store.
    expect(JSON.stringify(set)).not.toContain('"id"')
    expect(JSON.stringify(set)).not.toContain('"mark"')
  })

  it("updates in place rather than stacking verdicts on one finding", () => {
    const first = setTriage(emptyTriage("p"), KEY, "fix", { now: NOW })
    const second = setTriage(first, KEY, "ignore", { now: LATER })
    expect(second.entries).toHaveLength(1)
    expect(second.entries[0]!.state).toBe("ignore")
    expect(second.entries[0]!.updatedAt).toBe(LATER)
  })

  it("keeps an existing note when only the verdict changes", () => {
    const noted = setTriage(emptyTriage("p"), KEY, "fix", { now: NOW, note: "padding is 12 not 8" })
    const moved = setTriage(noted, KEY, "snooze", { now: NOW })
    expect(findTriage(moved, KEY)?.note).toBe("padding is 12 not 8")
  })

  it("gives a snooze a default horizon and never one to the other states", () => {
    const snoozed = setTriage(emptyTriage("p"), KEY, "snooze", { now: NOW })
    const expected = new Date(new Date(NOW).getTime() + SNOOZE_DAYS * 86_400_000).toISOString()
    expect(findTriage(snoozed, KEY)?.snoozeUntil).toBe(expected)
    const fixed = setTriage(emptyTriage("p"), KEY, "fix", { now: NOW })
    expect(findTriage(fixed, KEY)?.snoozeUntil).toBeUndefined()
  })

  it("clears back to untriaged", () => {
    const set = clearTriage(setTriage(emptyTriage("p"), KEY, "ignore", { now: NOW }), KEY)
    expect(set.entries).toHaveLength(0)
  })
})

describe("snoozing", () => {
  it("an elapsed snooze reads as untriaged — that is what snoozing means", () => {
    const snoozed = setTriage(emptyTriage("p"), KEY, "snooze", { now: NOW })
    const entry = findTriage(snoozed, KEY)!
    expect(effectiveState(entry, NOW)).toBe("snooze")
    expect(isSnoozeElapsed(entry, NOW)).toBe(false)
    expect(effectiveState(entry, LATER)).toBeUndefined()
    expect(isSnoozeElapsed(entry, LATER)).toBe(true)
  })

  it("ignore and fix never expire", () => {
    const ignored = findTriage(setTriage(emptyTriage("p"), KEY, "ignore", { now: NOW }), KEY)!
    expect(effectiveState(ignored, LATER)).toBe("ignore")
  })

  it("counts exclude an elapsed snooze", () => {
    let set = setTriage(emptyTriage("p"), "a", "fix", { now: NOW })
    set = setTriage(set, "b", "ignore", { now: NOW })
    set = setTriage(set, "c", "snooze", { now: NOW })
    expect(triageCounts(set, NOW)).toEqual({ fix: 1, ignore: 1, snooze: 1 })
    expect(triageCounts(set, LATER)).toEqual({ fix: 1, ignore: 1, snooze: 0 })
  })
})

describe("setTriageNote", () => {
  it("files an untriaged finding as 'fix' — writing a note is deciding to act", () => {
    const set = setTriageNote(emptyTriage("p"), KEY, "wrong radius", NOW)
    expect(findTriage(set, KEY)).toMatchObject({ state: "fix", note: "wrong radius" })
  })

  it("keeps the verdict when editing the note of a triaged finding", () => {
    const ignored = setTriage(emptyTriage("p"), KEY, "ignore", { now: NOW })
    const noted = setTriageNote(ignored, KEY, "intended: brand colour", LATER)
    expect(findTriage(noted, KEY)).toMatchObject({
      state: "ignore",
      note: "intended: brand colour",
    })
  })
})

describe("parseTriageSet", () => {
  it("round-trips a stored set", () => {
    const set = setTriage(emptyTriage("p"), KEY, "ignore", { now: NOW, note: "n" })
    const parsed = parseTriageSet(JSON.parse(JSON.stringify(set)), "p")
    expect(parsed.ok).toBe(true)
    expect(parsed.value).toEqual(set)
  })

  it("refuses a set belonging to another pair", () => {
    const other = setTriage(emptyTriage("other"), KEY, "fix", { now: NOW })
    const parsed = parseTriageSet(other, "p")
    expect(parsed.ok).toBe(false)
    expect(parsed.value.entries).toHaveLength(0)
  })

  it("drops malformed rows instead of failing the whole file", () => {
    const parsed = parseTriageSet(
      {
        version: 1,
        pair: "p",
        entries: [
          { key: KEY, state: "ignore", note: "keep", updatedAt: NOW },
          { key: "", state: "fix" },
          { key: "x", state: "explode" },
          { state: "fix" },
        ],
      },
      "p",
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.value.entries).toHaveLength(1)
    expect(parsed.value.entries[0]!.key).toBe(KEY)
  })

  it("survives junk", () => {
    expect(parseTriageSet(null, "p").ok).toBe(false)
    expect(parseTriageSet("nope", "p").ok).toBe(false)
    expect(parseTriageSet({ version: 1, pair: "p" }, "p").value.entries).toEqual([])
  })
})

describe("triageDigest", () => {
  it("groups by state for the model, and hides an elapsed snooze", () => {
    let set = setTriage(emptyTriage("p"), "a", "fix", { now: NOW, note: "raise to 16px" })
    set = setTriage(set, "b", "ignore", { now: NOW })
    set = setTriage(set, "c", "snooze", { now: NOW })
    const digest = triageDigest(set, NOW)
    expect(digest).toContain("## fix (1)")
    expect(digest).toContain("raise to 16px")
    expect(digest).toContain("## ignore (1)")
    expect(digest).toContain("## snooze (1)")
    expect(triageDigest(set, LATER)).not.toContain("## snooze")
  })

  it("says so when nothing is triaged", () => {
    expect(triageDigest(emptyTriage("p"), NOW)).toContain("No findings triaged yet")
  })
})
