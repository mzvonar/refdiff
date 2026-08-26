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
import { captureStorybook } from "./adapters/storybook.js";
import { ensureStorybook } from "./adapters/storybook-server.js";
import { parseManifest, type PairSpec } from "./manifest.js";
import { normalize, pairRefs } from "./pipeline.js";
import type { CaptureError } from "./pipeline.js";
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

Compare Claude Design (.dc.html) frames against Storybook stories.

One pair:
  --design-dir <dir>      directory containing the .dc.html comps
  --design-file <file>    comp file name, e.g. doc-detail-modal.dc.html
  --design-frame <frame>  frame id or data-screen-label inside the comp
  --story <storyId>       storybook story id
  --pair <id>             pair identity (default: derived from frame+story)
  --viewport <WxH>        impl viewport, e.g. 760x740 (default 1200x900)
  --overlay               story portals to <body> (dialog/sheet) — shoot viewport

Manifest mode (uctoinak manifest.mjs shape, optional \`ignore\` per pair):
  --manifest <file>       run every storybook pair of the manifest
  --design-dir <dir>      directory the manifest's design.file names live in
  --pair <id[,id…]>       run only these manifest ids

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

interface RunOptions {
  designDir: string;
  storybookUrl: string;
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

/** One pair through the whole pipeline. Capture errors are data. */
async function runPair(
  browser: Browser,
  spec: PairSpec,
  o: RunOptions,
): Promise<Result<ComparisonReport, PairError>> {
  const previous = await readPreviousReport(o.outDir);
  const policy = mergePolicies(spec.ignore, o.policy);
  const designSource = {
    ...spec.design,
    dir: resolve(o.designDir),
    ...(policy.scope !== undefined ? { scope: policy.scope } : {}),
  };

  console.log(`capturing design: ${spec.design.file}#${spec.design.frame}`);
  const design = await captureDcHtml(browser, designSource, {
    pngPath: join(o.outDir, "design.png"),
  });
  if (!design.ok) return err({ side: "design", error: design.error });
  const d = design.value;
  console.log(
    `  ${d.width}x${d.height} css px, ${d.elements.length} leaf elements, scope ${d.scope?.mode ?? "frame"} (${d.scope?.selector ?? "-"})`,
  );

  console.log(`capturing impl: ${spec.impl.storyId}`);
  const impl = await captureStorybook(
    browser,
    { ...spec.impl, url: o.storybookUrl },
    { pngPath: join(o.outDir, "impl.png") },
  );
  if (!impl.ok) return err({ side: "impl", error: impl.error });
  const i = impl.value;
  console.log(`  ${i.width}x${i.height} css px, ${i.elements.length} leaf elements`);

  const normalized = normalize(pairRefs(spec.id, d, i));
  if (normalized.designScale !== 1) {
    console.log(`normalized design side by ×${normalized.designScale.toFixed(4)}`);
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
      "storybook-url": { type: "string" },
      "storybook-dir": { type: "string" },
      "storybook-open": { type: "boolean" },
      story: { type: "string" },
      viewport: { type: "string" },
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

  const designDir = values["design-dir"] ?? fail(USAGE);
  const storybookUrl =
    values["storybook-url"] ?? process.env["VC_STORYBOOK_URL"] ?? "http://localhost:6006";
  const failThreshold = (values["fail-threshold"] ?? "major") as Severity;
  if (!["critical", "major", "minor"].includes(failThreshold)) {
    fail(`--fail-threshold must be critical|major|minor, got "${failThreshold}"`);
  }
  const maxGamma = values["max-gamma"] !== undefined ? Number(values["max-gamma"]) : undefined;

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
    const designFile = values["design-file"] ?? fail(USAGE);
    const designFrame = values["design-frame"] ?? fail(USAGE);
    const storyId = values.story ?? fail(USAGE);
    const viewport = parseViewport(values.viewport);
    specs = [
      {
        id: values.pair ?? `${designFrame}--${storyId}`,
        design: { kind: "dc-html", file: designFile, frame: designFrame, ...(viewport ? { viewport } : {}) },
        impl: {
          kind: "storybook",
          storyId,
          ...(viewport ? { viewport } : {}),
          ...(values.overlay ? { overlay: true } : {}),
        },
      },
    ];
  }

  const outRoot = values.out;

  // Storybook: reuse a running one; otherwise start our own (no browser tab
  // unless --storybook-open) when a project dir is known.
  const storybookDir = values["storybook-dir"] ?? process.env["VC_STORYBOOK_DIR"];
  let stopStorybook = async (): Promise<void> => {};
  if (storybookDir !== undefined) {
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
        designDir,
        storybookUrl,
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
