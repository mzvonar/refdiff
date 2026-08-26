import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AlignedPair, ElementMatch } from "../pipeline.js";
import type { Alignment, ElementNode } from "../types.js";
import { PIXEL_DEFAULTS } from "./checks.js";
import { diffMatches, writeDiffMask } from "./diff.js";

/**
 * Synthetic PNGs: a 200×200 (CSS) frame at dpr 2 with a filled square
 * (`inner`) inside a 40×40 element box at (50, 50). The "design" frame is
 * rendered LARGER (scale 1/0.94) so the alignment has to undo a real
 * resample, as on doc-detail.
 */
const DESIGN_SCALE = 0.94; // design→impl
const DPR = 2;

const svgFrame = (scale: number, inner: { x: number; y: number; w: number; h: number; fill: string }): Buffer => {
  const s = DPR / scale;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${200 * s}" height="${200 * s}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <rect x="${50 * s}" y="${50 * s}" width="${40 * s}" height="${40 * s}" fill="#e5e7eb"/>
      <rect x="${inner.x * s}" y="${inner.y * s}" width="${inner.w * s}" height="${inner.h * s}" fill="${inner.fill}"/>
    </svg>`,
  );
};

let dir: string;
let designPng: string;
let designOtherPng: string;
let implPng: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "vc-diff-"));
  designPng = join(dir, "design.png");
  designOtherPng = join(dir, "design-other.png");
  implPng = join(dir, "impl.png");
  const inner = { x: 60, y: 60, w: 20, h: 20, fill: "#1d4ed8" };
  await sharp(svgFrame(DESIGN_SCALE, inner)).png().toFile(designPng);
  // Same box, different glyph: a thin bar instead of the square.
  await sharp(svgFrame(DESIGN_SCALE, { x: 55, y: 68, w: 30, h: 4, fill: "#1d4ed8" })).png().toFile(designOtherPng);
  await sharp(svgFrame(1, inner)).png().toFile(implPng);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const alignment: Alignment = { scale: DESIGN_SCALE, offsetX: 0, offsetY: 0, confidence: 1 };
const box = { x: 50, y: 50, w: 40, h: 40 };
const el = (id: string): ElementNode => ({ id, box, role: "box" });
const match: ElementMatch = { design: el("d"), impl: el("i"), gamma: 0, via: "geometry" };

const pair = (design: string): AlignedPair => ({
  id: "p",
  designScale: DESIGN_SCALE,
  alignment,
  design: {
    side: "design",
    source: "dc-html",
    ref: "d",
    pngPath: design,
    width: 200,
    height: 200,
    dpr: DPR,
    elements: [el("d")],
  },
  impl: {
    side: "impl",
    source: "storybook",
    ref: "i",
    pngPath: implPng,
    width: 200,
    height: 200,
    dpr: DPR,
    elements: [el("i")],
  },
});

describe("diffMatches (effectful edge)", () => {
  it("sees an identical element through the alignment resample as (near) equal", async () => {
    const [d] = await diffMatches(pair(designPng), [match]);
    expect(d).toBeDefined();
    expect(d!.mask.width).toBe(box.w * DPR);
    expect(d!.mask.height).toBe(box.h * DPR);
    // Resampling leaves ~one native px of edge phase (≈2.4% here) — must stay
    // under the minor threshold so identical content never reports.
    expect(d!.diffRatio).toBeLessThan(PIXEL_DEFAULTS.thresholds.minor);
  });

  it("reports a different glyph inside the same box", async () => {
    const [d] = await diffMatches(pair(designOtherPng), [match]);
    expect(d!.diffRatio).toBeGreaterThan(0.1);
    // Differing pixels are set in the mask, in impl native px.
    const set = d!.mask.data.reduce((n, v) => n + v, 0);
    expect(set).toBe(d!.diffPixels);
  });

  it("skips degenerate boxes", async () => {
    const tiny: ElementMatch = {
      ...match,
      impl: { id: "t", box: { x: 0, y: 0, w: 1, h: 1 } },
    };
    expect(await diffMatches(pair(designPng), [tiny])).toEqual([]);
  });

  it("writes a diff mask PNG the size of the impl capture", async () => {
    const diffs = await diffMatches(pair(designOtherPng), [match]);
    const out = join(dir, "mask.png");
    await writeDiffMask(pair(designOtherPng), diffs, out);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([200 * DPR, 200 * DPR]);
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
    expect(painted).toBe(diffs[0]!.diffPixels);
  });
});
