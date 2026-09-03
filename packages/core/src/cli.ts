#!/usr/bin/env node
/**
 * refdiff CLI.
 *
 * Implemented:
 *   compare   run the pipeline for one design-frame / storybook-story pair,
 *             or for every storybook pair of a manifest (--manifest)
 *   summary   one table over every run dir under an out root (a component
 *             set's cells, a manifest's pairs) + the causes shared across them
 *   accept    record "the implementation is right" for reported findings —
 *             from the annotator's triage, or one finding by id
 *
 * Planned (docs/architecture.md): inspect, explore, report.
 */

import type { Capture, CaptureError, LiveAuth } from "./pipeline.js"
import type { ComparisonReport, Finding, IgnorePolicy, Severity } from "./types.js"
import type { Browser } from "playwright"

import { readdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import {
  acceptedFor,
  acceptedFromFinding,
  emptyAcceptedFile,
  parseAcceptedFile,
  upsertAccepted,
  type AcceptedFile,
} from "./accepted.js"
import { launchBrowser } from "./adapters/browser.js"
import { captureDcHtml } from "./adapters/dc-html.js"
import { FigmaClient, parseFigmaRef, readToken } from "./adapters/figma-api.js"
import { expandVariants } from "./adapters/figma-variants.js"
import { captureFigma, FIGMA_DEFAULTS, type FigmaCaptureOptions } from "./adapters/figma.js"
import { captureLiveUrl } from "./adapters/live-url.js"
import { ensureStorybook } from "./adapters/storybook-server.js"
import { captureStorybook } from "./adapters/storybook.js"
import { parseManifest, readAccepted, type LiveSpec, type PairSpec } from "./manifest.js"
import { emptyLedger, parseLedger, recordResolved, type ResolvedLedger } from "./package/delta.js"
import { packageForModel } from "./package/package-for-model.js"
import { describeRegions } from "./package/regions.js"
import { renderSummary, summarizeReports } from "./package/summary.js"
import { defaultDesignScale, normalize, pairRefs } from "./pipeline.js"
import { lowConfidenceFinding, PIXEL_DEFAULTS, remainderFinding, runPixelChecks } from "./pixel/checks.js"
import { diffMatches, diffRemainder, writeDiffMask } from "./pixel/diff.js"
import { hiddenMovement } from "./policy-audit.js"
import { stepHint, stepsOnOneSide } from "./adapters/steps.js"
import { applyPolicy, mergePolicies } from "./policy.js"
import { err, ok, type Result } from "./result.js"
import { aggregate } from "./structural/aggregate.js"
import { alignmentNote, alignStructural } from "./structural/align.js"
import { finalize, runTypedChecks, type RawFinding } from "./structural/checks.js"
import { matchElements } from "./structural/match.js"

const USAGE = `Usage: refdiff compare [options]
       refdiff summary <out-root> [--json]
       refdiff accept <run-dir> [options]

accept — record "we looked, and the implementation is right" for findings of
one run, so the next run suppresses them visibly instead of re-reporting them.
Each decision is built from the MEASUREMENT and lapses by itself when either
value changes, which is what an edited comp would never do.

  (default)               take every finding the annotator marked "ignore"
                          and use its note as the reason
  --finding <id>          accept one finding by id (needs --reason)
  --reason <text>         why the implementation is right (required with --finding)
  --manifest <file>       write accepted.json beside this manifest — where
                          compare reads it and where it is version-controlled
  --accepted <file>       decisions file, instead of deriving it from --manifest
  --dry-run               print what would be recorded, write nothing

A verdict with no note is refused: a suppression nobody can audit is how a
suite goes quiet. position/spacing findings are refused too — their values move
with every capture, so the rule would lapse immediately.

Compare a design frame (Claude Design .dc.html or Figma) against an
implementation (Storybook story or live URL).

One pair — design side (one of):
  --design-dir <dir>      directory containing the .dc.html comps
  --design-file <file>    comp file name, e.g. doc-detail-modal.dc.html
  --design-frame <frame>  frame id or data-screen-label inside the comp
  --figma <ref>           <fileKey>:<nodeId> or a Figma URL with node-id=;
                          token from $FIGMA_TOKEN or a .figma-token file
  --figma-scale <n>       render scale (default ${FIGMA_DEFAULTS.scale}) → design dpr
  --min-design-quality <0..1>
                          GIGO gate: share of leaves bound to variables/styles
                          below which the run stops with figma-low-quality
                          (default ${FIGMA_DEFAULTS.minQuality}; score always echoed in the report)
One pair — impl side (one of):
  --story <storyId>       storybook story id
  --overlay               story portals to <body> (dialog/sheet) — shoot viewport
  --url <url>             live page (absolute, or a path under --app-url)
  --selector <css>        capture this node instead of the viewport (live) or
                          #storybook-root (story) — e.g. one variant-matrix cell
                          '[data-rowkey="…"][data-col="Default"]' against one
                          Figma variant COMPONENT node
  --wait-for <css>        live: wait for this selector before capturing
  --full-page             live: full-page shot instead of the viewport
Common to one pair:
  --pair <id>             pair identity (default: derived from design+impl)
  --viewport <WxH>        impl viewport, e.g. 760x740 (default 1200x900)
  --design-scale <n|auto> design→impl geometry scale before alignment. auto =
                          impl width / design width (an artboard drawn at another
                          size; dc-html default). Figma default is 1: its units
                          ARE CSS px, so a wider frame is a layout difference,
                          not a scale to normalize away

Manifest mode (uctoinak manifest.mjs shape, optional \`ignore\` per pair;
design { file, frame } or { kind: "figma", fileKey, nodeId, variants? }; app
{ source: "storybook", storyId } or { source: "live", route, role? }).
A figma design with variants { selector, maps?, only?, omit? } names a
COMPONENT_SET: the entry expands into one pair per variant COMPONENT, each
against the story cell the selector template renders from the variant's
properties ('[data-rowkey="fill:{variant|tone}:…"][data-col="{State}"]'):
  --manifest <file>       run every pair of the manifest
  --design-dir <dir>      directory the manifest's design.file names live in
  --pair <id[,id…]>       run only these manifest ids

Live app (both modes):
  --app-url <origin>      origin for relative live routes (default $REFDIFF_APP_URL)
  --auth-state <file>     Playwright storageState JSON for the browser context
  --auth-post <url>       POST a JSON session request before navigating
                          (body { role, email: "__test__<role>@example.com",
                          name }; relative to --app-url)
  --auth-header <k: v>    header for --auth-post (repeatable)

Ignore policy (both modes):
  --scope <selector>      design node to compare instead of the artboard frame
                          (default: the frame's largest child by area)
  --ignore-text <regex>   suppress findings about matching text (repeatable)
  --accept <json>         intended deviation, repeatable: '{"type":"color",
                          "expected":{"color":"rgb(26, 26, 26)"},"actual":{"color":
                          "rgb(44, 36, 25)"},"reason":"…"}' → suppressed as "accepted";
                          a manifest rule may add "contents": true to also excuse
                          the TEXTLESS findings inside the element it accepted
                          ("<reason> (inside)"); this flag never writes it;
                          optional "role" narrows it ({"type":"missing-element",
                          "role":"box","reason":"focus ring …"}); for pixel-region,
                          "changeKind" narrows to shape|color|hue-rotation|added|
                          removed|stroke|noise ({"type":"pixel-region","role":"icon",
                          "changeKind":"shape","reason":"placeholder icon …"});
                          "text" narrows to one element ({"type":"missing-element",
                          "role":"text","text":"Pripomenúť","reason":"…"})
  --accepted <file>       decisions file to merge (default: accepted.json next
                          to the manifest, when one exists). Written by
                          \`refdiff accept\` — see that command.
  --no-accepted           ignore the decisions file for this run: every accepted
                          deviation is reported again, which is how you re-review
                          what past runs decided
  --data-slots            treat EVERY matched pair with differing text as demo
                          data and drop its text-content finding. Blind: it
                          cannot tell an amount from a button label, so it hides
                          copy regressions. Off by default — text differences are
                          REPORTED, and you declare the real rule per pair.
  --data-slot-text <re>   narrow the data-slot rule instead of turning it off
                          (repeatable), e.g. 'd{1,2}. d{1,2}. d{4}'. Each
                          shape is MASKED out of both strings and the REMAINDER
                          compared: equal remainder = data churn (suppressed),
                          different remainder = copy drift (reported). So a mixed
                          slot works — "Blok · 12. 7. 2026" vs "Doklad · 12. 7.
                          2026" is reported (the label drifted) while "Blok · 12.
                          7. 2026" vs "Blok · 11. 7. 2026" is not (only the date
                          moved). Anchors are optional: masking touches just the
                          match. Position, size, colour and typography stay
                          compared on data pairs (unlike --ignore-text, which
                          suppresses every finding type about a matching string).

Common:
  --no-aggregate          report every instance of a repeated delta separately
                          (default: ≥3 identical deltas collapse into one
                          finding "×N" that still lists every location)
  --no-pixels             skip the pixel channel (AA-aware diff inside matched
                          boxes → \`pixel-region\` findings + diff-mask.png; runs
                          only when alignment confidence ≥ 0.5)
  --storybook-url <url>   default $VC_STORYBOOK_URL or http://localhost:6006
  --storybook-dir <dir>   if nothing answers at --storybook-url, start Storybook
                          from this project dir (no browser tab) and stop it
                          after the run; default $VC_STORYBOOK_DIR. A Storybook
                          you started yourself is reused and left alone.
  --storybook-open        let the auto-started Storybook open its browser tab
  --out <dir>             run directory (default: out/<pair>)
  --fail-threshold <sev>  critical|major|minor (default major)
  --max-gamma <px>        element-match cutoff (default 100). Elements that share
                          a repeated text pair by text first, within 2× this

Suppressed findings are never dropped: findings.json lists them under
\`suppressed\` with the rule that hit each one. When --out already holds a
findings.json from a previous run, the new report carries \`delta\`
{ previousRun, resolved, introduced, regressions? } (identity by content +
place, not id). resolved-ledger.json in the run dir remembers everything
earlier runs resolved; an introduced finding that is ABSENT from the previous
run and matches the ledger is a regression (a shared-text key whose count
grew is only introduced — the key never left).

Alignment: on a same-size pair (a fluid comp rendered at the pair viewport, or a
design frame whose css px equal it) a structural fit that is not the identity
(|scale − 1| > 0.0005 or |offset| > 0.5 px) is ONE boxless minor \`alignment\`
finding (printed as ALIGNMENT:) — a chrome size / box model difference no
element finding shows. A frame of another size is layout, not scale: no note.

Set summary — reading one findings.json per cell does not scale to a 41-variant
set, so a multi-pair run ends with ONE table (pair → verdict, counts, alignment
confidence + transform, delta) plus the causes shared across pairs (same type/role/values →
one row listing how many cells show it), and writes it as summary.md +
summary.json into the out root. Rebuild it any time from the run dirs:
  refdiff summary <out-root>   (--json prints summary.json instead)

Exit codes: 0 pass, 1 findings at/above threshold, 2 capture or usage error.`

function fail(message: string): never {
  console.error(message)
  process.exit(2)
}

function parseViewport(raw: string | undefined): { width: number; height: number } | undefined {
  if (raw === undefined) return undefined
  const m = /^(\d+)x(\d+)$/.exec(raw)
  if (!m) fail(`--viewport must look like 760x740, got "${raw}"`)
  return { width: Number(m[1]), height: Number(m[2]) }
}

interface LiveOptions {
  appUrl?: string
  authState?: string
  authPost?: string
  authHeaders: Record<string, string>
}

interface RunOptions {
  designDir?: string
  storybookUrl: string
  live: LiveOptions
  figmaScale?: number
  minDesignQuality?: number
  /** Design→impl geometry scale; default per design source (Figma 1, dc-html auto). */
  designScale?: number | "auto"
  outDir: string
  failThreshold: Severity
  maxGamma?: number
  /** CLI-level policy, merged over the pair's own. */
  policy: IgnorePolicy
  /** Decisions recorded by `refdiff accept`, keyed by pair. */
  decisions?: AcceptedFile
  /** Collapse systematic findings (default true). */
  aggregate: boolean
  /** Run the scoped pixel channel inside matched boxes (default true). */
  pixels: boolean
  /** Figma inputs a set expansion already fetched for this pair. */
  prefetched?: FigmaCaptureOptions["prefetched"]
}

type PairError = { side: "design" | "impl"; error: CaptureError }

/**
 * The previous run's report in `outDir`, if a well-formed one is there. Read
 * BEFORE the run writes anything, so the relative verdict compares against
 * what the last run actually said. Unreadable/foreign JSON → no delta.
 */
async function readPreviousReport(outDir: string): Promise<ComparisonReport | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(outDir, "findings.json"), "utf8"))
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { findings?: unknown }).findings) &&
      typeof (parsed as { createdAt?: unknown }).createdAt === "string"
    ) {
      return parsed as ComparisonReport
    }
  } catch {
    // ENOENT or malformed: first run of this pair.
  }
  return undefined
}

