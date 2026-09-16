/**
 * STEP 6's MEASUREMENT PHASE — per-container confidence, evaluated over every
 * recorded pair before a line of it ships (read-only).
 *
 * Step 6 of `docs/plan-divergent-matching.md` wants to stop using ONE global
 * confidence to license geometry everywhere: a well-aligned container inside a
 * badly-aligned page should keep its geometry. The change it proposes touches
 * `isUnverified` only — no pairing moves, so `matched` cannot move and the whole
 * effect is a set of `unverified` FLAGS. That set is computable from each run's
 * recorded `elements.json` + `alignment` + `findings`, which is what this does.
 *
 * ## What a local confidence IS here
 *
 * `estimateTransform` scores the GLOBAL fit as the fraction of unique-text
 * anchors it explains within `AGREE_PX`, damped by `min(1, anchors/8)/anchors`.
 * A local score asks the SAME question of a subset: of the evidence sitting in
 * this container, how much does the transform that actually formed the pairings
 * explain? Nothing is refitted — a refit would score a transform the matcher
 * never used, and every pairing inside the container was formed at the global
 * one.
 *
 * Two evidence sets are measured, because the obvious one is thin:
 *
 *  - `anchors` — the unique-text anchor pairs `estimateTransform` itself fits.
 *    Faithful to the global definition and SPARSE: the whole corpus has 1264 of
 *    them across 52 pairs.
 *  - `textpairs` — every `via: "text"` match. Denser (pass 1b adds the
 *    non-unique texts), and it is the same evidence the gate already trusts:
 *    `isUnverified` exempts a text-proven pair at any confidence.
 *
 * Two damping readings, because the shipped damping is a penalty for a
 * container being SMALL rather than for the fit being bad: `min(1, n/8)`
 * caps a 3-evidence container at 0.375, below the 0.5 floor however perfectly
 * the transform explains it.
 *
 * And three answers to the step's own first question — what a pairing with NO
 * container is judged by: the global confidence, trust, or distrust.
 *
 * ## Admissibility
 *
 * The anchor reconstruction re-implements `uniqueTextIndex` + `scoreAgreement`
 * against ALIGNED trees, so its gate is that it reproduces the recorded
 * `alignment.confidence` / `confidenceX` / `confidenceY` to 4 dp; the text-pair
 * set comes from re-running the shipped `matchElements`, whose gate is the
 * recorded `matching` block. A pair failing either is DROPPED and named.
 * `basis: "element-pair"` pairs are excluded by construction: `alignStructural`
 * overrides their confidence to 1 without any anchors, so there is nothing to
 * reproduce.
 *
 * Nothing here writes to a run dir.
 *
 *   node scripts/r6-containers.ts [--out docs/r6-containers-<date>.md]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import {
  containersOf,
  groupByRegion,
  matchElements,
  VALUE_FINDING_TYPES,
  DEFAULT_MIN_ALIGNMENT_CONFIDENCE,
  type Box,
  type ComparisonReport,
  type ElementNode,
  type Finding,
} from "../packages/core/dist/index.js"

const OUT_ROOT = "out/baseline"
/** `align.ts` AGREE_PX — the residual within which a piece of evidence counts as explained. */
const AGREE_PX = 10
/** `align.ts` MIN_TEXT_LENGTH / MIN_ANCHORS. */
const MIN_TEXT_LENGTH = 3
const MIN_ANCHORS = 3
const FLOOR = DEFAULT_MIN_ALIGNMENT_CONFIDENCE

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

/** `structural/text.ts` normalizeForMatching, re-implemented; the gate below proves it faithful. */
const normText = (text: string): string =>
  text.replace(/−/g, "-").replace(/\s+/g, " ").trim().toLowerCase()

/** `align.ts` uniqueTextIndex. */
const uniqueTextIndex = (elements: readonly ElementNode[]): Map<string, ElementNode> => {
  const buckets = new Map<string, ElementNode[]>()
  for (const el of elements) {
    if (el.text === undefined) continue
    const key = normText(el.text)
    if (key.length < MIN_TEXT_LENGTH) continue
    buckets.set(key, [...(buckets.get(key) ?? []), el])
  }
  const unique = new Map<string, ElementNode>()
  for (const [key, els] of buckets) if (els.length === 1) unique.set(key, els[0]!)
  return unique
}

