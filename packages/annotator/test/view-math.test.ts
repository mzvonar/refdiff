import { describe, expect, it } from "vitest"

import {
  ALIGN_LABELS,
  ALIGN_MODES,
  IDENTITY_ALIGNMENT,
  alignRemap,
  aspectStretch,
  displayAlignment,
  shownFromWorld,
  worldFromShown,
  designCaptureDpr,
  designImageTransform,
  designLayerTransform,
  projectionAlignment,
  rawDesignSize,
  designToWorld,
  designWorldBox,
  fitView,
  focusView,
  implImageTransform,
  screenToWorld,
  unionBoxes,
  worldLayerTransform,
  worldToDesign,
  zoomAt,
} from "../src/view-math.js"

// The doc-detail run: design 756×955 css @2x, impl 760×740 @2x,
// alignment ×0.943/0.935 @ (3.5, 5.8).
const A = { scale: 0.943, scaleY: 0.935, offsetX: 3.5, offsetY: 5.8 }

describe("design ↔ world", () => {
  it("round-trips through the alignment", () => {
    const p = { x: 120, y: 340 }
    const w = designToWorld(p, A)
    expect(w.x).toBeCloseTo(120 * 0.943 + 3.5)
    expect(w.y).toBeCloseTo(340 * 0.935 + 5.8)
    const back = worldToDesign(w, A)
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it("identity alignment leaves points alone", () => {
    expect(designToWorld({ x: 7, y: 9 }, IDENTITY_ALIGNMENT)).toEqual({ x: 7, y: 9 })
  })

  it("designWorldBox is the design frame projected into impl space", () => {
    const b = designWorldBox({ w: 756, h: 955 }, A)
    expect(b).toEqual({ x: 3.5, y: 5.8, w: 756 * 0.943, h: 955 * 0.935 })
  })
})

describe("image transforms keep both panes in the same world", () => {
  const view = { z: 1.5, tx: 40, ty: 20 }

  // Parse "translate(a, b) scale(c[, d]) …" into an affine matrix and apply it.
  const apply = (transform: string, p: { x: number; y: number }) => {
    let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const mul = (n: typeof m) => {
      m = {
        a: m.a * n.a + m.c * n.b,
        b: m.b * n.a + m.d * n.b,
        c: m.a * n.c + m.c * n.d,
        d: m.b * n.c + m.d * n.d,
        e: m.a * n.e + m.c * n.f + m.e,
        f: m.b * n.e + m.d * n.f + m.f,
      }
    }
    for (const [, fn, args] of transform.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
      const nums = (args ?? "").split(",").map((s) => parseFloat(s))
      const [u = 0, v] = nums
      if (fn === "translate") mul({ a: 1, b: 0, c: 0, d: 1, e: u, f: v ?? 0 })
      else mul({ a: u, b: 0, c: 0, d: v ?? u, e: 0, f: 0 })
    }
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }
  }

  it("a design element and its matched impl element land on the same screen point", () => {
    // Design leaf at design css (200, 300) → world (200·0.943+3.5, 300·0.935+5.8).
    const world = designToWorld({ x: 200, y: 300 }, A)
    // Design PNG native px of that leaf (dpr 2) through the design transform:
    const onDesign = apply(designImageTransform(view, A, 2), { x: 400, y: 600 })
    // Impl PNG native px of the same world point (dpr 2) through the impl transform:
    const onImpl = apply(implImageTransform(view, 2), { x: world.x * 2, y: world.y * 2 })
    expect(onDesign.x).toBeCloseTo(onImpl.x, 6)
    expect(onDesign.y).toBeCloseTo(onImpl.y, 6)
    // …and both equal world · z + t.
    expect(onImpl.x).toBeCloseTo(world.x * 1.5 + 40, 6)
    expect(onImpl.y).toBeCloseTo(world.y * 1.5 + 20, 6)
  })

  it("uses scaleY when the alignment is anisotropic", () => {
    expect(designImageTransform(view, A, 2)).toContain(`scale(${0.943 / 2}, ${0.935 / 2})`)
  })
})

describe("rawDesignSize", () => {
  // The same pair: a 948×820 capture normalized ×1.3502 onto a 1280px impl.
  it("undoes the run's normalization so the world box is not scaled twice", () => {
    const raw = rawDesignSize(
      { width: 1280, height: 1107.17 },
      { scale: 1.350210970464135, offsetX: 0, offsetY: 0 },
    )
    expect(raw.w).toBeCloseTo(948, 3)
    expect(raw.h).toBeCloseTo(819.999, 2)
    // Through the run's own alignment it lands back on the normalized size,
    // which is what the finding boxes and the design image both use.
    expect(designWorldBox(raw, { scale: 1.350210970464135, offsetX: 0, offsetY: 0 }).w).toBeCloseTo(
      1280,
      6,
    )
  })

  it("uses scaleY for the height when the alignment is anisotropic", () => {
    const raw = rawDesignSize(
      { width: 200, height: 400 },
      { scale: 2, scaleY: 4, offsetX: 0, offsetY: 0 },
    )
    expect(raw).toEqual({ w: 100, h: 100 })
  })

  it("treats a degenerate scale as identity instead of dividing by zero", () => {
    expect(
      rawDesignSize({ width: 300, height: 200 }, { scale: 0, offsetX: 0, offsetY: 0 }),
    ).toEqual({ w: 300, h: 200 })
  })
})

describe("aspect lock", () => {
  // client-pending-accountant-desktop: the fit came out ×0.987 across, ×1.150 down — a 16 %
  // vertical stretch of the reference image. Other pairs in the same corpus reach +53 %.
  const ANISO = { scale: 0.987, scaleY: 1.15, offsetX: 14.1, offsetY: -67.7 }

  it("reports the stretch so the reader knows why the design looks tall", () => {
    expect(aspectStretch(ANISO)).toBeCloseTo(1.1651, 3)
    expect(aspectStretch({ scale: 2, offsetX: 0, offsetY: 0 })).toBe(1)
  })

  it("locking the aspect projects with ONE scale, unlocked keeps the run's fit", () => {
    expect(projectionAlignment(ANISO, true)).toEqual({
      scale: 0.987,
      scaleY: 0.987,
      offsetX: 14.1,
      offsetY: -67.7,
    })
    expect(projectionAlignment(ANISO, false)).toBe(ANISO)
  })

  it("moves the design MARKS by the same correction, so they stay on the image", () => {
    const view = { z: 2, tx: 10, ty: 20 }
    // Drawn with the run's own fit, the design layer is the plain world layer — boxes are already
    // in world space.
    expect(designLayerTransform(view, ANISO, ANISO)).toBe(worldLayerTransform(view))
    const locked = designLayerTransform(view, ANISO, projectionAlignment(ANISO, true))
    const k = ANISO.scale / ANISO.scaleY
    expect(locked).toContain(`scale(1, ${k})`)

    // The correction must map a design point to the SAME world y the locked image puts it at.
    const designY = 240
    const bakedWorldY = designY * ANISO.scaleY + ANISO.offsetY // what the finding box holds
    const correctedY = (bakedWorldY - ANISO.offsetY) * k + ANISO.offsetY
    const imageY = designY * ANISO.scale + ANISO.offsetY // locked projection of the image
    expect(correctedY).toBeCloseTo(imageY, 6)
  })

  it("is a no-op when the fit was already isotropic", () => {
    const iso = { scale: 1.2, scaleY: 1.2, offsetX: 3, offsetY: 4 }
    const view = { z: 1, tx: 0, ty: 0 }
    expect(designLayerTransform(view, iso, projectionAlignment(iso, true))).toBe(
      worldLayerTransform(view),
    )
  })

  it("survives a degenerate scale instead of dividing by zero", () => {
    const view = { z: 1, tx: 0, ty: 0 }
    const degenerate = { scale: 1, scaleY: 0, offsetX: 0, offsetY: 0 }
    expect(designLayerTransform(view, degenerate, projectionAlignment(degenerate, true))).toBe(
      worldLayerTransform(view),
    )
  })
})

describe("align modes", () => {
  // client-pending-accountant-desktop again: a 1181×962 raw frame fitted onto a 1182×900 impl.
  const RUN = { scale: 0.985, scaleY: 1.153, offsetX: 15.6, offsetY: -67.9 }
  const RAW = { w: 1181, h: 962 }
  const IMPL = { w: 1182, h: 900 }

  it("names every mode it offers, so the control can cycle them", () => {
    expect([...ALIGN_MODES]).toEqual(["anchors", "width", "left", "right"])
    expect(ALIGN_MODES.every((m) => ALIGN_LABELS[m])).toBe(true)
  })

  it("anchors = the run's fit with the stretch dropped", () => {
    expect(displayAlignment("anchors", RUN, RAW, IMPL)).toEqual(projectionAlignment(RUN, true))
  })

  it("width scales the frame onto the impl's width from the origin", () => {
    const a = displayAlignment("width", RUN, RAW, IMPL)
    expect(a.scale).toBeCloseTo(IMPL.w / RAW.w, 9)
    expect(a.scaleY).toBe(a.scale)
    expect([a.offsetX, a.offsetY]).toEqual([0, 0])
    // The design's right edge lands exactly on the impl's — that is what "width" means.
    expect(RAW.w * a.scale + a.offsetX).toBeCloseTo(IMPL.w, 9)
  })

  it("the corner modes are 1:1 and differ only in WHICH edge they register", () => {
    expect(displayAlignment("left", RUN, RAW, IMPL)).toEqual({
      scale: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    })
    const right = displayAlignment("right", RUN, RAW, IMPL)
    expect(right.scale).toBe(1)
    expect(right.offsetX).toBe(IMPL.w - RAW.w)
    expect(RAW.w + right.offsetX).toBe(IMPL.w)
    expect(right.offsetY).toBe(0)
  })

  it("never reintroduces the stretch, whatever the run fitted", () => {
    for (const mode of ALIGN_MODES) {
      const a = displayAlignment(mode, RUN, RAW, IMPL)
      expect(aspectStretch(a)).toBe(1)
    }
  })

  it("a pointer on the design pane round-trips to the space the shapes live in", () => {
    // What the reader clicks is on the DRAWN frame; what gets saved must be run-world, or the mark
    // reappears somewhere else. Both directions, in every mode.
    for (const mode of ALIGN_MODES) {
      const display = displayAlignment(mode, RUN, RAW, IMPL)
      const worldPoint = designToWorld({ x: 300, y: 640 }, RUN)
      const shown = shownFromWorld(worldPoint, RUN, display)
      // The drawn position of a design point IS that point through the display alignment.
      expect(shown.x).toBeCloseTo(300 * display.scale + display.offsetX, 6)
      expect(shown.y).toBeCloseTo(640 * (display.scaleY ?? display.scale) + display.offsetY, 6)
      const back = worldFromShown(shown, RUN, display)
      expect(back.x).toBeCloseTo(worldPoint.x, 6)
      expect(back.y).toBeCloseTo(worldPoint.y, 6)
    }
  })

  it("a degenerate run scale leaves the re-map at identity", () => {
    expect(alignRemap({ scale: 0, scaleY: 0, offsetX: 9, offsetY: 9 }, IDENTITY_ALIGNMENT)).toEqual(
      {
        kx: 1,
        tx: 0,
        ky: 1,
        ty: 0,
      },
    )
  })
})

describe("designCaptureDpr", () => {
  // client-pending-accountant-desktop: a 948×820 scope captured at dpr 2
  // (1896px PNG), normalized ×1.3502 onto a 1280px impl. Inferring the dpr as
  // naturalWidth / design.width gave 1.4812 and drew the design 1.35× too big.
  it("recovers the capture dpr from a NORMALIZED design width", () => {
    expect(designCaptureDpr(1896, { width: 1280 }, 1.350210970464135)).toBeCloseTo(2, 6)
    expect(designCaptureDpr(2560, { width: 1024 }, 0.8)).toBeCloseTo(2, 6)
  })

  it("lands the design image on exactly the impl's world width", () => {
    const scale = 1.350210970464135
    const dpr = designCaptureDpr(1896, { width: 1280 }, scale)
    // designImageTransform scales the native image by alignment.scale / dpr.
    expect(1896 * (scale / dpr)).toBeCloseTo(1280, 6)
  })

  it("prefers a dpr the run recorded over the derivation", () => {
    expect(designCaptureDpr(1896, { width: 1280, dpr: 3 }, 1.35)).toBe(3)
  })

  it("stays sane when there is nothing to divide by", () => {
    expect(designCaptureDpr(0, { width: 1280 }, 1.35)).toBe(1)
    expect(designCaptureDpr(1896, { width: 0 }, 1.35)).toBe(1)
    // A degenerate alignment must not collapse the image.
    expect(designCaptureDpr(1896, { width: 948 }, 0)).toBeCloseTo(2, 6)
  })
})

describe("view operations", () => {
  it("fitView centres the world box with padding", () => {
    const v = fitView({ x: 0, y: 0, w: 200, h: 100 }, { w: 432, h: 232 }, 16)
    expect(v.z).toBeCloseTo(2) // 400/200 = 2, 200/100 = 2
    expect(v.tx).toBeCloseTo(16)
    expect(v.ty).toBeCloseTo(16)
  })

  it("fitView is limited by the tighter axis", () => {
    const v = fitView({ x: 10, y: 10, w: 100, h: 400 }, { w: 1000, h: 232 }, 16)
    expect(v.z).toBeCloseTo(0.5)
    // horizontally centred: pad + (968 - 50)/2 - 10·0.5
    expect(v.tx).toBeCloseTo(16 + (968 - 50) / 2 - 5)
  })

  it("zoomAt keeps the world point under the cursor fixed", () => {
    const view = { z: 1, tx: 10, ty: 20 }
    const before = screenToWorld(view, 300, 200)
    const after = screenToWorld(zoomAt(view, 2, 300, 200), 300, 200)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it("zoomAt clamps to [min, max]", () => {
    expect(zoomAt({ z: 30, tx: 0, ty: 0 }, 10, 0, 0).z).toBe(40)
    expect(zoomAt({ z: 0.1, tx: 0, ty: 0 }, 0.01, 0, 0).z).toBe(0.05)
  })

  it("focusView centres the box and never zooms below minZoom", () => {
    const v = focusView(
      { x: 100, y: 50, w: 20, h: 10 },
      { w: 800, h: 600 },
      { z: 0.3, tx: 0, ty: 0 },
      1,
    )
    expect(v.z).toBeGreaterThanOrEqual(1)
    const centre = screenToWorld(v, 400, 300)
    expect(centre.x).toBeCloseTo(110)
    expect(centre.y).toBeCloseTo(55)
  })

  it("unionBoxes covers every box; empty input is the zero box", () => {
    expect(
      unionBoxes([
        { x: 0, y: 0, w: 10, h: 10 },
        { x: -5, y: 5, w: 30, h: 1 },
      ]),
    ).toEqual({ x: -5, y: 0, w: 30, h: 10 })
    expect(unionBoxes([])).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
