import { describe, expect, it } from "vitest"

import type { ComparisonReport } from "../types.js"

import { diffReports } from "./delta.js"

/**
 * Runs are numbered so the delta strip can say "Run 47 vs 46". A timestamp
 * identifies a run but does not ORDER it for a reader, which is what the comps
 * ask for and what a person acts on.
 *
 * The counter is the PREVIOUS REPORT, not a side file: `(previous?.run ?? 0) + 1`.
 * That gives it exactly the lifetime of the run dir it describes — delete the dir
 * and the count restarts with the delta and the ledger, rather than drifting on
 * against results that no longer exist.
 */
const report = (over: Partial<ComparisonReport> = {}): ComparisonReport =>
  ({
    pair: "p",
    createdAt: "2026-09-02T10:00:00.000Z",
    run: 1,
    findings: [],
    ...over,
  }) as ComparisonReport

describe("run numbering", () => {
  it("carries the previous run's ordinal into the delta", () => {
    const d = diffReports(report({ run: 46 }), { findings: [] })
    expect(d.previousRunNumber).toBe(46)
    // The timestamp stays: it is the run's identity, the ordinal is its order.
    expect(d.previousRun).toBe("2026-09-02T10:00:00.000Z")
  })

  it("omits the ordinal for a report written before runs were numbered", () => {
    // Reports on disk from earlier versions have no `run`; inventing one would
    // print a confident "Run 1 vs 1" over results that were never counted.
    const legacy = report()
    delete (legacy as { run?: number }).run
    const d = diffReports(legacy, { findings: [] })
    expect(d.previousRunNumber).toBeUndefined()
    expect(d.previousRun).toBe("2026-09-02T10:00:00.000Z")
  })
})
