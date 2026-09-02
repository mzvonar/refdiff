#!/usr/bin/env node
/**
 * make-demo-root — writes `fixtures/demo-root/`, the COMMITTED out root the
 * annotator serves while it is measured against the RefDiff comps
 * (docs/plan-annotator-redesign.md, phase 0).
 *
 * The comps draw designer fixture data: twelve Library items, one of them
 * opened in the Comparison Tool with fifteen findings (four of them ONE-SIDED,
 * the comp's rows 12–15) and four comments (the fourth design-anchored). For
 * the alignment to find shared text anchors the app has to render the SAME
 * copy, so every run dir here mirrors `RefDiff Library.dc.html`'s `ITEMS` and
 * `RefDiff Comparison Tool.dc.html`'s `findings` / `items` — in refdiff's real
 * shapes (`ComparisonReport`, `AnnotationSet`; the types are imported, not
 * hand-rolled), so the model reading `findings.json` sees a real report.
 *
 *   node fixtures/make-demo-root.ts             # JSON only (offline)
 *   node fixtures/make-demo-root.ts --now       # timestamps relative to the wall
 *                                              # clock, so the Library's "12 min
 *                                              # ago" reads as the comp's while a
 *                                              # measure runs (never commit that)
 *   node fixtures/make-demo-root.ts --capture   # also design.png / impl.png /
 *                                               # elements.json for the opened
 *                                               # pair (needs the network: the
 *                                               # artboards hydrate from unpkg)
 *
 * Pure builders on top, effects (files, browser) at the bottom. Where the
 * comps' vocabulary has no refdiff equivalent the choice is written down
 * beside the data, never guessed silently.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import type {
  Alignment,
  Box,
  ComparisonReport,
  ElementNode,
  Finding,
  FindingMember,
  Severity,
  SuppressedFinding,
} from "../packages/core/dist/index.js"
import { identityKey } from "../packages/core/dist/package/delta.js"
import type { Annotation, AnnotationSet, Shape } from "../packages/annotator/dist/annotations.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "demo-root")
const PARTS = resolve(HERE, "..", "design", "refdiff", "parts")

/**
 * The comps' clock. Their error-state copy reads `14:22:05`; every "N min
 * ago" in the Library is measured from here, so the timestamps are stable
 * across regenerations instead of drifting with the wall clock.
 */
export const DEMO_NOW = "2026-08-28T14:22:05.000Z"
const MIN = 60_000
const HOUR = 60 * MIN

/** The opened pair — the comp's `doc`; the Comparison Tool draws this one. */
export const OPENED_PAIR = "onboarding-document-step"
/** The artboards the Comparison Tool `dc-import`s, and their size. */
export const ARTBOARD = { width: 680, height: 740 }

type RunState = "analyzed" | "processing" | "queued" | "clean"

interface DemoItem {
  /** Run dir name — also the app route `/#/<slug>`. */
  slug: string
  /** The comp's display name: `report.pair`, the text the alignment anchors on. */
  name: string
  route: string
  /** `figma` / `claude` in the comp → refdiff's `figma` / `dc-html` design source. */
  src: "figma" | "dc-html"
  /**
   * The comp's run state. refdiff has no "processing" / "queued" state — a run
   * dir exists once `compare` wrote it — so those two are written as
   * zero-finding passing runs; phase 2 decides how a pending run is
   * represented (see the plan's design gaps).
   */
  state: RunState
  critical: number
  major: number
  minor: number
  comments: number
  confidence: number
  /** `+add new / −res resolved` on the card — becomes `delta`. */
  add: number
  res: number
  /**
   * ms before the clock. The broken run has one too: `createdAt` is the second
   * key of findings.json and survives the truncation, which is how the
   * degraded card keeps its slot in the newest-first list (the comp draws it
   * between the queued modal and yesterday's errors page).
   */
  ago?: number
  /** Written with a truncated findings.json on purpose — the degraded card. */
  broken?: true
}

