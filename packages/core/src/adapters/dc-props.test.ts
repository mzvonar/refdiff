import { describe, expect, it } from "vitest"

import { checkProps, describePropsError, readProps } from "./dc-props.js"

describe("checkProps", () => {
  const probe = (declared: string[]) => ({ supported: true, declared })

  it("passes an override whose every key the comp declares", () => {
    expect(checkProps({ selAd: "t1" }, probe(["selOd", "selAd"]))).toBeUndefined()
  })

  it("hard-stops on a runtime with no __dcSetProps", () => {
    expect(checkProps({ selAd: 1 }, { supported: false, declared: [] })).toEqual({
      kind: "props-unsupported",
    })
  })

  // The case this module exists for: the override is accepted by the runtime and
  // does nothing, so the frame shoots its default state under a pair that claims
  // otherwise. Undeclared is an ERROR, not a warning.
  it("hard-stops on a prop the comp does not declare, and names both sides", () => {
    expect(checkProps({ selAd: 1, selXx: 2 }, probe(["selAd"]))).toEqual({
      kind: "props-undeclared",
      undeclared: ["selXx"],
      declared: ["selAd"],
    })
  })

  // A comp with no data-props at all is the same remedy, not a third error.
  it("treats a comp that declares nothing as undeclared", () => {
    expect(checkProps({ selAd: 1 }, probe([]))).toEqual({
      kind: "props-undeclared",
      undeclared: ["selAd"],
      declared: [],
    })
  })

  // A typo lands here, and the message has to be enough to fix it without
  // opening the comp — hence the declared list in the error.
  it("explains an undeclared prop by listing what IS declared", () => {
    const error = checkProps({ selAdd: 1 }, probe(["selAd", "selAm"]))
    expect(error).toBeDefined()
    const text = describePropsError(error!)
    expect(text).toContain("selAdd")
    expect(text).toContain("selAd, selAm")
    expect(text).toContain("silently inert")
  })

  it("points an unsupported runtime at re-vendoring support.js", () => {
    expect(describePropsError({ kind: "props-unsupported" })).toContain("support.js")
  })
})

describe("readProps", () => {
  it("accepts a prop bag and keeps values untouched", () => {
    // Values are the comp's business: messages.dc.html takes an index OR a
    // thread id for the same prop, so a type check here would reject a valid pair.
    expect(readProps({ selAd: "t1", openAm: true, n: 3 })).toEqual({
      selAd: "t1",
      openAm: true,
      n: 3,
    })
  })

  it("rejects shapes that cannot be a prop bag", () => {
    expect(readProps(undefined)).toBeUndefined()
    expect(readProps(null)).toBeUndefined()
    expect(readProps([{ selAd: 1 }])).toBeUndefined()
    expect(readProps("selAd=1")).toBeUndefined()
  })

  // An empty object reads as "this pair sets props" while setting none, which
  // would make the probe run and the error paths reachable for no reason.
  it("treats an empty object as absent", () => {
    expect(readProps({})).toBeUndefined()
  })
})
