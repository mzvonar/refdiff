import { describe, expect, it, vi } from "vitest"

import {
  checkProps,
  type DcPropsProbe,
  describePropsError,
  driveProps,
  type PropsPage,
  readProps,
} from "./dc-props.js"

const probe = (over: Partial<DcPropsProbe> = {}): DcPropsProbe => ({
  supported: true,
  root: "messages",
  registryVisible: true,
  declared: ["selOd", "selAd"],
  ...over,
})

describe("checkProps", () => {
  it("passes an override whose every key the comp declares", () => {
    expect(checkProps({ selAd: "t1" }, probe())).toBeUndefined()
  })

  it("hard-stops on a runtime with no __dcSetProps", () => {
    expect(checkProps({ selAd: 1 }, probe({ supported: false }))).toEqual({
      kind: "props-unsupported",
    })
  })

  // The case this module exists for: the override is accepted by the runtime and
  // does nothing, so the frame shoots its default state under a pair that claims
  // otherwise. Undeclared is an ERROR, not a warning.
  it("hard-stops on a prop the comp does not declare, and names both sides", () => {
    expect(checkProps({ selAd: 1, selXx: 2 }, probe({ declared: ["selAd"] }))).toEqual({
      kind: "props-undeclared",
      undeclared: ["selXx"],
      declared: ["selAd"],
      root: "messages",
    })
  })

  it("treats a comp that declares nothing as undeclared", () => {
    expect(checkProps({ selAd: 1 }, probe({ declared: [] }))).toEqual({
      kind: "props-undeclared",
      undeclared: ["selAd"],
      declared: [],
      root: "messages",
    })
  })

  /**
   * „I could not read the declaration" and „there is no declaration" have
   * OPPOSITE remedies, and the first one's remedy — declare the prop — is wrong
   * and unactionable when the prop is already declared on a component the probe
   * could not see. The `dc-import` wrapper recipe in setup.md produces exactly
   * that shape: the root is the wrapper, the props live on its imported child.
   */
  it("separates an unreadable registry from a comp that declares nothing", () => {
    expect(checkProps({ selAd: 1 }, probe({ registryVisible: false }))).toEqual({
      kind: "props-registry-unreadable",
      root: "messages",
    })
  })

  it("reports an unsupported runtime before it reports an unreadable registry", () => {
    // Precedence matters: a pre-__dcSetProps runtime has no registry to read, so
    // reporting the registry first would send the reader to the wrong remedy.
    expect(checkProps({ selAd: 1 }, probe({ supported: false, registryVisible: false }))).toEqual({
      kind: "props-unsupported",
    })
  })
})

describe("describePropsError", () => {
  // A typo lands here, and the message has to be enough to fix it without
  // opening the comp — hence the declared list in the error.
  it("explains an undeclared prop by listing what IS declared", () => {
    const text = describePropsError({
      kind: "props-undeclared",
      undeclared: ["selAdd"],
      declared: ["selAd", "selAm"],
      root: "messages",
    })
    expect(text).toContain("selAdd")
    expect(text).toContain("selAd, selAm")
    expect(text).toContain("silently inert")
    // The wrapper trap is named here because this is the message a reader gets
    // when they hit it — see the registry-unreadable case for the other half.
    expect(text).toContain("dc-import")
  })

  it("says so plainly when the root declares nothing at all", () => {
    const text = describePropsError({
      kind: "props-undeclared",
      undeclared: ["selAd"],
      declared: [],
      root: "wrapper",
    })
    expect(text).toContain('the root "wrapper" declares no props at all')
  })

  it("points an unsupported runtime at re-vendoring support.js", () => {
    expect(describePropsError({ kind: "props-unsupported" })).toContain("support.js")
  })

  it("blames the harness, not the comp, when the registry could not be read", () => {
    const text = describePropsError({ kind: "props-registry-unreadable", root: "wrapper" })
    expect(text).toContain("wrapper")
    expect(text).toContain("NOT a missing declaration")
  })
})

describe("readProps", () => {
  it("accepts a prop bag and keeps values untouched", () => {
    // Values are the comp's business: the messages comp takes an index OR a
    // thread id for the same prop, so a type check here would reject a valid pair.
    const result = readProps({ selAd: "t1", openAm: true, n: 3 })
    expect(result).toEqual({ ok: true, value: { selAd: "t1", openAm: true, n: 3 } })
  })

  it("copies rather than aliasing the manifest's own object", () => {
    const original = { selAd: "t1" }
    const result = readProps(original)
    expect(result.ok && result.value).not.toBe(original)
  })

  it("treats an absent block as absent", () => {
    expect(readProps(undefined)).toEqual({ ok: true, value: undefined })
  })

  /**
   * A malformed block FAILS the manifest rather than being dropped, per
   * `readSections`' reasoning in manifest.ts: a dropped `props` leaves the
   * capture in the very default state this module exists to keep it out of, and
   * reports every difference against it as drift. The array case is the one to
   * expect, because the neighbouring `steps` IS an array.
   */
  it.each([
    ["an array", [{ selAd: 1 }]],
    ["a string", "selAd=1"],
    ["null", null],
    ["a number", 3],
  ])("refuses %s rather than dropping it", (_label, value) => {
    const result = readProps(value)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain("design.props must be an object")
  })

  it("refuses an empty object, which reads as setting props while setting none", () => {
    const result = readProps({})
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain("empty")
  })
})

/* ---------------------------------------------------------- driveProps -- */

interface FakeCall {
  kind: "evaluate" | "wait"
  arg: unknown
}

const fakePage = (probeResult: DcPropsProbe) => {
  const calls: FakeCall[] = []
  const page: PropsPage = {
    evaluate: vi.fn(async (_fn: (arg: never) => unknown, arg: unknown) => {
      calls.push({ kind: "evaluate", arg })
      // First evaluate is the probe; later ones are the apply.
      const isProbe = calls.filter((c) => c.kind === "evaluate").length === 1
      return (isProbe ? probeResult : undefined) as never
    }),
    waitForTimeout: vi.fn(async (ms: number) => {
      calls.push({ kind: "wait", arg: ms })
    }),
  }
  return { page, calls }
}

describe("driveProps", () => {
  it("probes, applies the whole bag, then settles", async () => {
    const { page, calls } = fakePage(probe({ declared: ["selAd", "openAm"] }))

    const error = await driveProps(page, { selAd: "t1", openAm: true }, 150)

    expect(error).toBeUndefined()
    expect(calls.map((c) => c.kind)).toEqual(["evaluate", "evaluate", "wait"])
    expect(calls[1]?.arg).toEqual({ selAd: "t1", openAm: true })
    expect(calls[2]?.arg).toBe(150)
  })

  /**
   * „Never mutate before validating": an inert override cannot reach a report
   * (the capture aborts), but applying one anyway would leave the page in a
   * state no error describes, and would make the failure order-dependent if a
   * later stage ever read it back.
   */
  it("applies NOTHING when the check fails", async () => {
    const { page, calls } = fakePage(probe({ declared: ["selAd"] }))

    const error = await driveProps(page, { selXx: 1 }, 150)

    expect(error).toMatchObject({ kind: "props-undeclared", undeclared: ["selXx"] })
    expect(calls.map((c) => c.kind)).toEqual(["evaluate"])
  })

  it("does not settle when it did not apply", async () => {
    const { page, calls } = fakePage(probe({ supported: false }))

    await driveProps(page, { selAd: 1 }, 150)

    expect(calls.some((c) => c.kind === "wait")).toBe(false)
  })
})