/** `ITEMS` from `RefDiff Library.dc.html`, verbatim, in the comp's order. */
export const ITEMS: readonly DemoItem[] = [
  { slug: OPENED_PAIR, name: "Onboarding — Document step", route: "/onboarding/document", src: "figma", state: "analyzed", critical: 3, major: 5, minor: 4, comments: 4, confidence: 0.42, add: 3, res: 1, ago: 12 * MIN },
  { slug: "onboarding-selfie-step", name: "Onboarding — Selfie step", route: "/onboarding/selfie", src: "figma", state: "analyzed", critical: 1, major: 3, minor: 0, comments: 1, confidence: 0.91, add: 1, res: 4, ago: 25 * MIN },
  { slug: "onboarding-review-step", name: "Onboarding — Review step", route: "/onboarding/review", src: "dc-html", state: "processing", critical: 0, major: 0, minor: 0, comments: 2, confidence: 0.88, add: 0, res: 0, ago: 30 * MIN },
  { slug: "button", name: "Button", route: "ds/Button", src: "dc-html", state: "analyzed", critical: 1, major: 0, minor: 1, comments: 0, confidence: 0.96, add: 1, res: 2, ago: 40 * MIN },
  { slug: "selection-card", name: "Selection card", route: "ds/SelectionCard", src: "figma", state: "analyzed", critical: 0, major: 2, minor: 0, comments: 1, confidence: 0.61, add: 2, res: 0, ago: 40 * MIN },
  { slug: "stepper", name: "Stepper", route: "ds/Stepper", src: "figma", state: "clean", critical: 0, major: 0, minor: 0, comments: 0, confidence: 0.94, add: 0, res: 3, ago: 40 * MIN },
  { slug: "login", name: "Login", route: "/auth/login", src: "dc-html", state: "clean", critical: 0, major: 0, minor: 0, comments: 0, confidence: 0.97, add: 0, res: 2, ago: 1 * HOUR },
  { slug: "verification-dashboard", name: "Verification dashboard", route: "/dashboard", src: "dc-html", state: "analyzed", critical: 0, major: 4, minor: 3, comments: 5, confidence: 0.55, add: 5, res: 1, ago: 2 * HOUR },
  { slug: "result-detail", name: "Result detail", route: "/results/:id", src: "figma", state: "analyzed", critical: 3, major: 1, minor: 2, comments: 0, confidence: 0.83, add: 2, res: 6, ago: 2 * HOUR + 5 * MIN },
  { slug: "confirm-modal", name: "Confirm modal", route: "ds/ConfirmModal", src: "dc-html", state: "queued", critical: 0, major: 0, minor: 0, comments: 0, confidence: 0.9, add: 0, res: 0, ago: 3 * HOUR },
  { slug: "onboarding-liveness-step", name: "Onboarding — Liveness step", route: "/onboarding/liveness", src: "figma", state: "analyzed", critical: 0, major: 0, minor: 0, comments: 0, confidence: 0, add: 0, res: 0, broken: true, ago: 5 * HOUR },
  { slug: "error-empty-states", name: "Error & empty states", route: "/onboarding/errors", src: "figma", state: "analyzed", critical: 0, major: 1, minor: 4, comments: 1, confidence: 0.68, add: 1, res: 1, ago: 24 * HOUR },
]

/* ------------------------------------------------------------ builders -- */

// `ago` reproduces the comp's card ORDER under the Library's newest-first
// sort (phase 2): the comp gives its Processing / Queued items no time at all
// ("running" / "waiting"), so they take the slot the comp draws them in —
// review between selfie and button, modal between detail and the broken
// liveness — and the 2 h tie is broken the way the comp lists it (dash, then
// detail; both still print "2 h ago"). The broken run has no readable time
// and sorts last, one slot after where the comp draws it.
// The clock every timestamp hangs off: the comps' fixed one, so the committed
// files are stable — or the wall clock under --now, for a measure run.
let clock = DEMO_NOW
const iso = (msBefore: number): string => new Date(Date.parse(clock) - msBefore).toISOString()

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h })

/** Identity alignment — the two artboards share one coordinate system by construction. */
const alignment = (confidence: number): Alignment => ({
  scale: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  confidence,
  confidenceX: confidence,
  confidenceY: Math.min(1, confidence + 0.3),
  basis: "anchors",
})

