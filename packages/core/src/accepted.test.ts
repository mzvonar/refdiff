import type { Finding } from "./types.js"

import { describe, expect, it } from "vitest"

import {
  acceptedFor,
  acceptedFromFinding,
  emptyAcceptedFile,
  parseAcceptedFile,
  removeAcceptedByKey,
  upsertAccepted,
  type AcceptedRecord,
} from "./accepted.js"
import { applyPolicy } from "./policy.js"

const NOW = "2026-08-28T12:00:00.000Z"

type Overrides = { [K in keyof Finding]?: Finding[K] | undefined }

// An explicit `undefined` override REMOVES the key: under
// exactOptionalPropertyTypes "absent" and "present but undefined" are different
// types, and these cases are about a finding that genuinely lacks the field.
const finding = (over: Overrides = {}): Finding => {
  const merged: Record<string, unknown> = {
    id: "f1",
    mark: 1,
    type: "color",
    severity: "major",
    message: 'color of "Portfólio" differs',
    text: "Portfólio",
    role: "text",
    key: "color|text|…",
    expected: { color: "rgb(44, 36, 25)" },
    actual: { color: "rgb(138, 125, 108)" },
    ...over,
  }
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete merged[k]
  return merged as unknown as Finding
}

describe("acceptedFromFinding", () => {
  it("builds the rule from the measurement, with provenance", () => {
    const r = acceptedFromFinding(finding(), "  our ink token; this comp is the outlier  ", NOW)
    expect(r.ok && r.value).toEqual({
      type: "color",
      role: "text",
      text: "Portfólio",
      expected: { color: "rgb(44, 36, 25)" },
      actual: { color: "rgb(138, 125, 108)" },
      reason: "our ink token; this comp is the outlier",
      key: "color|text|…",
      decidedAt: NOW,
    })
  })

  it("refuses a decision with no reason — a suppression nobody can audit", () => {
    const r = acceptedFromFinding(finding(), "   ", NOW)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/needs a reason/)
  })

  it("refuses coordinate findings, whose values move on every capture", () => {
    for (const type of ["position", "spacing"] as const) {
      const r = acceptedFromFinding(finding({ type }), "intended", NOW)
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toMatch(/lapse on the next run/)
    }
  })

  it("refuses the identity note — its numbers move and the fix is the size difference it names", () => {
    const r = acceptedFromFinding(
      finding({ type: "alignment", role: undefined, text: undefined, expected: { scale: 1 }, actual: { scale: 1.002 } }),
      "intended",
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/box model/)
  })

  it("drops the volatile diff numbers from a pixel-region and keeps changeKind", () => {
    const r = acceptedFromFinding(
      finding({
        type: "pixel-region",
        role: "icon",
        text: undefined,
        expected: { diffRatio: 0 },
        actual: { diffRatio: 0.3, diffPixels: 400, clusters: 4, changeKind: "shape" },
      }),
      "story renders a placeholder icon",
      NOW,
    )
    expect(r.ok && r.value.changeKind).toBe("shape")
    expect(r.ok && r.value.expected).toBeUndefined()
    expect(r.ok && r.value.actual).toBeUndefined()
  })

  it("refuses a finding that carries neither values nor text — it would forgive its whole role", () => {
    const r = acceptedFromFinding(
      finding({ type: "missing-element", text: undefined, expected: undefined, actual: undefined }),
      "intended",
      NOW,
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/every missing-element of role "text"/)
  })

  it("accepts a valueless presence finding when its text identifies the element", () => {
    const r = acceptedFromFinding(
      finding({ type: "missing-element", expected: undefined, actual: undefined }),
      "dropped deliberately in the redesign",
      NOW,
    )
    expect(r.ok && r.value).toMatchObject({ type: "missing-element", text: "Portfólio" })
  })
})

/** The record, or a failure loud enough to read in the test output. */
const decide = (f: Finding, reason: string, now: string = NOW): AcceptedRecord => {
  const r = acceptedFromFinding(f, reason, now)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("the decisions file", () => {
  it("round-trips through parse", () => {
    const built = upsertAccepted(
      emptyAcceptedFile(),
      "docs-owner-desktop",
      decide(finding(), "ours"),
    ).file
    const parsed = parseAcceptedFile(JSON.parse(JSON.stringify(built)))
    expect(parsed.ok && parsed.value).toEqual(built)
  })

  it("rejects a malformed entry instead of silently dropping it", () => {
    const parsed = parseAcceptedFile({
      version: 1,
      pairs: { p: [{ type: "color" }] },
    })
    expect(parsed.ok).toBe(false)
    expect(!parsed.ok && parsed.error).toMatch(/needs at least \{ type, reason \}/)
  })

  it("replaces an identical rule rather than appending it", () => {
    const first = decide(finding(), "ours")
    const again = decide(finding(), "ours, restated", "2026-09-01T00:00:00.000Z")
    const once = upsertAccepted(emptyAcceptedFile(), "p", first)
    expect(once.added).toBe(true)
    const twice = upsertAccepted(once.file, "p", again)
    expect(twice.added).toBe(false)
    expect(acceptedFor(twice.file, "p")).toHaveLength(1)
    expect(acceptedFor(twice.file, "p")[0]!.reason).toBe("ours, restated")
  })

  it("removes by the key that recorded it", () => {
    const file = upsertAccepted(emptyAcceptedFile(), "p", decide(finding(), "ours")).file
    expect(removeAcceptedByKey(file, "p", "color|text|…").removed).toBe(1)
    expect(removeAcceptedByKey(file, "p", "nope").removed).toBe(0)
  })
})

describe("a recorded decision, applied", () => {
  it("suppresses the finding it was made from, visibly and with its rule", () => {
    const file = upsertAccepted(emptyAcceptedFile(), "p", decide(finding(), "our ink token")).file
    const { kept, suppressed } = applyPolicy([finding()], { accepted: acceptedFor(file, "p") })
    expect(kept).toEqual([])
    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]!.suppressedBy).toBe("accepted")
    expect(suppressed[0]!.rule).toContain("our ink token")
  })

  it("lapses when the measured value changes — the whole reason not to edit the comp", () => {
    const drifted = finding({ actual: { color: "rgb(200, 0, 0)" } })
    const { kept } = applyPolicy([drifted], { accepted: [decide(finding(), "our ink token")] })
    expect(kept).toHaveLength(1)
  })

  it("does not spill onto another element with the same values", () => {
    const elsewhere = finding({ text: "Transakcie" })
    const { kept } = applyPolicy([elsewhere], { accepted: [decide(finding(), "our ink token")] })
    expect(kept).toHaveLength(1)
  })
})
