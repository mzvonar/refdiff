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
import type { ComparisonReport, Finding, IgnorePolicy, MatchVia, Severity } from "./types.js"
import type { Browser } from "playwright"

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
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
import {
  FigmaClient,
  parseFigmaRef,
  readToken,
  type FigmaApiError,
  type FigmaVariablesResponse,
} from "./adapters/figma-api.js"
import {
  defaultFigmaCacheRoot,
  imageCachePath,
  isCacheable,
  pruneOtherVersions,
  readCache,
  variablesCachePath,
  writeCache,
} from "./adapters/figma-cache.js"
import { figmaRenderBleed } from "./adapters/figma-tree.js"
import { expandVariants, variantAxes, variantSpec } from "./adapters/figma-variants.js"
import { captureFigma, FIGMA_DEFAULTS, type FigmaCaptureOptions } from "./adapters/figma.js"
import { DEFAULT_GROUND, readGround, type Ground } from "./adapters/ground.js"
import { captureLiveUrl } from "./adapters/live-url.js"
import { stepHint, stepsOnOneSide } from "./adapters/steps.js"
import { ensureStorybook } from "./adapters/storybook-server.js"
import { captureStorybook } from "./adapters/storybook.js"
import { parseManifest, readAccepted, type LiveSpec, type PairSpec } from "./manifest.js"
import { emptyLedger, parseLedger, recordResolved, type ResolvedLedger } from "./package/delta.js"
import { driftWalk, formatDriftWalk, type DriftAxis } from "./package/drift.js"
import { packageForModel } from "./package/package-for-model.js"
import { describeRegions, describeUnmatched } from "./package/regions.js"
import { buildSetIndex, setIndexFileName, type SetIndex } from "./package/set-index.js"
import { renderSummary, summarizeReports } from "./package/summary.js"
import { defaultDesignScale, normalize, pairRefs } from "./pipeline.js"
import {
  lowConfidenceFinding,
  PIXEL_DEFAULTS,
  remainderFinding,
  runPixelChecks,
} from "./pixel/checks.js"
import { diffMatches, diffRemainder, writeDiffMask } from "./pixel/diff.js"
import { hiddenMovement } from "./policy-audit.js"
import { applyPolicy, explainFindings, mergePolicies, runWidePolicy } from "./policy.js"
import { err, ok, type Result } from "./result.js"
import { aggregate } from "./structural/aggregate.js"
import { alignmentNote, alignStructural, rootSizeNote } from "./structural/align.js"
import { finalize, runTypedChecks, type RawFinding } from "./structural/checks.js"
import { matchElements, matchingStats } from "./structural/match.js"

