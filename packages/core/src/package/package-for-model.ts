/**
 * Agent packaging — the comprehension layer (effectful edge: fs via sharp).
 *
 * Produces exactly what the evidence says a model consumes well
 * (research.md §4): findings.json with typed, bbox-grounded findings;
 * per-finding native-resolution crop pairs as SEPARATE files (never
 * concatenated side-by-side images); and both element trees so the model
 * compares data first and confirms visually second.
 *
 * Marks are NOT baked into an image here. The annotator draws them live on
 * both panes from `Finding.mark`, filterable and zoomable; a static
 * impl-only snapshot of the same numbers had no reader.
 */

import type { AlignedPair } from "../pipeline.js"
import type {
  Box,
  ComparisonReport,
  Finding,
  IgnorePolicy,
  MatchingStats,
  Severity,
  SuppressedFinding,
} from "../types.js"

import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, relative } from "node:path"
import sharp from "sharp"

import { clampBox, padBox, toDesignNative, toImplNative } from "../geometry.js"
import { pairPhase } from "../structural/phase.js"
import { diffReports, identityKey, type ResolvedLedger } from "./delta.js"
import { containersOf, groupByRegion } from "./regions.js"
import { verdictOf } from "./verdict.js"

export interface PackageOptions {
  /** Run directory: findings.json, crops and element trees land here. */
  outDir: string
  /** Lowest severity that fails the deterministic gate. Default "major". */
  failThreshold?: Severity
  /** CSS px of context around each crop. Default 12. */
  cropPadding?: number
  /** Findings the ignore policy removed — reported, not drawn or cropped. */
  suppressed?: readonly SuppressedFinding[]
  /** The policy that produced `suppressed`. */
  policy?: IgnorePolicy
  /** Absolute path of the pixel channel's diff mask PNG, when it ran. */
  diffMaskPath?: string
  /** What the matcher did (`matchingStats`) → `report.matching`. */
  matching?: MatchingStats
  /** The previous run's report of this pair, when one exists → `delta`. */
  previous?: ComparisonReport
  /** What earlier runs resolved → `delta.regressions` (needs `previous`). */
  ledger?: ResolvedLedger
}

async function cropTo(srcPng: string, box: Box, outPath: string): Promise<boolean> {
  const meta = await sharp(srcPng).metadata()
  const clamped = clampBox(box, meta.width ?? 0, meta.height ?? 0)
  if (!clamped) return false
  await sharp(srcPng)
    .extract({ left: clamped.x, top: clamped.y, width: clamped.w, height: clamped.h })
    .toFile(outPath)
  return true
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
    matching,
    previous,
    ledger,
  }: PackageOptions,
): Promise<ComparisonReport> {
  // Run dirs are reused across iterations and finding ids are POSITIONAL (f1, f2, ...),
  // so a run with fewer findings than the last leaves crops behind under ids a later run
  // reuses for something else entirely. Measured on one corpus before this line existed:
  // 380 orphaned crop pairs and 134 older than the run they sat in, some of them predating
  // a change in capture semantics and still carrying the retired ground. Nothing reads a
  // crop by path today, which is the only reason that was harmless rather than wrong — so
  // REBUILD the directory rather than writing this run's crops into the last run's.
  await rm(join(outDir, "crops"), { force: true, recursive: true })
  await mkdir(join(outDir, "crops"), { recursive: true })
  // Same reasoning: drop the overlay a pre-annotator version of this function wrote
  // there, so nobody reads last week's marks.
  await rm(join(outDir, "overlay.png"), { force: true })

  const rel = (p: string): string => relative(outDir, p)
  const { design, impl, alignment } = pair

  // Native-res crop pairs: same normalized region from both sides, so the
  // model sees directly comparable patches. Aggregates crop the primary
  // member only; the other locations are in `members`.
  const withCrops: Finding[] = []
  for (const f of findings) {
    const cssBox = f.implBox ?? f.designBox
    if (!cssBox) {
      withCrops.push(f)
      continue
    }
    const padded = padBox(cssBox, cropPadding)
    // Design png is at original (pre-alignment) scale: invert the total
    // design→impl transform, then go to native pixels.
    const designNative = toDesignNative(padded, alignment, design.dpr, design.bleed)
    const implNative = toImplNative(padded, impl.dpr, impl.bleed)
    const designCrop = join(outDir, "crops", `${f.id}-design.png`)
    const implCrop = join(outDir, "crops", `${f.id}-impl.png`)
    const [dOk, iOk] = await Promise.all([
      cropTo(design.pngPath, designNative, designCrop),
      cropTo(impl.pngPath, implNative, implCrop),
    ])
    withCrops.push(
      dOk && iOk ? { ...f, crops: { design: rel(designCrop), impl: rel(implCrop) } } : f,
    )
  }

  // Both element trees — the model compares data first, pixels second.
  await writeFile(
    join(outDir, "elements.json"),
    JSON.stringify({ alignment, design: design.elements, impl: impl.elements }, null, 2),
  )

  // Stamp the run-stable identity onto every finding (see Finding.key): ids and marks are
  // renumbered each run, so anything a human files against a finding — a triage decision, a note —
  // needs a handle that survives the next capture.
  const withKeys = withCrops.map((f) => ({ ...f, key: identityKey(f) }))
  const suppressedWithKeys = [...suppressed].map((f) => ({ ...f, key: identityKey(f) }))

  // WHERE the findings are, from the impl tree (world space, so no alignment is
  // folded in) — computed here rather than by the caller, because every consumer
  // of the report wants it and the loop otherwise writes the script by hand.
  const byRegion = groupByRegion(
    withCrops,
    containersOf(impl.elements, { x: 0, y: 0, w: impl.width, h: impl.height }),
  )

  const report: ComparisonReport = {
    pair: pair.id,
    createdAt: new Date().toISOString(),
    // The previous report IS the counter — no side file to fall out of step with
    // the run dir it describes.
    run: (previous?.run ?? 0) + 1,
    design: {
      source: design.source,
      ref: design.ref,
      width: design.width,
      height: design.height,
      // The viewer sizes designPng by this: `width` is the NORMALIZED width,
      // so inferring the ratio from the PNG folds `alignment.scale` into it.
      dpr: design.dpr,
      ...(design.bleed ? { bleed: design.bleed } : {}),
      ...(design.scope ? { scope: design.scope } : {}),
      ...(design.quality ? { quality: design.quality } : {}),
    },
    impl: {
      source: impl.source,
      ref: impl.ref,
      width: impl.width,
      height: impl.height,
      dpr: impl.dpr,
      ...(impl.bleed ? { bleed: impl.bleed } : {}),
    },
    alignment,
    ...(matching !== undefined ? { matching } : {}),
    // Derived here rather than passed in, because it is a pure projection of two fields
    // the report already carries — and deriving it at the one place the report is built is
    // what stops a caller writing a `phase` that disagrees with its own numbers.
    ...(matching !== undefined ? { phase: pairPhase(alignment, matching) } : {}),
    findings: withKeys,
    suppressed: suppressedWithKeys,
    policy,
    verdict: verdictOf(withCrops, failThreshold),
    ...(previous !== undefined
      ? { delta: diffReports(previous, { findings: withCrops }, {}, ledger) }
      : {}),
    ...(byRegion.groups.length > 0 ? { byRegion } : {}),
    artifacts: {
      designPng: rel(design.pngPath),
      implPng: rel(impl.pngPath),
      ...(diffMaskPath !== undefined ? { diffMask: rel(diffMaskPath) } : {}),
    },
  }

  await writeFile(join(outDir, "findings.json"), JSON.stringify(report, null, 2))
  return report
}
