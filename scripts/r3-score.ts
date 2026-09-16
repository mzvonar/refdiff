import type { Box } from "../packages/core/dist/index.js"

/**
 * Score candidate DISCRIMINATORS against the R3 sweep's labels.
 *
 * Plan step 5 proposes refusing pairs on weak evidence, and names CONTAINMENT
 * as the discriminator ("correct long pairs keep their x and their local
 * structure; wrong ones move on both axes and change role"). That claim came
 * from 7 labelled pairs, 3 of which it was derived from. This joins
 * `scripts/r3-sweep.ts`'s candidate table to `docs/r3-sweep-<date>.labels.json`
 * and scores each proposed rule the same way, so a rule can be FALSIFIED.
 *
 * A rule is scored by what it would COST and what it would BUY:
 *   caught  — wrong pairs it refuses          (the buy)
 *   broken  — correct pairs it refuses        (the cost; step 2's regression signature)
 *   missed  — wrong pairs it keeps
 * A rule that breaks more than it catches is refuted, and the γ ceiling is
 * scored here beside the rest so the refutation is reproducible rather than
 * quoted.
 *
 *   node scripts/r3-score.ts --in <sweep>.json --labels <labels>.json
 */
import { readFileSync } from "node:fs"

interface Candidate {
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
  blockMates: number
}

interface Label {
  n: number
  label: "wrong" | "correct" | "leafshape"
  how: string
  note: string
}

type Row = Candidate & Label

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol

/**
 * How many times bigger the larger box is. The slot pass is width-blind by
 * design — `slotGamma` drops the width term so a value that got longer still
 * pairs — and this is the term it dropped, put back as a RATIO rather than as
 * a distance so a wide element and a narrow one at the same anchor are
 * comparable across pairs and viewports.
 */
const areaRatio = (c: { designBox: Box; implBox: Box }): number => {
  const a = Math.max(1, c.designBox.w) * Math.max(1, c.designBox.h)
  const b = Math.max(1, c.implBox.w) * Math.max(1, c.implBox.h)
  return Math.max(a, b) / Math.min(a, b)
}

/**
 * The rules under test. Each returns true when it would REFUSE the pair.
 * `containment-*` are the plan's proposal in the three readings its own wording
 * allows, because "correct long pairs keep their local structure" does not say
 * which of the three it means.
 */
const RULES: { name: string; refuse: (c: Candidate) => boolean }[] = [
  { name: "γ ceiling 1000", refuse: (c) => c.gamma > 1000 },
  { name: "γ ceiling 700", refuse: (c) => c.gamma > 700 },
  { name: "γ ceiling 500", refuse: (c) => c.gamma > 500 },
  { name: "γ ceiling 200 (all candidates)", refuse: () => true },
  { name: "Δx ceiling 100", refuse: (c) => Math.abs(c.dx) > 100 },
  {
    name: "both axes move (|Δx|>60 ∧ |Δy|>60)",
    refuse: (c) => Math.abs(c.dx) > 60 && Math.abs(c.dy) > 60,
  },
  {
    name: "containment-A: containers disagree in SHAPE",
    refuse: (c) =>
      c.designContainer !== undefined && c.implContainer !== undefined && !c.sameContainerShape,
  },
  {
    name: "containment-B: A, and an unplaced side counts as disagreement",
    refuse: (c) =>
      c.designContainer === undefined || c.implContainer === undefined || !c.sameContainerShape,
  },
  {
    name: "containment-C: containers disagree in shape OR in offset-relative position",
    refuse: (c) =>
      c.designContainer !== undefined &&
      c.implContainer !== undefined &&
      !(
        near(c.designContainer.w, c.implContainer.w, 8) &&
        near(c.designContainer.h, c.implContainer.h, 8) &&
        near(c.designBox.x - c.designContainer.x, c.implBox.x - c.implContainer.x, 12)
      ),
  },
  { name: "area ratio > 3", refuse: (c) => areaRatio(c) > 3 },
  { name: "area ratio > 4", refuse: (c) => areaRatio(c) > 4 },
  { name: "area ratio > 5", refuse: (c) => areaRatio(c) > 5 },
  { name: "area ratio > 6", refuse: (c) => areaRatio(c) > 6 },
  { name: "SLOT pairs only, area ratio > 4", refuse: (c) => c.via === "slot" && areaRatio(c) > 4 },
  { name: "SLOT pairs only, area ratio > 5", refuse: (c) => c.via === "slot" && areaRatio(c) > 5 },
  { name: "no block-mates (moves alone)", refuse: (c) => c.blockMates === 0 },
  {
    name: "no block-mates AND γ > 500",
    refuse: (c) => c.blockMates === 0 && c.gamma > 500,
  },
]