const USAGE = `Usage: refdiff compare [options]
       refdiff summary <out-root> [--json]
       refdiff accept <run-dir> [options]
       refdiff drift <run-dir> [options]

drift — undo the alignment fit and walk the residual down the page, to name the
element a \`scale\` / \`scaleY\` is about. The fit absorbs a per-repeat step better
than a per-element \`position\` finding does, so ONE box a pixel short in every row
reports as a scale and names nothing. Reads \`elements.json\` only.

  --axis <y|x>            which axis to walk (default y)
  --step <px>             plateau tolerance; below this is sub-pixel rendering
                          rather than a box model difference (default 0.5)
  --top <n>               print only the first n rows (the steps are always all)
  --json                  the whole walk as JSON

Flat residual = an OFFSET, one box above or beside the anchors. A residual that
steps = that box REPEATED, one step per repeat, and the element at the step is
the fix.

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
  --bleed <px>            capture this much margin AROUND the node on both sides,
                          so a focus ring, an offset outline or a drop shadow is
                          in the picture instead of clipped off it (default 0).
                          Changes no measurement — element boxes and the alignment
                          are untouched; only the PNG grows. A manifest entry's
                          own bleed overrides it. Figma ignores it (the /images
                          render is whatever the node's own bounds are); it
                          applies to every browser capture, single pair or set
  --ground <mode>         what a browser capture does with the paint BEHIND its
                          node: transparent (default) neutralises the captured
                          node's ancestry and shoots with an alpha channel, so
                          the shot holds the node's own subtree and nothing else
                          — which is what a Figma /images render already is, and
                          cannot be made not to be. keep restores the composite
                          (the pre-2026-09-10 shot, byte for byte). Element shots
                          only; a viewport or full-page shot keeps its ground.
                          A manifest entry's own ground overrides it
  --no-figma-cache        do not read or write the on-disk Figma cache. It is on
                          by default and keyed by the FILE VERSION, so an edited
                          file misses every key and refetches — it cannot serve
                          stale bytes, and stale versions are pruned on sight.
                          Caches the rendered PNGs and the variables map, never
                          the node subtree: that call carries the version every
                          key is built from. Measured on a 208-pair manifest:
                          83 API calls cold, 14 warm

Manifest mode (uctoinak manifest.mjs shape, optional \`ignore\` per pair;
design { file, frame } or { kind: "figma", fileKey, nodeId, variants? }; app
{ source: "storybook", storyId } or { source: "live", route, role? }).
A figma design with variants { selector, maps?, only?, omit? } names a
COMPONENT_SET: the entry expands into one pair per variant COMPONENT, each
against the story cell the selector template renders from the variant's
properties ('[data-rowkey="fill:{variant|tone}:…"][data-col="{State}"]'):
  --manifest <file>       run every pair of the manifest
  --design-dir <dir>      directory the manifest's design.file names live in
  --pair <id[,id…]>       run only these manifest ids (repeatable)

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
  /** Run-wide margin captured around each node; a pair's own `bleed` wins. */
  bleed?: number
  /** Run-wide ground mode; a pair's own `ground` wins. Default `transparent`. */
  ground?: Ground
  /** Disable the version-keyed Figma cache for this run. */
  noFigmaCache?: boolean
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

/**
 * How much margin this capture keeps around its node: the side's own `bleed`,
 * else the entry's, else the run's `--bleed`. Three tiers rather than two
 * because the need is usually per COMPONENT (a button has a focus ring on both
 * sides) while the exception is per side (only the impl paints an outline).
 * Omitted entirely when nothing asked, so a capture with no bleed is byte-for-
 * byte the shot it was before the flag existed.
 */
function bleedFor(spec: PairSpec, own: number | undefined, o: RunOptions): { bleed?: number } {
  const px = own ?? spec.bleed ?? o.bleed
  return px !== undefined && px > 0 ? { bleed: px } : {}
}

/**
 * What this capture does with the paint behind its node: the side's own
 * `ground`, else the entry's, else the run's `--ground`, else transparent.
 * Same three tiers as `bleedFor` and for the same reason — the need is per
 * COMPONENT, the exception is per side.
 *
 * Unlike `bleedFor` this always returns a value, because the default is not
 * "nothing": a capture with no `ground` anywhere is still a transparent-ground
 * capture. `keep` is how a caller asks for the composite back.
 */
function groundFor(spec: PairSpec, own: Ground | undefined, o: RunOptions): { ground: Ground } {
  return { ground: own ?? spec.ground ?? o.ground ?? DEFAULT_GROUND }
}

/**
 * The zone and locale BOTH sides of this pair render in: the entry's, else
 * nothing — and "nothing" means `openPage`'s pinned `CAPTURE_TIMEZONE` /
 * `CAPTURE_LOCALE`, not the host's.
 *
 * Deliberately NOT a three-tier resolve like `bleedFor` / `groundFor`, and not a
 * CLI flag either. The zone a comp is drawn for is a property of that pair's
 * data, so a run-wide override would let one invocation re-date every pair in a
 * set at once — which is a re-baseline wearing a flag. The manifest is the level
 * that can say it, and it is the level under version control.
 */
function zoneFor(spec: PairSpec): { timezoneId?: string; locale?: string } {
  return {
    ...(spec.timezoneId !== undefined ? { timezoneId: spec.timezoneId } : {}),
    ...(spec.locale !== undefined ? { locale: spec.locale } : {}),
  }
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
        // Figma reads this as a switch, not a distance — see FigmaSource.bleed.
        // Resolved through the same precedence as every other side, so an
        // entry-level `bleed` reaches BOTH sides of the pair or neither.
        ...bleedFor(spec, spec.design.bleed, o),
      },
      {
        pngPath,
        ...(o.prefetched ? { prefetched: o.prefetched } : {}),
        ...(o.noFigmaCache ? { cache: false as const } : {}),
      },
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
    {
      ...spec.design,
      dir: resolve(o.designDir),
      ...(scope !== undefined ? { scope } : {}),
      ...bleedFor(spec, spec.design.bleed, o),
      ...groundFor(spec, spec.design.ground, o),
      ...zoneFor(spec),
    },
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
      {
        ...rest,
        url: url.value,
        ...(auth ? { auth } : {}),
        ...bleedFor(spec, rest.bleed, o),
        ...groundFor(spec, rest.ground, o),
        ...zoneFor(spec),
      },
      { pngPath },
    )
  }
  console.log(`capturing impl: ${spec.impl.storyId}`)
  return captureStorybook(
    browser,
    {
      ...spec.impl,
      url: o.storybookUrl,
      ...bleedFor(spec, spec.impl.bleed, o),
      ...groundFor(spec, spec.impl.ground, o),
      ...zoneFor(spec),
    },
    { pngPath },
  )
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
  // The captured root's own box, which the element channel structurally cannot reach.
  const rootSize = rootSizeNote(d, i, aligned.alignment.basis)
  if (rootSize) console.log(`ROOT SIZE: ${rootSize.message}`)

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
    if ("clickText" in st) {
      console.log(`  note: ${stepHint}`)
      break
    }
  }

  // The alignment confidence rides into the checks so a value finding resting on
  // a geometry-formed pair can be marked `unverified` rather than read as drift.
  const structural = runTypedChecks(match, { alignmentConfidence: confidence })

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
    finalize([
      ...structural,
      ...pixel,
      ...(identity ? [identity] : []),
      ...(rootSize ? [rootSize] : []),
    ]),
    policy,
    { implElements: aligned.impl.elements, frame: { w: i.width, h: i.height } },
  )
  // Explained LAST, on the aggregated list: an aggregate is one cause, so it is explained (or not)
  // as one thing, and the count a person reads is the count of causes they still have to explain.
  const findings = explainFindings(
    o.aggregate ? aggregate(kept) : kept,
    policy,
    aligned.impl.elements,
  )
  // AN EXPLANATION CAN GO STALE, and unlike an `accepted` rule it cannot lapse on its own: it is
  // keyed to a region and a set of types, not to measured values, so when the cause is finally
  // fixed on the comp's side the rule stays and would quietly explain a REAL finding in the same
  // place. There is no maintained number to keep — the previous run is the baseline. Any movement
  // in what a cause explains is printed: a count that FELL means the cause may be gone (drop the
  // rule), one that GREW means findings joined a bucket nobody re-read, which is the case where
  // something would otherwise be missed.
  const causeCounts = (fs: readonly { explained?: { cause: string } }[]): Map<string, number> => {
    const m = new Map<string, number>()
    for (const f of fs)
      if (f.explained) m.set(f.explained.cause, (m.get(f.explained.cause) ?? 0) + 1)
    return m
  }
  // A rule that matches nothing on THIS pair is not news — the rules are shared across pairs and a
  // cause that lives in the rail says nothing about a pair with no rail. `refdiff summary` makes
  // that call for the whole set, where "nothing, anywhere" is the reading that means stale.
  const nowCauses = causeCounts(findings)
  if (previous !== undefined) {
    const before = causeCounts(previous.findings)
    for (const cause of new Set([...before.keys(), ...nowCauses.keys()])) {
      const a = before.get(cause) ?? 0
      const b = nowCauses.get(cause) ?? 0
      if (a === b) continue
      const how = b > a ? "GREW" : "fell"
      console.log(
        `  explain: "${cause}" ${how} ${a} → ${b}${b > a ? " — findings joined a cause nobody re-read; check they belong to it" : " — the cause may be going away"}`,
      )
    }
  }
  const report = await packageForModel(aligned, findings, {
    outDir: o.outDir,
    failThreshold: o.failThreshold,
    suppressed,
    policy,
    ...(diffMaskPath !== undefined ? { diffMaskPath } : {}),
    // The matcher's own counts ride into the report: a finding total cannot tell a
    // matcher that got stricter from one that fell apart (see `MatchingStats`).
    matching: matchingStats(match),
    // And the pair LIST, for `report.distant`: the counts cannot say WHICH
    // pairing crossed the shared-text bound, and that is the whole question.
    matches: match.matches,
    ...(o.maxGamma !== undefined ? { maxGamma: o.maxGamma } : {}),
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

/**
 * What formed this finding's pairing, appended to its line. The flagged ones say
 * so in words: a reader should not have to know what γ 98.7 means to distrust a
 * finding, only to recognise that nothing but geometry put the two elements
 * together.
 */
function provenanceTag(f: Finding): string {
  if (f.via === undefined) return ""
  const g = f.gamma !== undefined ? ` γ${f.gamma}` : ""
  return f.unverified ? `  [unverified · ${f.via}${g}]` : `  [${f.via}${g}]`
}

/** How the run's findings are split by the evidence behind their pairings. */
function reportProvenance(findings: readonly Finding[]): void {
  const byVia: Record<MatchVia, number> = { text: 0, slot: 0, geometry: 0 }
  let paired = 0
  let unverified = 0
  for (const f of findings) {
    if (f.via === undefined) continue
    byVia[f.via]++
    paired++
    if (f.unverified === true) unverified++
  }
  if (paired === 0) return
  const parts = (["text", "slot", "geometry"] as const)
    .filter((v) => byVia[v] > 0)
    .map((v) => `${byVia[v]} ${v}`)
    .join(", ")
  const tail =
    unverified > 0
      ? ` — ${unverified} marked UNVERIFIED: nothing but a weak alignment paired their two elements, so their values are not evidence of drift`
      : ""
  console.log(`pairing evidence: ${parts} (${findings.length - paired} rest on no pair)${tail}`)
}

/**
 * The phase verdict, FIRST — before the findings, because it says how to read them.
 *
 * On a `reconcile` pair the unmatched elements are the headline and the per-element
 * findings are not — they size the problem before a reader starts spending attention on
 * individual colour deltas between elements that were never the same element.
 *
 * Since 2026-09-16 they arrive PLACED, one grouping per side (`report.unmatched`), which
 * is as much of the parked structure map as the evidence earns — a fresh-context model
 * given the comp, both screenshots and the flat list placed 57 of 59 texted elements by
 * itself, so what it lacked was never completeness but organisation. The full
 * correspondence map stays parked (`docs/plan-divergent-matching.md`).
 *
 * Two things this block used to get wrong, both fixed there rather than here:
 * it printed the MATCHER's count over a list holding one fewer, and it told the reader
 * `byRegion` grouped that list when `byRegion` places 11 of the witness's 37 design-only
 * elements (it groups by IMPL containers — see `groupUnmatched`).
 *
 * The findings are still all there, printed below and written to `findings.json`
 * unchanged — this only changes what a reader meets first.
 */
function printPhase(report: ComparisonReport): void {
  const p = report.phase
  if (p === undefined) return
  console.log(`\nPHASE: ${p.phase} — ${p.reason}`)
  console.log(
    `  signals: match rate ${p.matchRate.toFixed(2)} · best axis ${p.axisConfidence.toFixed(2)} (joint ${report.alignment.confidence.toFixed(2)}) · text share ${p.textShare.toFixed(2)}`,
  )
  if (p.phase === "reconcile" && report.matching) {
    const m = report.matching
    console.log(
      `  what to do: read the comp and the implementation as WHOLES and fix the structure before reading findings one by one — the missing-element / extra-element findings below are the raw material, grouped per side here and in \`unmatched\` in findings.json`,
    )
    console.log(
      `  pairings: of ${m.matched}, ${m.matchedVia.text} are text-proven and ${m.matchedVia.geometry} rest on position alone`,
    )
    if (report.unmatched) {
      for (const line of describeUnmatched(
        report.unmatched.design,
        "design element(s) with no counterpart, in the comp's own containers",
      ))
        console.log(line)
      for (const line of describeUnmatched(
        report.unmatched.impl,
        "impl element(s) the design does not have, in the implementation's containers",
      ))
        console.log(line)
    }
  }
}

