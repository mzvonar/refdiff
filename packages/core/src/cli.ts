#!/usr/bin/env node
/**
 * visual-compare CLI.
 *
 * Implemented:
 *   compare   run the pipeline for one design-frame / storybook-story pair,
 *             or for every storybook pair of a manifest (--manifest)
 *   summary   one table over every run dir under an out root (a component
 *             set's cells, a manifest's pairs) + the causes shared across them
 *
 * Planned (docs/architecture.md): inspect, explore, report.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser } from "playwright";

import { launchBrowser } from "./adapters/browser.js";
import { captureDcHtml } from "./adapters/dc-html.js";
import { captureFigma, FIGMA_DEFAULTS, type FigmaCaptureOptions } from "./adapters/figma.js";
import { FigmaClient, parseFigmaRef, readToken } from "./adapters/figma-api.js";
import { expandVariants } from "./adapters/figma-variants.js";
import { captureLiveUrl } from "./adapters/live-url.js";
import { captureStorybook } from "./adapters/storybook.js";
import { ensureStorybook } from "./adapters/storybook-server.js";
import { parseManifest, readAccepted, type LiveSpec, type PairSpec } from "./manifest.js";
import { defaultDesignScale, normalize, pairRefs } from "./pipeline.js";
import type { Capture, CaptureError, LiveAuth } from "./pipeline.js";
import { applyPolicy, mergePolicies } from "./policy.js";
import { err, ok, type Result } from "./result.js";
import { aggregate } from "./structural/aggregate.js";
import { alignStructural } from "./structural/align.js";
import { matchElements } from "./structural/match.js";
import { finalize, runTypedChecks, type RawFinding } from "./structural/checks.js";
import { diffMatches, writeDiffMask } from "./pixel/diff.js";
import { lowConfidenceFinding, PIXEL_DEFAULTS, runPixelChecks } from "./pixel/checks.js";
import { packageForModel } from "./package/package-for-model.js";
import { emptyLedger, parseLedger, recordResolved, type ResolvedLedger } from "./package/delta.js";
import { renderSummary, summarizeReports } from "./package/summary.js";
import type { ComparisonReport, IgnorePolicy, Severity } from "./types.js";

const USAGE = `Usage: visual-compare compare [options]
       visual-compare summary <out-root> [--json]

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
  --app-url <origin>      origin for relative live routes (default $VC_APP_URL)
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
                          optional "role" narrows it ({"type":"missing-element",
                          "role":"box","reason":"focus ring …"}); for pixel-region,
                          "changeKind" narrows to shape|color|hue-rotation|added|
                          removed|stroke|noise ({"type":"pixel-region","role":"icon",
                          "changeKind":"shape","reason":"placeholder icon …"})
  --no-data-slots         report text differences on matched pairs (default:
                          suppressed as demo data — the "data-slot" rule)

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
  --max-gamma <px>        element-match cutoff (default 100)

Suppressed findings are never dropped: findings.json lists them under
\`suppressed\` with the rule that hit each one. When --out already holds a
findings.json from a previous run, the new report carries \`delta\`
{ previousRun, resolved, introduced, regressions? } (identity by content +
place, not id). resolved-ledger.json in the run dir remembers everything
earlier runs resolved; an introduced finding matching it is a regression.

Set summary — reading one findings.json per cell does not scale to a 41-variant
set, so a multi-pair run ends with ONE table (pair → verdict, counts, alignment
confidence, delta) plus the causes shared across pairs (same type/role/values →
one row listing how many cells show it), and writes it as summary.md +
summary.json into the out root. Rebuild it any time from the run dirs:
  visual-compare summary <out-root>   (--json prints summary.json instead)

Exit codes: 0 pass, 1 findings at/above threshold, 2 capture or usage error.`;

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

function parseViewport(raw: string | undefined): { width: number; height: number } | undefined {
  if (raw === undefined) return undefined;
  const m = /^(\d+)x(\d+)$/.exec(raw);
  if (!m) fail(`--viewport must look like 760x740, got "${raw}"`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

interface LiveOptions {
  appUrl?: string;
  authState?: string;
  authPost?: string;
  authHeaders: Record<string, string>;
}

interface RunOptions {
  designDir?: string;
  storybookUrl: string;
  live: LiveOptions;
  figmaScale?: number;
  minDesignQuality?: number;
  /** Design→impl geometry scale; default per design source (Figma 1, dc-html auto). */
  designScale?: number | "auto";
  outDir: string;
  failThreshold: Severity;
  maxGamma?: number;
  /** CLI-level policy, merged over the pair's own. */
  policy: IgnorePolicy;
  /** Collapse systematic findings (default true). */
  aggregate: boolean;
  /** Run the scoped pixel channel inside matched boxes (default true). */
  pixels: boolean;
  /** Figma inputs a set expansion already fetched for this pair. */
  prefetched?: FigmaCaptureOptions["prefetched"];
}