/**
 * The Comparison Tool's `findings` for the opened pair, in refdiff's real
 * vocabulary: the comp's `prop expected → actual` line becomes the typed
 * check's own keys (`backgroundColor`, `fontSize`, `borderRadius`, `gap`,
 * `y`…), the comp's high / medium / low becomes critical / major / minor, and
 * `num` becomes `mark`. Aggregates (`g1`, `g2`) carry `instances` + `members`;
 * the three suppressed rows are `SuppressedFinding`s tagged with the rule kind
 * refdiff actually has — the comp's "Preset · …" labels are placeholders
 * (plan, section C).
 */
export function openedFindings(): { findings: Finding[]; suppressed: SuppressedFinding[] } {
  const f = (
    id: string,
    mark: number,
    type: Finding["type"],
    severity: Severity,
    message: string,
    b: Box,
    expected: Record<string, string | number>,
    actual: Record<string, string | number>,
    extra: Partial<Finding> = {},
  ): Finding => {
    const f: Finding = { id, type, severity, mark, designBox: b, implBox: b, expected, actual, message, ...extra }
    // The run-stable identity `packageForModel` stamps on a real run — without it the rail's
    // triage row can only say "no stable key" (phase 4).
    return { ...f, key: identityKey(f) }
  }

  const grid = (n: number, at: (i: number) => Box): FindingMember[] =>
    Array.from({ length: n }, (_, i) => ({ designBox: at(i), implBox: at(i) }))

  /**
   * A ONE-SIDED finding: exactly one box, which is what makes it one-sided. A
   * `missing-element` has a designBox and no implBox; an `extra-element` the
   * reverse. The GHOST language exists for precisely these — the comp draws a
   * hatched footprint on the pane that lacks the element — so the fixture has to
   * carry them or the ghost pairs have nothing to show. `f()` above sets BOTH
   * boxes, which would make every row two-sided.
   */
  const one = (
    id: string,
    mark: number,
    side: "design" | "impl",
    severity: Severity,
    message: string,
    b: Box,
    extra: Partial<Finding> = {},
  ): Finding => {
    const base: Finding =
      side === "design"
        ? { id, type: "missing-element", severity, mark, message, designBox: b, expected: { element: "present" }, actual: { element: "missing" }, ...extra }
        : { id, type: "extra-element", severity, mark, message, implBox: b, expected: { element: "—" }, actual: { element: "present" }, ...extra }
    return { ...base, key: identityKey(base) }
  }

  const findings: Finding[] = [
    f("f1", 1, "color", "critical", "Primary button color mismatch", box(36, 586, 280, 48), { backgroundColor: "#4F46E5" }, { backgroundColor: "#6366F1" }, { role: "box", text: "Continue" }),
    f("f2", 2, "spacing", "critical", "Dropzone inner padding reduced", box(36, 368, 608, 190), { padding: "32px" }, { padding: "20px" }, { role: "box" }),
    f("f3", 3, "typography", "major", "Heading font-size drift", box(36, 130, 430, 40), { fontSize: 28 }, { fontSize: 24 }, { role: "text", text: "Upload your ID document" }),
    f("f4", 4, "border-radius", "major", "Card corner radius mismatch", box(36, 204, 608, 140), { borderRadius: 12 }, { borderRadius: 6 }, { role: "box" }),
    f("f5", 5, "spacing", "minor", "Step indicator gap tighter", box(36, 84, 430, 26), { gap: 24, axis: "x" }, { gap: 16, axis: "x" }, { role: "box" }),
    f("f6", 6, "color", "minor", "Footer text color drift", box(36, 664, 608, 24), { color: "#6B7280" }, { color: "#9CA3AF" }, { role: "text" }),
    f("g1", 7, "color", "major", "Label color drift", box(56, 214, 120, 16), { color: "#6B7280" }, { color: "#94A3B8" }, {
      role: "text",
      instances: 14,
      members: grid(14, (i) => box(56 + (i % 3) * 196, 214 + Math.floor(i / 3) * 36, 120, 16)),
    }),
    f("g2", 8, "position", "minor", "Row baseline shifted 23px", box(36, 380, 608, 22), { x: 36, y: 380 }, { x: 36, y: 403 }, {
      role: "box",
      instances: 5,
      members: grid(5, (i) => box(36, 414 + i * 34, 608, 22)),
    }),
    // Rows 12–15, the comp's one-sided findings (ids o1..o4, which is what
    // `data-vc-step` renders so a step can select one). Boxes, severities and
    // titles are the comp's own: high/medium/low map to critical/major/minor as
    // everywhere else here.
    one("o1", 12, "design", "critical", "Retake photo button missing", box(332, 586, 200, 48), { role: "box" }),
    one("o2", 13, "design", "major", "Field hint tooltip missing", box(476, 136, 26, 26), { role: "icon" }),
    one("o3", 14, "impl", "major", "Debug ribbon not in design", box(540, 16, 104, 30), { role: "box" }),
    one("o4", 15, "impl", "minor", "Extra divider above footer", box(36, 648, 608, 3), { role: "box" }),
  ]
  const suppressed: SuppressedFinding[] = [
    {
      ...f("s1", 9, "size", "minor", "Text renders 0.4px wider", box(36, 130, 430, 40), { w: 430, h: 40 }, { w: 430.4, h: 40 }, { role: "text" }),
      suppressedBy: "accepted",
      rule: "size w/h ±0.5px on text — font smoothing widens glyphs, not a layout change",
    },
    {
      ...f("s2", 10, "size", "minor", "Content 15px narrower", box(0, 0, 680, 740), { w: 680, h: 740 }, { w: 665, h: 740 }, { role: "box" }),
      suppressedBy: "accepted",
      rule: "size w 680→665 on the page box — the scrollbar gutter, present in the browser and absent in the comp",
    },
    {
      ...f("s3", 11, "text-content", "major", "Placeholder copy differs", box(56, 470, 300, 22), { text: "Front side of ID" }, { text: "Front of document" }, { role: "text", text: "Front side of ID" }),
      suppressedBy: "text-pattern",
      rule: "^Front (side of ID|of document)$",
    },
  ]
  return { findings, suppressed }
}

