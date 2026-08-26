#!/usr/bin/env node
/**
 * visual-compare CLI.
 *
 * Implemented:
 *   compare   run the pipeline for one design-frame / storybook-story pair
 *
 * Planned (docs/architecture.md): inspect, explore, report.
 */

import { parseArgs } from "node:util";
import { join, resolve } from "node:path";

import { launchBrowser } from "./adapters/browser.js";
import { captureDcHtml } from "./adapters/dc-html.js";
import { captureStorybook } from "./adapters/storybook.js";
import { normalize, pairRefs } from "./pipeline.js";
import type { Capture, CaptureError } from "./pipeline.js";
import type { Result } from "./result.js";
import { alignStructural } from "./structural/align.js";
import { matchElements } from "./structural/match.js";
import { runTypedChecks } from "./structural/checks.js";
import { packageForModel } from "./package/package-for-model.js";
import type { Severity } from "./types.js";

const USAGE = `Usage: visual-compare compare [options]

Compare one Claude Design (.dc.html) frame against one Storybook story.

Required:
  --design-dir <dir>      directory containing the .dc.html comps
  --design-file <file>    comp file name, e.g. doc-detail-modal.dc.html
  --design-frame <frame>  frame id or data-screen-label inside the comp
  --story <storyId>       storybook story id

Optional:
  --pair <id>             pair identity (default: derived from frame+story)
  --storybook-url <url>   default $VC_STORYBOOK_URL or http://localhost:6006
  --viewport <WxH>        impl viewport, e.g. 760x740 (default 1200x900)
  --overlay               story portals to <body> (dialog/sheet) — shoot viewport
  --out <dir>             run directory (default: out/<pair>)
  --fail-threshold <sev>  critical|major|minor (default major)
  --max-gamma <px>        element-match cutoff (default 100)

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

function unwrapCapture(result: Result<Capture, CaptureError>, side: string): Capture {
  if (result.ok) return result.value;
  console.error(`\n${side} capture failed (typed error):`);
  console.error(JSON.stringify(result.error, null, 2));
  process.exit(2);
}

async function compare(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      pair: { type: "string" },
      "design-dir": { type: "string" },
      "design-file": { type: "string" },
      "design-frame": { type: "string" },
      "storybook-url": { type: "string" },
      story: { type: "string" },
      viewport: { type: "string" },
      overlay: { type: "boolean" },
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
  const designFile = values["design-file"] ?? fail(USAGE);
  const designFrame = values["design-frame"] ?? fail(USAGE);
  const storyId = values.story ?? fail(USAGE);
  const storybookUrl =
    values["storybook-url"] ?? process.env["VC_STORYBOOK_URL"] ?? "http://localhost:6006";
  const viewport = parseViewport(values.viewport);
  const pairId = values.pair ?? `${designFrame}--${storyId}`;
  const outDir = resolve(values.out ?? join("out", pairId));
  const failThreshold = (values["fail-threshold"] ?? "major") as Severity;
  if (!["critical", "major", "minor"].includes(failThreshold)) {
    fail(`--fail-threshold must be critical|major|minor, got "${failThreshold}"`);
  }
  const maxGamma = values["max-gamma"] !== undefined ? Number(values["max-gamma"]) : undefined;

  const browser = await launchBrowser();
  let design: Capture;
  let impl: Capture;
  try {
    console.log(`capturing design: ${designFile}#${designFrame}`);
    design = unwrapCapture(
      await captureDcHtml(
        browser,
        {
          kind: "dc-html",
          dir: resolve(designDir),
          file: designFile,
          frame: designFrame,
          ...(viewport ? { viewport } : {}),
        },
        { pngPath: join(outDir, "design.png") },
      ),
      "design",
    );
    console.log(`  ${design.width}x${design.height} css px, ${design.elements.length} leaf elements`);

    console.log(`capturing impl: ${storyId}`);
    impl = unwrapCapture(
      await captureStorybook(
        browser,
        {
          kind: "storybook",
          url: storybookUrl,
          storyId,
          ...(viewport ? { viewport } : {}),
          ...(values.overlay ? { overlay: true } : {}),
        },
        { pngPath: join(outDir, "impl.png") },
      ),
      "impl",
    );
    console.log(`  ${impl.width}x${impl.height} css px, ${impl.elements.length} leaf elements`);
  } finally {
    await browser.close();
  }

  const normalized = normalize(pairRefs(pairId, design, impl));
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
    maxGamma !== undefined ? { maxGamma } : {},
  );
  console.log(
    `matched ${match.matches.length} elements (${match.designOnly.length} design-only, ${match.implOnly.length} impl-only)`,
  );

  const findings = runTypedChecks(match);
  const report = await packageForModel(aligned, findings, { outDir, failThreshold });

  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of report.findings) counts[f.severity]++;
  console.log(
    `\n${report.findings.length} findings (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor)`,
  );
  for (const f of report.findings.slice(0, 25)) {
    console.log(`  [${f.mark}] ${f.severity.padEnd(8)} ${f.type.padEnd(15)} ${f.message}`);
  }
  if (report.findings.length > 25) console.log(`  … ${report.findings.length - 25} more`);
  console.log(`\nverdict: ${report.verdict.pass ? "PASS" : "FAIL"} (threshold: ${failThreshold})`);
  console.log(`report: ${join(outDir, "findings.json")}`);
  process.exit(report.verdict.pass ? 0 : 1);
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
