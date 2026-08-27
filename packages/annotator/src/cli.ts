#!/usr/bin/env node
/**
 * visual-compare-annotator — human view of a comparison run + the annotation
 * loop back to the agent.
 *
 *   visual-compare-annotator <run-dir> [--out report.html] [--serve] [--port 7378] [--host 0.0.0.0]
 *                                      [--mark-implemented <id,…|all>] [--digest]
 *
 * Reads <run-dir>/findings.json (a ComparisonReport written by `visual-compare
 * compare`), writes a self-contained report.html INTO the run dir (it links
 * design.png / impl.png / crops relatively) and, with --serve, serves the run
 * dir with a zero-dependency JSON API (`GET/PUT /api/annotations`) so notes
 * placed in the page persist to <run-dir>/annotations.json.
 *
 * Annotations are re-projected against the CURRENT elements.json on every
 * start (a recapture moves them with their element; orphans are marked
 * stale) and digested for the model: annotations.md (numbered, grouped by
 * status) + annotations-design.png / annotations-impl.png (the full PNGs with
 * numbered markers). All logic is pure (annotations.ts); this file is the
 * effectful edge: files, HTTP, sharp.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import sharp, { type Sharp } from "sharp";

import { serveDir, type Alignment, type ComparisonReport, type ElementNode } from "@visual-compare/core";

import {
  counts,
  digestSvg,
  digestText,
  emptySet,
  parseAnnotationSet,
  reprojectAll,
  transition,
  type AnnotationSet,
} from "./annotations.js";
import { renderReport } from "./render.js";
import { worldToDesign } from "./view-math.js";

const USAGE = `Usage: visual-compare-annotator <run-dir> [options]

Writes <run-dir>/report.html: the FULL design and FULL implementation side by
side, one shared pan/zoom (the design pane is projected through the run's
Alignment), numbered finding marks on both panes, the finding list with
expected/actual and crops, suppressed findings and the delta — plus human
annotations (notes/regions anchored to elements, open → implemented → done).

Annotations live in <run-dir>/annotations.json. On every start they are
re-projected against the current elements.json (a recapture moves a note with
its element; an element that vanished marks the note stale) and digested for
the model into annotations.md + annotations-design.png / annotations-impl.png.

Options:
  --out <file>     where to write the HTML (default <run-dir>/report.html;
                   must stay inside the run dir for the relative image links)
  --serve          serve the run dir (static + GET/PUT /api/annotations) and keep running
  --port <n>       port for --serve (default 7378)
  --host <addr>    bind address for --serve (default 127.0.0.1; 0.0.0.0 for
                   other devices on the network)
  --mark-implemented <id,…|all>
                   the agent acted on these open notes: open → implemented
                   ("all" = every open note); rewrites annotations.json + digest
  --digest         (re)write the digest files even when nothing changed
  -h, --help

Exit codes: 0 ok, 2 usage error, unreadable findings.json or invalid annotations.json.`;

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

/* ------------------------------------------------------- annotations I/O -- */

const ANNOTATIONS_FILE = "annotations.json";
const DIGEST = { text: "annotations.md", design: "annotations-design.png", impl: "annotations-impl.png" } as const;

