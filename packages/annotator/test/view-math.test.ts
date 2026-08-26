import { describe, expect, it } from "vitest";

import {
  IDENTITY_ALIGNMENT,
  designImageTransform,
  designToWorld,
  designWorldBox,
  fitView,
  focusView,
  implImageTransform,
  screenToWorld,
  unionBoxes,
  worldToDesign,
  zoomAt,
} from "../src/view-math.js";

// The doc-detail run: design 756×955 css @2x, impl 760×740 @2x,
// alignment ×0.943/0.935 @ (3.5, 5.8).
const A = { scale: 0.943, scaleY: 0.935, offsetX: 3.5, offsetY: 5.8 };

describe("design ↔ world", () => {
  it("round-trips through the alignment", () => {
    const p = { x: 120, y: 340 };
    const w = designToWorld(p, A);
    expect(w.x).toBeCloseTo(120 * 0.943 + 3.5);
    expect(w.y).toBeCloseTo(340 * 0.935 + 5.8);
    const back = worldToDesign(w, A);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it("identity alignment leaves points alone", () => {
    expect(designToWorld({ x: 7, y: 9 }, IDENTITY_ALIGNMENT)).toEqual({ x: 7, y: 9 });
  });

  it("designWorldBox is the design frame projected into impl space", () => {
    const b = designWorldBox({ w: 756, h: 955 }, A);
    expect(b).toEqual({ x: 3.5, y: 5.8, w: 756 * 0.943, h: 955 * 0.935 });
  });
});

describe("image transforms keep both panes in the same world", () => {
  const view = { z: 1.5, tx: 40, ty: 20 };

  // Parse "translate(a, b) scale(c[, d]) …" into an affine matrix and apply it.
  const apply = (transform: string, p: { x: number; y: number }) => {
    let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const mul = (n: typeof m) => {
      m = {
        a: m.a * n.a + m.c * n.b,
        b: m.b * n.a + m.d * n.b,
        c: m.a * n.c + m.c * n.d,
        d: m.b * n.c + m.d * n.d,
        e: m.a * n.e + m.c * n.f + m.e,
        f: m.b * n.e + m.d * n.f + m.f,
      };
    };
    for (const [, fn, args] of transform.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
      const nums = (args ?? "").split(",").map((s) => parseFloat(s));
      const [u = 0, v] = nums;
      if (fn === "translate") mul({ a: 1, b: 0, c: 0, d: 1, e: u, f: v ?? 0 });
      else mul({ a: u, b: 0, c: 0, d: v ?? u, e: 0, f: 0 });
    }
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  };

  it("a design element and its matched impl element land on the same screen point", () => {
    // Design leaf at design css (200, 300) → world (200·0.943+3.5, 300·0.935+5.8).
    const world = designToWorld({ x: 200, y: 300 }, A);
    // Design PNG native px of that leaf (dpr 2) through the design transform:
    const onDesign = apply(designImageTransform(view, A, 2), { x: 400, y: 600 });
    // Impl PNG native px of the same world point (dpr 2) through the impl transform:
    const onImpl = apply(implImageTransform(view, 2), { x: world.x * 2, y: world.y * 2 });
    expect(onDesign.x).toBeCloseTo(onImpl.x, 6);
    expect(onDesign.y).toBeCloseTo(onImpl.y, 6);
    // …and both equal world · z + t.
    expect(onImpl.x).toBeCloseTo(world.x * 1.5 + 40, 6);
    expect(onImpl.y).toBeCloseTo(world.y * 1.5 + 20, 6);
  });

  it("uses scaleY when the alignment is anisotropic", () => {
    expect(designImageTransform(view, A, 2)).toContain(`scale(${0.943 / 2}, ${0.935 / 2})`);
  });
});

describe("view operations", () => {
  it("fitView centres the world box with padding", () => {
    const v = fitView({ x: 0, y: 0, w: 200, h: 100 }, { w: 432, h: 232 }, 16);
    expect(v.z).toBeCloseTo(2); // 400/200 = 2, 200/100 = 2
    expect(v.tx).toBeCloseTo(16);
    expect(v.ty).toBeCloseTo(16);
  });

  it("fitView is limited by the tighter axis", () => {
    const v = fitView({ x: 10, y: 10, w: 100, h: 400 }, { w: 1000, h: 232 }, 16);
    expect(v.z).toBeCloseTo(0.5);
    // horizontally centred: pad + (968 - 50)/2 - 10·0.5
    expect(v.tx).toBeCloseTo(16 + (968 - 50) / 2 - 5);
  });

  it("zoomAt keeps the world point under the cursor fixed", () => {
    const view = { z: 1, tx: 10, ty: 20 };
    const before = screenToWorld(view, 300, 200);
    const after = screenToWorld(zoomAt(view, 2, 300, 200), 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("zoomAt clamps to [min, max]", () => {
    expect(zoomAt({ z: 30, tx: 0, ty: 0 }, 10, 0, 0).z).toBe(40);
    expect(zoomAt({ z: 0.1, tx: 0, ty: 0 }, 0.01, 0, 0).z).toBe(0.05);
  });

  it("focusView centres the box and never zooms below minZoom", () => {
    const v = focusView({ x: 100, y: 50, w: 20, h: 10 }, { w: 800, h: 600 }, { z: 0.3, tx: 0, ty: 0 }, 1);
    expect(v.z).toBeGreaterThanOrEqual(1);
    const centre = screenToWorld(v, 400, 300);
    expect(centre.x).toBeCloseTo(110);
    expect(centre.y).toBeCloseTo(55);
  });

  it("unionBoxes covers every box; empty input is the zero box", () => {
    expect(unionBoxes([{ x: 0, y: 0, w: 10, h: 10 }, { x: -5, y: 5, w: 30, h: 1 }])).toEqual({ x: -5, y: 0, w: 30, h: 10 });
    expect(unionBoxes([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
