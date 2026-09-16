/**
 * R3 SWEEP — the complement audit, run over every recorded pair (read-only).
 *
 * `skills/refdiff/reconcile.md` §R3 asks, of one pair: which elements are
 * MISSING FROM the unmatched list, and what claimed them? Absence from a
 * list-shaped report is not evidence of presence. This is that question asked
 * of the whole corpus at once, mechanically: every matched pair above a γ floor
 * is an element that is NOT in the unmatched list because this pairing claimed
 * it, and each one is a claim to check rather than a fact.
 *
 * It is the MEASUREMENT PHASE of plan step 5 (`docs/plan-divergent-matching.md`).
 * Step 5 wants to refuse pairs on weak evidence; its candidate discriminator is
 * CONTAINMENT, and the corpus holds 7 labelled text pairs against 1424. A rule
 * fitted to the 7 examples that named it is illustrated, not validated — so
 * this builds the candidate table that a rule can be falsified against.
 *
 * It needs no capture, no server and no library change: every run dir's
 * `elements.json` holds both ALIGNED leaf sets, and the shipped `matchElements`
 * is re-run over them. **A recomputation that does not reproduce that pair's
 * recorded `matching` block is not evidence about that pair** — such pairs are
 * dropped and named, never silently included.
 *
 * Nothing here writes to a run dir.
 *
 *   node scripts/r3-sweep.ts [--gamma 200] [--out docs/r3-sweep-<date>.md]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import {
  matchElements,
  containersOf,
  groupByRegion,
  type ElementNode,
  type Finding,
  type ComparisonReport,
  type Box,
} from "../packages/core/dist/index.js"

const OUT_ROOT = "out/baseline"

interface ElementsFile {
  design: ElementNode[]
  impl: ElementNode[]
}

interface PairRun {
  corpus: string
  pair: string
  dir: string
  report: ComparisonReport
  elements: ElementsFile
}

const readRuns = (): PairRun[] => {
  const runs: PairRun[] = []
  for (const corpus of readdirSync(OUT_ROOT, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  )) {
    const croot = join(OUT_ROOT, corpus.name)
    for (const pair of readdirSync(croot, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = join(croot, pair.name)
      const f = join(dir, "findings.json")
      const e = join(dir, "elements.json")
      if (!existsSync(f) || !existsSync(e)) continue
      runs.push({
        corpus: corpus.name,
        pair: pair.name,
        dir,
        report: JSON.parse(readFileSync(f, "utf8")) as ComparisonReport,
        elements: JSON.parse(readFileSync(e, "utf8")) as ElementsFile,
      })
    }
  }
  return runs
}

/**
 * The admissibility gate. `matchElements`'s defaults are what a run used, so a
 * faithful re-run reproduces the recorded counts exactly; anything else means
 * the recomputation is describing a different matcher than the one that wrote
 * the report, and the pair is dropped.
 */
const reproduces = (
  recorded: ComparisonReport["matching"],
  got: ReturnType<typeof matchElements>,
): boolean => {
  if (recorded === undefined) return false
  const via = (v: string): number => got.matches.filter((m) => m.via === v).length
  return (
    recorded.matched === got.matches.length &&
    recorded.designOnly === got.designOnly.length &&
    recorded.implOnly === got.implOnly.length &&
    recorded.matchedVia.text === via("text") &&
    recorded.matchedVia.slot === via("slot") &&
    recorded.matchedVia.geometry === via("geometry")
  )
}

/**
 * The container an element sits in, on its OWN side — computed by the shipped
 * placement rather than a copy of it: one synthetic finding per element through
 * `groupByRegion` at `minGroup: 1`, which is exactly how `groupUnmatched`
 * places the unmatched population. An element the map cannot place reads
 * `undefined`, which is a measurement (`elsewhere`), not a gap.
 */
