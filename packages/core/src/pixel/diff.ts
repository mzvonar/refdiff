/**
 * Pixel diff edge (effectful: reads PNGs via sharp).
 *
 * For every matched pair, crop the design element (via the inverse alignment
 * transform, at design native resolution) and the impl element (impl native
 * resolution), resample the design crop onto the impl crop's pixel grid, and
 * run an anti-aliasing-aware pixelmatch. The result per match is a binary
 * diff mask plus the diff ratio — pure data the pixel checks stage turns
 * into findings. Nothing here decides severity.
 *
 * Elements are compared INSIDE their own boxes (not at a shared frame
 * location) so a positional offset — already a structural finding — does not
 * make every pixel differ.
 */

import type { AlignedPair, ElementMatch } from "../pipeline.js"
import type { Box } from "../types.js"
import type { MatchDiff } from "./checks.js"
import type { RawImage } from "./classify.js"
import type { DiffMask } from "./cluster.js"

import pixelmatch from "pixelmatch"
import sharp, { type Sharp } from "sharp"

import { clusterMask, type Cluster } from "./cluster.js"
import { clampBox, padBox, toDesignNative, toImplNative } from "../geometry.js"

export interface DiffOptions {
  /** pixelmatch per-pixel threshold (0..1, YIQ distance). Default 0.1. */
  threshold?: number
  /** Elements smaller than this (impl native px, either side) are skipped. Default 4. */
  minBoxPx?: number
  /**
   * Gaussian sigma applied to BOTH crops after resampling (0 = off). The
   * design side is resampled onto the impl grid, so thin strokes land on
   * different sub-pixels; a light blur makes the comparison about shapes,
   * not rasterization phase.
   */
  blur?: number
  /**
   * Translation tolerance in impl native px: the design crop is compared at
   * every integer offset within ±shift and the best (fewest differing
   * pixels) is kept. Absorbs the sub-pixel phase left by resampling the
   * design onto the impl grid, which otherwise flags every 1px stroke.
   */
  shift?: number
}

/**
 * shift 2: on doc-detail (design ×0.94) it cut identical-content ratios by
 * ~30–50% on icons; blur did not help consistently and stays off.
 */
export const DIFF_DEFAULTS: Required<DiffOptions> = {
  threshold: 0.1,
  minBoxPx: 4,
  blur: 0,
  shift: 2,
}

type Raw = RawImage

/** Native-px crop of a PNG as RGBA, optionally resampled to `resize`. */
async function rawCrop(
  png: Sharp,
  box: Box,
  blur: number,
  resize?: { width: number; height: number },
): Promise<Raw | null> {
  const meta = await png.metadata()
  const clamped = clampBox(box, meta.width ?? 0, meta.height ?? 0)
  if (!clamped) return null
  let pipeline = png
    .clone()
    .extract({ left: clamped.x, top: clamped.y, width: clamped.w, height: clamped.h })
  if (resize && (resize.width !== clamped.w || resize.height !== clamped.h)) {
    pipeline = pipeline.resize(resize.width, resize.height, { fit: "fill" })
  }
  if (blur > 0) pipeline = pipeline.blur(blur)
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return {
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  }
}

/** Diff one matched pair; null when either crop is empty/degenerate. */
async function diffMatch(
  designPng: Sharp,
  implPng: Sharp,
  pair: AlignedPair,
  match: ElementMatch,
  o: Required<DiffOptions>,
): Promise<MatchDiff | null> {
  const { design, impl, alignment } = pair
  const implNative = toImplNative(match.impl.box, impl.dpr)
  if (implNative.w < o.minBoxPx || implNative.h < o.minBoxPx) return null
  const implRaw = await rawCrop(implPng, implNative, o.blur)
  if (!implRaw) return null
  const { width, height } = implRaw

  // Design crop with a `shift` px margin (in impl native px, mapped into
  // design px through the alignment scale), resampled so that the impl box
  // corresponds to its central width×height window.
  const s = o.shift
  const marginCss = s / impl.dpr
  const designBox = padBox(match.design.box, marginCss)
  const designRaw = await rawCrop(
    designPng,
    toDesignNative(designBox, alignment, design.dpr),
    o.blur,
    { width: width + 2 * s, height: height + 2 * s },
  )
  if (!designRaw || designRaw.width !== width + 2 * s || designRaw.height !== height + 2 * s)
    return null

  let best: { diffPixels: number; out: Uint8Array; window: Uint8Array } | null = null
  // Smallest shift first: when every offset differs alike (a whole-element
  // recolor) the tie must resolve to (0, 0), not to the corner of the search.
  for (const [dx, dy] of shiftOffsets(s)) {
    const window = new Uint8Array(width * height * 4)
    copyWindow(designRaw, s + dx, s + dy, width, height, window)
    const out = new Uint8Array(width * height * 4)
    const diffPixels = pixelmatch(window, implRaw.data, out, width, height, {
      threshold: o.threshold,
      includeAA: false,
      diffMask: true,
    })
    if (best === null || diffPixels < best.diffPixels) best = { diffPixels, out, window }
    if (diffPixels === 0) break
  }
  const { diffPixels, out, window } = best!
  // diffMask output is transparent except on differing pixels.
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = out[i * 4 + 3]! > 0 ? 1 : 0
  const mask: DiffMask = { width, height, data }
  return {
    match,
    mask,
    diffRatio: diffPixels / (width * height),
    diffPixels,
    dpr: impl.dpr,
    // The crops the classifier reads: design at the best shift, on the impl grid.
    design: { data: window, width, height },
    impl: implRaw,
  }
}