/**
 * Filler findings for the pairs the comps never open. Only their counts are
 * ever read (`/api/pairs` → the Library card), so they are typed but say so.
 */
function genericFindings(item: DemoItem): Finding[] {
  const kinds: Record<Severity, Finding["type"]> = { critical: "missing-element", major: "color", minor: "spacing" }
  const out: Finding[] = []
  const push = (severity: Severity, n: number) => {
    for (let i = 0; i < n; i++) {
      const mark = out.length + 1
      out.push({
        id: `d${mark}`,
        type: kinds[severity],
        severity,
        mark,
        implBox: box(24, 24 + mark * 40, 200, 24),
        message: `Demo fixture — ${severity} ${kinds[severity]} #${mark} (${item.name})`,
      })
    }
  }
  push("critical", item.critical)
  push("major", item.major)
  push("minor", item.minor)
  return out
}

export function reportFor(item: DemoItem): ComparisonReport {
  const opened = item.slug === OPENED_PAIR
  const { findings, suppressed } = opened ? openedFindings() : { findings: genericFindings(item), suppressed: [] }
  const createdAt = iso(item.ago ?? 0)
  const failing = findings.some((f) => f.severity === "critical" || f.severity === "major")
  // Every item has a previous run: the card's `+add / −res` (a `Steady
  // +0 new / −0 resolved` is still a delta). For the opened pair the Library
  // card AND the Comparison Tool's `Regression` tags on f1 / g2 say so; only
  // the Tool's `showDeltaStrip` prop (default false) disagrees, so phase 3
  // accepts the strip rather than the fixture pretending there was no run
  // before (plan, gap 23, decided in phase 2). The broken run has none.
  // The comps show run ORDINALS ("Run 47 vs 46"), and core numbers runs since
  // 2026-09-02, so the fixture must carry them too — otherwise the served app
  // falls back to the timestamp and the pair reports a text-content difference
  // against the comp's own label. 47/46 is the Tool comp's own demo pair.
  const runNo = opened ? 47 : 12
  const delta = item.broken
    ? undefined
    : {
        previousRun: iso((item.ago ?? 0) + 6 * HOUR),
        previousRunNumber: runNo - 1,
        resolved: Array.from({ length: item.res }, (_, i) => `prev-${i + 1}`),
        introduced: opened ? ["f1", "f2", "g2"] : findings.slice(0, item.add).map((f) => f.id),
        ...(opened ? { regressions: ["f1", "g2"] } : {}),
      }
  return {
    pair: item.name,
    createdAt,
    run: runNo,
    design: {
      source: item.src,
      ref: item.src === "figma" ? `figma://veriflow/${item.slug}` : `${item.slug}.dc.html#${item.name}`,
      width: ARTBOARD.width,
      height: ARTBOARD.height,
      dpr: 2,
      ...(opened ? { scope: { mode: "screen-label" as const, selector: '[data-screen-label="Design ref"]', fluid: true } } : {}),
    },
    impl: {
      source: item.route.startsWith("ds/") ? "storybook" : "live-url",
      ref: item.route,
      width: ARTBOARD.width,
      height: ARTBOARD.height,
      dpr: 2,
    },
    alignment: alignment(item.confidence),
    findings,
    suppressed,
    policy: opened
      ? {
          textPatterns: ["^Front (side of ID|of document)$"],
          accepted: [
            { type: "size", role: "text", expected: { w: 430, h: 40 }, actual: { w: 430.4, h: 40 }, reason: "font smoothing widens glyphs, not a layout change" },
            { type: "size", role: "box", expected: { w: 680, h: 740 }, actual: { w: 665, h: 740 }, reason: "the scrollbar gutter, present in the browser and absent in the comp" },
          ],
        }
      : {},
    verdict: { pass: !failing, failThreshold: "major" },
    ...(delta ? { delta } : {}),
    artifacts: { designPng: "design.png", implPng: "impl.png" },
  }
}

