import type { ElementNode } from "../types.js"

import { describe, expect, it } from "vitest"

import { describeOcclusion, dropOccluded } from "./occlusion.js"

const node = (id: string, occluded?: boolean): ElementNode => ({
  id,
  box: { x: 0, y: 0, w: 10, h: 10 },
  role: "text",
  ...(occluded === undefined ? {} : { occluded }),
})

describe(dropOccluded, () => {
  it("removes elements the adapter reported as painted over", () => {
    const f = dropOccluded([node("d1"), node("d2", true)], [node("i1", true), node("i2", false)])
    expect(f.design.map((e) => e.id)).toStrictEqual(["d1"])
    expect(f.impl.map((e) => e.id)).toStrictEqual(["i2"])
    expect(f.designDropped).toBe(1)
    expect(f.implDropped).toBe(1)
  })

  // The contract that keeps this from deleting real findings. A Figma node has
  // no hit test and so no `occluded` key at all; treating that as "true" would
  // silently empty the design side of every Figma pair.
  it("keeps an element whose adapter could not tell, and one explicitly visible", () => {
    const f = dropOccluded([node("unknown"), node("visible", false)], [])
    expect(f.design.map((e) => e.id)).toStrictEqual(["unknown", "visible"])
    expect(f.designDropped).toBe(0)
  })

  it("is a no-op when nothing is occluded", () => {
    const design = [node("d1"), node("d2", false)]
    const f = dropOccluded(design, [])
    expect(f.design).toStrictEqual(design)
    expect(describeOcclusion(f)).toBeNull()
  })
})

describe(describeOcclusion, () => {
  it("names both sides so a reader can see which one carried the ghosts", () => {
    const f = dropOccluded([node("d", true)], [node("i1", true), node("i2", true)])
    expect(describeOcclusion(f)).toContain("1 design + 2 impl")
  })
})
