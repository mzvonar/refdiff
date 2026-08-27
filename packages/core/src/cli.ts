#!/usr/bin/env node
/**
 * visual-compare CLI.
 *
 * Implemented:
 *   compare   run the pipeline for one design-frame / storybook-story pair,
 *             or for every storybook pair of a manifest (--manifest)
 *
 * Planned (docs/architecture.md): inspect, explore, report.
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser } from "playwright";

import { launchBrowser } from "./adapters/browser.js";
import { captureDcHtml } from "./adapters/dc-html.js";
import { captureFigma, FIGMA_DEFAULTS } from "./adapters/figma.js";
import { parseFigmaRef } from "./adapters/figma-api.js";
import { captureLiveUrl } from "./adapters/live-url.js";
import { captureStorybook } from "./adapters/storybook.js";
import { ensureStorybook } from "./adapters/storybook-server.js";
import { parseManifest, type LiveSpec, type PairSpec } from "./manifest.js";
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
import type { ComparisonReport, IgnorePolicy, Severity } from "./types.js";

const USAGE = `Usage: visual-compare compare [options]

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
design { file, frame } or { kind: "figma", fileKey, nodeId }; app
{ source: "storybook", storyId } or { source: "live", route, role? }):
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
{ previousRun, resolved, introduced } (identity by content + place, not id).

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
      { pngPath },
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
  const { offsetX, offsetY, confidence } = aligned.alignment;
  console.log(
    `aligned design by (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})px (confidence ${confidence.toFixed(2)})`,
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
    ...(previous !== undefined ? { previous } : {}),
  });
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
    const { introduced, resolved, previousRun } = report.delta;
    console.log(
      `delta vs ${previousRun}: +${introduced.length} introduced / −${resolved.length} resolved${
        introduced.length > 0 ? ` (introduced: ${introduced.join(", ")})` : ""
      }`,
    );
  }
  console.log(`verdict: ${report.verdict.pass ? "PASS" : "FAIL"} (threshold: ${report.verdict.failThreshold})`);
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
  let anyError = false;
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
    }
  } finally {
    await browser.close();
    await stopStorybook();
  }
  process.exit(anyError ? 2 : anyFail ? 1 : 0);
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "compare":
    await compare(rest);
    break;
  case undefined:
  case "--help":
  case "help":
    console.log(USAGE);
    break;
  default:
    fail(`unknown command "${command}"\n\n${USAGE}`);
}