const placeAll = (
  boxes: readonly { id: string; box: Box }[],
  elements: readonly ElementNode[],
  frame: Box,
): Map<string, Box> => {
  const synthetic: Finding[] = boxes.map((b) => ({
    id: b.id,
    type: "missing-element",
    severity: "minor",
    message: "",
    implBox: b.box,
  })) as unknown as Finding[]
  const grouped = groupByRegion(synthetic, containersOf(elements, frame), { minGroup: 1 })
  const home = new Map<string, Box>()
  for (const g of grouped.groups) for (const id of g.ids) home.set(id, g.box)
  return home
}

const fmtBox = (b: Box): string =>
  `(${b.x.toFixed(0)}, ${b.y.toFixed(0)}) ${b.w.toFixed(0)}×${b.h.toFixed(0)}`

/**
 * The texted elements sharing this element's line on its OWN side, left to
 * right. Independent of containers and of the pairing: it is what a reader sees
 * when they look at the element in place, which is how every label so far was
 * decided. The comp's `Vybavené` sits in a row of filter chips; the impl's sits
 * in a thread row beside a merchant name and a date.
 */
const rowOf = (el: ElementNode, all: readonly ElementNode[]): string[] => {
  const mid = el.box.y + el.box.h / 2
  return all
    .filter(
      (o) =>
        o !== el &&
        o.text !== undefined &&
        o.text !== "" &&
        mid >= o.box.y - 4 &&
        mid <= o.box.y + o.box.h + 4,
    )
    .sort((a, b) => a.box.x - b.box.x)
    .map((o) => `${o.text!.slice(0, 26)}@${o.box.x.toFixed(0)}`)
}

const styleOf = (el: ElementNode): string => {
  const s = el.style ?? {}
  return [
    s.fontSize === undefined ? undefined : `${s.fontSize}px`,
    s.fontWeight === undefined ? undefined : `w${s.fontWeight}`,
    s.color,
    s.backgroundColor === undefined ? undefined : `bg ${s.backgroundColor}`,
    s.borderRadius === undefined ? undefined : `r${s.borderRadius}`,
  ]
    .filter((x) => x !== undefined)
    .join(" · ")
}

/**
 * How many OTHER matched pairs move by the same vector (±6 px on both axes).
 * A translated block of content — a nav bar that slid up, a library row in a
 * shorter list — carries its neighbours with it; an element paired across the
 * page on its string alone moves alone. Reported as a candidate feature, NOT
 * used to label: a discriminator scored against labels it produced is fitted.
 */
const blockMates = (
  m: { design: ElementNode; impl: ElementNode },
  all: readonly { design: ElementNode; impl: ElementNode }[],
): number => {
  const dx = m.impl.box.x - m.design.box.x
  const dy = m.impl.box.y - m.design.box.y
  return all.filter(
    (o) =>
      o !== m &&
      Math.abs(o.impl.box.x - o.design.box.x - dx) <= 6 &&
      Math.abs(o.impl.box.y - o.design.box.y - dy) <= 6,
  ).length
}

const fmtContainer = (b: Box | undefined): string => (b === undefined ? "—" : fmtBox(b))

interface Candidate {
  corpus: string
  pair: string
  phase: string
  via: string
  gamma: number
  dx: number
  dy: number
  designText: string
  implText: string
  designBox: Box
  implBox: Box
  designContainer: Box | undefined
  implContainer: Box | undefined
  sameContainerShape: boolean
  designRow: string[]
  implRow: string[]
  designStyle: string
  implStyle: string
  blockMates: number
}

