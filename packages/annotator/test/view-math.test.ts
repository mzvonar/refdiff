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
  FOCUS_MAX_ZOOM,
  paneInsets,
  NO_INSETS,
  implImageTransform,
  screenToWorld,
  unionBoxes,
  worldLayerTransform,
  worldToDesign,
  pinchOf,
  pinchView,
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
    const v = fitView({ x: 0, y: 0, w: 200, h: 100 }, { w: 432, h: 232 }, 16, Infinity)
    expect(v.z).toBeCloseTo(2) // 400/200 = 2, 200/100 = 2 (uncapped for the centring check)
    expect(v.tx).toBeCloseTo(16)
    expect(v.ty).toBeCloseTo(16)
  })

  it("fitView defaults to the comps' fit: 24px of air, capped at 1.6×", () => {
    // The RefDiff Comparison Tool comp fits a 680px artboard into a 390px pane at 50%
    // ((390 − 48) / 680); the annotator read 53% with 16px of padding.
    const phone = fitView({ x: 0, y: 0, w: 680, h: 740 }, { w: 390, h: 2000 })
    expect(phone.z).toBeCloseTo((390 - 48) / 680, 5)
    // A small component is not blown up to fill the pane.
    const small = fitView({ x: 0, y: 0, w: 100, h: 40 }, { w: 1000, h: 800 })
    expect(small.z).toBe(1.6)
    expect(small.tx).toBeCloseTo(24 + (952 - 160) / 2, 5)
  })

  it("paneInsets: every panel over the pane costs its CHEAPEST edge — the sheet the bottom, a floating pill the edge it hugs", () => {
    const pane = { x: 0, y: 100, w: 390, h: 700 }
    // The closed sheet: 45px anchored to the bottom across the width.
    expect(paneInsets(pane, [{ x: 0, y: 755, w: 390, h: 45 }])).toEqual({ top: 0, right: 0, bottom: 45, left: 0 })
    // The open sheet: 52% of the work area.
    expect(paneInsets(pane, [{ x: 0, y: 436, w: 390, h: 364 }]).bottom).toBe(364)
    // A FLOATING PILL NOW COUNTS (2026-09-03). It used to be ignored because it covers a corner
    // rather than an edge — true, and it meant the fit solved for the space behind it and drew the
    // artboard under it. The phone's tool pill at left:8 / bottom:56, 200×44: clearing it from the
    // bottom costs 100px × 390 wide = 39 000, from the left 208px × 700 tall = 145 600, from the
    // top 644 × 390. So the bottom gives way, and it is the pill's FAR edge from the pane's, not
    // the pill's height: fitting above a pill means clearing the gap under it too.
    expect(paneInsets(pane, [{ x: 8, y: 700, w: 200, h: 44 }])).toEqual({ top: 0, right: 0, bottom: 100, left: 0 })
    // The toolbar layout's Show control, 223×29 at 8,8 inside the pane: 45px of height beats 231px
    // of width, so the canvas keeps its width — which is what a wide artboard needs.
    expect(paneInsets(pane, [{ x: 8, y: 108, w: 223, h: 29 }])).toEqual({ top: 37, right: 0, bottom: 0, left: 0 })
    // Both at once, plus the sheet: one inset per panel, max per edge (the sheet's 45 loses to the
    // pill's 100, which already contains it).
    expect(
      paneInsets(pane, [
        { x: 8, y: 108, w: 223, h: 29 },
        { x: 8, y: 700, w: 200, h: 44 },
        { x: 0, y: 755, w: 390, h: 45 },
      ]),
    ).toEqual({ top: 37, right: 0, bottom: 100, left: 0 })
    // A tall narrow pill hugging the right: 90px × 700 tall = 63 000 against 700 × 390 from the
    // top — the right gives way.
    expect(paneInsets(pane, [{ x: 300, y: 300, w: 60, h: 200 }])).toEqual({ top: 0, right: 90, bottom: 0, left: 0 })
    // The desktop rail is a flex sibling beside the pane: no overlap, nothing.
    expect(paneInsets(pane, [{ x: 390, y: 100, w: 321, h: 700 }])).toEqual(NO_INSETS)
    // A hidden panel (display:none reads 0×0) is nothing.
    expect(paneInsets(pane, [{ x: 0, y: 0, w: 0, h: 0 }])).toEqual(NO_INSETS)
    // A left-anchored strip spanning the height is a left inset.
    expect(paneInsets(pane, [{ x: 0, y: 100, w: 45, h: 700 }]).left).toBe(45)
  })

  it("fitView centres in the pane minus its insets — the phone sheet moves the frame up, not smaller", () => {
    // The comps' phone: 680×740 artboard in a 390-wide pane is width-limited at 50% with or
    // without the 45px sheet (the zoom pill reads the same); the frame is centred in the 655px that show.
    const v = fitView({ x: 0, y: 0, w: 680, h: 740 }, { w: 390, h: 700 }, 24, 1.6, { top: 0, right: 0, bottom: 45, left: 0 })
    expect(v.z).toBeCloseTo((390 - 48) / 680, 5)
    expect(v.ty).toBeCloseTo(24 + (700 - 45 - 48 - 740 * v.z) / 2, 5)
    expect(v.ty + (740 * v.z) / 2).toBeCloseTo((700 - 45) / 2, 5) // its centre is the visible area's centre
    // A left inset shifts the centre right by itself; no inset is the old fit.
    const l = fitView({ x: 0, y: 0, w: 100, h: 100 }, { w: 500, h: 500 }, 0, 1, { top: 0, right: 0, bottom: 0, left: 100 })
    expect(l.tx).toBeCloseTo(100 + (400 - 100) / 2)
    expect(fitView({ x: 0, y: 0, w: 100, h: 100 }, { w: 500, h: 500 }, 0, 1)).toEqual(fitView({ x: 0, y: 0, w: 100, h: 100 }, { w: 500, h: 500 }, 0, 1, NO_INSETS))
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

  it("pinchOf needs two fingers and reads them relative to the pane", () => {
    expect(pinchOf([{ x: 10, y: 10 }])).toBeNull()
    const p = pinchOf(
      [
        { x: 100, y: 200 },
        { x: 140, y: 230 },
      ],
      { x: 20, y: 50 },
    )
    expect(p).toEqual({ dist: 50, x: 100, y: 165 })
  })

  it("pinchOf ignores a third finger rather than giving up", () => {
    // A palm or a third finger landing mid-gesture must not stop the zoom dead.
    const two = pinchOf([
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ])
    const three = pinchOf([
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 500, y: 500 },
    ])
    expect(three).toEqual(two)
  })

  it("pinchView zooms by the change in span about the midpoint", () => {
    const view = { z: 1, tx: 0, ty: 0 }
    const prev = { dist: 100, x: 300, y: 200 }
    const next = { dist: 200, x: 300, y: 200 }
    const after = pinchView(view, prev, next)
    expect(after.z).toBeCloseTo(2)
    // the world point between the fingers stays under them
    const before = screenToWorld(view, 300, 200)
    const now = screenToWorld(after, 300, 200)
    expect(now.x).toBeCloseTo(before.x)
    expect(now.y).toBeCloseTo(before.y)
  })

  it("pinchView pans by the midpoint's travel as well as zooming", () => {
    // Two fingers moving together with a constant span is a drag, not a no-op.
    const after = pinchView({ z: 2, tx: 0, ty: 0 }, { dist: 80, x: 100, y: 100 }, { dist: 80, x: 140, y: 90 })
    expect(after.z).toBeCloseTo(2)
    expect(after.tx).toBeCloseTo(40)
    expect(after.ty).toBeCloseTo(-10)
  })

  it("pinchView survives a zero span instead of poisoning the view with NaN", () => {
    // Coalesced touches do report both fingers on one point; dist/0 killed the view for good.
    const after = pinchView({ z: 1.5, tx: 10, ty: 20 }, { dist: 0, x: 50, y: 50 }, { dist: 0, x: 50, y: 50 })
    expect(after).toEqual({ z: 1.5, tx: 10, ty: 20 })
    const grown = pinchView({ z: 1, tx: 0, ty: 0 }, { dist: 0, x: 50, y: 50 }, { dist: 60, x: 50, y: 50 })
    expect(Number.isFinite(grown.z)).toBe(true)
    expect(grown.z).toBe(1)
  })

  it("focusView centres the box and ZOOMS TO it, whatever zoom you were at", () => {
    const box = { x: 100, y: 50, w: 20, h: 10 }
    const pane = { w: 800, h: 600 }
    const v = focusView(box, pane)
    // 20×10 is under the 60px floor, so it is focused as 60×60 + 70 each side:
    // min(800/200, 600/200, 2.2) → the 2.2 ceiling.
    expect(v.z).toBeCloseTo(FOCUS_MAX_ZOOM)
    const centre = screenToWorld(v, 400, 300)
    expect(centre.x).toBeCloseTo(110)
    expect(centre.y).toBeCloseTo(55)
    // It used to depend on where you were — clamped to max(current, 1) over a
    // fit padded by a third of the pane, which never magnified anything: every
    // element read 100% from 100%, and a flat 100% from a whole-page 50%.
    expect(focusView(box, pane).z).toBe(v.z)
  })

  it("focusView zooms OUT for an element bigger than the pane — you asked for that element", () => {
    const wide = focusView({ x: 0, y: 0, w: 680, h: 740 }, { w: 496, h: 734 })
    expect(wide.z).toBeCloseTo(Math.min(496 / (680 + 140), 734 / (740 + 140)))
    expect(wide.z).toBeLessThan(1)
    // …and a mid-sized one lands between: a 200×48 button in that pane is the
    // 146% the comps draw.
    expect(focusView({ x: 0, y: 0, w: 200, h: 48 }, { w: 496, h: 734 }).z).toBeCloseTo(496 / 340, 2)
  })

  it("focusView centres the box in the part of the pane above the phone's open sheet, and sizes to it too", () => {
    // Tapping a finding in the open sheet (52% of the work area) centred it UNDER the sheet (2026-08-28).
    const inset = { top: 0, right: 0, bottom: 312, left: 0 }
    const v = focusView({ x: 100, y: 50, w: 20, h: 10 }, { w: 800, h: 600 }, inset)
    const centre = screenToWorld(v, 400, (600 - 312) / 2)
    expect(centre.x).toBeCloseTo(110)
    expect(centre.y).toBeCloseTo(55)
    // The insets bound the ZOOM as well: the comps size from the full height and
    // ignore their own sheet, which can scale an element to fit space behind it.
    const tall = focusView({ x: 0, y: 0, w: 100, h: 400 }, { w: 800, h: 600 }, inset)
    expect(tall.z).toBeCloseTo((600 - 312) / (400 + 140))
    expect(tall.z).toBeLessThan(focusView({ x: 0, y: 0, w: 100, h: 400 }, { w: 800, h: 600 }).z)
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