const main = (): void => {
  const argv = process.argv.slice(2)
  const argOf = (n: string): string => {
    const i = argv.indexOf(n)
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : ""
  }
  const { candidates } = JSON.parse(readFileSync(argOf("--in"), "utf8")) as {
    candidates: Candidate[]
  }
  const { labels } = JSON.parse(readFileSync(argOf("--labels"), "utf8")) as { labels: Label[] }
  const byN = new Map(labels.map((l) => [l.n, l]))
  const rows: Row[] = candidates.map((c, i) => {
    const l = byN.get(i + 1)
    if (l === undefined) throw new Error(`candidate ${i + 1} (${c.pair}) has no label`)
    return { ...c, ...l }
  })

  const wrong = rows.filter((r) => r.label === "wrong")
  const correct = rows.filter((r) => r.label === "correct")
  const leaf = rows.filter((r) => r.label === "leafshape")
  const say = console.log

  say(`# R3 sweep — scoring the proposed discriminators`)
  say()
  say(
    `Labelled candidates: **${rows.length}** — ${wrong.length} wrong, ${correct.length} correct, ${leaf.length} leaf-shape.`,
  )
  const byHow = (h: string): number => rows.filter((r) => r.how === h).length
  say(
    `Decided by: pixels ${byHow("pixels")} · family ${byHow("family")} · detail ${byHow("detail")} · prior ${byHow("prior")}.`,
  )
  say()

  say(`## Where the two populations sit`)
  say()
  const span = (rs: Row[]): string =>
    rs.length === 0
      ? "—"
      : `${Math.min(...rs.map((r) => r.gamma)).toFixed(1)} … ${Math.max(...rs.map((r) => r.gamma)).toFixed(1)}`
  say(`| population | n | γ span | via text | via slot | phase polish |`)
  say(`| --- | ---: | --- | ---: | ---: | ---: |`)
  for (const [name, rs] of [
    ["wrong", wrong],
    ["correct", correct],
    ["leaf-shape", leaf],
  ] as [string, Row[]][]) {
    say(
      `| ${name} | ${rs.length} | ${span(rs)} | ${rs.filter((r) => r.via === "text").length} | ${rs.filter((r) => r.via === "slot").length} | ${rs.filter((r) => r.phase === "polish").length} |`,
    )
  }
  say()

  say(`## Rules, scored`)
  say()
  say(`\`broken\` is the cost — a correct pair the rule would refuse. \`caught\` is the buy.`)
  say()
  say(`| rule | caught (of ${wrong.length}) | broken (of ${correct.length}) | missed | verdict |`)
  say(`| --- | ---: | ---: | ---: | --- |`)
  for (const r of RULES) {
    const caught = wrong.filter((c) => r.refuse(c)).length
    const broken = correct.filter((c) => r.refuse(c)).length
    const verdict = caught === 0 ? "buys nothing" : broken >= caught ? "REFUTED" : "net positive"
    say(`| ${r.name} | ${caught} | ${broken} | ${wrong.length - caught} | ${verdict} |`)
  }
  say()

  say(`## The same table on the PIXEL-LABELLED subset only`)
  say()
  say(`The \`detail\` labels read an element's line-mates and the containment rules read its`)
  say(
    `container; both are "local surroundings", so they are not fully independent. These ${rows.filter((r) => r.how === "pixels").length}`,
  )
  say(`labels were decided from the PNGs alone.`)
  say()
  const pw = wrong.filter((r) => r.how === "pixels")
  const pc = correct.filter((r) => r.how === "pixels")
  say(`| rule | caught (of ${pw.length}) | broken (of ${pc.length}) |`)
  say(`| --- | ---: | ---: |`)
  for (const r of RULES) {
    say(
      `| ${r.name} | ${pw.filter((c) => r.refuse(c)).length} | ${pc.filter((c) => r.refuse(c)).length} |`,
    )
  }
  say()

  say(`## Every wrong pair, and what each feature says about it`)
  say()
  say(`| pair | design text | impl text | via | γ | Δx | Δy | d-container | i-container | mates |`)
  say(`| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | ---: |`)
  const fmt = (b: Box | undefined): string =>
    b === undefined ? "**unplaced**" : `${b.w.toFixed(0)}×${b.h.toFixed(0)}`
  for (const r of wrong) {
    say(
      `| ${r.pair} | \`${r.designText.slice(0, 30)}\` | \`${r.implText.slice(0, 30)}\` | ${r.via} | ${r.gamma.toFixed(0)} | ${r.dx.toFixed(0)} | ${r.dy.toFixed(0)} | ${fmt(r.designContainer)} | ${fmt(r.implContainer)} | ${r.blockMates} |`,
    )
  }
  say()

  const placed = (r: Row): boolean =>
    r.designContainer !== undefined && r.implContainer !== undefined
  say(`## The container column's own availability — the map's miss rate, one level down`)
  say()
  say(`- wrong pairs with BOTH sides placed: **${wrong.filter(placed).length} of ${wrong.length}**`)
  say(
    `- correct pairs with BOTH sides placed: **${correct.filter(placed).length} of ${correct.length}**`,
  )
  say(
    `- wrong pairs with NEITHER side placed: **${wrong.filter((r) => r.designContainer === undefined && r.implContainer === undefined).length}**`,
  )
}

main()