const main = (): void => {
  const argv = process.argv.slice(2)
  const argOf = (name: string, dflt: string): string => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : dflt
  }
  const gammaFloor = Number(argOf("--gamma", "200"))
  const slotRatio = Number(argOf("--slot-ratio", "0"))
  const outPath = argOf("--out", "")

  // Two candidate selectors, never mixed: a γ floor asks "what did the matcher
  // claim from far away", a slot area ratio asks "what did the width-blind pass
  // claim that is not the same SIZE of thing". The second exists because the
  // first cannot see the slot family at all — its distances are tiny by
  // construction (`slotGamma` caps them at 40) while its area ratios reach 80.
  const areaRatio = (m: { design: ElementNode; impl: ElementNode }): number => {
    const a = Math.max(1, m.design.box.w) * Math.max(1, m.design.box.h)
    const b = Math.max(1, m.impl.box.w) * Math.max(1, m.impl.box.h)
    return Math.max(a, b) / Math.min(a, b)
  }
  const selects =
    slotRatio > 0
      ? (m: { via: string; design: ElementNode; impl: ElementNode }): boolean =>
          m.via === "slot" && areaRatio(m) > slotRatio
      : (m: { gamma: number }): boolean => m.gamma >= gammaFloor

  const runs = readRuns()
  const admissible: PairRun[] = []
  const dropped: string[] = []
  const allGammas: { via: string; gamma: number }[] = []
  const candidates: Candidate[] = []
  const perPair: { pair: string; corpus: string; phase: string; matches: number; cands: number }[] =
    []

  for (const r of runs) {
    const got = matchElements(r.elements.design, r.elements.impl)
    if (!reproduces(r.report.matching, got)) {
      dropped.push(`${r.corpus}/${r.pair}`)
      continue
    }
    admissible.push(r)
    for (const m of got.matches) allGammas.push({ via: m.via, gamma: m.gamma })

    const phase = r.report.phase?.phase ?? "unknown"
    const long = got.matches.filter(selects)
    perPair.push({
      pair: r.pair,
      corpus: r.corpus,
      phase,
      matches: got.matches.length,
      cands: long.length,
    })
    if (long.length === 0) continue

    const designFrame: Box = {
      x: r.report.alignment.offsetX,
      y: r.report.alignment.offsetY,
      w: r.report.design.width,
      h: r.report.design.height,
    }
    const implFrame: Box = { x: 0, y: 0, w: r.report.impl.width, h: r.report.impl.height }
    const dHome = placeAll(
      long.map((m, i) => ({ id: `c${i}`, box: m.design.box })),
      r.elements.design,
      designFrame,
    )
    const iHome = placeAll(
      long.map((m, i) => ({ id: `c${i}`, box: m.impl.box })),
      r.elements.impl,
      implFrame,
    )

    long.forEach((m, i) => {
      const dc = dHome.get(`c${i}`)
      const ic = iHome.get(`c${i}`)
      candidates.push({
        corpus: r.corpus,
        pair: r.pair,
        phase,
        via: m.via,
        gamma: m.gamma,
        dx: m.impl.box.x - m.design.box.x,
        dy: m.impl.box.y - m.design.box.y,
        designText: m.design.text ?? "",
        implText: m.impl.text ?? "",
        designBox: m.design.box,
        implBox: m.impl.box,
        designContainer: dc,
        implContainer: ic,
        sameContainerShape:
          dc !== undefined &&
          ic !== undefined &&
          Math.abs(dc.w - ic.w) <= 8 &&
          Math.abs(dc.h - ic.h) <= 8,
        designRow: rowOf(m.design, r.elements.design),
        implRow: rowOf(m.impl, r.elements.impl),
        designStyle: styleOf(m.design),
        implStyle: styleOf(m.impl),
        blockMates: blockMates(m, got.matches),
      })
    })
  }

  const pct = (xs: number[], p: number): number => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length === 0 ? 0 : s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!
  }
  const textG = allGammas.filter((g) => g.via === "text").map((g) => g.gamma)

  const lines: string[] = []
  const say = (s = ""): void => {
    lines.push(s)
    console.log(s)
  }

  say(`# R3 sweep — the complement audit over the recorded corpus`)
  say()
  const selector = slotRatio > 0 ? `--slot-ratio ${slotRatio}` : `--gamma ${gammaFloor}`
  say(`Generated by \`node scripts/r3-sweep.ts ${selector}\`. Read-only.`)
  say()
  say(`- run dirs read: **${runs.length}**`)
  say(
    `- admissible (recomputation reproduces the recorded \`matching\` block): **${admissible.length}**`,
  )
  say(`- dropped: **${dropped.length}**${dropped.length > 0 ? ` — ${dropped.join(", ")}` : ""}`)
  say(`- matches across the admissible pairs: **${allGammas.length}** (text ${textG.length})`)
  say(
    `- text γ distribution: p50 ${pct(textG, 50).toFixed(1)}, p90 ${pct(textG, 90).toFixed(1)}, p99 ${pct(textG, 99).toFixed(1)}, max ${Math.max(...textG).toFixed(1)}`,
  )
  say(
    `- candidates (${slotRatio > 0 ? `slot pairs at area ratio > ${slotRatio}` : `γ ≥ ${gammaFloor}`}): **${candidates.length}**`,
  )
  const byVia = (v: string): number => candidates.filter((c) => c.via === v).length
  say(
    `  - by \`via\`: text ${byVia("text")} · geometry ${byVia("geometry")} · slot ${byVia("slot")}`,
  )
  const byPhase = (p: string): number => candidates.filter((c) => c.phase === p).length
  say(`  - by phase: reconcile ${byPhase("reconcile")} · polish ${byPhase("polish")}`)
  say()

  say(`## Candidates, γ descending`)
  say()
  say(
    `| # | pair | phase | via | γ | Δx | Δy | design text | impl text | design box | impl box | design container | impl container |`,
  )
  say(`| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |`)
  candidates
    .sort((a, b) => b.gamma - a.gamma)
    .forEach((c, i) => {
      const t = (s: string): string =>
        s.length === 0 ? "—" : `\`${s.replace(/\|/g, "\\|").slice(0, 44)}\``
      say(
        `| ${i + 1} | ${c.pair} | ${c.phase} | ${c.via} | ${c.gamma.toFixed(1)} | ${c.dx.toFixed(0)} | ${c.dy.toFixed(0)} | ${t(c.designText)} | ${t(c.implText)} | ${fmtBox(c.designBox)} | ${fmtBox(c.implBox)} | ${fmtContainer(c.designContainer)} | ${fmtContainer(c.implContainer)} |`,
      )
    })
  say()

  if (argv.includes("--detail")) {
    say(`## Candidate detail — the evidence a label is decided on`)
    say()
    candidates.forEach((c, i) => {
      say(
        `### ${i + 1}. ${c.pair} — \`${c.designText}\` ↔ \`${c.implText}\` (${c.via}, γ ${c.gamma.toFixed(1)})`,
      )
      say()
      say(
        `- Δ (${c.dx.toFixed(0)}, ${c.dy.toFixed(0)}) · phase ${c.phase} · block-mates ${c.blockMates}`,
      )
      say(`- design box ${fmtBox(c.designBox)} · style ${c.designStyle || "—"}`)
      say(`-   container ${fmtContainer(c.designContainer)}`)
      say(`-   row: ${c.designRow.length === 0 ? "alone on its line" : c.designRow.join(" | ")}`)
      say(`- impl   box ${fmtBox(c.implBox)} · style ${c.implStyle || "—"}`)
      say(`-   container ${fmtContainer(c.implContainer)}`)
      say(`-   row: ${c.implRow.length === 0 ? "alone on its line" : c.implRow.join(" | ")}`)
      say()
    })
  }

  say(`## Per pair`)
  say()
  say(`| corpus | pair | phase | matches | candidates |`)
  say(`| --- | --- | --- | ---: | ---: |`)
  for (const p of perPair.sort((a, b) => b.cands - a.cands || a.pair.localeCompare(b.pair))) {
    say(`| ${p.corpus} | ${p.pair} | ${p.phase} | ${p.matches} | ${p.cands} |`)
  }

  if (outPath !== "") {
    writeFileSync(outPath, lines.join("\n") + "\n")
    writeFileSync(
      outPath.replace(/\.md$/, ".json"),
      JSON.stringify({ gammaFloor, dropped, candidates }, null, 2) + "\n",
    )
  }
}

main()