/**
 * The Comparison Tool's `items` for the opened pair: three comments, statuses
 * implemented / open / done, two with the model's reply. `reply` is the field
 * phase 4 adds to `Annotation` (plan, gap 19) — written here already so the
 * fixture does not need regenerating then. Generic pairs get numbered notes to
 * match the card's comment count.
 *
 * Anchors are snapped to the captured element tree when one exists (the
 * generator ran with --capture at least once), otherwise the notes are
 * anchor-less — the annotator accepts both.
 */
export function annotationsFor(
  item: DemoItem,
  snap: (shape: Shape) => Annotation["anchor"] | undefined,
): AnnotationSet {
  const at = (msBefore: number) => iso(msBefore)
  const note = (
    id: string,
    shape: Shape,
    text: string,
    status: Annotation["status"],
    minutesAgo: number,
    reply?: string,
    side: Annotation["side"] = "impl",
  ): Annotation & { reply?: string } => {
    const anchor = snap(shape)
    const createdAt = at(minutesAgo * MIN)
    return {
      id,
      side,
      shape,
      ...(anchor ? { anchor } : {}),
      note: text,
      status,
      createdAt,
      updatedAt: createdAt,
      ...(status !== "open" ? { implementedAt: at((minutesAgo - 5) * MIN) } : {}),
      ...(status === "done" ? { doneAt: at((minutesAgo - 8) * MIN) } : {}),
      ...(reply ? { reply } : {}),
    }
  }
  const rect = (x: number, y: number, w: number, h: number): Shape => ({ kind: "rect", x, y, w, h })
  if (item.slug === OPENED_PAIR)
    return {
      version: 1,
      pair: item.name,
      annotations: [
        note("c1", rect(36, 14, 150, 36), "Logo should use the darker navy from the brand kit", "implemented", 50, "Fetched brand token — logo color maps to #1E2A5A. Queued for the next impl build."),
        note("c2", rect(36, 204, 608, 140), "Check spacing between document cards at tablet width", "open", 30),
        note("c3", rect(36, 586, 280, 48), "Continue button should be full width on mobile", "done", 90, "Confirmed — impl build 342 makes the button fluid below 480px."),
        // Comment 4 is anchored on the DESIGN side and is a POINT (0×0) — the
        // comment half of the ghost language: selecting it while the impl pane is
        // on screen has nothing to show without a ghost.
        note("c4", { kind: "point", x: 618, y: 618 }, "Is the corner check icon final art?", "open", 15, undefined, "design"),
      ],
    }
  return {
    version: 1,
    pair: item.name,
    annotations: Array.from({ length: item.comments }, (_, i) =>
      note(`c${i + 1}`, { kind: "point", x: 60, y: 60 + i * 40 }, `Demo fixture — comment ${i + 1} on ${item.name}`, "open", 20 + i * 10),
    ),
  }
}

/** The comp's degraded card: `findings.json · unexpected end of JSON`. */
export const truncate = (json: string): string => json.slice(0, Math.floor(json.length * 0.6))