/** All integer offsets within ±s, ordered by |dx|+|dy| (then dx, dy) — (0,0) first. */
export function shiftOffsets(s: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) out.push([dx, dy])
  return out.sort(
    (a, b) =>
      Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) ||
      a[0] - b[0] ||
      a[1] - b[1],
  )
}

/** Copy the width×height RGBA window at (x0, y0) of `src` into `dst`. */
function copyWindow(
  src: Raw,
  x0: number,
  y0: number,
  width: number,
  height: number,
  dst: Uint8Array,
): void {
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * src.width + x0) * 4
    dst.set(src.data.subarray(from, from + width * 4), y * width * 4)
  }
}

/** Effectful edge: per-match AA-aware diffs for the whole pair. */
export async function diffMatches(
  pair: AlignedPair,
  matches: readonly ElementMatch[],
  options: DiffOptions = {},
): Promise<MatchDiff[]> {
  const o: Required<DiffOptions> = { ...DIFF_DEFAULTS, ...options }
  const designPng = sharp(pair.design.pngPath)
  const implPng = sharp(pair.impl.pngPath)
  const out: MatchDiff[] = []
  for (const m of matches) {
    const d = await diffMatch(designPng, implPng, pair, m, o)
    if (d) out.push(d)
  }
  return out
}

/**
 * Colour per `changeKind`, so the mask says WHAT differs and not merely that
 * something does. Unclassified diffs (hand-built, or a run without crops) keep
 * the original crimson.
 */
/** What the whole-frame backstop measured: difference NOT inside any matched element. */
export interface RemainderDiff {
  /** Unexplained differing pixels / frame pixels. */
  diffRatio: number
  diffPixels: number
  totalPixels: number
  dpr: number
  /** Largest connected regions of unexplained difference, in impl CSS px, largest first. */
  clusters: Cluster[]
}

/**
 * The backstop: diff the WHOLE frame, then subtract every matched element's box
 * and report what is left.
 *
 * Why this exists. The per-match channel only ever looks INSIDE boxes that
 * matched, and matching is driven by the element model, which extracts leaves.
 * So anything the model cannot represent is invisible to both channels at once.
 * Measured case, 2026-09-02: a control that should have been a floating pill
 * (223x29, rounded, shadowed) was implemented as a full-width bar with a
 * background and a bottom border. Every label inside it matched and compared
 * clean; the bar itself is a container, never a leaf, never matched, never
 * diffed — the run reported NOTHING and a person found it by eye. "No mask file
 * means no unexplained pixel evidence" was true only inside matched boxes,
 * which reads as a far stronger guarantee than it was.
 *
 * Matched boxes are subtracted with a margin, because a correct element still
 * differs along its own antialiased edge; without it every glyph would leak a
 * halo into the remainder and the ratio would measure rasterisation, not drift.
 */