type PairError = { side: "design" | "impl"; error: CaptureError };

/**
 * The previous run's report in `outDir`, if a well-formed one is there. Read
 * BEFORE the run writes anything, so the relative verdict compares against
 * what the last run actually said. Unreadable/foreign JSON → no delta.
 */
async function readPreviousReport(outDir: string): Promise<ComparisonReport | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(outDir, "findings.json"), "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { findings?: unknown }).findings) &&
      typeof (parsed as { createdAt?: unknown }).createdAt === "string"
    ) {
      return parsed as ComparisonReport;
    }
  } catch {
    // ENOENT or malformed: first run of this pair.
  }
  return undefined;
}

const LEDGER_FILE = "resolved-ledger.json";

/** The pair's ledger of findings earlier runs resolved (fresh when absent/foreign). */
async function readLedger(outDir: string, pair: string): Promise<ResolvedLedger> {
  try {
    return parseLedger(JSON.parse(await readFile(join(outDir, LEDGER_FILE), "utf8")), pair);
  } catch {
    return emptyLedger(pair);
  }
}

/** Absolute URL for a live route: absolute as-is, else under --app-url. */
function resolveLiveUrl(route: string, appUrl: string | undefined): Result<string, string> {
  if (/^https?:\/\//i.test(route)) return ok(route);
  if (!appUrl) return err(`live route "${route}" is relative — pass --app-url <origin> (or $VC_APP_URL)`);
  return ok(`${appUrl.replace(/\/$/, "")}${route.startsWith("/") ? "" : "/"}${route}`);
}

/** The auth hook for a live spec, from the CLI's auth flags. */
function liveAuth(spec: LiveSpec, o: LiveOptions, url: string): LiveAuth | undefined {
  if (o.authState) return { kind: "storage-state", path: o.authState };
  if (o.authPost) {
    const role = spec.role ?? "user";
    const postUrl = /^https?:\/\//i.test(o.authPost) ? o.authPost : new URL(o.authPost, url).href;
    return {
      kind: "post",
      url: postUrl,
      headers: o.authHeaders,
      body: { role, email: `__test__${role}@example.com`, name: `visual-compare ${role}` },
    };
  }
  return undefined;
}

async function captureDesign(
  browser: Browser,
  spec: PairSpec,
  scope: string | undefined,
  o: RunOptions,
): Promise<Result<Capture, CaptureError>> {
  const pngPath = join(o.outDir, "design.png");
  if (spec.design.kind === "figma") {
    console.log(`capturing design: figma ${spec.design.fileKey}#${spec.design.nodeId}`);
    return captureFigma(
      {
        ...spec.design,
        ...(o.figmaScale !== undefined && spec.design.scale === undefined ? { scale: o.figmaScale } : {}),
        ...(o.minDesignQuality !== undefined && spec.design.minQuality === undefined
          ? { minQuality: o.minDesignQuality }
          : {}),
      },
      { pngPath, ...(o.prefetched ? { prefetched: o.prefetched } : {}) },
    );
  }
  if (o.designDir === undefined) {
    return err({ kind: "capture-failed", ref: `${spec.design.file}#${spec.design.frame}`, detail: "--design-dir is required for .dc.html designs" });
  }
  console.log(`capturing design: ${spec.design.file}#${spec.design.frame}`);
  return captureDcHtml(
    browser,
    { ...spec.design, dir: resolve(o.designDir), ...(scope !== undefined ? { scope } : {}) },
    { pngPath },
  );
}

async function captureImpl(browser: Browser, spec: PairSpec, o: RunOptions): Promise<Result<Capture, CaptureError>> {
  const pngPath = join(o.outDir, "impl.png");
  if (spec.impl.kind === "live-url") {
    const { route, role, ...rest } = spec.impl;
    void role;
    const url = resolveLiveUrl(route, o.live.appUrl);
    if (!url.ok) return err({ kind: "capture-failed", ref: `live:${route}`, detail: url.error });
    console.log(`capturing impl: ${url.value}`);
    const auth = liveAuth(spec.impl, o.live, url.value);
    return captureLiveUrl(browser, { ...rest, url: url.value, ...(auth ? { auth } : {}) }, { pngPath });
  }
  console.log(`capturing impl: ${spec.impl.storyId}`);
  return captureStorybook(browser, { ...spec.impl, url: o.storybookUrl }, { pngPath });
}

/** One pair through the whole pipeline. Capture errors are data. */
async function runPair(
  browser: Browser,
  spec: PairSpec,
  o: RunOptions,
): Promise<Result<ComparisonReport, PairError>> {
  const previous = await readPreviousReport(o.outDir);
  const ledger = await readLedger(o.outDir, spec.id);
  const policy = mergePolicies(spec.ignore, o.policy);

  const design = await captureDesign(browser, spec, policy.scope, o);
  if (!design.ok) return err({ side: "design", error: design.error });
  const d = design.value;
  console.log(
    `  ${d.width}x${d.height} css px @${d.dpr}x, ${d.elements.length} leaf elements, scope ${d.scope?.mode ?? "frame"} (${d.scope?.selector ?? "-"})${
      d.quality ? `, design quality ${d.quality.score} (${d.quality.bound}/${d.quality.leaves} bound)` : ""
    }`,
  );

  const impl = await captureImpl(browser, spec, o);
  if (!impl.ok) return err({ side: "impl", error: impl.error });
  const i = impl.value;
  console.log(`  ${i.width}x${i.height} css px, ${i.elements.length} leaf elements`);

  const scalePolicy = o.designScale ?? defaultDesignScale(d);
  const normalized = normalize(pairRefs(spec.id, d, i), { designScale: scalePolicy });
  if (normalized.designScale !== 1) {
    console.log(`normalized design side by ×${normalized.designScale.toFixed(4)} (--design-scale ${scalePolicy})`);
  } else if (Math.abs(i.width / d.width - 1) >= 0.05) {
    console.log(
      `design ${d.width}px wide vs impl ${i.width}px, kept at scale 1 (--design-scale ${scalePolicy}): a layout difference, not a scale`,
    );
  }

  const aligned = alignStructural(normalized);
  const { offsetX, offsetY, confidence, basis } = aligned.alignment;
  console.log(
    `aligned design by (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})px (confidence ${confidence.toFixed(2)}${basis ? `, basis: ${basis}` : ""})`,
  );

  const match = matchElements(
    aligned.design.elements,
    aligned.impl.elements,
    o.maxGamma !== undefined ? { maxGamma: o.maxGamma } : {},
  );
  const slots = match.matches.filter((m) => m.via === "slot").length;
  console.log(
    `matched ${match.matches.length} elements (${slots} as data slots; ${match.designOnly.length} design-only, ${match.implOnly.length} impl-only)`,
  );

  const structural = runTypedChecks(match);

  // Pixel channel: AA-aware diff inside each matched box, gated on the
  // structural alignment being trustworthy. Never duplicates a structural
  // finding on the same pair.
  let pixel: RawFinding[] = [];
  let diffMaskPath: string | undefined;
  if (o.pixels) {
    if (confidence < PIXEL_DEFAULTS.minConfidence) {
      pixel = [lowConfidenceFinding(aligned.alignment, PIXEL_DEFAULTS.minConfidence)];
      console.log(`pixel channel skipped (confidence ${confidence.toFixed(2)} < ${PIXEL_DEFAULTS.minConfidence})`);
    } else {
      const diffs = await diffMatches(aligned, match.matches);
      pixel = runPixelChecks(diffs, structural);
      diffMaskPath = join(o.outDir, "diff-mask.png");
      await writeDiffMask(aligned, diffs, diffMaskPath);
      console.log(`pixel channel: diffed ${diffs.length} matched boxes, ${pixel.length} pixel-region findings`);
    }
  }

  const { kept, suppressed } = applyPolicy(finalize([...structural, ...pixel]), policy);
  const findings = o.aggregate ? aggregate(kept) : kept;
  const report = await packageForModel(aligned, findings, {
    outDir: o.outDir,
    failThreshold: o.failThreshold,
    suppressed,
    policy,
    ...(diffMaskPath !== undefined ? { diffMaskPath } : {}),
    ...(previous !== undefined ? { previous, ledger } : {}),
  });
  // The ledger remembers every fix across runs, so a finding that comes back
  // three iterations later is still recognised as a regression.
  if (previous !== undefined && report.delta) {
    const next = recordResolved(ledger, previous, report.delta, report.createdAt);
    await writeFile(join(o.outDir, LEDGER_FILE), JSON.stringify(next, null, 2));
  }
  return ok(report);
}

function printReport(report: ComparisonReport): void {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of report.findings) counts[f.severity]++;
  const instances = report.findings.reduce((n, f) => n + (f.instances ?? 1), 0);
  const aggregated = instances !== report.findings.length ? ` covering ${instances} instances` : "";
  console.log(
    `\n${report.findings.length} findings (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor)${aggregated}, ${report.suppressed.length} suppressed`,
  );
  for (const f of report.findings.slice(0, 40)) {
    const times = f.instances !== undefined ? ` ×${f.instances}` : "";
    console.log(`  [${f.mark}]${times} ${f.severity.padEnd(8)} ${f.type.padEnd(15)} ${f.message}`);
  }
  if (report.findings.length > 40) console.log(`  … ${report.findings.length - 40} more`);
  if (report.suppressed.length > 0) {
    const byRule = new Map<string, number>();
    for (const s of report.suppressed) byRule.set(s.suppressedBy, (byRule.get(s.suppressedBy) ?? 0) + 1);
    console.log(
      `  suppressed: ${[...byRule].map(([rule, n]) => `${n} ${rule}`).join(", ")} (see findings.json)`,
    );
  }
  if (report.delta) {
    const { introduced, resolved, previousRun, regressions = [] } = report.delta;
    console.log(
      `delta vs ${previousRun}: +${introduced.length} introduced / −${resolved.length} resolved${
        introduced.length > 0 ? ` (introduced: ${introduced.join(", ")})` : ""
      }`,
    );
    if (regressions.length > 0) {
      const byId = new Map(report.findings.map((f) => [f.id, f]));
      console.log(`REGRESSION: ${regressions.length} previously resolved finding(s) are back:`);
      for (const id of regressions) console.log(`  [${id}] ${byId.get(id)?.message ?? ""}`);
    }
  }
  console.log(`verdict: ${report.verdict.pass ? "PASS" : "FAIL"} (threshold: ${report.verdict.failThreshold})`);
}

