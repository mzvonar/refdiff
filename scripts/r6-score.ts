/**
 * STEP 6's FALSIFICATION — does container-local alignment quality predict
 * whether a pairing is the RIGHT pairing? (read-only)
 *
 * `unverified` makes exactly one claim: *this pair is not worth believing*. A
 * per-container confidence proposes to make that claim per container instead of
 * per page, which is a hypothesis about the corpus and not a matter of taste —
 * so it is scored the same way step 5's containment hypothesis was, against the
 * 107 labels of `docs/r3-sweep-2026-09-16.md` rather than against the examples
 * that suggested it.
 *
 * The question asked here: is the local score of a labelled-WRONG pairing's
 * container LOWER than that of a labelled-CORRECT pairing's? If the two
 * populations overlap, a low local score is not evidence about a pairing, and
 * neither flagging nor clearing on it is justified.
 *
 * The candidate set is frozen (`docs/r3-sweep-2026-09-16.candidates.json`)
 * alongside its labels, so the scoring reproduces forever; the corpus behind it
 * moved at step 5, so a candidate whose pairing no longer exists is reported as
 * GONE rather than silently scored.
 *
 *   node scripts/r6-score.ts [--out docs/r6-score-<date>.md]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import {
  containersOf,
  groupByRegion,
  matchElements,
  type Box,
  type ComparisonReport,
  type ElementNode,
  type Finding,
} from "../packages/core/dist/index.js"

const OUT_ROOT = "out/baseline"
const AGREE_PX = 10
const CANDIDATES = "docs/r3-sweep-2026-09-16.candidates.json"
const LABELS = "docs/r3-sweep-2026-09-16.labels.json"

interface Candidate {
  corpus: string
  pair: string
  via: string
  gamma: number
  designBox: Box
  implBox: Box
  designText?: string
  implText?: string
}

interface Label {
  n: number
  label: "wrong" | "correct" | "leafshape"
  how: string
  note: string
}

interface Evidence {
  impl: ElementNode
  dx: number
  dy: number
}

const center = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

const median = (v: readonly number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

type Reading = "global" | "refit"

const share = (ev: readonly Evidence[], reading: Reading): number => {
  if (ev.length === 0) return 0
  const ox = reading === "refit" ? median(ev.map((e) => e.dx)) : 0
  const oy = reading === "refit" ? median(ev.map((e) => e.dy)) : 0
  return (
    ev.filter((e) => Math.abs(e.dx - ox) <= AGREE_PX && Math.abs(e.dy - oy) <= AGREE_PX).length /
    ev.length
  )
}

const placer = (
  elements: readonly ElementNode[],
  frame: Box,
): ((box: Box) => number | undefined) => {
  const containers = containersOf(elements, frame)
  const key = (b: Box): string => `${b.x}|${b.y}|${b.w}|${b.h}`
  const index = new Map<string, number>()
  containers.forEach((c, i) => index.set(key(c.box), i))
  return (box) => {
    const synthetic = [
      { id: "q", type: "missing-element", severity: "minor", message: "", implBox: box },
    ] as unknown as Finding[]
    const home = groupByRegion(synthetic, containers, { minGroup: 1 }).groups[0]
    return home === undefined ? undefined : index.get(key(home.box))
  }
}

const sameBox = (a: Box, b: Box): boolean =>
  Math.abs(a.x - b.x) < 0.01 &&
  Math.abs(a.y - b.y) < 0.01 &&
  Math.abs(a.w - b.w) < 0.01 &&
  Math.abs(a.h - b.h) < 0.01

interface Scored {
  n: number
  label: Label["label"]
  how: string
  pair: string
  via: string
  gamma: number
  /** `undefined` = no container, or none holding the minimum evidence. */
  localGlobal: number | undefined
  localRefit: number | undefined
  evidence: number
  /**
   * The SAME question asked without containers: the k text-proven pairings
   * nearest this one, by impl-box center distance. It exists because the
   * container reading dies on AVAILABILITY, and availability is a property of
   * `containersOf`, not of locality — a neighbourhood is defined on every
   * pairing on every pair, so it separates the two explanations.
   */
  nearGlobal: number | undefined
  nearRefit: number | undefined
  note: string
}