/**
 * The pairings that crossed the shared-text bound — printed on EVERY pair, not
 * only `reconcile` ones: the longest list in the corpus (17) is on a `polish`
 * pair, and step 5 found mis-pairings on the two best-corresponding pairs in
 * the corpus. Capped at six rows like the region lines, with the rest in
 * `findings.json`; a busy tail is not orientation.
 */
function printDistant(report: ComparisonReport, limit = 6): void {
  const rows = report.distant
  if (rows === undefined || rows.length === 0) return
  console.log(
    `\nDISTANT PAIRINGS: ${rows.length} pairing(s) formed across more than the matcher's own shared-text bound`,
  )
  console.log(
    `  A list to CHECK, not defects — measured across 52 pairs, 74 of 79 such pairings were RIGHT (an element the`,
  )
  console.log(
    `  implementation relocated). But the corpus's worst mis-pairing is here too, and it has no tell: identical`,
  )
  console.log(
    `  strings, so no text-content finding. Read both boxes before believing any finding that names one of these.`,
  )
  const box = (b: { x: number; y: number; w: number; h: number }): string =>
    `(${Math.round(b.x)}, ${Math.round(b.y)}) ${Math.round(b.w)}×${Math.round(b.h)}`
  for (const r of rows.slice(0, limit)) {
    const d = r.designText === undefined ? "" : ` "${r.designText}"`
    const i = r.implText === undefined ? "" : ` "${r.implText}"`
    console.log(
      `    ${r.via.padEnd(8)} γ${r.gamma.toFixed(1).padStart(7)}  design${d} ${box(r.designBox)}  →  impl${i} ${box(r.implBox)}`,
    )
  }
  if (rows.length > limit)
    console.log(`    ${rows.length - limit} more — see \`distant\` in findings.json`)
}