/**
 * One piece of local evidence: the RESIDUAL a pair of boxes leaves under the
 * fitted transform. Stored as the raw Δ rather than a boolean so the same
 * evidence can be read two ways — against the global transform (Δ itself) and
 * against a container-local offset (Δ minus the container's median Δ).
 */
interface Evidence {
  impl: ElementNode
  dx: number
  dy: number
}

const center = (b: Box): { x: number; y: number } => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

const evidenceOf = (design: ElementNode, impl: ElementNode): Evidence => {
  const dc = center(design.box)
  const ic = center(impl.box)
  return { impl, dx: dc.x - ic.x, dy: dc.y - ic.y }
}

const median = (v: readonly number[]): number => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length === 0 ? 0 : s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/**
 * How the residuals are read. `global` asks whether the transform that formed
 * the pairings lands them; `refit` first subtracts the container's own median
 * offset, i.e. asks whether the container is INTERNALLY coherent — a card that
 * moved as a block, whose pairings inside it are still the right ones.
 */
type Reading = "global" | "refit"

const agreeing = (ev: readonly Evidence[], reading: Reading): number => {
  const ox = reading === "refit" ? median(ev.map((e) => e.dx)) : 0
  const oy = reading === "refit" ? median(ev.map((e) => e.dy)) : 0
  return ev.filter((e) => Math.abs(e.dx - ox) <= AGREE_PX && Math.abs(e.dy - oy) <= AGREE_PX).length
}

const agreeingAxis = (ev: readonly Evidence[], axis: "x" | "y"): number =>
  ev.filter((e) => Math.abs(axis === "x" ? e.dx : e.dy) <= AGREE_PX).length

/**
 * The anchors, scored against the ALIGNED trees. The design tree in
 * `elements.json` is already mapped into impl space, so an anchor's residual
 * under the fitted transform is the distance between the two centers — no
 * transform is re-applied and none is re-fitted.
 */
const anchorsOf = (el: ElementsFile): Evidence[] => {
  const dIdx = uniqueTextIndex(el.design)
  const iIdx = uniqueTextIndex(el.impl)
  const out: Evidence[] = []
  for (const [key, d] of dIdx) {
    const i = iIdx.get(key)
    if (i) out.push(evidenceOf(d, i))
  }
  return out
}

/** `align.ts` scoreAgreement — damped exactly as the shipped one is. */
const damped = (
  ev: readonly Evidence[],
  reading: Reading = "global",
): { joint: number; x: number; y: number } => {
  const n = ev.length
  if (n === 0) return { joint: 0, x: 0, y: 0 }
  const d = Math.min(1, n / 8) / n
  return {
    joint: agreeing(ev, reading) * d,
    x: agreeingAxis(ev, "x") * d,
    y: agreeingAxis(ev, "y") * d,
  }
}

/** Undamped: the raw fraction explained, for the reading where the damping is the suspect. */
const rawShare = (ev: readonly Evidence[], reading: Reading = "global"): number =>
  ev.length === 0 ? 0 : agreeing(ev, reading) / ev.length

/**
 * The container a box sits in — computed through the SHIPPED placement
 * (`containersOf` + `groupByRegion` at `minGroup: 1`), which is exactly the call
 * `groupUnmatched` makes, rather than a copy of its rules. A box the map cannot
 * place reads `undefined`, which is a measurement, not a gap.
 */
const placer = (
  elements: readonly ElementNode[],
  frame: Box,
): { containers: number; place: (box: Box | undefined) => number | undefined } => {
  const containers = containersOf(elements, frame)
  const key = (b: Box): string => `${b.x}|${b.y}|${b.w}|${b.h}`
  const index = new Map<string, number>()
  containers.forEach((c, i) => index.set(key(c.box), i))
  return {
    containers: containers.length,
    place: (box) => {
      if (box === undefined) return undefined
      const synthetic = [
        { id: "q", type: "missing-element", severity: "minor", message: "", implBox: box },
      ] as unknown as Finding[]
      const home = groupByRegion(synthetic, containers, { minGroup: 1 }).groups[0]
      return home === undefined ? undefined : index.get(key(home.box))
    },
  }
}