/* ------------------------------------------------------------- effects -- */

interface ElementsFile {
  alignment: Alignment
  design: ElementNode[]
  impl: ElementNode[]
}

async function readElements(dir: string): Promise<ElementsFile | undefined> {
  try {
    return JSON.parse(await readFile(join(dir, "elements.json"), "utf8")) as ElementsFile
  } catch {
    return undefined
  }
}

/**
 * design.png / impl.png / elements.json for the opened pair, captured from the
 * exact artboards the comp `dc-import`s, through the same adapter `compare`
 * uses — so the canvas content matches the comp by construction.
 */
async function captureOpened(dir: string): Promise<void> {
  const core = await import("../packages/core/dist/index.js")
  const browser = await core.launchBrowser()
  try {
    const sides = [
      { side: "design", file: "Artboard Design.dc.html", frame: "Design ref", png: "design.png" },
      { side: "impl", file: "Artboard Impl.dc.html", frame: "Implementation ref", png: "impl.png" },
    ] as const
    const captured: Partial<Record<"design" | "impl", ElementNode[]>> = {}
    for (const s of sides) {
      const result = await core.captureDcHtml(
        browser,
        { kind: "dc-html", dir: PARTS, file: s.file, frame: s.frame, viewport: ARTBOARD },
        { pngPath: join(dir, s.png), ref: `parts/${s.file}#${s.frame}` },
      )
      if (core.isErr(result)) throw new Error(`capture ${s.side}: ${JSON.stringify(result.error)}`)
      const c = result.value
      if (c.width !== ARTBOARD.width || c.height !== ARTBOARD.height)
        throw new Error(`capture ${s.side}: expected ${ARTBOARD.width}×${ARTBOARD.height}, got ${c.width}×${c.height} (fluid detection did not fire?)`)
      captured[s.side] = c.elements
      console.log(`captured ${s.png}: ${c.width}×${c.height} @${c.dpr}x, ${c.elements.length} elements`)
    }
    const elements: ElementsFile = { alignment: alignment(0.42), design: captured.design!, impl: captured.impl! }
    await writeFile(join(dir, "elements.json"), JSON.stringify(elements, null, 2))
  } finally {
    await browser.close()
  }
}

async function main(): Promise<void> {
  const capture = process.argv.includes("--capture")
  if (process.argv.includes("--now")) clock = new Date().toISOString()
  await mkdir(ROOT, { recursive: true })
  for (const item of ITEMS) {
    const dir = join(ROOT, item.slug)
    // Start clean so a renamed item cannot leave a stale run dir behind — but keep the
    // captured PNGs and element tree: they only change with --capture.
    await mkdir(dir, { recursive: true })
    for (const stale of ["findings.json", "annotations.json", "annotations.md", "triage.json", "focus.json"])
      await rm(join(dir, stale), { force: true })
    const report = reportFor(item)
    const json = JSON.stringify(report, null, 2)
    if (item.broken) {
      await writeFile(join(dir, "findings.json"), truncate(json))
      console.log(`${item.slug}: findings.json TRUNCATED on purpose (the degraded card)`)
      continue
    }
    await writeFile(join(dir, "findings.json"), json)
    if (item.slug === OPENED_PAIR && capture) await captureOpened(dir)
    const elements = item.slug === OPENED_PAIR ? await readElements(dir) : undefined
    const snap = (shape: Shape) => {
      if (!elements) return undefined
      const { anchorFor } = annotator
      return anchorFor(shape, elements.impl)
    }
    const notes = annotationsFor(item, snap)
    if (notes.annotations.length) await writeFile(join(dir, "annotations.json"), JSON.stringify(notes, null, 2))
    console.log(
      `${item.slug}: ${report.findings.length} findings (${item.critical}/${item.major}/${item.minor}), ${report.suppressed.length} suppressed, confidence ${item.confidence}, ${notes.annotations.length} comments${elements ? ", anchored to elements.json" : ""}`,
    )
  }
  const known = new Set(ITEMS.map((i) => i.slug))
  for (const name of await readdir(ROOT)) if (!known.has(name)) console.warn(`WARNING: ${name} is not a demo item — delete it by hand`)
}

const annotator = await import("../packages/annotator/dist/annotations.js")
await main()