const LEDGER_FILE = "resolved-ledger.json"

/** The pair's ledger of findings earlier runs resolved (fresh when absent/foreign). */
async function readLedger(outDir: string, pair: string): Promise<ResolvedLedger> {
  try {
    return parseLedger(JSON.parse(await readFile(join(outDir, LEDGER_FILE), "utf8")), pair)
  } catch {
    return emptyLedger(pair)
  }
}

/** Absolute URL for a live route: absolute as-is, else under --app-url. */
function resolveLiveUrl(route: string, appUrl: string | undefined): Result<string, string> {
  if (/^https?:\/\//i.test(route)) return ok(route)
  if (!appUrl)
    return err(`live route "${route}" is relative — pass --app-url <origin> (or $REFDIFF_APP_URL)`)
  return ok(`${appUrl.replace(/\/$/, "")}${route.startsWith("/") ? "" : "/"}${route}`)
}

/** The auth hook for a live spec, from the CLI's auth flags. */
function liveAuth(spec: LiveSpec, o: LiveOptions, url: string): LiveAuth | undefined {
  if (o.authState) return { kind: "storage-state", path: o.authState }
  if (o.authPost) {
    const role = spec.role ?? "user"
    const postUrl = /^https?:\/\//i.test(o.authPost) ? o.authPost : new URL(o.authPost, url).href
    return {
      kind: "post",
      url: postUrl,
      headers: o.authHeaders,
      body: { role, email: `__test__${role}@example.com`, name: `refdiff ${role}` },
    }
  }
  return undefined
}

async function captureDesign(
  browser: Browser,
  spec: PairSpec,
  scope: string | undefined,
  o: RunOptions,
): Promise<Result<Capture, CaptureError>> {
  const pngPath = join(o.outDir, "design.png")
  if (spec.design.kind === "figma") {
    console.log(`capturing design: figma ${spec.design.fileKey}#${spec.design.nodeId}`)
    return captureFigma(
      {
        ...spec.design,
        ...(o.figmaScale !== undefined && spec.design.scale === undefined
          ? { scale: o.figmaScale }
          : {}),
        ...(o.minDesignQuality !== undefined && spec.design.minQuality === undefined
          ? { minQuality: o.minDesignQuality }
          : {}),
      },
      { pngPath, ...(o.prefetched ? { prefetched: o.prefetched } : {}) },
    )
  }
  if (o.designDir === undefined) {
    return err({
      kind: "capture-failed",
      ref: `${spec.design.file}#${spec.design.frame}`,
      detail: "--design-dir is required for .dc.html designs",
    })
  }
  console.log(`capturing design: ${spec.design.file}#${spec.design.frame}`)
  return captureDcHtml(
    browser,
    { ...spec.design, dir: resolve(o.designDir), ...(scope !== undefined ? { scope } : {}) },
    { pngPath },
  )
}

async function captureImpl(
  browser: Browser,
  spec: PairSpec,
  o: RunOptions,
): Promise<Result<Capture, CaptureError>> {
  const pngPath = join(o.outDir, "impl.png")
  if (spec.impl.kind === "live-url") {
    const { route, role, ...rest } = spec.impl
    void role
    const url = resolveLiveUrl(route, o.live.appUrl)
    if (!url.ok) return err({ kind: "capture-failed", ref: `live:${route}`, detail: url.error })
    console.log(`capturing impl: ${url.value}`)
    const auth = liveAuth(spec.impl, o.live, url.value)
    return captureLiveUrl(
      browser,
      { ...rest, url: url.value, ...(auth ? { auth } : {}) },
      { pngPath },
    )
  }
  console.log(`capturing impl: ${spec.impl.storyId}`)
  return captureStorybook(browser, { ...spec.impl, url: o.storybookUrl }, { pngPath })
}

/** One pair through the whole pipeline. Capture errors are data. */
async function runPair(
  browser: Browser,
  spec: PairSpec,
  o: RunOptions,
): Promise<Result<ComparisonReport, PairError>> {
  const previous = await readPreviousReport(o.outDir)
  const ledger = await readLedger(o.outDir, spec.id)
  // Past decisions ride in as ordinary accepted deviations — same suppression,
  // same visibility under `suppressed`, same automatic lapse when a measured
  // value moves. The count is printed because a policy nobody can see is how a
  // suite goes quiet without anyone choosing that.
  const decided = o.decisions ? acceptedFor(o.decisions, spec.id) : []
  if (decided.length > 0) {
    console.log(`accepted decisions: ${decided.length} for ${spec.id}`)
  }
  const policy = mergePolicies(spec.ignore, { accepted: decided }, o.policy)

  const design = await captureDesign(browser, spec, policy.scope, o)
  if (!design.ok) return err({ side: "design", error: design.error })
  const d = design.value
  console.log(
    `  ${d.width}x${d.height} css px @${d.dpr}x, ${d.elements.length} leaf elements, scope ${d.scope?.mode ?? "frame"}${d.scope?.fluid ? " fluid" : ""} (${d.scope?.selector ?? "-"})${
      d.quality
        ? `, design quality ${d.quality.score} (${d.quality.bound}/${d.quality.leaves} bound)`
        : ""
    }`,
  )

  const impl = await captureImpl(browser, spec, o)
  if (!impl.ok) return err({ side: "impl", error: impl.error })
  const i = impl.value
  console.log(`  ${i.width}x${i.height} css px, ${i.elements.length} leaf elements`)

  const scalePolicy = o.designScale ?? defaultDesignScale(d)
  const normalized = normalize(pairRefs(spec.id, d, i), { designScale: scalePolicy })
  if (normalized.designScale !== 1) {
    console.log(
      `normalized design side by ×${normalized.designScale.toFixed(4)} (--design-scale ${scalePolicy})`,
    )
  } else if (Math.abs(i.width / d.width - 1) >= 0.05) {
    console.log(
      `design ${d.width}px wide vs impl ${i.width}px, kept at scale 1 (--design-scale ${scalePolicy}): a layout difference, not a scale`,
    )
  }

  const aligned = alignStructural(normalized)
  const { offsetX, offsetY, confidence, confidenceX, confidenceY, basis } = aligned.alignment
  // Split the score only when it actually explains a low joint one — an axis
  // fitting far better than the pair says WHICH way the layouts disagree.
  const axes =
    confidence < PIXEL_DEFAULTS.minConfidence &&
    confidenceX !== undefined &&
    confidenceY !== undefined &&
    Math.max(confidenceX, confidenceY) > confidence
      ? `, x ${confidenceX.toFixed(2)} / y ${confidenceY.toFixed(2)}`
      : ""
  console.log(
    `aligned design by (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})px (confidence ${confidence.toFixed(2)}${axes}${basis ? `, basis: ${basis}` : ""})`,
  )
  // Same-size sides (a fluid frame is rendered AT the pair viewport; a design
  // whose raw css px equal it) leave the fit nothing legitimate to absorb —
  // a non-identity transform there is a finding of its own.
  const sameSize = d.scope?.fluid === true || Math.abs(d.width - i.width) < 1
  const identity = alignmentNote(aligned.alignment, sameSize)
  if (identity) console.log(`ALIGNMENT: ${identity.message}`)

  const match = matchElements(
    aligned.design.elements,
    aligned.impl.elements,
    o.maxGamma !== undefined ? { maxGamma: o.maxGamma } : {},
  )
  const slots = match.matches.filter((m) => m.via === "slot").length
  console.log(
    `matched ${match.matches.length} elements (${slots} as data slots; ${match.designOnly.length} design-only, ${match.implOnly.length} impl-only)`,
  )
  // Provably-wrong pairings the veto refused. They are not a suppression: both
  // elements are reported, as missing/extra, which is what a list in another
  // order IS. Named here because the alternative — five property findings about
  // two unrelated elements — is what a reader would otherwise have had to
  // untangle by hand.
  if (match.vetoed && match.vetoed.length > 0) {
    const ex = match.vetoed[0]!
    console.log(
      `  ${match.vetoed.length} candidate pairing(s) vetoed as unrelated (both texts occur on the other side, e.g. "${ex.designText}" vs "${ex.implText}" at γ ${ex.gamma.toFixed(0)}) → reported missing/extra instead`,
    )
  }

  // A state is a state: steps on one side only reports the difference between
  // "selected" and "not selected" as if it were drift.
  const dSteps = "steps" in spec.design ? spec.design.steps : undefined
  const aSteps = "steps" in spec.impl ? spec.impl.steps : undefined
  if (stepsOnOneSide(dSteps, aSteps)) {
    console.log(
      `  ⚠ interaction steps are set on the ${(dSteps ?? []).length > 0 ? "DESIGN" : "IMPL"} side only — the other side captures its default state, so every finding may be "this state vs that state"`,
    )
  }
  for (const st of [...(dSteps ?? []), ...(aSteps ?? [])]) {
    if ("clickText" in st) { console.log(`  note: ${stepHint}`); break }
  }

  const structural = runTypedChecks(match)

  // Pixel channel: AA-aware diff inside each matched box, gated on the
  // structural alignment being trustworthy. Never duplicates a structural
  // finding on the same pair.
  let pixel: RawFinding[] = []
  let diffMaskPath: string | undefined
  if (o.pixels) {
    if (confidence < PIXEL_DEFAULTS.minConfidence) {
      pixel = [lowConfidenceFinding(aligned.alignment, PIXEL_DEFAULTS.minConfidence)]
      console.log(
        `pixel channel skipped (confidence ${confidence.toFixed(2)} < ${PIXEL_DEFAULTS.minConfidence})`,
      )
    } else {
      const diffs = await diffMatches(aligned, match.matches)
      const { findings: pixelFindings, reported } = runPixelChecks(diffs, structural)
      pixel = pixelFindings
      // Backstop: whole-frame diff minus every matched box. The per-match channel
      // cannot see what the element model does not represent — a container's
      // surface is never a leaf, so it is never matched and never diffed.
      const remainder = await diffRemainder(aligned, match.matches)
      const remFinding = remainder ? remainderFinding(remainder) : undefined
      if (remFinding) pixel = [...pixel, remFinding]
      if (remainder) {
        console.log(
          `  unexplained remainder: ${(remainder.diffRatio * 100).toFixed(2)}% of the frame outside matched elements, ${remainder.clusters.length} region(s)${remFinding ? " → reported" : " (below the reporting floor)"}`,
        )
      }
      // Only the REPORTED diffs are painted: an all-diffs mask is dominated by
      // the residue of two correct rasterizations at different scales (95.6 %
      // of one measured page pair's mask lay inside text), which no finding
      // explains and a reader cannot act on. Nothing reported → no mask file,
      // so its absence means "no unexplained pixel evidence".
      if (reported.length > 0) {
        diffMaskPath = join(o.outDir, "diff-mask.png")
        await writeDiffMask(aligned, reported, diffMaskPath)
      }
      console.log(
        `pixel channel: diffed ${diffs.length} matched boxes, ${pixel.length} pixel-region findings`,
      )
    }
  }
  // A run dir is reused across iterations: a mask left by an earlier run would
  // otherwise outlive the findings that justified it.
  if (diffMaskPath === undefined) await rm(join(o.outDir, "diff-mask.png"), { force: true })

  // The impl elements come along because a `contentsOf` rule's container is an ELEMENT, not a
  // finding: it must fire whether or not that element is itself reported.
  const { kept, suppressed } = applyPolicy(
    finalize([...structural, ...pixel, ...(identity ? [identity] : [])]),
    policy,
    { implElements: aligned.impl.elements, frame: { w: i.width, h: i.height } },
  )
  const findings = o.aggregate ? aggregate(kept) : kept
  const report = await packageForModel(aligned, findings, {
    outDir: o.outDir,
    failThreshold: o.failThreshold,
    suppressed,
    policy,
    ...(diffMaskPath !== undefined ? { diffMaskPath } : {}),
    ...(previous !== undefined ? { previous, ledger } : {}),
  })
  // The ledger remembers every fix across runs, so a finding that comes back
  // three iterations later is still recognised as a regression.
  if (previous !== undefined && report.delta) {
    const next = recordResolved(ledger, previous, report.delta, report.createdAt)
    await writeFile(join(o.outDir, LEDGER_FILE), JSON.stringify(next, null, 2))
  }
  return ok(report)
}

function printReport(report: ComparisonReport): void {
  const counts = { critical: 0, major: 0, minor: 0 }
  for (const f of report.findings) counts[f.severity]++
  const instances = report.findings.reduce((n, f) => n + (f.instances ?? 1), 0)
  const aggregated = instances !== report.findings.length ? ` covering ${instances} instances` : ""
  console.log(
    `\n${report.findings.length} findings (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor)${aggregated}, ${report.suppressed.length} suppressed`,
  )
  for (const f of report.findings.slice(0, 40)) {
    const times = f.instances !== undefined ? ` ×${f.instances}` : ""
    console.log(`  [${f.mark}]${times} ${f.severity.padEnd(8)} ${f.type.padEnd(15)} ${f.message}`)
  }
  if (report.findings.length > 40) console.log(`  … ${report.findings.length - 40} more`)
  if (report.suppressed.length > 0) {
    const byRule = new Map<string, number>()
    for (const s of report.suppressed)
      byRule.set(s.suppressedBy, (byRule.get(s.suppressedBy) ?? 0) + 1)
    console.log(
      `  suppressed: ${[...byRule].map(([rule, n]) => `${n} ${rule}`).join(", ")} (see findings.json)`,
    )
    // A suppression that also swallowed a large shift is worth naming: a rule
    // saying "this element's WORDING is demo data" should not silently also say
    // "and I do not care where it is". Never un-suppresses — just stops being
    // quiet about the size of what it hid.
    const hidden = hiddenMovement(report.suppressed)
    if (hidden.length > 0) {
      console.log(`  ⚠ ${hidden.length} suppressed finding(s) moved ≥8px — a rule is hiding geometry:`)
      for (const h of hidden.slice(0, 5))
        console.log(`      ${h.px}px  [${h.suppressedBy} ${h.rule}] ${h.message.slice(0, 90)}`)
      const advice = hidden.find((h) => h.advice)?.advice
      if (advice !== undefined) console.log(`      ${advice}`)
      if (hidden.length > 5) console.log(`      … ${hidden.length - 5} more (see findings.json)`)
    }
  }
  if (report.delta) {
    const { introduced, resolved, previousRun, previousRunNumber, regressions = [] } = report.delta
    // Name the runs when they are numbered; the timestamp stays the fallback for a
    // report written before runs carried an ordinal.
    const vs = previousRunNumber === undefined ? previousRun : `run ${previousRunNumber} (run ${report.run} now)`
    console.log(
      `delta vs ${vs}: +${introduced.length} introduced / −${resolved.length} resolved${
        introduced.length > 0 ? ` (introduced: ${introduced.join(", ")})` : ""
      }`,
    )
    if (regressions.length > 0) {
      const byId = new Map(report.findings.map((f) => [f.id, f]))
      const repaired = new Map((report.delta.repaired ?? []).map((r) => [r.id, r]))
      console.log(`REGRESSION: ${regressions.length} previously resolved finding(s) are back:`)
      for (const id of regressions) {
        console.log(`  [${id}] ${byId.get(id)?.message ?? ""}`)
        // The element kept its place and lost its PARTNER: read this before
        // undoing anything. Never suppresses the regression — a genuine vanish
        // looks the same from here.
        const r = repaired.get(id)
        if (r) {
          console.log(
            `      ↳ this run also resolved ${r.resolved.length} finding(s) about "${r.text}" (${r.types.join(", ")}) — the element's PARTNER changed, not the element: a re-pairing, not necessarily a fix undone`,
          )
        }
      }
    }
  }
  // WHERE they are, before the verdict: on a page pair this is the orientation
  // the severity-sorted list cannot give (106 in the rail is "the list is
  // offset"; 70 in the canvas is "the zoom differs" — two causes, one report).
  if (report.byRegion) {
    console.log("by region:")
    for (const line of describeRegions(report.byRegion)) console.log(line)
  }
  console.log(
    `verdict: ${report.verdict.pass ? "PASS" : "FAIL"} (threshold: ${report.verdict.failThreshold})`,
  )
}

type Prefetched = NonNullable<FigmaCaptureOptions["prefetched"]>

/**
 * A figma design with `variants` names a COMPONENT_SET: read the set once,
 * expand it (pure) into one pair per variant COMPONENT against its story
 * cell, fetch variables once and render every variant in one batched
 * /images call, and hand each pair its prefetched inputs. Skipped variants
 * are printed, never dropped silently.
 */
async function expandFigmaSet(
  spec: PairSpec,
  figmaScale: number | undefined,
): Promise<Result<{ specs: PairSpec[]; prefetched: Map<string, Prefetched> }, CaptureError>> {
  if (spec.design.kind !== "figma" || spec.design.variants === undefined) {
    return ok({ specs: [spec], prefetched: new Map() })
  }
  const { variants, ...design } = spec.design
  const ref = `${design.fileKey}#${design.nodeId}`
  const token = await readToken()
  if (!token)
    return err({
      kind: "figma-auth",
      ref,
      detail: "no Figma token: set $FIGMA_TOKEN or create .figma-token",
    })
  const client = new FigmaClient(token)
  const apiErr = (e: { kind: string; detail: string; until?: string }): CaptureError =>
    e.kind === "no-token" || e.kind === "auth"
      ? { kind: "figma-auth", ref, detail: e.detail }
      : e.kind === "rate-limited" || e.kind === "cooling-down"
        ? { kind: "figma-rate-limited", ref, until: e.until ?? "", detail: e.detail }
        : { kind: "figma-api", ref, detail: e.detail }

  const nodes = await client.nodes(design.fileKey, [design.nodeId], design.version)
  if (!nodes.ok) return err(apiErr(nodes.error))
  const set = nodes.value.nodes[design.nodeId]?.document
  if (!set)
    return err({
      kind: "figma-node-not-found",
      ref,
      fileKey: design.fileKey,
      nodeId: design.nodeId,
    })
  const version = design.version ?? nodes.value.version

  const expanded = expandVariants(set, variants)
  if (!expanded.ok)
    return err({ kind: "figma-api", ref, detail: `variants: ${JSON.stringify(expanded.error)}` })
  console.log(
    `${spec.id}: ${set.name} → ${expanded.value.pairs.length} variant pairs, ${expanded.value.skipped.length} skipped`,
  )
  for (const sk of expanded.value.skipped) console.log(`  skipping ${sk.name}: ${sk.reason}`)
  if (expanded.value.pairs.length === 0) return ok({ specs: [], prefetched: new Map() })

  const variables = await client.localVariables(design.fileKey)
  if (!variables.ok) return err(apiErr(variables.error))
  const scale = design.scale ?? figmaScale ?? FIGMA_DEFAULTS.scale
  const images = await client.renderImages(
    design.fileKey,
    expanded.value.pairs.map((p) => p.nodeId),
    scale,
    version ? { version } : {},
  )
  if (!images.ok) return err(apiErr(images.error))

  const byId = new Map(set.children?.map((c) => [c.id, c]) ?? [])
  const prefetched = new Map<string, Prefetched>()
  const specs: PairSpec[] = expanded.value.pairs.map((p) => {
    const id = `${spec.id}--${p.slug}`
    const url = images.value[p.nodeId]
    prefetched.set(id, {
      document: byId.get(p.nodeId)!,
      ...(version ? { version } : {}),
      variables: variables.value ?? null,
      ...(url ? { imageUrl: url } : {}),
    })
    return {
      id,
      title: `${spec.title ?? spec.id} — ${p.name}`,
      design: {
        ...design,
        nodeId: p.nodeId,
        ...(figmaScale !== undefined && design.scale === undefined ? { scale } : {}),
      },
      impl: { ...spec.impl, selector: p.selector },
      ...(spec.ignore ? { ignore: spec.ignore } : {}),
    }
  })
  return ok({ specs, prefetched })
}

async function loadManifest(file: string): Promise<PairSpec[]> {
  const mod: Record<string, unknown> = await import(pathToFileURL(resolve(file)).href)
  const parsed = parseManifest(mod["manifest"] ?? mod["default"])
  if (!parsed.ok) fail(`invalid manifest ${file}: ${JSON.stringify(parsed.error)}`)
  for (const s of parsed.value.skipped) console.log(`skipping ${s.id}: ${s.reason}`)
  return parsed.value.pairs
}

async function compare(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pair: { type: "string" },
      manifest: { type: "string" },
      "design-dir": { type: "string" },
      "design-file": { type: "string" },
      "design-frame": { type: "string" },
      figma: { type: "string" },
      "figma-scale": { type: "string" },
      "min-design-quality": { type: "string" },
      url: { type: "string" },
      selector: { type: "string" },
      "wait-for": { type: "string" },
      "full-page": { type: "boolean" },
      "app-url": { type: "string" },
      "auth-state": { type: "string" },
      "auth-post": { type: "string" },
      "auth-header": { type: "string", multiple: true },
      "storybook-url": { type: "string" },
      "storybook-dir": { type: "string" },
      "storybook-open": { type: "boolean" },
      story: { type: "string" },
      viewport: { type: "string" },
      "design-scale": { type: "string" },
      overlay: { type: "boolean" },
      scope: { type: "string" },
      "ignore-text": { type: "string", multiple: true },
      accept: { type: "string", multiple: true },
      accepted: { type: "string" },
      "no-accepted": { type: "boolean" },
      "data-slots": { type: "boolean" },
      "data-slot-text": { type: "string", multiple: true },
      "no-aggregate": { type: "boolean" },
      "no-pixels": { type: "boolean" },
      out: { type: "string" },
      "fail-threshold": { type: "string" },
      "max-gamma": { type: "string" },
      help: { type: "boolean" },
    },
  })

  if (values.help) {
    console.log(USAGE)
    return
  }

  const designDir = values["design-dir"]
  const figmaScale = values["figma-scale"] !== undefined ? Number(values["figma-scale"]) : undefined
  if (figmaScale !== undefined && !(figmaScale >= 0.5 && figmaScale <= 4))
    fail(`--figma-scale must be 0.5..4`)
  const minDesignQuality =
    values["min-design-quality"] !== undefined ? Number(values["min-design-quality"]) : undefined
  if (minDesignQuality !== undefined && !(minDesignQuality >= 0 && minDesignQuality <= 1)) {
    fail(`--min-design-quality must be 0..1`)
  }
  const authHeaders: Record<string, string> = {}
  for (const h of values["auth-header"] ?? []) {
    const m = /^([^:=]+)[:=]\s*(.*)$/.exec(h)
    if (!m?.[1]) fail(`--auth-header must look like "Name: value", got "${h}"`)
    authHeaders[m[1].trim()] = m[2] ?? ""
  }
  const appUrl = values["app-url"] ?? process.env["REFDIFF_APP_URL"]
  const live: LiveOptions = {
    authHeaders,
    ...(appUrl !== undefined ? { appUrl } : {}),
    ...(values["auth-state"] !== undefined ? { authState: resolve(values["auth-state"]) } : {}),
    ...(values["auth-post"] !== undefined ? { authPost: values["auth-post"] } : {}),
  }
  const storybookUrl =
    values["storybook-url"] ?? process.env["VC_STORYBOOK_URL"] ?? "http://localhost:6006"
  const failThreshold = (values["fail-threshold"] ?? "major") as Severity
  if (!["critical", "major", "minor"].includes(failThreshold)) {
    fail(`--fail-threshold must be critical|major|minor, got "${failThreshold}"`)
  }
  const maxGamma = values["max-gamma"] !== undefined ? Number(values["max-gamma"]) : undefined
  let designScale: number | "auto" | undefined
  if (values["design-scale"] !== undefined) {
    const raw = values["design-scale"]
    designScale = raw === "auto" ? "auto" : Number(raw)
    if (designScale !== "auto" && !(designScale >= 0.1 && designScale <= 10))
      fail(`--design-scale must be auto or 0.1..10`)
  }

  const dataSlotText = values["data-slot-text"] ?? []
  if (dataSlotText.length > 0 && values["data-slots"]) {
    fail(
      "--data-slot-text narrows which pairs count as data slots; --data-slots takes them all — pass one or the other",
    )
  }
  // Default OFF: every text difference is reported. Which strings are data is a
  // per-pair judgement, and guessing it centrally hides copy regressions.
  const policy: IgnorePolicy = {
    dataSlots: dataSlotText.length > 0 ? { patterns: dataSlotText } : values["data-slots"] === true,
    ...(values.scope !== undefined ? { scope: values.scope } : {}),
    ...(values["ignore-text"]?.length ? { textPatterns: values["ignore-text"] } : {}),
  }
  for (const p of dataSlotText) {
    try {
      new RegExp(p, "u")
    } catch (e) {
      fail(
        `--data-slot-text "${p}" is not a valid regex: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  for (const raw of values.accept ?? []) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      fail(`--accept must be JSON { type, expected?, actual?, reason }, got ${raw}`)
    }
    const a = readAccepted(parsed)
    if (!a) fail(`--accept needs { type, reason } and string/number expected/actual values: ${raw}`)
    policy.accepted = [...(policy.accepted ?? []), a]
  }
  for (const entry of policy.textPatterns ?? []) {
    // `--ignore-text` always yields the string form; a manifest may carry the
    // role-scoped object form, and both must compile before the run starts.
    const p = typeof entry === "string" ? entry : entry.pattern
    try {
      new RegExp(p, "u")
    } catch (e) {
      fail(
        `--ignore-text "${p}" is not a valid regex: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  let specs: PairSpec[]
  if (values.manifest !== undefined) {
    // These describe ONE pair's capture; in manifest mode each pair carries its own
    // in the entry, so the flag has nowhere to apply. Accepting and ignoring them
    // silently produced a run that looked like it honoured the flag but did not —
    // say so instead, naming the manifest field that replaces it.
    const perPairOnly: [keyof typeof values, string][] = [
      ["design-file", "design.file"],
      ["design-frame", "design.frame"],
      ["figma", 'design.{ kind: "figma", fileKey, nodeId }'],
      ["story", "app.storyId"],
      ["url", "app.route"],
      ["overlay", "app.overlay"],
      ["selector", "app.selector"],
      ["wait-for", "app.waitFor"],
      ["full-page", "app.fullPage"],
      ["viewport", "app.viewport"],
    ]
    const offending = perPairOnly.filter(
      ([flag]) => values[flag] !== undefined && values[flag] !== false,
    )
    if (offending.length > 0) {
      fail(
        `--manifest takes each pair's capture from the manifest entry, so ${offending
          .map(([flag]) => `--${flag}`)
          .join(
            ", ",
          )} cannot apply. Set ${offending.map(([, field]) => field).join(", ")} on the entry instead.`,
      )
    }
    const all = await loadManifest(values.manifest)
    const only = values.pair
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    specs = only ? all.filter((p) => only.includes(p.id)) : all
    if (specs.length === 0) fail(`no runnable pairs selected from ${values.manifest}`)
  } else {
    const viewport = parseViewport(values.viewport)
    let design: PairSpec["design"]
    let designId: string
    if (values.figma !== undefined) {
      const parsed = parseFigmaRef(values.figma)
      if (!parsed.ok) fail(`--figma: ${parsed.error}`)
      design = { kind: "figma", ...parsed.value }
      designId = `figma-${parsed.value.nodeId.replace(":", "-")}`
    } else {
      const designFile = values["design-file"] ?? fail(USAGE)
      const designFrame = values["design-frame"] ?? fail(USAGE)
      if (designDir === undefined) fail(USAGE)
      design = {
        kind: "dc-html",
        file: designFile,
        frame: designFrame,
        ...(viewport ? { viewport } : {}),
      }
      designId = designFrame
    }
    let impl: PairSpec["impl"]
    let implId: string
    if (values.url !== undefined) {
      impl = {
        kind: "live-url",
        route: values.url,
        ...(viewport ? { viewport } : {}),
        ...(values.selector !== undefined ? { selector: values.selector } : {}),
        ...(values["wait-for"] !== undefined ? { waitFor: values["wait-for"] } : {}),
        ...(values["full-page"] ? { fullPage: true } : {}),
      }
      implId = values.url
        .replace(/^https?:\/\//, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-|-$/g, "")
    } else {
      const storyId = values.story ?? fail(USAGE)
      impl = {
        kind: "storybook",
        storyId,
        ...(viewport ? { viewport } : {}),
        ...(values.overlay ? { overlay: true } : {}),
        ...(values.selector !== undefined ? { selector: values.selector } : {}),
      }
      implId = storyId
    }
    specs = [{ id: values.pair ?? `${designId}--${implId}`, design, impl }]
  }

  const outRoot = values.out

  // Decisions recorded by `refdiff accept`. Default location is next to
  // the manifest, because that is where the pairs are defined and a decision is
  // about a pair; an explicit --accepted overrides, --no-accepted re-opens every
  // past decision for review.
  const decisionsPath = values["no-accepted"]
    ? undefined
    : (values.accepted ??
      (values.manifest !== undefined
        ? join(dirname(resolve(values.manifest)), "accepted.json")
        : undefined))
  let decisions: AcceptedFile | undefined
  if (decisionsPath !== undefined) {
    const loaded = await readAcceptedFile(decisionsPath)
    if (!loaded.ok) fail(`--accepted ${decisionsPath}: ${loaded.error}`)
    decisions = loaded.value
    // An explicitly named file that is not there is a typo, not "no decisions".
    if (decisions === undefined && values.accepted !== undefined) {
      fail(`--accepted ${decisionsPath}: file not found`)
    }
  }

  // Component sets → one pair per variant (typed errors keep the other entries running).
  const prefetched = new Map<string, Prefetched>()
  let anyError = false
  {
    const expanded: PairSpec[] = []
    for (const spec of specs) {
      const r = await expandFigmaSet(spec, figmaScale)
      if (!r.ok) {
        anyError = true
        console.error(`\n${spec.id}: component-set expansion failed (typed error):`)
        console.error(JSON.stringify(r.error, null, 2))
        continue
      }
      expanded.push(...r.value.specs)
      for (const [k, v] of r.value.prefetched) prefetched.set(k, v)
    }
    specs = expanded
  }

  // Storybook: reuse a running one; otherwise start our own (no browser tab
  // unless --storybook-open) when a project dir is known.
  const storybookDir = values["storybook-dir"] ?? process.env["VC_STORYBOOK_DIR"]
  const needsStorybook = specs.some((s) => s.impl.kind === "storybook")
  let stopStorybook = async (): Promise<void> => {}
  if (storybookDir !== undefined && needsStorybook) {
    const sb = await ensureStorybook({
      url: storybookUrl,
      dir: resolve(storybookDir),
      open: values["storybook-open"] ?? false,
      log: (line) => console.log(line),
    })
    if (!sb.ok) fail(`${sb.error.kind}: ${sb.error.detail}`)
    stopStorybook = sb.value.stop
  }

  let browser = await launchBrowser()
  let anyFail = false
  const done: { dir: string; report: ComparisonReport }[] = []
  try {
    for (const spec of specs) {
      // One browser serves the whole run, and it can die mid-run (chromium killed
      // under memory pressure on a long set). Every adapter then throws from
      // `newContext` — outside its try — so ONE dead browser used to take the
      // remaining pairs and the set summary with it. Relaunch instead: the pair
      // that lost the browser already recorded its typed capture error.
      if (!browser.isConnected()) {
        console.log("browser disconnected — relaunching for the remaining pairs")
        browser = await launchBrowser()
      }
      // `--out` is ALWAYS a root; the run dir is always `<root>/<pair>`. It used to
      // mean the run dir itself when exactly one pair was selected, which made the
      // flag's meaning depend on the pair COUNT: a wrapper script pinning one --out
      // wrote single-pair artifacts (findings.json, design.png, crops/) into the root,
      // and the next `summary` over that root then counted the root itself as a pair.
      const outDir = resolve(join(outRoot ?? "out", spec.id))
      console.log(`\n=== ${spec.id}${spec.title ? ` — ${spec.title}` : ""} ===`)
      const result = await runPair(browser, spec, {
        ...(designDir !== undefined ? { designDir } : {}),
        storybookUrl,
        live,
        ...(figmaScale !== undefined ? { figmaScale } : {}),
        ...(minDesignQuality !== undefined ? { minDesignQuality } : {}),
        ...(designScale !== undefined ? { designScale } : {}),
        outDir,
        failThreshold,
        ...(maxGamma !== undefined ? { maxGamma } : {}),
        policy,
        ...(decisions !== undefined ? { decisions } : {}),
        aggregate: !values["no-aggregate"],
        pixels: !values["no-pixels"],
        ...(prefetched.has(spec.id) ? { prefetched: prefetched.get(spec.id)! } : {}),
      })
      if (!result.ok) {
        anyError = true
        console.error(`\n${spec.id}: ${result.error.side} capture failed (typed error):`)
        console.error(JSON.stringify(result.error.error, null, 2))
        continue
      }
      printReport(result.value)
      console.log(`report: ${join(outDir, "findings.json")}`)
      if (!result.value.verdict.pass) anyFail = true
      done.push({ dir: spec.id, report: result.value })
    }
  } finally {
    await browser.close()
    await stopStorybook()
  }
  // A set run ends with the one page the loop actually reads: the console
  // shows the pairs just run; summary.md/json cover EVERY run dir under the
  // root (several sets share one root), exactly what `summary <root>` writes.
  if (specs.length > 1 && done.length > 0) {
    const root = resolve(outRoot ?? "out")
    console.log(
      `\n${renderSummary(summarizeReports(done), { title: `refdiff summary — this run` })}`,
    )
    await writeSummary(root, await readRunDirs(root))
    console.log(`summary (all run dirs under the root): ${join(root, "summary.md")}`)
  }
  process.exit(anyError ? 2 : anyFail ? 1 : 0)
}

/** Effect: summary.md + summary.json into `root`; returns the rendered text. */
async function writeSummary(
  root: string,
  reports: { dir: string; report: ComparisonReport }[],
): Promise<string> {
  const summary = summarizeReports(reports)
  const text = renderSummary(summary, { title: `refdiff summary — ${root}` })
  await writeFile(join(root, "summary.md"), text)
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2))
  return text
}

/** Every `<root>/<dir>/findings.json` (or `<root>/findings.json` itself), oldest run first. */
async function readRunDirs(root: string): Promise<{ dir: string; report: ComparisonReport }[]> {
  const self = await readPreviousReport(root)
  if (self) return [{ dir: root.split("/").filter(Boolean).at(-1) ?? root, report: self }]
  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch (e) {
    fail(`summary: cannot read ${root}: ${e instanceof Error ? e.message : String(e)}`)
  }
  const runs: { dir: string; report: ComparisonReport }[] = []
  for (const dir of names.sort()) {
    const report = await readPreviousReport(join(root, dir))
    if (report) runs.push({ dir, report })
  }
  return runs.sort((a, b) => a.report.createdAt.localeCompare(b.report.createdAt))
}

/** The decisions file at `path`; `undefined` when there is none yet. */
async function readAcceptedFile(path: string): Promise<Result<AcceptedFile | undefined, string>> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch {
    return ok(undefined)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return err(`not valid JSON (${e instanceof Error ? e.message : String(e)})`)
  }
  return parseAcceptedFile(parsed)
}