function printReport(report: ComparisonReport): void {
  printPhase(report)
  printDistant(report)
  const counts = { critical: 0, major: 0, minor: 0 }
  for (const f of report.findings) counts[f.severity]++
  const instances = report.findings.reduce((n, f) => n + (f.instances ?? 1), 0)
  const aggregated = instances !== report.findings.length ? ` covering ${instances} instances` : ""
  const explained = report.findings.filter((f) => f.explained !== undefined)
  const openN = report.findings.length - explained.length
  console.log(
    `\n${report.findings.length} findings (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor)${aggregated}, ${report.suppressed.length} suppressed`,
  )
  // The number a person is meant to act on is the UNEXPLAINED one; the rest carry a diagnosed cause
  // and are printed under it, never hidden.
  if (explained.length > 0) {
    const byCause = new Map<string, number>()
    for (const f of explained)
      byCause.set(f.explained!.cause, (byCause.get(f.explained!.cause) ?? 0) + 1)
    console.log(
      `  ${openN} unexplained · ${explained.length} explained: ${[...byCause]
        .sort((a, b) => b[1] - a[1])
        .map(([cause, n]) => `${n} ${cause}`)
        .join(", ")}`,
    )
  }
  // Unexplained first: they are the list, the explained ones are the context.
  const ordered = [...report.findings].sort(
    (a, b) => (a.explained === undefined ? 0 : 1) - (b.explained === undefined ? 0 : 1),
  )
  for (const f of ordered.slice(0, 40)) {
    const times = f.instances !== undefined ? ` ×${f.instances}` : ""
    const why = f.explained ? ` [${f.explained.cause}]` : ""
    console.log(
      `  [${f.mark}]${times} ${f.severity.padEnd(8)} ${f.type.padEnd(15)} ${f.message}${why}${provenanceTag(f)}`,
    )
  }
  if (report.findings.length > 40) console.log(`  … ${report.findings.length - 40} more`)
  reportProvenance(report.findings)
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
      console.log(
        `  ⚠ ${hidden.length} suppressed finding(s) moved ≥8px — a rule is hiding geometry:`,
      )
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
    const vs =
      previousRunNumber === undefined
        ? previousRun
        : `run ${previousRunNumber} (run ${report.run} now)`
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
  outRoot: string,
  runBleed: number | undefined,
  noFigmaCache = false,
): Promise<Result<{ specs: PairSpec[]; prefetched: Map<string, Prefetched> }, CaptureError>> {
  if (spec.design.kind !== "figma" || spec.design.variants === undefined) {
    // Not a set: no index. An entry with one pair has nothing to be the index OF.
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

  // The set index: what this set CONTAINS, which the run dirs cannot say —
  // they are only what was measured.
  //
  // Written HERE, not by the caller on the success path, and the difference is
  // not cosmetic: the /images and /variables calls below can fail (rate limit,
  // a cooldown, a dead token), and on that path the whole entry returns a
  // typed error. An index built above and returned below would be lost on
  // exactly the runs where "what is this set supposed to contain?" is the
  // question — which is the invisible-coverage failure this artifact exists to
  // end. Everything it needs is in hand at this line, so it lands at this line.
  //
  // The same reasoning covers the empty expansion: a set whose every variant
  // skipped still records its cells and their reasons, and that is the case
  // where the run root ends up with not one directory.
  const index = buildSetIndex({
    entryId: spec.id,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    designRef: `${design.fileKey}#${design.nodeId}${version ? `@${version}` : ""}`,
    axes: variantAxes(set),
    ...(spec.gallery !== undefined ? { gallery: spec.gallery } : {}),
    expansion: expanded.value,
  })
  const wrote = await writeSetIndex(outRoot, index)
  // The gallery clause names the declared axes rather than saying "declared":
  // a `columns` naming a property this set does not define is shape-valid (the
  // manifest parser has no node), and reading it back beside `axes from …` is
  // where a reader can see the mismatch at all until a consumer resolves it.
  // `order` is named too, and by PROPERTY rather than as a boolean: a pin is the
  // one gallery field that overrides what the axes say, so a reader comparing
  // this line against `axes from definitions` has to know which properties are
  // no longer coming from there. Whether each pin AGREES with the axes is the
  // sheet's to report — it holds both — but a pin nobody can see in the log is
  // a silent reordering.
  const pinned = Object.keys(index.gallery?.order ?? {})
  const galleryAxes = [
    index.gallery?.columns !== undefined ? `columns=${index.gallery.columns}` : "",
    index.gallery?.rows !== undefined ? `rows=${index.gallery.rows}` : "",
    pinned.length > 0 ? `order pinned for ${pinned.join(",")}` : "",
  ].filter(Boolean)
  const galleryNote =
    index.gallery === undefined ? "" : `, gallery ${galleryAxes.join(" ") || "labels/order only"}`
  console.log(
    wrote.ok
      ? `  set index: ${wrote.value} (${index.pairs.length} pairs, ${index.skipped.length} skipped, axes from ${index.axes.source}${galleryNote})`
      : `  set index NOT written for ${wrote.error.entryId}: ${wrote.error.detail}`,
  )
  if (expanded.value.pairs.length === 0) return ok({ specs: [], prefetched: new Map() })

  // Resolved before the variables call, because that call is cacheable too —
  // one per set, 14 of a 14-entry run's 83.
  const cacheVersion = !noFigmaCache && isCacheable(version) ? version : undefined
  const cacheRoot = cacheVersion ? defaultFigmaCacheRoot() : undefined
  if (cacheRoot && cacheVersion) {
    const dropped = await pruneOtherVersions(cacheRoot, design.fileKey, cacheVersion)
    if (dropped > 0) console.log(`  figma cache: dropped ${dropped} stale version(s) of this file`)
  }

  const varPath =
    cacheRoot && cacheVersion
      ? variablesCachePath(cacheRoot, design.fileKey, cacheVersion)
      : undefined
  const cachedVars = varPath ? await readCache(varPath) : undefined
  let variables: Result<FigmaVariablesResponse | undefined, FigmaApiError> | undefined
  if (cachedVars) {
    try {
      // `null` is a CACHED ANSWER, not a miss: "looked, this file has none".
      // Most files are not Enterprise, so the endpoint 403s and refdiff reads
      // tokens off the node tree instead — without caching that, the 14 calls
      // this is here to save go out on every run of every non-Enterprise file.
      const parsed = JSON.parse(cachedVars.toString("utf8")) as FigmaVariablesResponse | null
      variables = ok(parsed ?? undefined)
    } catch {
      variables = undefined // a truncated entry is a miss, never a crash
    }
  }
  if (variables === undefined) {
    variables = await client.localVariables(design.fileKey)
    if (variables.ok && varPath) await writeCache(varPath, JSON.stringify(variables.value ?? null))
  }
  if (!variables.ok) return err(apiErr(variables.error))
  const scale = design.scale ?? figmaScale ?? FIGMA_DEFAULTS.scale
  const byId = new Map(set.children?.map((c) => [c.id, c]) ?? [])

  // `use_absolute_bounds` is one query parameter for the whole chunk, and
  // whether a cell NEEDS the render bounds is a per-cell fact — a set's Focus
  // column paints a ring and its Default column does not. So the ids are split
  // and rendered in two batches rather than one, or every cell would inherit
  // whichever answer the first one needed. Both batches still chunk internally,
  // so the request count is unchanged in the common case where one side is
  // empty. The condition below MUST match `captureFigma`'s, since that is what
  // sizes the PNG check: a cell rendered one way and verified the other fails
  // as `figma-render-failed` with a size mismatch that reads like a Figma bug.
  const wantsBleed = (design.bleed ?? spec.bleed ?? runBleed ?? 0) > 0
  const bled = new Set(
    wantsBleed
      ? expanded.value.pairs
          .filter((p) => {
            const child = byId.get(p.nodeId)
            return child !== undefined && figmaRenderBleed(child) !== undefined
          })
          .map((p) => p.nodeId)
      : [],
  )
  // Nodes whose PNG is already cached AT THIS VERSION need no `/v1/images`
  // request — that endpoint is the one that rate-limits, and it is 55 of a full
  // run's 83 calls. The key includes `absoluteBounds`, so a cell cached under
  // one setting does not satisfy the other. A new file version changes every
  // key, so an edited file refetches without anyone clearing anything.
  const cachedIds = new Set<string>()
  if (cacheRoot && cacheVersion) {
    const { access } = await import("node:fs/promises")
    for (const pair of expanded.value.pairs) {
      const path = imageCachePath(cacheRoot, {
        fileKey: design.fileKey,
        version: cacheVersion,
        nodeId: pair.nodeId,
        scale,
        absoluteBounds: !bled.has(pair.nodeId),
      })
      const there = await access(path).then(
        () => true,
        () => false,
      )
      if (there) cachedIds.add(pair.nodeId)
    }
    if (cachedIds.size > 0) {
      console.log(
        `  figma cache: ${cachedIds.size}/${expanded.value.pairs.length} renders served from disk (version ${cacheVersion})`,
      )
    }
  }

  const images: Record<string, string | null> = {}
  for (const absoluteBounds of [true, false]) {
    const ids = expanded.value.pairs
      .map((p) => p.nodeId)
      .filter((id) => bled.has(id) !== absoluteBounds && !cachedIds.has(id))
    if (ids.length === 0) continue
    const r = await client.renderImages(design.fileKey, ids, scale, {
      ...(version ? { version } : {}),
      ...(absoluteBounds ? {} : { absoluteBounds: false }),
    })
    if (!r.ok) return err(apiErr(r.error))
    Object.assign(images, r.value)
  }
  if (bled.size > 0) {
    console.log(
      `  design bleed: ${bled.size}/${expanded.value.pairs.length} cells paint outside their box — rendered at their render bounds`,
    )
  }
  const prefetched = new Map<string, Prefetched>()
  const specs: PairSpec[] = expanded.value.pairs.map((p) => {
    const id = `${spec.id}--${p.slug}`
    const url = images[p.nodeId]
    prefetched.set(id, {
      document: byId.get(p.nodeId)!,
      ...(version ? { version } : {}),
      variables: variables.value ?? null,
      ...(url ? { imageUrl: url } : {}),
    })
    // Pure, and unit-tested in figma-variants.test.ts: this is where an
    // entry-level setting goes missing, silently and on every cell at once.
    return variantSpec(spec, p, design, figmaScale)
  })
  return ok({ specs, prefetched })
}

/**
 * Write one set's index, `<root>/<entryId>.set.json`.
 *
 * A FILE at the root, never a directory: both run-dir walkers filter on
 * `isDirectory()` (`readRunDirs` below, and the annotator's own), so a file is
 * invisible to them with no exclusion to remember, where a `sets/` directory
 * would be read as a run dir — counted by `summary` and drawn as a broken
 * card in the Library until every walker special-cased it.
 *
 * Per-set and NEVER fatal (CLAUDE.md: one bad pair must never kill a run). A
 * set is expensive; losing 41 measured pairs to a failed 4 KB write would be
 * the costliest possible failure. The failure is a value, printed with its
 * cause by the caller — and it deliberately does NOT set `anyError`, because
 * the exit code means "a pair failed to compare" and a run whose measurements
 * are all sound must not claim otherwise over its provenance file.
 */
async function writeSetIndex(
  root: string,
  index: SetIndex,
): Promise<
  Result<string, { kind: "set-index-write"; entryId: string; path: string; detail: string }>
> {
  const path = resolve(join(root, setIndexFileName(index.entryId)))
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8")
    return ok(path)
  } catch (e) {
    return err({
      kind: "set-index-write",
      entryId: index.entryId,
      path,
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}

async function loadManifest(file: string): Promise<PairSpec[]> {
  const mod: Record<string, unknown> = await import(pathToFileURL(resolve(file)).href)
  const parsed = parseManifest(mod["manifest"] ?? mod["default"], mod["sections"])
  if (!parsed.ok) fail(`invalid manifest ${file}: ${JSON.stringify(parsed.error)}`)
  for (const s of parsed.value.skipped) console.log(`skipping ${s.id}: ${s.reason}`)
  // Only for a manifest that opted in, so nothing changes for one that has not
  // — and printed at all because a declaration with no output is
  // indistinguishable from a key the parser never read. This line is what says
  // the hierarchy arrived. `sections` itself is not persisted into the out root
  // yet: the library surface that draws it is the consumer that decides the
  // artifact's shape (docs/plan-gallery-groups.md, chunk 5 prerequisite 5).
  const placed = parsed.value.pairs.filter((p) => p.section !== undefined)
  if (parsed.value.sections.length > 0 || placed.length > 0) {
    console.log(
      `hierarchy: ${parsed.value.sections.length} sections declared, ${placed.length}/${parsed.value.pairs.length} entries placed`,
    )
  }
  return parsed.value.pairs
}

async function compare(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      // `multiple` so a REPEATED flag accumulates instead of the last one
      // silently winning. Node's parseArgs keeps only the last occurrence of a
      // non-multiple option, so `--pair a --pair b` used to run b alone — and a
      // run that measured half of what you asked for looks completely healthy in
      // the log. Both forms now work: repeat the flag, comma-separate, or mix.
      pair: { type: "string", multiple: true },
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
      bleed: { type: "string" },
      ground: { type: "string" },
      "no-figma-cache": { type: "boolean" },
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

  const noFigmaCache = values["no-figma-cache"] === true
  const ground = readGround(values.ground)
  if (values.ground !== undefined && ground === undefined)
    fail('--ground must be "transparent" (default) or "keep"')

  let bleed: number | undefined
  if (values.bleed !== undefined) {
    bleed = Number(values.bleed)
    if (!Number.isFinite(bleed) || bleed < 0 || bleed > 200)
      fail("--bleed must be 0..200 CSS px of margin around the captured node")
  }

  const dataSlotText = values["data-slot-text"] ?? []
  if (dataSlotText.length > 0 && values["data-slots"]) {
    fail(
      "--data-slot-text narrows which pairs count as data slots; --data-slots takes them all — pass one or the other",
    )
  }
  // Default OFF: every text difference is reported. Which strings are data is a
  // per-pair judgement, and guessing it centrally hides copy regressions.
  //
  // `runWidePolicy` OMITS a key nobody asked for, which is load-bearing rather
  // than tidy — this policy is merged last, so a key written here overrides every
  // pair's own. See its doc comment for the defect that shape caused.
  const policy: IgnorePolicy = runWidePolicy({
    dataSlotText,
    ...(values["data-slots"] === true ? { dataSlots: true } : {}),
    ...(values.scope !== undefined ? { scope: values.scope } : {}),
    ...(values["ignore-text"]?.length ? { textPatterns: values["ignore-text"] } : {}),
  })
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
  // Cell-level `--pair` selection (see the manifest branch below). Empty in every other
  // mode, which is what keeps the post-expansion filter a no-op for them.
  let cellSelectors: string[] = []
  let wholeEntries = new Set<string>()
  const entryOf = (id: string): string => id.split("--")[0] ?? id
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
      ?.flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean)
    // A selector names an ENTRY (`button-ghost`) or ONE EXPANDED CELL
    // (`button-ghost--state-hover_variant-primary_size-sm`). Only entries exist at this
    // point — variants expand further down — so an entry is selected here and the
    // cell-level selectors are kept for the post-expansion filter. Without it the only
    // way to re-measure one cell of a 34-cell set was to re-run all 34, Figma calls
    // included, which is the cost the fix loop pays most often.
    specs = only ? all.filter((p) => only.some((sel) => entryOf(sel) === p.id)) : all
    cellSelectors = only?.filter((sel) => sel.includes("--")) ?? []
    wholeEntries = new Set(only?.filter((sel) => !sel.includes("--")) ?? [])
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
    // Outside manifest mode `--pair` NAMES the one pair, so several is a
    // contradiction rather than a selection — say so instead of picking one.
    if (values.pair && values.pair.length > 1)
      fail(
        "--pair names the single pair's identity here; pass it once (a manifest run selects many with --pair a,b)",
      )
    specs = [{ id: values.pair?.[0] ?? `${designId}--${implId}`, design, impl }]
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
      const r = await expandFigmaSet(spec, figmaScale, outRoot ?? "out", bleed, noFigmaCache)
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
    if (cellSelectors.length > 0) {
      const wanted = new Set(cellSelectors)
      // An entry named without `--` stays WHOLE, so `--pair alert,button-ghost--<cell>`
      // means all of alert and one cell of button-ghost. A non-set entry never expands,
      // so its id has no `--` and it matches through wholeEntries like any other.
      specs = expanded.filter((p) => wanted.has(p.id) || wholeEntries.has(entryOf(p.id)))
      if (specs.length === 0) {
        fail(
          `no pair matched ${[...wanted].join(", ")} after variant expansion — check the cell id against <out-root>/<entry>.set.json`,
        )
      }
    }
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
        ...(bleed !== undefined ? { bleed } : {}),
        ...(ground !== undefined ? { ground } : {}),
        ...(noFigmaCache ? { noFigmaCache } : {}),
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

async function drift(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      axis: { type: "string" },
      step: { type: "string" },
      top: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help || positionals.length !== 1) {
    console.log(USAGE)
    if (!values.help) process.exit(2)
    return
  }
  const runDir = resolve(positionals[0]!)
  const file = join(runDir, "elements.json")
  const raw = await readFile(file, "utf8").catch(() => undefined)
  if (raw === undefined)
    fail(`drift: no elements.json in ${runDir} — point at a RUN dir (the one holding findings.json)`)
  const parsed = JSON.parse(raw) as Parameters<typeof driftWalk>[0]
  const axis = (values.axis ?? "y") as DriftAxis
  if (axis !== "y" && axis !== "x") fail(`drift: --axis must be y or x, got "${values.axis}"`)
  const walk = driftWalk(parsed, {
    axis,
    ...(values.step !== undefined ? { stepTolerance: Number(values.step) } : {}),
  })
  if (values.json) {
    console.log(JSON.stringify(walk, null, 2))
    return
  }
  console.log(
    formatDriftWalk(walk, ...(values.top !== undefined ? [{ top: Number(values.top) }] : [])),
  )
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
  case "drift":
    await drift(rest)
    break
  case undefined:
  case "--help":
  case "help":
    console.log(USAGE)
    break
  default:
    fail(`unknown command "${command}"\n\n${USAGE}`)
}
