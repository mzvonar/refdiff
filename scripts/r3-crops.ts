/**
 * Own-side crops for the R3 sweep's candidates — the LOOKING half.
 *
 * `scripts/r3-sweep.ts` produces the candidate table; a label on a candidate is
 * a judgement about whether the two elements are the same semantic element, and
 * that judgement is made by looking at each element WHERE IT SITS ON ITS OWN
 * SIDE. The run dirs' existing crops cannot serve: `packageForModel` crops both
 * PNGs at `implBox ?? designBox`, i.e. the SAME region from both sides, which is
 * right for a finding about a pair and shows nothing about where the design
 * element actually lives when the pair is 1000 px apart.
 *
 * So this crops `design.png` around the DESIGN box and `impl.png` around the
 * IMPL box, each with enough margin to show the row it is in, and outlines the
 * element. Read-only with respect to every run dir: output goes to `--out`.
 *
 *   node scripts/r3-crops.ts --in <sweep>.json --out <dir> [--pad 420] [--only 1,2,5]
 */
import { readFileSync, mkdirSync } from "node:fs"
// The workspace root has no `sharp`; `@refdiff/core` does, and this script is
// the core package's own crop path re-pointed at each side's own box.
import { createRequire } from "node:module"
import { join } from "node:path"

interface SharpImage {
  metadata: () => Promise<{ width?: number; height?: number }>
  extract: (r: { left: number; top: number; width: number; height: number }) => SharpImage
  composite: (c: { input: Buffer; top: number; left: number }[]) => SharpImage
  toFile: (p: string) => Promise<unknown>
}
const sharp = createRequire("/root/refdiff/packages/core/package.json")("sharp") as (
  src: string,
) => SharpImage

import {
  toDesignNative,
  toImplNative,
  clampBox,
  padBox,
  type Box,
} from "../packages/core/dist/index.js"

interface Candidate {
  corpus: string
  pair: string
  via: string
  gamma: number
  designText: string
  implText: string
  designBox: Box
  implBox: Box
}

const OUT_ROOT = "out/baseline"

const outline = async (
  srcPng: string,
  region: Box,
  element: Box,
  outPath: string,
): Promise<boolean> => {
  const meta = await sharp(srcPng).metadata()
  const clamped = clampBox(region, meta.width ?? 0, meta.height ?? 0)
  if (clamped === null) return false
  const rx = Math.round(element.x - clamped.x)
  const ry = Math.round(element.y - clamped.y)
  const rw = Math.max(2, Math.round(element.w))
  const rh = Math.max(2, Math.round(element.h))
  const svg = Buffer.from(
    `<svg width="${clamped.w}" height="${clamped.h}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="#ff0066" stroke-width="3"/></svg>`,
  )
  await sharp(srcPng)
    .extract({ left: clamped.x, top: clamped.y, width: clamped.w, height: clamped.h })
    .composite([{ input: svg, top: 0, left: 0 }])
    .toFile(outPath)
  return true
}

const main = async (): Promise<void> => {
  const argv = process.argv.slice(2)
  const argOf = (name: string, dflt: string): string => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : dflt
  }
  const inPath = argOf("--in", "")
  const outDir = argOf("--out", "")
  const padX = Number(argOf("--pad", "420"))
  const padY = Number(argOf("--padY", "60"))
  const only = argOf("--only", "")
  const wanted = only === "" ? undefined : new Set(only.split(",").map((s) => Number(s.trim())))

  const { candidates } = JSON.parse(readFileSync(inPath, "utf8")) as { candidates: Candidate[] }
  mkdirSync(outDir, { recursive: true })

  const reports = new Map<string, { alignment: unknown; design: unknown; impl: unknown }>()
  for (const [i, c] of candidates.entries()) {
    const n = i + 1
    if (wanted !== undefined && !wanted.has(n)) continue
    const dir = join(OUT_ROOT, c.corpus, c.pair)
    if (!reports.has(dir))
      reports.set(dir, JSON.parse(readFileSync(join(dir, "findings.json"), "utf8")))
    const rep = reports.get(dir)! as {
      alignment: Parameters<typeof toDesignNative>[1]
      design: { dpr: number }
      impl: { dpr: number }
    }
    const grow = (b: Box): Box => ({
      x: b.x - padX,
      y: b.y - padY,
      w: b.w + 2 * padX,
      h: b.h + 2 * padY,
    })
    const dRegion = toDesignNative(grow(c.designBox), rep.alignment, rep.design.dpr)
    const dEl = toDesignNative(c.designBox, rep.alignment, rep.design.dpr)
    const iRegion = toImplNative(grow(c.implBox), rep.impl.dpr)
    const iEl = toImplNative(c.implBox, rep.impl.dpr)
    const tag = `${String(n).padStart(2, "0")}-${c.pair}`
    const dOk = await outline(
      join(dir, "design.png"),
      dRegion,
      dEl,
      join(outDir, `${tag}-design.png`),
    )
    const iOk = await outline(join(dir, "impl.png"), iRegion, iEl, join(outDir, `${tag}-impl.png`))
    console.log(
      `${tag}  γ${c.gamma.toFixed(0)}  "${c.designText}" / "${c.implText}"  design:${dOk ? "ok" : "CLIPPED"} impl:${iOk ? "ok" : "CLIPPED"}`,
    )
  }
}

void main()