export async function diffRemainder(
  pair: AlignedPair,
  matches: readonly ElementMatch[],
  options: DiffOptions & { subtractMarginPx?: number } = {},
): Promise<RemainderDiff | null> {
  const o: Required<DiffOptions> = { ...DIFF_DEFAULTS, ...options }
  const margin = options.subtractMarginPx ?? 2
  const { design, impl, alignment } = pair
  const frameCss: Box = { x: 0, y: 0, w: impl.width, h: impl.height }

  const implRaw = await rawCrop(sharp(impl.pngPath), toImplNative(frameCss, impl.dpr), o.blur)
  if (!implRaw) return null
  const { width, height } = implRaw
  const designRaw = await rawCrop(
    sharp(design.pngPath),
    toDesignNative(frameCss, alignment, design.dpr),
    o.blur,
    { width, height },
  )
  if (!designRaw || designRaw.width !== width || designRaw.height !== height) return null

  const out = new Uint8Array(width * height * 4)
  pixelmatch(designRaw.data, implRaw.data, out, width, height, {
    threshold: o.threshold,
    includeAA: false,
    diffMask: true,
  })

  // The mask is 1 byte per pixel: was this pixel reported as different.
  const flags = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) flags[i] = out[i * 4 + 3] === 0 ? 0 : 1

  // Subtract every matched element. A matched box that compared clean and one
  // that produced a finding are BOTH explained: the per-match channel owns them.
  for (const m of matches) {
    const b = toImplNative(m.impl.box, impl.dpr)
    const x0 = Math.max(0, Math.floor(b.x) - margin)
    const y0 = Math.max(0, Math.floor(b.y) - margin)
    const x1 = Math.min(width, Math.ceil(b.x + b.w) + margin)
    const y1 = Math.min(height, Math.ceil(b.y + b.h) + margin)
    for (let y = y0; y < y1; y++) flags.fill(0, y * width + x0, y * width + x1)
  }

  let diffPixels = 0
  for (let i = 0; i < flags.length; i++) if (flags[i] === 1) diffPixels++
  const totalPixels = width * height
  // minSize is in MASK px: a region smaller than ~4 CSS px on a side is
  // resampling residue along a shared edge, not a surface anybody drew.
  const minSize = Math.max(2, Math.round(4 * impl.dpr))
  const raw = clusterMask({ width, height, data: flags }, { minSize, gap: 2 })
  // clusterMask works in mask px; findings are in impl CSS px.
  const clusters = raw
    .map((c) => ({
      pixels: c.pixels,
      box: {
        x: Math.round((c.box.x / impl.dpr) * 10) / 10,
        y: Math.round((c.box.y / impl.dpr) * 10) / 10,
        w: Math.round((c.box.w / impl.dpr) * 10) / 10,
        h: Math.round((c.box.h / impl.dpr) * 10) / 10,
      },
    }))
    .sort((a, b) => b.pixels - a.pixels)
  return {
    diffRatio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPixels,
    totalPixels,
    dpr: impl.dpr,
    clusters,
  }
}

export const MASK_COLORS: Record<string, [number, number, number]> = {
  shape: [232, 62, 214], // magenta — a different glyph or drawing
  added: [34, 197, 94], // green — content only the impl has
  removed: [225, 29, 72], // red — content only the design has
  stroke: [251, 191, 36], // amber — same shape, different outline
  color: [56, 189, 248], // cyan — same shape, recoloured
  "hue-rotation": [56, 189, 248],
  noise: [148, 163, 184], // slate — resample residue
}
const MASK_FALLBACK: [number, number, number] = [225, 29, 72]

/**
 * Effectful edge: paint the REPORTED diffs onto a transparent canvas the size
 * of the impl PNG and write it — the report's `artifacts.diffMask`.
 *
 * Painted marks are dilated by `dilate` native px. A 1px stroke difference is
 * one pixel wide, and a page pair is viewed at fit-to-screen zoom (≈0.3×),
 * where one pixel is not there at all: without dilation the mask is honest and
 * invisible, which is the failure mode a mask exists to prevent.
 */
export async function writeDiffMask(
  pair: AlignedPair,
  diffs: readonly { diff: MatchDiff; finding?: { actual?: Record<string, unknown> } }[],
  outPath: string,
  dilate = 1,
): Promise<void> {
  const meta = await sharp(pair.impl.pngPath).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const canvas = new Uint8Array(width * height * 4)
  const paint = (cx: number, cy: number, color: [number, number, number]): void => {
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return
    const i = (cy * width + cx) * 4
    canvas[i] = color[0]
    canvas[i + 1] = color[1]
    canvas[i + 2] = color[2]
    canvas[i + 3] = 255
  }
  for (const { diff: d, finding } of diffs) {
    const kind = finding?.actual?.["changeKind"]
    const color = (typeof kind === "string" ? MASK_COLORS[kind] : undefined) ?? MASK_FALLBACK
    const origin = toImplNative(d.match.impl.box, d.dpr)
    const ox = Math.max(0, Math.floor(origin.x))
    const oy = Math.max(0, Math.floor(origin.y))
    for (let y = 0; y < d.mask.height; y++) {
      for (let x = 0; x < d.mask.width; x++) {
        if (d.mask.data[y * d.mask.width + x] === 0) continue
        for (let dy = -dilate; dy <= dilate; dy++) {
          for (let dx = -dilate; dx <= dilate; dx++) paint(ox + x + dx, oy + y + dy, color)
        }
      }
    }
  }
  await sharp(Buffer.from(canvas), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath)
}
