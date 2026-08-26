#!/usr/bin/env node
/**
 * visual-compare-annotator — human view of a comparison run.
 *
 *   visual-compare-annotator <run-dir> [--out report.html] [--serve] [--port 7378] [--host 0.0.0.0]
 *
 * Reads <run-dir>/findings.json (a ComparisonReport written by `visual-compare
 * compare`), writes a self-contained report.html INTO the run dir (it links
 * design.png / impl.png / crops relatively) and, with --serve, serves the
 * run dir so the page can be opened here or on a phone over the LAN.
 */

import { readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { serveDir, type ComparisonReport } from "@visual-compare/core";

import { renderReport } from "./render.js";

const USAGE = `Usage: visual-compare-annotator <run-dir> [options]

Writes <run-dir>/report.html: the FULL design and FULL implementation side by
side, one shared pan/zoom (the design pane is projected through the run's
Alignment), numbered finding marks on both sides, the finding list with
expected/actual and crops, suppressed findings and the delta.

Options:
  --out <file>     where to write the HTML (default <run-dir>/report.html;
                   must stay inside the run dir for the relative image links)
  --serve          serve the run dir after writing and keep running
  --port <n>       port for --serve (default 7378)
  --host <addr>    bind address for --serve (default 127.0.0.1; 0.0.0.0 for
                   other devices on the network)
  -h, --help

Exit codes: 0 ok, 2 usage error or unreadable findings.json.`;

function usageError(message: string): never {
  console.error(message);
  console.error();
  console.error(USAGE);
  process.exit(2);
}

async function readReport(runDir: string): Promise<ComparisonReport> {
  const path = join(runDir, "findings.json");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return usageError(`cannot read ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return usageError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
  const r = parsed as Partial<ComparisonReport>;
  if (
    typeof r !== "object" ||
    r === null ||
    typeof r.pair !== "string" ||
    !Array.isArray(r.findings) ||
    !r.alignment ||
    !r.design ||
    !r.impl ||
    !r.artifacts
  ) {
    return usageError(`${path} is not a ComparisonReport (pair, findings, alignment, design, impl, artifacts required)`);
  }
  return { ...r, suppressed: r.suppressed ?? [], policy: r.policy ?? {} } as ComparisonReport;
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

async function main(): Promise<void> {
  let values: {
    out?: string;
    serve?: boolean;
    port?: string;
    host?: string;
    help?: boolean;
  };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        out: { type: "string" },
        serve: { type: "boolean" },
        port: { type: "string" },
        host: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (e) {
    return usageError((e as Error).message);
  }
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const runDirArg = positionals[0];
  if (!runDirArg) return usageError("missing <run-dir>");
  const runDir = resolve(runDirArg);

  const report = await readReport(runDir);
  const viewMathSource = await readFile(new URL("./view-math.js", import.meta.url), "utf8");
  const html = renderReport(report, { viewMathSource });
  const outPath = values.out ? resolve(values.out) : join(runDir, "report.html");
  await writeFile(outPath, html, "utf8");
  console.log(`wrote ${outPath} (${report.findings.length} findings, ${report.suppressed.length} suppressed)`);

  if (!values.serve) return;
  const port = values.port ? Number(values.port) : 7378;
  if (!Number.isInteger(port) || port < 0 || port > 65535) return usageError(`bad --port ${values.port}`);
  const host = values.host ?? "127.0.0.1";
  const server = await serveDir(runDir, { port, host });
  const page = basename(outPath);
  const actualPort = new URL(server.origin).port;
  console.log(`serving ${runDir}`);
  console.log(`  ${server.origin}/${page}`);
  if (host === "0.0.0.0") for (const ip of lanAddresses()) console.log(`  http://${ip}:${actualPort}/${page}`);
  console.log("Ctrl-C to stop");
  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

void main();