async function readAnnotations(runDir: string, pair: string): Promise<AnnotationSet> {
  const path = join(runDir, ANNOTATIONS_FILE);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return emptySet(pair);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return usageError(`${path} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = parseAnnotationSet(raw, pair);
  if (!parsed.ok) return usageError(`${path}: ${parsed.error}`);
  return parsed.value;
}

/** Atomic write: never leave a half-written set for the page or the agent to read. */
async function writeAtomic(path: string, body: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, body);
  await rename(tmp, path);
}

async function readElements(runDir: string): Promise<{ design: ElementNode[]; impl: ElementNode[] } | undefined> {
  try {
    const j = JSON.parse(await readFile(join(runDir, "elements.json"), "utf8")) as { design?: ElementNode[]; impl?: ElementNode[] };
    return { design: j.design ?? [], impl: j.impl ?? [] };
  } catch {
    return undefined;
  }
}

/** The digest: text + the two full PNGs with numbered markers (side-native resolution). */
async function writeDigest(runDir: string, report: ComparisonReport, set: AnnotationSet): Promise<void> {
  await writeAtomic(join(runDir, DIGEST.text), digestText(set, { runCreatedAt: report.createdAt, designPng: DIGEST.design, implPng: DIGEST.impl }));
  const a: Alignment = report.alignment;
  for (const side of ["design", "impl"] as const) {
    const src = join(runDir, side === "design" ? report.artifacts.designPng : report.artifacts.implPng);
    let image: Sharp;
    let w: number;
    let h: number;
    try {
      image = sharp(src);
      const meta = await image.metadata();
      w = meta.width ?? 0;
      h = meta.height ?? 0;
      if (w === 0 || h === 0) continue;
    } catch {
      continue; // no PNG for this side — the text digest still says where the notes are
    }
    const cssWidth = side === "design" ? report.design.width : report.impl.width;
    const dpr = w / cssWidth;
    const toNative =
      side === "design"
        ? (p: { x: number; y: number }) => {
            const d = worldToDesign(p, a);
            return { x: d.x * dpr, y: d.y * dpr };
          }
        : (p: { x: number; y: number }) => ({ x: p.x * dpr, y: p.y * dpr });
    const svg = digestSvg(set, side, { w, h }, toNative, Math.max(1, Math.round(dpr)));
    const out = await image.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
    await writeAtomic(join(runDir, DIGEST[side]), out);
  }
}

/* ------------------------------------------------------------------ API -- */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit = 5 * 1024 * 1024): Promise<string | undefined> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        resolveBody(undefined);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolveBody(undefined));
  });
}

/**
 * `GET /api/annotations` → the current set; `PUT /api/annotations` → validate,
 * persist atomically, refresh the digest, echo the stored set. Last write
 * wins — one reviewer at a time is the use case.
 */
function annotationsApi(runDir: string, report: ComparisonReport, state: { set: AnnotationSet }) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== "/api/annotations") return false;
    if (req.method === "GET") {
      sendJson(res, 200, state.set);
      return true;
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      if (body === undefined) {
        sendJson(res, 413, { error: "body too large" });
        return true;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(body);
      } catch (e) {
        sendJson(res, 400, { error: `invalid JSON: ${(e as Error).message}` });
        return true;
      }
      const parsed = parseAnnotationSet(raw, report.pair);
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error });
        return true;
      }
      state.set = parsed.value;
      await writeAtomic(join(runDir, ANNOTATIONS_FILE), JSON.stringify(state.set, null, 2));
      await writeDigest(runDir, report, state.set);
      const c = counts(state.set);
      console.log(`annotations saved: ${state.set.annotations.length} (${c.open} open · ${c.implemented} implemented · ${c.done} done)`);
      sendJson(res, 200, state.set);
      return true;
    }
    res.writeHead(405, { Allow: "GET, PUT" });
    res.end();
    return true;
  };
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

/* ----------------------------------------------------------------- main -- */

async function main(): Promise<void> {
  let values: {
    out?: string;
    serve?: boolean;
    port?: string;
    host?: string;
    "mark-implemented"?: string;
    digest?: boolean;
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
        "mark-implemented": { type: "string" },
        digest: { type: "boolean" },
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

  // Annotations: load, re-project against the current capture, apply --mark-implemented.
  const stored = await readAnnotations(runDir, report.pair);
  const elements = await readElements(runDir);
  let set = elements ? reprojectAll(stored, elements) : stored;
  if (set !== stored) {
    const stale = set.annotations.filter((a) => a.stale).length;
    console.log(`re-projected ${set.annotations.length} annotations against the current elements.json${stale ? ` (${stale} stale — element not found)` : ""}`);
  }
  if (values["mark-implemented"] !== undefined) {
    const now = new Date().toISOString();
    const wanted = values["mark-implemented"] === "all" ? null : new Set(values["mark-implemented"].split(",").map((s) => s.trim()).filter(Boolean));
    if (wanted && wanted.size === 0) return usageError("--mark-implemented needs ids or 'all'");
    const known = new Set(set.annotations.map((a) => a.id));
    for (const id of wanted ?? []) if (!known.has(id)) return usageError(`--mark-implemented: no annotation ${id}`);
    let n = 0;
    set = {
      ...set,
      annotations: set.annotations.map((a) => {
        if (wanted && !wanted.has(a.id)) return a;
        const next = transition(a, "implement", now);
        if (next !== a) n++;
        return next;
      }),
    };
    console.log(`marked ${n} annotation${n === 1 ? "" : "s"} implemented`);
  }
  const changed = set !== stored;
  if (changed) await writeAtomic(join(runDir, ANNOTATIONS_FILE), JSON.stringify(set, null, 2));
  if (changed || values.digest || (set.annotations.length > 0 && values.serve)) {
    await writeDigest(runDir, report, set);
    console.log(`digest: ${DIGEST.text}, ${DIGEST.design}, ${DIGEST.impl}`);
  }

  const [viewMathSource, annotationsSource] = await Promise.all([
    readFile(new URL("./view-math.js", import.meta.url), "utf8"),
    readFile(new URL("./annotations.js", import.meta.url), "utf8"),
  ]);
  const html = renderReport(report, { viewMathSource, annotationsSource, annotations: set });
  const outPath = values.out ? resolve(values.out) : join(runDir, "report.html");
  await writeFile(outPath, html, "utf8");
  const c = counts(set);
  console.log(
    `wrote ${outPath} (${report.findings.length} findings, ${report.suppressed.length} suppressed, ${set.annotations.length} annotations: ${c.open} open · ${c.implemented} implemented · ${c.done} done)`,
  );

  if (!values.serve) return;
  const port = values.port ? Number(values.port) : 7378;
  if (!Number.isInteger(port) || port < 0 || port > 65535) return usageError(`bad --port ${values.port}`);
  const host = values.host ?? "127.0.0.1";
  const live = { set };
  const server = await serveDir(runDir, { port, host, handle: annotationsApi(runDir, report, live) });
  const page = basename(outPath);
  const actualPort = new URL(server.origin).port;
  console.log(`serving ${runDir} (+ GET/PUT /api/annotations → ${ANNOTATIONS_FILE})`);
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
