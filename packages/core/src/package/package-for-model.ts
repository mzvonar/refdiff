/**
 * Agent packaging — the comprehension layer (effectful edge: fs via sharp).
 *
 * Produces exactly what the evidence says a model consumes well
 * (research.md §4): findings.json with typed, bbox-grounded findings; a
 * set-of-marks overlay (numbered marks, never raw coordinates); per-finding
 * native-resolution crop pairs as SEPARATE files (never concatenated
 * side-by-side images); and both element trees so the model compares data
 * first and confirms visually second.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import sharp from "sharp";

import { clampBox, padBox, scaleBox, toDesignNative, toImplNative } from "../geometry.js";
import type { AlignedPair } from "../pipeline.js";
import { diffReports } from "./delta.js";
import type {
  Box,
  ComparisonReport,
  Finding,
  IgnorePolicy,
  Severity,
  SuppressedFinding,
} from "../types.js";

export interface PackageOptions {
  /** Run directory: findings.json, overlay and crops land here. */
  outDir: string;
  /** Lowest severity that fails the deterministic gate. Default "major". */
  failThreshold?: Severity;
  /** CSS px of context around each crop. Default 12. */
  cropPadding?: number;
  /** Findings the ignore policy removed — reported, not drawn or cropped. */
  suppressed?: readonly SuppressedFinding[];
  /** The policy that produced `suppressed`. */
  policy?: IgnorePolicy;
  /** Absolute path of the pixel channel's diff mask PNG, when it ran. */
  diffMaskPath?: string;
  /** The previous run's report of this pair, when one exists → `delta`. */
  previous?: ComparisonReport;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const MARK_COLORS: Record<Severity, string> = {
  critical: "#e11d48",
  major: "#f59e0b",
  minor: "#3b82f6",
};

const atOrAbove = (s: Severity, threshold: Severity): boolean =>
  SEVERITY_RANK[s] <= SEVERITY_RANK[threshold];

async function cropTo(
  srcPng: string,
  box: Box,
  outPath: string,
): Promise<boolean> {
  const meta = await sharp(srcPng).metadata();
  const clamped = clampBox(box, meta.width ?? 0, meta.height ?? 0);
  if (!clamped) return false;
  await sharp(srcPng)
    .extract({ left: clamped.x, top: clamped.y, width: clamped.w, height: clamped.h })
    .toFile(outPath);
  return true;
}

/** Set-of-marks overlay: impl screenshot + numbered severity-colored marks. */
async function renderOverlay(
  implPng: string,
  findings: readonly Finding[],
  dpr: number,
  outPath: string,
): Promise<void> {
  const meta = await sharp(implPng).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const parts: string[] = [];
  for (const f of findings) {
    // An aggregated finding marks every member location with the same number.
    const locations = f.members ?? [{ designBox: f.designBox, implBox: f.implBox }];
    for (const loc of locations) {
      const cssBox = loc.implBox ?? loc.designBox;
      if (!cssBox) continue;
      const box = clampBox(scaleBox(cssBox, dpr), width, height);
      if (!box) continue;
      const color = MARK_COLORS[f.severity];
      const sw = Math.max(2, Math.round(dpr));
      const fontSize = 13 * dpr;
      const r = 11 * dpr;
      // Badge sits at the box's top-left corner, nudged inside the image.
      const cx = Math.max(r, box.x);
      const cy = Math.max(r, box.y);
      parts.push(
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="${color}" stroke-width="${sw}"/>`,
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`,
        `<text x="${cx}" y="${cy}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${f.mark}</text>`,
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
  await sharp(implPng)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .toFile(outPath);
}

/**
 * Package one compared pair for the model. Writes findings.json, the
 * set-of-marks overlay, crop pairs and both element trees under
 * `outDir`, and returns the report (also serialized as findings.json).
 */
export async function packageForModel(
  pair: AlignedPair,
  findings: readonly Finding[],
  {
    outDir,
    failThreshold = "major",
    cropPadding = 12,
    suppressed = [],
    policy = {},
    diffMaskPath,
    previous,
  }: PackageOptions,
): Promise<ComparisonReport> {
  await mkdir(join(outDir, "crops"), { recursive: true });

  const rel = (p: string): string => relative(outDir, p);
  const { design, impl, alignment } = pair;

  // Native-res crop pairs: same normalized region from both sides, so the
  // model sees directly comparable patches. Aggregates crop the primary
  // member only; the other locations are in `members` and on the overlay.
  const withCrops: Finding[] = [];
  for (const f of findings) {
    const cssBox = f.implBox ?? f.designBox;
    if (!cssBox) {
      withCrops.push(f);
      continue;
    }
    const padded = padBox(cssBox, cropPadding);
    // Design png is at original (pre-alignment) scale: invert the total
    // design→impl transform, then go to native pixels.
    const designNative = toDesignNative(padded, alignment, design.dpr);
    const implNative = toImplNative(padded, impl.dpr);
    const designCrop = join(outDir, "crops", `${f.id}-design.png`);
    const implCrop = join(outDir, "crops", `${f.id}-impl.png`);
    const [dOk, iOk] = await Promise.all([
      cropTo(design.pngPath, designNative, designCrop),
      cropTo(impl.pngPath, implNative, implCrop),
    ]);
    withCrops.push(
      dOk && iOk ? { ...f, crops: { design: rel(designCrop), impl: rel(implCrop) } } : f,
    );
  }

  const overlayPath = join(outDir, "overlay.png");
  await renderOverlay(impl.pngPath, withCrops, impl.dpr, overlayPath);

  // Both element trees — the model compares data first, pixels second.
  await writeFile(
    join(outDir, "elements.json"),
    JSON.stringify(
      { alignment, design: design.elements, impl: impl.elements },
      null,
      2,
    ),
  );

  const report: ComparisonReport = {
    pair: pair.id,
    createdAt: new Date().toISOString(),
    design: {
      source: design.source,
      ref: design.ref,
      width: design.width,
      height: design.height,
      ...(design.scope ? { scope: design.scope } : {}),
    },
    impl: { source: impl.source, ref: impl.ref, width: impl.width, height: impl.height },
    alignment,
    findings: withCrops,
    suppressed: [...suppressed],
    policy,
    verdict: {
      pass: !withCrops.some((f) => atOrAbove(f.severity, failThreshold)),
      failThreshold,
    },
    ...(previous !== undefined ? { delta: diffReports(previous, { findings: withCrops }) } : {}),
    artifacts: {
      overlay: rel(overlayPath),
      designPng: rel(design.pngPath),
      implPng: rel(impl.pngPath),
      ...(diffMaskPath !== undefined ? { diffMask: rel(diffMaskPath) } : {}),
    },
  };

  await writeFile(join(outDir, "findings.json"), JSON.stringify(report, null, 2));
  return report;
}