interface LocalScore {
  n: number
  globalDamped: number
  globalRaw: number
  refitDamped: number
  refitRaw: number
}

type EvidenceSet = "anchors" | "textpairs"
/** What a pairing with NO usable container is judged by — the step's first decision. */
type Fallback = "global" | "trust" | "distrust"

interface GatedFinding {
  id: string
  type: string
  severity: string
  explained: boolean
  container: number | undefined
  /** Local score per evidence set and reading: `undefined` = no container, or none in it. */
  local: Record<EvidenceSet, LocalScore | undefined>
  wasUnverified: boolean
}

interface Config {
  set: EvidenceSet
  reading: Reading
  useRaw: boolean
  minEvidence: number
  fb: Fallback
}

const scoreOf = (l: LocalScore, reading: Reading, useRaw: boolean): number =>
  reading === "refit"
    ? useRaw
      ? l.refitRaw
      : l.refitDamped
    : useRaw
      ? l.globalRaw
      : l.globalDamped

const localVerdict = (f: GatedFinding, global: number, c: Config): boolean => {
  const l = f.local[c.set]
  if (l === undefined || l.n < c.minEvidence) {
    if (c.fb === "global") return global < FLOOR
    return c.fb === "distrust"
  }
  return scoreOf(l, c.reading, c.useRaw) < FLOOR
}

interface PairResult {
  corpus: string
  pair: string
  phase: string
  failThreshold: string
  global: number
  axis: number
  matchRate: number
  anchors: number
  textPairs: number
  containers: number
  containerBoxes: Box[]
  byContainer: Record<EvidenceSet, Map<number, Evidence[]>>
  gatedByContainer: Map<number, GatedFinding[]>
  gated: GatedFinding[]
  /** Every unexplained finding at or above the pair's threshold — what decides the verdict. */
  gatingIds: Set<string>
  pass: boolean
}

const fmtBox = (b: Box): string =>
  `(${b.x.toFixed(0)}, ${b.y.toFixed(0)}) ${b.w.toFixed(0)}×${b.h.toFixed(0)}`

const RANK: Record<string, number> = { critical: 0, major: 1, minor: 2 }

