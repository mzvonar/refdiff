import { describe, expect, it } from "vitest";

import type { DiffMask } from "./cluster.js";
import { classifyChange, classifyRegion, describeChange, regionSignals, type RawImage } from "./classify.js";

type Rgb = [number, number, number];
type Shape = (x: number, y: number) => boolean;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** 4×4 supersampled raster of `shape` in `fg` over `bg` — anti-aliased like a real render. */
function raster(w: number, h: number, bg: Rgb, layers: Array<{ shape: Shape; color: Rgb }>): RawImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      for (const { shape, color } of layers) {
        let cov = 0;
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) cov += shape(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4) ? 1 : 0;
        cov /= 16;
        r = r * (1 - cov) + color[0] * cov;
        g = g * (1 - cov) + color[1] * cov;
        b = b * (1 - cov) + color[2] * cov;
      }
      const i = (y * w + x) * 4;
      data[i] = Math.round(r);
      data[i + 1] = Math.round(g);
      data[i + 2] = Math.round(b);
      data[i + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

/** Area-average downscale (what a resample of a bigger render does to strokes). */
function downscale(img: RawImage, w: number, h: number): RawImage {
  const data = new Uint8Array(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.min(img.height, Math.ceil((y + 1) * sy)); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.min(img.width, Math.ceil((x + 1) * sx)); xx++) {
          const i = (yy * img.width + xx) * 4;
          for (let c = 0; c < 4; c++) acc[c]! += img.data[i + c]!;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = Math.round(acc[c]! / n);
    }
  }
  return { data, width: w, height: h };
}

/** Mask of pixels whose colors differ noticeably (stand-in for pixelmatch). */
function maskOf(a: RawImage, b: RawImage, t = 40): DiffMask {
  const data = new Uint8Array(a.width * a.height);
  for (let i = 0; i < data.length; i++) {
    const d = Math.max(
      Math.abs(a.data[i * 4]! - b.data[i * 4]!),
      Math.abs(a.data[i * 4 + 1]! - b.data[i * 4 + 1]!),
      Math.abs(a.data[i * 4 + 2]! - b.data[i * 4 + 2]!),
    );
    data[i] = d > t ? 1 : 0;
  }
  return { width: a.width, height: a.height, data };
}

const ring =
  (cx: number, cy: number, rOuter: number, rInner: number): Shape =>
  (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= rOuter && d >= rInner;
  };
const disc = (cx: number, cy: number, r: number): Shape => (x, y) => Math.hypot(x - cx, y - cy) <= r;
const cross =
  (cx: number, cy: number, half: number, thick: number): Shape =>
  (x, y) =>
    (Math.abs(x - cx) <= thick / 2 && Math.abs(y - cy) <= half) || (Math.abs(y - cy) <= thick / 2 && Math.abs(x - cx) <= half);
const rect =
  (x0: number, y0: number, x1: number, y1: number): Shape =>
  (x, y) =>
    x >= x0 && x < x1 && y >= y0 && y < y1;

const S = 42; // a 21 CSS px icon at dpr 2
const C = S / 2;

const classify = (a: RawImage, b: RawImage): ReturnType<typeof classifyRegion> => classifyRegion(a, b, maskOf(a, b));