/** The k text-proven pairings nearest a box, by impl-center distance. */
const nearest = (ev: readonly Evidence[], box: Box, k: number): Evidence[] => {
  const c = center(box)
  return [...ev]
    .map((e) => {
      const ec = center(e.impl.box)
      return { e, d: Math.abs(ec.x - c.x) + Math.abs(ec.y - c.y) }
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((x) => x.e)
}

const NEIGHBOURS = 8

const main = (): void => {
  const cands = (JSON.parse(readFileSync(CANDIDATES, "utf8")) as { candidates: Candidate[] })
    .candidates
  const labels = (JSON.parse(readFileSync(LABELS, "utf8")) as { labels: Label[] }).labels

  const cache = new Map<
    string,
    { evidence: Evidence[]; place: (b: Box) => number | undefined; live: Set<string> } | undefined
  >()
  const loadPair = (corpus: string, pair: string): ReturnType<typeof cache.get> => {
    const k = `${corpus}/${pair}`
    if (cache.has(k)) return cache.get(k)
    const dir = join(OUT_ROOT, corpus, pair)
    if (!existsSync(join(dir, "findings.json")) || !existsSync(join(dir, "elements.json"))) {
      cache.set(k, undefined)
      return undefined
    }
    const rep = JSON.parse(readFileSync(join(dir, "findings.json"), "utf8")) as ComparisonReport
    const el = JSON.parse(readFileSync(join(dir, "elements.json"), "utf8")) as {
      design: ElementNode[]
      impl: ElementNode[]
    }
    const re = matchElements(el.design, el.impl)
    const via = (v: string): number => re.matches.filter((m) => m.via === v).length
    const ok =
      rep.matching !== undefined &&
      rep.matching.matched === re.matches.length &&
      rep.matching.matchedVia.text === via("text") &&
      rep.matching.matchedVia.slot === via("slot") &&
      rep.matching.matchedVia.geometry === via("geometry")
    if (!ok) {
      cache.set(k, undefined)
      return undefined
    }
    const value = {
      // Every text-proven pairing is the local evidence: it is denser than the
      // unique-text anchor set and it is what `isUnverified` already trusts.
      evidence: re.matches
        .filter((m) => m.via === "text")
        .map((m) => {
          const dc = center(m.design.box)
          const ic = center(m.impl.box)
          return { impl: m.impl, dx: dc.x - ic.x, dy: dc.y - ic.y }
        }),
      place: placer(el.impl, { x: 0, y: 0, w: rep.impl.width, h: rep.impl.height }),
      live: new Set(
        re.matches.map(
          (m) => `${m.design.box.x},${m.design.box.y}|${m.impl.box.x},${m.impl.box.y}`,
        ),
      ),
    }
    cache.set(k, value)
    return value
  }

  const scored: Scored[] = []
  const gone: string[] = []
  const notAdmissible: string[] = []

  for (const lab of labels) {
    const c = cands[lab.n - 1]!
    const loaded = loadPair(c.corpus, c.pair)
    if (loaded === undefined) {
      notAdmissible.push(`#${lab.n} ${c.pair}`)
      continue
    }
    const key = `${c.designBox.x},${c.designBox.y}|${c.implBox.x},${c.implBox.y}`
    if (!loaded.live.has(key)) {
      gone.push(`#${lab.n} ${c.pair} (${c.via}) — the pairing no longer exists`)
      continue
    }
    const home = loaded.place(c.implBox)
    const ev =
      home === undefined ? [] : loaded.evidence.filter((e) => loaded.place(e.impl.box) === home)
    // The pairing's own text-proven twin, if it has one, is excluded: a pairing
    // cannot be evidence about itself.
    const pool = loaded.evidence.filter((e) => !sameBox(e.impl.box, c.implBox))
    const near = nearest(pool, c.implBox, NEIGHBOURS)
    scored.push({
      n: lab.n,
      label: lab.label,
      how: lab.how,
      pair: c.pair,
      via: c.via,
      gamma: c.gamma,
      localGlobal: ev.length === 0 ? undefined : share(ev, "global"),
      localRefit: ev.length === 0 ? undefined : share(ev, "refit"),
      evidence: ev.length,
      nearGlobal: near.length < NEIGHBOURS ? undefined : share(near, "global"),
      nearRefit: near.length < NEIGHBOURS ? undefined : share(near, "refit"),
      note: lab.note,
    })
  }

  const lines: string[] = []
  const say = (s = ""): void => {
    lines.push(s)
    console.log(s)
  }

  say(`# Step 6 falsification — does container-local confidence predict a WRONG pairing?`)
  say()
  say(
    `${labels.length} labelled candidates · **${scored.length} still exist and are scorable** · ${gone.length} no longer exist (step 5 refused them) · ${notAdmissible.length} on a pair that does not reproduce`,
  )
  say()

  const pop = (l: Label["label"]): Scored[] => scored.filter((s) => s.label === l)
  say(`## Availability, the same question step 5's containment scoring died on`)
  say()
  say(
    `| population | n | container with ≥1 text pair | ≥3 | median local (global) | median local (refit) |`,
  )
  say(`| --- | ---: | ---: | ---: | ---: | ---: |`)
  for (const l of ["wrong", "correct", "leafshape"] as Label["label"][]) {
    const p = pop(l)
    const withEv = p.filter((s) => s.evidence >= 1)
    const withEv3 = p.filter((s) => s.evidence >= 3)
    const med = (xs: (number | undefined)[]): string => {
      const v = xs.filter((x): x is number => x !== undefined)
      return v.length === 0 ? "—" : median(v).toFixed(2)
    }
    say(
      `| ${l} | ${p.length} | ${withEv.length} | ${withEv3.length} | ${med(withEv.map((s) => s.localGlobal))} | ${med(withEv.map((s) => s.localRefit))} |`,
    )
  }
  say()

  say(`## The rule scored — a pairing is DISTRUSTED when its container's local score < floor`)
  say()
  say(
    `| reading | min evidence | floor | wrong caught | correct broken | pixels-only caught/broken |`,
  )
  say(`| --- | ---: | ---: | ---: | ---: | --- |`)
  const wrong = pop("wrong")
  const correct = pop("correct")
  for (const reading of ["global", "refit"] as Reading[]) {
    for (const minEv of [1, 3]) {
      for (const floor of [0.5, 0.75]) {
        const hit = (s: Scored): boolean => {
          const v = reading === "refit" ? s.localRefit : s.localGlobal
          return v !== undefined && s.evidence >= minEv && v < floor
        }
        const px = (xs: Scored[]): Scored[] => xs.filter((s) => s.how === "pixels")
        say(
          `| ${reading} | ${minEv} | ${floor} | ${wrong.filter(hit).length} of ${wrong.length} | ${correct.filter(hit).length} of ${correct.length} | ${px(wrong).filter(hit).length} of ${px(wrong).length} / ${px(correct).filter(hit).length} of ${px(correct).length} |`,
        )
      }
    }
  }
  say()

  say(`## The container-free reading — the ${NEIGHBOURS} nearest text-proven pairings`)
  say()
  say(
    `Defined on every pairing whose pair has ${NEIGHBOURS} text pairs at all, so this separates "containers are unavailable" from "locality does not discriminate".`,
  )
  say()
  say(`| reading | floor | wrong caught | correct broken | pixels-only caught/broken |`)
  say(`| --- | ---: | ---: | ---: | --- |`)
  for (const reading of ["global", "refit"] as Reading[]) {
    for (const floor of [0.5, 0.75]) {
      const hit = (s: Scored): boolean => {
        const v = reading === "refit" ? s.nearRefit : s.nearGlobal
        return v !== undefined && v < floor
      }
      const px = (xs: Scored[]): Scored[] => xs.filter((s) => s.how === "pixels")
      say(
        `| ${reading} | ${floor} | ${wrong.filter(hit).length} of ${wrong.length} | ${correct.filter(hit).length} of ${correct.length} | ${px(wrong).filter(hit).length} of ${px(wrong).length} / ${px(correct).filter(hit).length} of ${px(correct).length} |`,
      )
    }
  }
  say()
  const defined = scored.filter((s) => s.nearGlobal !== undefined).length
  say(`Defined on **${defined} of ${scored.length}** scorable candidates, against ${scored.filter((s) => s.evidence >= 1).length} for the container reading.`)
  say()

  say(`## Every scorable WRONG pairing, with what the rule would say about it`)
  say()
  say(
    `| # | pair | via | γ | text pairs in its container | local (global) | local (refit) | note |`,
  )
  say(`| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |`)
  for (const s of wrong.sort((a, b) => b.gamma - a.gamma))
    say(
      `| ${s.n} | ${s.pair} | ${s.via} | ${s.gamma.toFixed(0)} | ${s.evidence} | ${s.localGlobal?.toFixed(2) ?? "—"} | ${s.localRefit?.toFixed(2) ?? "—"} | ${s.note} |`,
    )
  say()

  if (gone.length > 0) {
    say(`## No longer in the corpus`)
    say()
    for (const g of gone) say(`- ${g}`)
    say()
  }

  const outArg = process.argv.indexOf("--out")
  if (outArg > 0) {
    writeFileSync(process.argv[outArg + 1]!, lines.join("\n") + "\n")
    console.log(`\nwrote ${process.argv[outArg + 1]!}`)
  }
}

main()