type Prefetched = NonNullable<FigmaCaptureOptions["prefetched"]>;

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
    return ok({ specs: [spec], prefetched: new Map() });
  }
  const { variants, ...design } = spec.design;
  const ref = `${design.fileKey}#${design.nodeId}`;
  const token = await readToken();
  if (!token) return err({ kind: "figma-auth", ref, detail: "no Figma token: set $FIGMA_TOKEN or create .figma-token" });
  const client = new FigmaClient(token);
  const apiErr = (e: { kind: string; detail: string; until?: string }): CaptureError =>
    e.kind === "no-token" || e.kind === "auth"
      ? { kind: "figma-auth", ref, detail: e.detail }
      : e.kind === "rate-limited" || e.kind === "cooling-down"
        ? { kind: "figma-rate-limited", ref, until: e.until ?? "", detail: e.detail }
        : { kind: "figma-api", ref, detail: e.detail };

  const nodes = await client.nodes(design.fileKey, [design.nodeId], design.version);
  if (!nodes.ok) return err(apiErr(nodes.error));
  const set = nodes.value.nodes[design.nodeId]?.document;
  if (!set) return err({ kind: "figma-node-not-found", ref, fileKey: design.fileKey, nodeId: design.nodeId });
  const version = design.version ?? nodes.value.version;

  const expanded = expandVariants(set, variants);
  if (!expanded.ok) return err({ kind: "figma-api", ref, detail: `variants: ${JSON.stringify(expanded.error)}` });
  console.log(`${spec.id}: ${set.name} → ${expanded.value.pairs.length} variant pairs, ${expanded.value.skipped.length} skipped`);
  for (const sk of expanded.value.skipped) console.log(`  skipping ${sk.name}: ${sk.reason}`);
  if (expanded.value.pairs.length === 0) return ok({ specs: [], prefetched: new Map() });

  const variables = await client.localVariables(design.fileKey);
  if (!variables.ok) return err(apiErr(variables.error));
  const scale = design.scale ?? figmaScale ?? FIGMA_DEFAULTS.scale;
  const images = await client.renderImages(
    design.fileKey,
    expanded.value.pairs.map((p) => p.nodeId),
    scale,
    version ? { version } : {},
  );
  if (!images.ok) return err(apiErr(images.error));

  const byId = new Map(set.children?.map((c) => [c.id, c]) ?? []);
  const prefetched = new Map<string, Prefetched>();
  const specs: PairSpec[] = expanded.value.pairs.map((p) => {
    const id = `${spec.id}--${p.slug}`;
    const url = images.value[p.nodeId];
    prefetched.set(id, {
      document: byId.get(p.nodeId)!,
      ...(version ? { version } : {}),
      variables: variables.value ?? null,
      ...(url ? { imageUrl: url } : {}),
    });
    return {
      id,
      title: `${spec.title ?? spec.id} — ${p.name}`,
      design: { ...design, nodeId: p.nodeId, ...(figmaScale !== undefined && design.scale === undefined ? { scale } : {}) },
      impl: { ...spec.impl, selector: p.selector },
      ...(spec.ignore ? { ignore: spec.ignore } : {}),
    };
  });
  return ok({ specs, prefetched });
}