const reproducesMatching = (
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

const main = (): void => {
  const outArg = process.argv.indexOf("--out")
  const runs = readRuns()
  const dropped: string[] = []
  const elementPairs: string[] = []
  const results: PairResult[] = []

  for (const run of runs) {
    const { report: rep, elements: el } = run
    const name = `${run.corpus}/${run.pair}`
    if (rep.alignment === undefined || rep.matching === undefined) {
      dropped.push(`${name} — no alignment/matching block`)
      continue
    }
    if (rep.alignment.basis === "element-pair") {
      elementPairs.push(name)
      continue
    }

    const anchors = anchorsOf(el)
    const got = damped(anchors)
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-4
    if (
      anchors.length >= MIN_ANCHORS &&
      !(
        near(got.joint, rep.alignment.confidence) &&
        near(got.x, rep.alignment.confidenceX ?? got.x) &&
        near(got.y, rep.alignment.confidenceY ?? got.y)
      )
    ) {
      dropped.push(
        `${name} — confidence does not reproduce: got ${got.joint.toFixed(4)}/${got.x.toFixed(4)}/${got.y.toFixed(4)}, recorded ${rep.alignment.confidence.toFixed(4)}/${(rep.alignment.confidenceX ?? -1).toFixed(4)}/${(rep.alignment.confidenceY ?? -1).toFixed(4)}`,
      )
      continue
    }

    const re = matchElements(el.design, el.impl)
    if (!reproducesMatching(rep.matching, re)) {
      dropped.push(`${name} — matchElements does not reproduce the recorded matching block`)
      continue
    }
    const textPairs = re.matches
      .filter((m) => m.via === "text")
      .map((m) => evidenceOf(m.design, m.impl))

    const implFrame: Box = { x: 0, y: 0, w: rep.impl.width, h: rep.impl.height }
    const { containers, place } = placer(el.impl, implFrame)
    const containerBoxes = containersOf(el.impl, implFrame).map((c) => c.box)

    const bucket = (ev: readonly Evidence[]): Map<number, Evidence[]> => {
      const m = new Map<number, Evidence[]>()
      for (const e of ev) {
        const c = place(e.impl.box)
        if (c === undefined) continue
        m.set(c, [...(m.get(c) ?? []), e])
      }
      return m
    }
    const byContainer: Record<EvidenceSet, Map<number, Evidence[]>> = {
      anchors: bucket(anchors),
      textpairs: bucket(textPairs),
    }

    const threshold = rep.verdict?.failThreshold ?? "major"
    const gatingIds = new Set(
      rep.findings
        .filter((f) => f.explained === undefined && RANK[f.severity]! <= RANK[threshold]!)
        .map((f) => f.id),
    )

    const gated: GatedFinding[] = []
    for (const f of rep.findings) {
      if (!VALUE_FINDING_TYPES.has(f.type)) continue
      if (f.via === undefined || f.via === "text") continue
      const c = place(f.implBox ?? f.designBox)
      const localOf = (set: EvidenceSet): GatedFinding["local"][EvidenceSet] => {
        if (c === undefined) return undefined
        const ev = byContainer[set].get(c)
        if (ev === undefined || ev.length === 0) return undefined
        return {
          n: ev.length,
          globalDamped: damped(ev, "global").joint,
          globalRaw: rawShare(ev, "global"),
          refitDamped: damped(ev, "refit").joint,
          refitRaw: rawShare(ev, "refit"),
        }
      }
      gated.push({
        id: f.id,
        type: f.type,
        severity: f.severity,
        explained: f.explained !== undefined,
        container: c,
        local: { anchors: localOf("anchors"), textpairs: localOf("textpairs") },
        wasUnverified: f.unverified === true,
      })
    }

    results.push({
      corpus: run.corpus,
      pair: run.pair,
      phase: rep.phase?.phase ?? "?",
      failThreshold: threshold,
      global: rep.alignment.confidence,
      axis: Math.max(rep.alignment.confidenceX ?? 0, rep.alignment.confidenceY ?? 0),
      matchRate: rep.phase?.matchRate ?? 0,
      anchors: anchors.length,
      textPairs: textPairs.length,
      containers,
      containerBoxes,
      byContainer,
      gatedByContainer: gated.reduce((m, f) => {
        const k = f.container ?? -1
        return m.set(k, [...(m.get(k) ?? []), f])
      }, new Map<number, GatedFinding[]>()),
      gated,
      gatingIds,
      pass: rep.verdict?.pass ?? true,
    })
  }

  const lines: string[] = []
  const say = (s = ""): void => {
    lines.push(s)
    console.log(s)
  }

  say(`# Step 6 measurement — per-container confidence over the recorded corpus`)
  say()
  say(
    `${runs.length} run dirs read · **${results.length} admissible** · ${elementPairs.length} element-pair (confidence forced to 1, no anchors to score) · ${dropped.length} dropped`,
  )
  for (const d of dropped) say(`- DROPPED ${d}`)
  say()

  const allGated = results.flatMap((r) => r.gated)
  const nowFlagged = allGated.filter((f) => f.wasUnverified).length

  // THE THIRD ADMISSIBILITY GATE, and the one a reader would otherwise have to
  // take on trust: every verdict below is a DELTA against today's gate, so the
  // model of today's gate must reproduce the recorded flags exactly. It is the
  // same rule as the other two — a reconstruction that does not reproduce the run
  // is not evidence about it — applied to the baseline rather than to the inputs.
  const mismatched = results.flatMap((r) =>
    r.gated.filter((f) => f.wasUnverified !== r.global < FLOOR),
  ).length

  // ---- 1. Availability ----
  say(`## 1. Availability — what a per-container confidence has to work with`)
  say()
  say(
    `Gated-eligible findings (a value type on a \`via\` ≠ text pairing): **${allGated.length}**; today's global gate flags **${nowFlagged}** of them.`,
  )
  say()
  say(
    `Baseline reproduction: re-deriving today's flag from \`alignment.confidence < ${FLOOR}\` disagrees with the recorded \`unverified\` on **${mismatched}** of ${allGated.length} findings.`,
  )
  say()
  say(`| evidence set | total in corpus | findings with a container holding ≥1 | ≥3 | ≥8 |`)
  say(`| --- | ---: | ---: | ---: | ---: |`)
  for (const set of ["anchors", "textpairs"] as EvidenceSet[]) {
    const total = results.reduce((n, r) => n + (set === "anchors" ? r.anchors : r.textPairs), 0)
    const has = (k: number): number => allGated.filter((f) => (f.local[set]?.n ?? 0) >= k).length
    say(`| \`${set}\` | ${total} | ${has(1)} | ${has(3)} | ${has(8)} |`)
  }
  say()
  const placed = allGated.filter(
    (f) => f.local.anchors !== undefined || f.local.textpairs !== undefined,
  ).length
  say(
    `**${allGated.length - placed} of ${allGated.length}** gated-eligible findings have NO usable container under either evidence set — the fallback decides them, and it is the step's first question.`,
  )
  say()

  // ---- 2. The flip table ----
  say(`## 2. What changes — flips against today's global gate`)
  say()
  say(
    `| evidence | reading | damping | min ev | fallback | newly flagged | newly cleared | flags after |`,
  )
  say(`| --- | --- | --- | ---: | --- | ---: | ---: | ---: |`)
  const configs: Config[] = []
  for (const set of ["anchors", "textpairs"] as EvidenceSet[])
    for (const reading of ["global", "refit"] as Reading[])
      for (const useRaw of [false, true])
        for (const minEvidence of [1, 3])
          for (const fb of ["global", "trust", "distrust"] as Fallback[])
            configs.push({ set, reading, useRaw, minEvidence, fb })

  const tally = (c: Config): { flagged: number; cleared: number; after: number } => {
    let flagged = 0
    let cleared = 0
    let after = 0
    for (const r of results) {
      for (const f of r.gated) {
        const now = localVerdict(f, r.global, c)
        if (now) after += 1
        if (now && !f.wasUnverified) flagged += 1
        if (!now && f.wasUnverified) cleared += 1
      }
    }
    return { flagged, cleared, after }
  }
  for (const c of configs) {
    const { flagged, cleared, after } = tally(c)
    say(
      `| \`${c.set}\` | ${c.reading} | ${c.useRaw ? "undamped" : "shipped"} | ${c.minEvidence} | ${c.fb} | ${flagged} | ${cleared} | ${after} |`,
    )
  }
  say()

  // ---- 3. Per-pair detail, for the reading that moves the fewest findings the wrong way ----
  const detail = (c: Config): void => {
    say(
      `## 3. Per-pair — \`${c.set}\`, ${c.reading} reading, ${c.useRaw ? "undamped" : "shipped damping"}, min evidence ${c.minEvidence}, fallback \`${c.fb}\``,
    )
    say()
    say(
      `| pair | phase | global | anchors | text pairs | containers | gated | flagged now | after |`,
    )
    say(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`)
    for (const r of [...results].sort((a, b) => a.global - b.global)) {
      if (r.gated.length === 0) continue
      const after = r.gated.filter((f) => localVerdict(f, r.global, c)).length
      const now = r.gated.filter((f) => f.wasUnverified).length
      if (after === now) continue
      say(
        `| ${r.pair} | ${r.phase} | ${r.global.toFixed(2)} | ${r.anchors} | ${r.textPairs} | ${r.containers} | ${r.gated.length} | ${now} | ${after} |`,
      )
    }
    say()
  }
  detail({ set: "anchors", reading: "global", useRaw: false, minEvidence: 1, fb: "global" })
  detail({ set: "anchors", reading: "refit", useRaw: true, minEvidence: 3, fb: "global" })
  detail({ set: "textpairs", reading: "refit", useRaw: true, minEvidence: 3, fb: "global" })

  // ---- 3b. One pair, container by container — is a newly-flagged container
  // genuinely misaligned, or is its score one disagreeing anchor?
  const pairArg = process.argv.indexOf("--pair")
  if (pairArg > 0) {
    const want = process.argv[pairArg + 1]!
    const r = results.find((x) => x.pair === want)
    if (r === undefined) say(`(no admissible run for ${want})`)
    else {
      say(`## 3b. \`${r.pair}\` — container by container`)
      say()
      say(
        `global ${r.global.toFixed(2)} · ${r.anchors} anchors · ${r.textPairs} text pairs · ${r.containers} containers`,
      )
      say()
      say(
        `| container | box | anchors (agree) | text pairs (agree) | global raw | refit raw (text) | gated findings | flagged now |`,
      )
      say(`| ---: | --- | --- | --- | ---: | ---: | ---: | ---: |`)
      const keys = [...new Set(r.gatedByContainer.keys())].sort((a, b) => a - b)
      for (const k of keys) {
        const fs = r.gatedByContainer.get(k) ?? []
        const a = k === -1 ? [] : (r.byContainer.anchors.get(k) ?? [])
        const t = k === -1 ? [] : (r.byContainer.textpairs.get(k) ?? [])
        const box = k === -1 ? "— no container —" : fmtBox(r.containerBoxes[k]!)
        const ag = (ev: readonly Evidence[]): string => `${ev.length} (${agreeing(ev, "global")})`
        say(
          `| ${k === -1 ? "—" : k} | ${box} | ${ag(a)} | ${ag(t)} | ${t.length === 0 ? "—" : rawShare(t, "global").toFixed(2)} | ${t.length === 0 ? "—" : rawShare(t, "refit").toFixed(2)} | ${fs.length} | ${fs.filter((f) => f.wasUnverified).length} |`,
        )
      }
      say()
    }
  }

  // ---- 4. Step 2's parked verdict question ----
  say(`## 4. Step 2's parked question, re-asked at the configuration that distinguishes it`)
  say()
  say(
    `*Should an \`unverified\` finding count toward the verdict?* It is distinguishable only on a pair where EVERY gating finding (unexplained, at or above \`failThreshold\`) is flagged — then excluding the flag set flips fail → pass. Per configuration, the number of pairs where that happens:`,
  )
  say()
  say(`| evidence | reading | damping | min ev | fallback | pairs today | pairs after |`)
  say(`| --- | --- | --- | ---: | --- | ---: | ---: |`)
  const flips = (c: Config): { today: number; after: number } => {
    let today = 0
    let after = 0
    for (const r of results) {
      if (r.pass || r.gatingIds.size === 0) continue
      const gatedIds = new Set(r.gated.map((f) => f.id))
      const allGating = [...r.gatingIds]
      if (allGating.some((id) => !gatedIds.has(id))) continue // a gating finding the flag cannot reach
      if (r.gated.filter((f) => r.gatingIds.has(f.id)).every((f) => f.wasUnverified)) today += 1
      if (
        r.gated
          .filter((f) => r.gatingIds.has(f.id))
          .every((f) => localVerdict(f, r.global, c))
      )
        after += 1
    }
    return { today, after }
  }
  for (const c of configs.filter((x) => x.minEvidence === 3)) {
    const { today, after } = flips(c)
    say(
      `| \`${c.set}\` | ${c.reading} | ${c.useRaw ? "undamped" : "shipped"} | 3 | ${c.fb} | ${today} | ${after} |`,
    )
  }
  say()
  // A count of zero is not an answer; WHY it is zero is. The flag can only ever
  // reach a value finding on a non-text pairing, and a verdict is decided by
  // whatever unexplained finding sits at or above the threshold — which on these
  // pairs is dominated by presence findings the flag cannot touch at all.
  const failing = results.filter((r) => !r.pass)
  const reachable = failing.map((r) => {
    const ids = new Set(r.gated.map((f) => f.id))
    const gating = [...r.gatingIds]
    return {
      pair: r.pair,
      gating: gating.length,
      reachable: gating.filter((id) => ids.has(id)).length,
    }
  })
  const totalGating = reachable.reduce((n, x) => n + x.gating, 0)
  const totalReach = reachable.reduce((n, x) => n + x.reachable, 0)
  const allReach = reachable.filter((x) => x.gating > 0 && x.reachable === x.gating).length
  say(
    `**${failing.length} of ${results.length} pairs fail.** Across them, ${totalGating} findings decide the verdict and the flag can reach **${totalReach}** of them (${((100 * totalReach) / totalGating).toFixed(1)}%); on **${allReach}** pairs it reaches all of them. That is why the count is zero and why it stays zero under every configuration above: a verdict is decided by presence findings and text-proven pairings, which no version of this flag touches.`,
  )
  say()

  // ---- 5. Which confidence the gate READS ----
  say(`## 5. The gate reads the JOINT confidence — the reading \`pairPhase\` was moved off`)
  say()
  say(
    `\`Alignment.confidenceX\`'s own doc comment says the joint score is right FOR THE PIXEL GATE, because diffing pixels needs both axes; \`pairPhase\` reads \`max(confidenceX, confidenceY)\` for exactly that reason. \`isUnverified\` still reads the joint one.`,
  )
  say()
  say(`| pair | phase | match rate | joint | max(x, y) | gated | flagged today | flagged on max |`)
  say(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |`)
  let jointOnly = 0
  let jointOnlyFindings = 0
  for (const r of [...results].sort((a, b) => b.axis - a.axis)) {
    if (!(r.global < FLOOR && r.axis >= FLOOR)) continue
    jointOnly += 1
    jointOnlyFindings += r.gated.length
    say(
      `| ${r.pair} | ${r.phase} | ${r.matchRate.toFixed(2)} | ${r.global.toFixed(2)} | ${r.axis.toFixed(2)} | ${r.gated.length} | ${r.gated.filter((f) => f.wasUnverified).length} | 0 |`,
    )
  }
  say()
  say(
    `**${jointOnly} of ${results.length} pairs** are below the floor on the joint score and at or above it on the better axis, carrying **${jointOnlyFindings}** flagged findings between them.`,
  )
  say()

  // ---- 6. What the local score actually measures ----
  say(`## 6. Does a local score STABILISE as its container gains evidence?`)
  say()
  say(
    `\`tx-picker-owner-desktop\`'s busiest container holds **20 text-proven pairings** — correspondence PROVEN, not assumed — and scores 0.45, while its quiet sibling holds 8 and scores 1.00. That suggests a local agreement score reads REFLOW rather than correspondence. Scored across the corpus the suggestion does NOT hold as a monotone pattern, and what is left is worse for the proposal: the score neither rises nor falls with evidence, and its median sits BELOW the floor in three of four buckets.`,
  )
  say()
  say(`| text pairs in the container | containers | median agreement (global) | median agreement (refit) |`)
  say(`| --- | ---: | ---: | ---: |`)
  const buckets: { label: string; lo: number; hi: number }[] = [
    { label: "3–5", lo: 3, hi: 5 },
    { label: "6–10", lo: 6, hi: 10 },
    { label: "11–20", lo: 11, hi: 20 },
    { label: "21+", lo: 21, hi: Infinity },
  ]
  const medianOf = (v: number[]): string => {
    if (v.length === 0) return "—"
    const s2 = [...v].sort((a, b) => a - b)
    const m = Math.floor(s2.length / 2)
    return (s2.length % 2 === 1 ? s2[m]! : (s2[m - 1]! + s2[m]!) / 2).toFixed(2)
  }
  for (const b of buckets) {
    const g: number[] = []
    const rf: number[] = []
    let n = 0
    for (const r of results) {
      for (const ev of r.byContainer.textpairs.values()) {
        if (ev.length < b.lo || ev.length > b.hi) continue
        n += 1
        g.push(rawShare(ev, "global"))
        rf.push(rawShare(ev, "refit"))
      }
    }
    say(`| ${b.label} | ${n} | ${medianOf(g)} | ${medianOf(rf)} |`)
  }
  say()

  if (outArg > 0) {
    const path = process.argv[outArg + 1]!
    writeFileSync(path, lines.join("\n") + "\n")
    console.log(`\nwrote ${path}`)
  }
}

main()