/** The annotator's verdicts for a run dir, or an empty list when it was never served. */
async function readTriageStates(
  runDir: string,
): Promise<{ key: string; state: string; note: string }[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(runDir, "triage.json"), "utf8"))
    const entries = (parsed as { entries?: unknown }).entries
    if (!Array.isArray(entries)) return []
    return entries.filter(
      (e): e is { key: string; state: string; note: string } =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { key?: unknown }).key === "string" &&
        typeof (e as { state?: unknown }).state === "string",
    )
  } catch {
    return []
  }
}

/**
 * `accept` — turn reviewed findings into durable decisions.
 *
 * Two inputs, one output. From the annotator: every finding a person marked
 * `ignore` with a note ("this is intended, the comp is the outlier") becomes an
 * accepted deviation carrying that note as its reason. From the command line:
 * one finding by id with `--reason`. Either way the rule is built FROM the
 * measurement, so it lapses when the measurement changes.
 *
 * A verdict without a note is REFUSED, loudly: `suppressed` entries carry their
 * rule so a reader can audit them, and "ignored, no reason given" is not
 * something a reader can audit.
 */
async function accept(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      accepted: { type: "string" },
      manifest: { type: "string" },
      finding: { type: "string" },
      reason: { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help || positionals.length !== 1) {
    console.log(USAGE)
    if (!values.help) process.exit(2)
    return
  }
  const runDir = resolve(positionals[0]!)
  const report = await readPreviousReport(runDir)
  if (!report) fail(`accept: no readable findings.json in ${runDir}`)
  // Decisions live NEXT TO THE MANIFEST, which is where compare looks for them
  // and the only place they are version-controlled — an out root is disposable.
  // No default: writing them where the next run will not read them is worse
  // than asking.
  const path =
    values.accepted ??
    (values.manifest !== undefined
      ? join(dirname(resolve(values.manifest)), "accepted.json")
      : fail(
          "accept: pass --manifest <file> (decisions go beside it, where compare reads them) or --accepted <file>",
        ))
  const loaded = await readAcceptedFile(path)
  if (!loaded.ok) fail(`accept: ${path}: ${loaded.error}`)
  let file = loaded.value ?? emptyAcceptedFile()

  // findings.json holds only KEPT findings; a finding already suppressed by a
  // past decision is in `suppressed`, and re-accepting it must be a no-op
  // rather than "unknown finding".
  const all: Finding[] = [...report.findings, ...report.suppressed]
  const wanted: { finding: Finding; reason: string }[] = []
  if (values.finding !== undefined) {
    const finding = all.find((f) => f.id === values.finding)
    if (!finding) fail(`accept: no finding "${values.finding}" in ${runDir}/findings.json`)
    if (values.reason === undefined) fail("accept --finding needs --reason")
    wanted.push({ finding: finding!, reason: values.reason! })
  } else {
    const triaged = await readTriageStates(runDir)
    const ignored = triaged.filter((t) => t.state === "ignore")
    if (ignored.length === 0) {
      console.log(
        `no ignored findings in ${runDir}/triage.json — mark the ones the implementation wins in the annotator (with a note), or pass --finding <id> --reason "…"`,
      )
      return
    }
    for (const entry of ignored) {
      const finding = all.find((f) => f.key === entry.key)
      if (!finding) {
        console.log(`skipped: triaged key no longer in this run (${entry.key})`)
        continue
      }
      wanted.push({ finding, reason: entry.note ?? "" })
    }
  }

  const now = new Date().toISOString()
  let added = 0
  let updated = 0
  let refused = 0
  for (const { finding, reason } of wanted) {
    const record = acceptedFromFinding(finding, reason, now)
    if (!record.ok) {
      refused++
      console.log(`refused ${finding.id} (${finding.type}): ${record.error}`)
      continue
    }
    const next = upsertAccepted(file, report.pair, record.value)
    file = next.file
    if (next.added) added++
    else updated++
    console.log(`${next.added ? "accepted" : "updated"} ${finding.id}: ${finding.message}`)
  }
  if (values["dry-run"]) {
    console.log(`\ndry run — ${added} to add, ${updated} to update, ${refused} refused (${path})`)
    return
  }
  if (added + updated > 0) await writeFile(path, `${JSON.stringify(file, null, 2)}\n`)
  console.log(
    `\n${added} accepted, ${updated} updated, ${refused} refused → ${path}` +
      `\n${acceptedFor(file, report.pair).length} decisions now stand for ${report.pair}; they are applied on the next compare and reported under "suppressed".`,
  )
}

async function summary(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" }, help: { type: "boolean" } },
  })
  if (values.help || positionals.length !== 1) {
    console.log(USAGE)
    if (!values.help) process.exit(2)
    return
  }
  const root = resolve(positionals[0]!)
  const runs = await readRunDirs(root)
  if (runs.length === 0) fail(`summary: no findings.json under ${root}`)
  const text = await writeSummary(root, runs)
  if (values.json) console.log(await readFile(join(root, "summary.json"), "utf8"))
  else console.log(text)
  process.exit(runs.every((r) => r.report.verdict.pass) ? 0 : 1)
}

const [command, ...rest] = process.argv.slice(2)
switch (command) {
  case "compare":
    await compare(rest)
    break
  case "summary":
    await summary(rest)
    break
  case "accept":
    await accept(rest)
    break
  case undefined:
  case "--help":
  case "help":
    console.log(USAGE)
    break
  default:
    fail(`unknown command "${command}"\n\n${USAGE}`)
}