describe("classifyRegion", () => {
  it("calls a same-shape recolor `color` (darker glyph)", () => {
    const design = raster(S, S, WHITE, [{ shape: ring(C, C, 16, 12), color: [90, 90, 90] }]);
    const impl = raster(S, S, WHITE, [{ shape: ring(C, C, 16, 12), color: BLACK }]);
    const { kind, signals } = classify(design, impl);
    expect(kind).toBe("color");
    expect(signals.edgeCorrelation).toBeGreaterThan(0.7);
    expect(signals.meanDy).toBeLessThan(0);
    expect(describeChange(kind, signals)).toContain("darker");
  });

  it("calls a flat background recolor `color`, not a shape change", () => {
    const glyph = { shape: ring(C, C, 14, 11), color: BLACK };
    const design = raster(S, S, [255, 212, 209], [glyph]);
    const impl = raster(S, S, [251, 111, 109], [glyph]);
    expect(classify(design, impl).kind).toBe("color");
  });

  it("calls a saturated hue flip `hue-rotation`", () => {
    const design = raster(S, S, WHITE, [{ shape: disc(C, C, 14), color: [220, 40, 40] }]);
    const impl = raster(S, S, WHITE, [{ shape: disc(C, C, 14), color: [40, 200, 60] }]);
    const { kind, signals } = classify(design, impl);
    expect(signals.chromaCos).toBeLessThan(0);
    expect(kind).toBe("hue-rotation");
  });

  it("calls a different glyph `shape` (globe vs plus-circle)", () => {
    const design = raster(S, S, [90, 216, 230], [
      { shape: ring(C, C, 15, 12), color: BLACK },
      { shape: (x, y) => Math.abs(x - C) <= 1.5 && Math.hypot(x - C, y - C) <= 15, color: BLACK },
      { shape: (x, y) => Math.abs(y - C) <= 1.5 && Math.hypot(x - C, y - C) <= 15, color: BLACK },
      { shape: (x, y) => Math.abs(Math.hypot((x - C) * 2, y - C) - 15) <= 1.5, color: BLACK },
    ]);
    const impl = raster(S, S, [90, 216, 230], [
      { shape: ring(C, C, 15, 12), color: BLACK },
      { shape: cross(C, C, 8, 3), color: BLACK },
    ]);
    const { kind, signals } = classify(design, impl);
    expect(signals.edgeCorrelation).toBeLessThan(0.7);
    expect(kind).toBe("shape");
    expect(describeChange(kind, signals)).not.toContain("fill around");
  });

  it("a glyph swap on a recolored fill says so", () => {
    const design = raster(S, S, [255, 212, 209], [{ shape: cross(C, C, 12, 4), color: BLACK }]);
    const impl = raster(S, S, [251, 111, 109], [{ shape: disc(C, C, 10), color: BLACK }]);
    const { kind, signals } = classify(design, impl);
    expect(kind).toBe("shape");
    expect(describeChange(kind, signals)).toContain("fill around it is recolored");
  });

  it("calls content present on one side only `removed` / `added`", () => {
    const blank = raster(S, S, WHITE, []);
    const withGlyph = raster(S, S, WHITE, [{ shape: cross(C, C, 12, 4), color: BLACK }]);
    expect(classify(withGlyph, blank).kind).toBe("removed");
    expect(classify(blank, withGlyph).kind).toBe("added");
  });

  it("calls a border that appears `stroke`", () => {
    const plain = raster(S, S, [240, 240, 240], []);
    const bordered = raster(S, S, [240, 240, 240], [
      { shape: (x, y) => !rect(3, 3, S - 3, S - 3)(x, y), color: [60, 60, 60] },
    ]);
    const { kind, signals } = classify(plain, bordered);
    expect(signals.perimeterRatio).toBeGreaterThan(0.7);
    expect(kind).toBe("stroke");
  });

  it("calls the resample residue of the same glyph at 24 vs 21 px `noise`", () => {
    // The design renders at 24 CSS px (48 native), the impl at 21 (42 native);
    // the channel resamples the design onto the impl grid.
    const big = raster(48, 48, WHITE, [{ shape: ring(24, 24, 17, 13), color: BLACK }]);
    const design = downscale(big, S, S);
    const impl = raster(S, S, WHITE, [{ shape: ring(C, C, 17 * (S / 48), 13 * (S / 48)), color: BLACK }]);
    const mask = maskOf(design, impl, 60);
    const { kind, signals } = classifyRegion(design, impl, mask);
    expect(signals.diffRatio).toBeLessThan(0.1);
    expect(signals.edgeCorrelation).toBeGreaterThan(0.7);
    expect(signals.edgeAdjacentRatio).toBeGreaterThan(0.8);
    expect(kind).toBe("noise");
  });
});

describe("classifyChange / regionSignals edge cases", () => {
  it("two identical blank crops have no structure and count as color (nothing differs anyway)", () => {
    const a = raster(8, 8, WHITE, []);
    const s = regionSignals(a, a, { width: 8, height: 8, data: new Uint8Array(64) });
    expect(s.edgeCorrelation).toBe(1);
    expect(s.diffRatio).toBe(0);
    expect(classifyChange(s)).toBe("color");
  });

  it("options override the defaults", () => {
    const design = raster(S, S, WHITE, [{ shape: ring(C, C, 16, 12), color: [90, 90, 90] }]);
    const impl = raster(S, S, WHITE, [{ shape: ring(C, C, 16, 12), color: BLACK }]);
    const s = regionSignals(design, impl, maskOf(design, impl));
    expect(classifyChange(s, { sameStructure: 1.01 })).toBe("shape");
  });
});