async function loadManifest(file: string): Promise<PairSpec[]> {
  const mod: Record<string, unknown> = await import(pathToFileURL(resolve(file)).href);
  const parsed = parseManifest(mod["manifest"] ?? mod["default"]);
  if (!parsed.ok) fail(`invalid manifest ${file}: ${JSON.stringify(parsed.error)}`);
  for (const s of parsed.value.skipped) console.log(`skipping ${s.id}: ${s.reason}`);
  return parsed.value.pairs;
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
      "no-data-slots": { type: "boolean" },
      "no-aggregate": { type: "boolean" },
      "no-pixels": { type: "boolean" },
      out: { type: "string" },
      "fail-threshold": { type: "string" },
      "max-gamma": { type: "string" },
      help: { type: "boolean" },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const designDir = values["design-dir"];
  const figmaScale = values["figma-scale"] !== undefined ? Number(values["figma-scale"]) : undefined;
  if (figmaScale !== undefined && !(figmaScale >= 0.5 && figmaScale <= 4)) fail(`--figma-scale must be 0.5..4`);
  const minDesignQuality =
    values["min-design-quality"] !== undefined ? Number(values["min-design-quality"]) : undefined;
  if (minDesignQuality !== undefined && !(minDesignQuality >= 0 && minDesignQuality <= 1)) {
    fail(`--min-design-quality must be 0..1`);
  }
  const authHeaders: Record<string, string> = {};
  for (const h of values["auth-header"] ?? []) {
    const m = /^([^:=]+)[:=]\s*(.*)$/.exec(h);
    if (!m?.[1]) fail(`--auth-header must look like "Name: value", got "${h}"`);
    authHeaders[m[1].trim()] = m[2] ?? "";
  }
  const appUrl = values["app-url"] ?? process.env["VC_APP_URL"];
  const live: LiveOptions = {
    authHeaders,
    ...(appUrl !== undefined ? { appUrl } : {}),
    ...(values["auth-state"] !== undefined ? { authState: resolve(values["auth-state"]) } : {}),
    ...(values["auth-post"] !== undefined ? { authPost: values["auth-post"] } : {}),
  };
  const storybookUrl =
    values["storybook-url"] ?? process.env["VC_STORYBOOK_URL"] ?? "http://localhost:6006";
  const failThreshold = (values["fail-threshold"] ?? "major") as Severity;
  if (!["critical", "major", "minor"].includes(failThreshold)) {
    fail(`--fail-threshold must be critical|major|minor, got "${failThreshold}"`);
  }
  const maxGamma = values["max-gamma"] !== undefined ? Number(values["max-gamma"]) : undefined;
  let designScale: number | "auto" | undefined;
  if (values["design-scale"] !== undefined) {
    const raw = values["design-scale"];
    designScale = raw === "auto" ? "auto" : Number(raw);
    if (designScale !== "auto" && !(designScale >= 0.1 && designScale <= 10)) fail(`--design-scale must be auto or 0.1..10`);
  }

  const policy: IgnorePolicy = {
    dataSlots: !values["no-data-slots"],
    ...(values.scope !== undefined ? { scope: values.scope } : {}),
    ...(values["ignore-text"]?.length ? { textPatterns: values["ignore-text"] } : {}),
  };
  for (const raw of values.accept ?? []) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      fail(`--accept must be JSON { type, expected?, actual?, reason }, got ${raw}`);
    }
    const a = readAccepted(parsed);
    if (!a) fail(`--accept needs { type, reason } and string/number expected/actual values: ${raw}`);
    policy.accepted = [...(policy.accepted ?? []), a];
  }
  for (const p of policy.textPatterns ?? []) {
    try {
      new RegExp(p, "u");
    } catch (e) {
      fail(`--ignore-text "${p}" is not a valid regex: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let specs: PairSpec[];
  if (values.manifest !== undefined) {
    const all = await loadManifest(values.manifest);
    const only = values.pair?.split(",").map((s) => s.trim()).filter(Boolean);
    specs = only ? all.filter((p) => only.includes(p.id)) : all;
    if (specs.length === 0) fail(`no runnable pairs selected from ${values.manifest}`);
  } else {
    const viewport = parseViewport(values.viewport);
    let design: PairSpec["design"];
    let designId: string;
    if (values.figma !== undefined) {
      const parsed = parseFigmaRef(values.figma);
      if (!parsed.ok) fail(`--figma: ${parsed.error}`);
      design = { kind: "figma", ...parsed.value };
      designId = `figma-${parsed.value.nodeId.replace(":", "-")}`;
    } else {
      const designFile = values["design-file"] ?? fail(USAGE);
      const designFrame = values["design-frame"] ?? fail(USAGE);
      if (designDir === undefined) fail(USAGE);
      design = { kind: "dc-html", file: designFile, frame: designFrame, ...(viewport ? { viewport } : {}) };
      designId = designFrame;
    }
    let impl: PairSpec["impl"];
    let implId: string;
    if (values.url !== undefined) {
      impl = {
        kind: "live-url",
        route: values.url,
        ...(viewport ? { viewport } : {}),
        ...(values.selector !== undefined ? { selector: values.selector } : {}),
        ...(values["wait-for"] !== undefined ? { waitFor: values["wait-for"] } : {}),
        ...(values["full-page"] ? { fullPage: true } : {}),
      };
      implId = values.url.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
    } else {
      const storyId = values.story ?? fail(USAGE);
      impl = {
        kind: "storybook",
        storyId,
        ...(viewport ? { viewport } : {}),
        ...(values.overlay ? { overlay: true } : {}),
        ...(values.selector !== undefined ? { selector: values.selector } : {}),
      };
      implId = storyId;
    }
    specs = [{ id: values.pair ?? `${designId}--${implId}`, design, impl }];
  }

  const outRoot = values.out;

  // Component sets → one pair per variant (typed errors keep the other entries running).
  const prefetched = new Map<string, Prefetched>();
  let anyError = false;
  {
    const expanded: PairSpec[] = [];
    for (const spec of specs) {
      const r = await expandFigmaSet(spec, figmaScale);
      if (!r.ok) {
        anyError = true;
        console.error(`\n${spec.id}: component-set expansion failed (typed error):`);
        console.error(JSON.stringify(r.error, null, 2));
        continue;
      }
      expanded.push(...r.value.specs);
      for (const [k, v] of r.value.prefetched) prefetched.set(k, v);
    }
    specs = expanded;
  }

  // Storybook: reuse a running one; otherwise start our own (no browser tab
  // unless --storybook-open) when a project dir is known.
  const storybookDir = values["storybook-dir"] ?? process.env["VC_STORYBOOK_DIR"];
  const needsStorybook = specs.some((s) => s.impl.kind === "storybook");
  let stopStorybook = async (): Promise<void> => {};
  if (storybookDir !== undefined && needsStorybook) {
    const sb = await ensureStorybook({
      url: storybookUrl,
      dir: resolve(storybookDir),
      open: values["storybook-open"] ?? false,
      log: (line) => console.log(line),
    });
    if (!sb.ok) fail(`${sb.error.kind}: ${sb.error.detail}`);
    stopStorybook = sb.value.stop;
  }

  const browser = await launchBrowser();
  let anyFail = false;
  const done: { dir: string; report: ComparisonReport }[] = [];
  try {
    for (const spec of specs) {
      const outDir = resolve(
        outRoot !== undefined && specs.length === 1 ? outRoot : join(outRoot ?? "out", spec.id),
      );
      console.log(`\n=== ${spec.id}${spec.title ? ` — ${spec.title}` : ""} ===`);
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
        aggregate: !values["no-aggregate"],
        pixels: !values["no-pixels"],
        ...(prefetched.has(spec.id) ? { prefetched: prefetched.get(spec.id)! } : {}),
      });
      if (!result.ok) {
        anyError = true;
        console.error(`\n${spec.id}: ${result.error.side} capture failed (typed error):`);
        console.error(JSON.stringify(result.error.error, null, 2));
        continue;
      }
      printReport(result.value);
      console.log(`report: ${join(outDir, "findings.json")}`);
      if (!result.value.verdict.pass) anyFail = true;
      done.push({ dir: spec.id, report: result.value });
    }
  } finally {
    await browser.close();
    await stopStorybook();
  }
  // A set run ends with the one page the loop actually reads: the console
  // shows the pairs just run; summary.md/json cover EVERY run dir under the
  // root (several sets share one root), exactly what `summary <root>` writes.
  if (specs.length > 1 && done.length > 0) {
    const root = resolve(outRoot ?? "out");
    console.log(`\n${renderSummary(summarizeReports(done), { title: `visual-compare summary — this run` })}`);
    await writeSummary(root, await readRunDirs(root));
    console.log(`summary (all run dirs under the root): ${join(root, "summary.md")}`);
  }
  process.exit(anyError ? 2 : anyFail ? 1 : 0);
}

/** Effect: summary.md + summary.json into `root`; returns the rendered text. */
async function writeSummary(root: string, reports: { dir: string; report: ComparisonReport }[]): Promise<string> {
  const summary = summarizeReports(reports);
  const text = renderSummary(summary, { title: `visual-compare summary — ${root}` });
  await writeFile(join(root, "summary.md"), text);
  await writeFile(join(root, "summary.json"), JSON.stringify(summary, null, 2));
  return text;
}

/** Every `<root>/<dir>/findings.json` (or `<root>/findings.json` itself), oldest run first. */
async function readRunDirs(root: string): Promise<{ dir: string; report: ComparisonReport }[]> {
  const self = await readPreviousReport(root);
  if (self) return [{ dir: root.split("/").filter(Boolean).at(-1) ?? root, report: self }];
  let names: string[];
  try {
    names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    fail(`summary: cannot read ${root}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const runs: { dir: string; report: ComparisonReport }[] = [];
  for (const dir of names.sort()) {
    const report = await readPreviousReport(join(root, dir));
    if (report) runs.push({ dir, report });
  }
  return runs.sort((a, b) => a.report.createdAt.localeCompare(b.report.createdAt));
}

async function summary(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: "boolean" }, help: { type: "boolean" } },
  });
  if (values.help || positionals.length !== 1) {
    console.log(USAGE);
    if (!values.help) process.exit(2);
    return;
  }
  const root = resolve(positionals[0]!);
  const runs = await readRunDirs(root);
  if (runs.length === 0) fail(`summary: no findings.json under ${root}`);
  const text = await writeSummary(root, runs);
  if (values.json) console.log(await readFile(join(root, "summary.json"), "utf8"));
  else console.log(text);
  process.exit(runs.every((r) => r.report.verdict.pass) ? 0 : 1);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "compare":
    await compare(rest);
    break;
  case "summary":
    await summary(rest);
    break;
  case undefined:
  case "--help":
  case "help":
    console.log(USAGE);
    break;
  default:
    fail(`unknown command "${command}"\n\n${USAGE}`);
}
