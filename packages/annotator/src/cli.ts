#!/usr/bin/env node
/**
 * refdiff-annotator — human view of a comparison run + the annotation
 * loop back to the agent.
 *
 *   refdiff-annotator <run-dir|out-root> [--out report.html] [--serve [--read-only]] [--port 7378]
 *                                      [--host 0.0.0.0] [--mark-implemented <id,…|all> [--reply <text>]] [--digest]
 *
 * Reads <run-dir>/findings.json (a ComparisonReport written by `refdiff
 * compare`), writes a self-contained report.html INTO the run dir (it links
 * design.png / impl.png / crops relatively) and, with --serve, serves the run
 * dir with a zero-dependency JSON API (`GET/PUT /api/annotations`) so notes
 * placed in the page persist to <run-dir>/annotations.json.
 *
 * Given an OUT ROOT instead (a directory whose children hold findings.json —
 * a whole set), it does that for every pair and writes an index.html listing
 * them; each report links back to it. Serving the root then puts the set one
 * tap away from any pair, which is the only way to move between pairs on a
 * phone (the alternative was restarting the server per pair).
 *
 * Annotations are re-projected against the CURRENT elements.json on every
 * start (a recapture moves them with their element; orphans are marked
 * stale) and digested for the model: annotations.md (numbered, grouped by
 * status) + annotations-design.png / annotations-impl.png (the full PNGs with
 * numbered markers). All logic is pure (annotations.ts); this file is the
 * effectful edge: files, HTTP, sharp.
 */

import type { IncomingMessage, ServerResponse } from "node:http"

import {
  serveDir,
  type Alignment,
  type ComparisonReport,
  type ElementNode,
} from "@refdiff/core"
import { access, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises"
import { networkInterfaces } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import sharp, { type Sharp } from "sharp"

import {
  counts,
  digestSvg,
  digestText,
  emptySet,
  parseAnnotationSet,
  reprojectAll,
  setReply,
  transition,
  type AnnotationSet,
} from "./annotations.js"
import { renderAppShell } from "./app-shell.js"
import { readOnlyRefusal } from "./read-only.js"
import { type BrokenPair, type PairSummary } from "./index-view.js"
import { fontFile } from "./fonts.js"
import { renderReport } from "./render.js"
import { parseReport, type ReportParse } from "./report-file.js"
import {
  emptyFocus,
  focusDigest,
  parseFocusSet,
  type FocusSet,
} from "./focus.js"
import {
  emptyTriage,
  parseTriageSet,
  triageCounts,
  triageDigest,
  type TriageSet,
} from "./triage.js"
import { worldToDesign } from "./view-math.js"

const USAGE = `Usage: refdiff-annotator <run-dir|out-root> [options]

Writes <run-dir>/report.html: the FULL design and FULL implementation side by
side, one shared pan/zoom (the design pane is projected through the run's
Alignment), numbered finding marks on both panes, the review rail with each
finding's expected → actual, the suppressed findings and the delta — plus human
comments (notes/regions anchored to elements, open → implemented → done, with
the model's reply under each).

Point it at an OUT ROOT (the parent of many run dirs) instead and it renders
every pair plus <out-root>/index.html — one card per pair, each report linking
back to it. With --serve that is the whole set on one port.

Annotations live in <run-dir>/annotations.json. On every start they are
re-projected against the current elements.json (a recapture moves a note with
its element; an element that vanished marks the note stale) and digested for
the model into annotations.md + annotations-design.png / annotations-impl.png.

Options:
  --out <file>     where to write the HTML (default <run-dir>/report.html;
                   must stay inside the run dir for the relative image links).
                   Single run dir only — a set writes each report in place.
  --serve          run the app: one page at /, the pair list from /api/pairs
                   and each pair's findings.json loaded at request time
                   (nothing is written; add --emit to also write the files).
                   On a phone the header's settings popover picks the layout
                   (default / minimal) and theme; ?layout=minimal|default on
                   the page URL presets the layout for that load only
  --emit           write the self-contained report.html files (and index.html
                   for a set) — the default when not serving. Needed only to
                   read a report off disk with no server
  --read-only      with --serve: refuse every write (PUT → 405) so the served
                   root cannot change under a measurement — serve a committed
                   fixture, or the thing you are comparing, with this on. The
                   page is otherwise identical to the writable app; the rail's
                   status line names the refusal on the first save attempted
  --port <n>       port for --serve (default 7378)
  --host <addr>    bind address for --serve (default 127.0.0.1; 0.0.0.0 for
                   other devices on the network)
  --mark-implemented <id,…|all>
                   the agent acted on these open notes: open → implemented
                   ("all" = every open note); rewrites annotations.json + digest.
                   Single run dir only — note ids are per pair
  --reply <text>   with --mark-implemented: the agent's answer, shown under
                   the comment in the app ("what I did / why not"); the same
                   text goes on every note marked in this call
  --digest         (re)write the digest files even when nothing changed
  -h, --help

Exit codes: 0 ok, 2 usage error, unreadable findings.json (a single run dir —
in a set an unreadable pair is reported and skipped) or invalid annotations.json.`

function usageError(message: string): never {
  console.error(message)
  console.error()
  console.error(USAGE)
  process.exit(2)
}

/**
 * A run dir's report, or the reason it cannot be one — never an exception. The
 * CLI paths turn the reason into a usage error; the request handlers turn it
 * into a 500 for THAT pair, because a `process.exit` from inside a request is
 * one bad pair killing the whole served set.
 */
async function loadReport(runDir: string): Promise<ReportParse> {
  const path = join(runDir, "findings.json")
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return { ok: false, reason: "findings.json · cannot read" }
  }
  return parseReport(text)
}

async function readReport(runDir: string): Promise<ComparisonReport> {
  const loaded = await loadReport(runDir)
  return loaded.ok ? loaded.value : usageError(`${join(runDir, "findings.json")}: ${loaded.reason}`)
}

/* ------------------------------------------------------- annotations I/O -- */

const ANNOTATIONS_FILE = "annotations.json"
const DIGEST = {
  text: "annotations.md",
  design: "annotations-design.png",
  impl: "annotations-impl.png",
} as const

async function readAnnotations(runDir: string, pair: string): Promise<AnnotationSet> {
  const path = join(runDir, ANNOTATIONS_FILE)
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    return emptySet(pair)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return usageError(`${path} is not valid JSON: ${(e as Error).message}`)
  }
  const parsed = parseAnnotationSet(raw, pair)
  if (!parsed.ok) return usageError(`${path}: ${parsed.error}`)
  return parsed.value
}

const TRIAGE_FILE = "triage.json"
const TRIAGE_DIGEST = "triage.md"
const FOCUS_FILE = "focus.json"
const FOCUS_DIGEST = "focus.md"

/**
 * The region a person is working inside, so "work in the focused region" survives leaving the
 * browser. Same tolerance as triage: unreadable means "no region", never a failed request.
 */
async function readFocus(runDir: string, pair: string): Promise<FocusSet> {
  try {
    const parsed = parseFocusSet(JSON.parse(await readFile(join(runDir, FOCUS_FILE), "utf8")), pair)
    return parsed.value
  } catch {
    return emptyFocus(pair)
  }
}

/**
 * Triage decisions keyed by `Finding.key`. A malformed file degrades to "nothing triaged" rather
 * than killing the request: these are convenience verdicts, and refusing to serve a pair because
 * one row is bad would be the worse failure.
 */
async function readTriage(runDir: string, pair: string): Promise<TriageSet> {
  try {
    const parsed = parseTriageSet(
      JSON.parse(await readFile(join(runDir, TRIAGE_FILE), "utf8")),
      pair,
    )
    return parsed.value
  } catch {
    return emptyTriage(pair)
  }
}

/** Atomic write: never leave a half-written set for the page or the agent to read. */
async function writeAtomic(path: string, body: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, body)
  await rename(tmp, path)
}

async function readElements(
  runDir: string,
): Promise<{ design: ElementNode[]; impl: ElementNode[] } | undefined> {
  try {
    const j = JSON.parse(await readFile(join(runDir, "elements.json"), "utf8")) as {
      design?: ElementNode[]
      impl?: ElementNode[]
    }
    return { design: j.design ?? [], impl: j.impl ?? [] }
  } catch {
    return undefined
  }
}

/** The digest: text + the two full PNGs with numbered markers (side-native resolution). */
async function writeDigest(
  runDir: string,
  report: ComparisonReport,
  set: AnnotationSet,
): Promise<void> {
  await writeAtomic(
    join(runDir, DIGEST.text),
    digestText(set, {
      runCreatedAt: report.createdAt,
      designPng: DIGEST.design,
      implPng: DIGEST.impl,
    }),
  )
  const a: Alignment = report.alignment
  for (const side of ["design", "impl"] as const) {
    const src = join(
      runDir,
      side === "design" ? report.artifacts.designPng : report.artifacts.implPng,
    )
    let image: Sharp
    let w: number
    let h: number
    try {
      image = sharp(src)
      const meta = await image.metadata()
      w = meta.width ?? 0
      h = meta.height ?? 0
      if (w === 0 || h === 0) continue
    } catch {
      continue // no PNG for this side — the text digest still says where the notes are
    }
    const cssWidth = side === "design" ? report.design.width : report.impl.width
    const dpr = w / cssWidth
    const toNative =
      side === "design"
        ? (p: { x: number; y: number }) => {
            const d = worldToDesign(p, a)
            return { x: d.x * dpr, y: d.y * dpr }
          }
        : (p: { x: number; y: number }) => ({ x: p.x * dpr, y: p.y * dpr })
    const svg = digestSvg(set, side, { w, h }, toNative, Math.max(1, Math.round(dpr)))
    const out = await image
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer()
    await writeAtomic(join(runDir, DIGEST[side]), out)
  }
}

/* ------------------------------------------------------------------ API -- */

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 5 * 1024 * 1024): Promise<string | undefined> {
  return new Promise((resolveBody) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on("data", (c: Buffer) => {
      size += c.length
      if (size > limit) {
        resolveBody(undefined)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")))
    req.on("error", () => resolveBody(undefined))
  })
}

interface AppApiOptions {
  root: string
  runs: { name: string; dir: string }[]
  /** A lone run dir is served AS the root, so its artifacts sit at `/`. */
  single: boolean
  shell: string
  /** `--read-only`: refuse every write; the served root is under measurement or committed. */
  readOnly?: boolean
}


/**
 * The app's server half. Everything is read from disk per request, so a
 * `compare` run finished after the server started shows up on reload:
 *
 *   GET  /                          the shell (no data)
 *   GET  /fonts/<file>              the self-hosted faces (assets/fonts, whitelisted in fonts.ts)
 *   GET  /api/pairs                 the list, summarised from each findings.json
 *   GET  /api/pairs/<dir>/annotations
 *   PUT  /api/pairs/<dir>/annotations  validate, persist atomically, refresh digest
 *
 * With `readOnly` every non-GET under /api/ is refused with 405 before any
 * endpoint runs, and /api/pairs carries `readOnly: true` for the rail.
 * Anything else falls through to static serving of the root.
 */
/** `assets/fonts/` sits beside `dist/`, where this module runs from. */
const FONTS_DIR = new URL("../assets/fonts/", import.meta.url)

function appApi(options: AppApiOptions) {
  const byName = new Map(options.runs.map((r) => [r.name, r.dir]))
  // A lone run dir is its own root: the shell still lists exactly one pair, and
  // its artifacts are addressed by the dir name that serveDir cannot see.
  const dirFor = (name: string): string | undefined =>
    options.single ? (name === options.runs[0]!.name ? options.root : undefined) : byName.get(name)
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      })
      res.end(options.shell)
      return true
    }
    if (path === "/api/pairs") {
      sendJson(res, 200, {
        root: options.root,
        pairs: await summarisePairs(options),
        ...(options.readOnly ? { readOnly: true } : {}),
      })
      return true
    }
    const refused = readOnlyRefusal(options.readOnly, req.method, path)
    if (refused) {
      res.setHeader("Allow", "GET")
      sendJson(res, refused.status, { error: refused.error })
      return true
    }
    const font = fontFile(path)
    if (font) {
      // The package ships the files (package.json `files`); a missing one is a
      // broken install, reported as 404 so the page degrades to system-ui
      // instead of the request hanging or the server dying.
      try {
        const body = await readFile(new URL(font.file, FONTS_DIR))
        res.writeHead(200, {
          "Content-Type": "font/woff2",
          "Cache-Control": "public, max-age=86400",
        })
        res.end(body)
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end(`font not shipped: ${font.file}`)
      }
      return true
    }
    // GET/PUT the pair's focus region. On write the digest is rebuilt, because the digest — not the
    // JSON — is what makes the region legible to the agent.
    const focusMatch = /^\/api\/pairs\/([^/]+)\/focus$/.exec(path)
    if (focusMatch) {
      const focusName = decodeURIComponent(focusMatch[1]!)
      const focusDir = dirFor(focusName)
      if (!focusDir) {
        sendJson(res, 404, { error: `unknown pair ${focusName}` })
        return true
      }
      const focusReportLoaded = await loadReport(focusDir)
      if (!focusReportLoaded.ok) {
        sendJson(res, 500, { error: focusReportLoaded.reason })
        return true
      }
      const focusReport = focusReportLoaded.value
      if (req.method === "GET") {
        sendJson(res, 200, await readFocus(focusDir, focusReport.pair))
        return true
      }
      if (req.method === "PUT") {
        const body = await readBody(req)
        if (body === undefined) {
          sendJson(res, 413, { error: "body too large" })
          return true
        }
        let raw: unknown
        try {
          raw = JSON.parse(body)
        } catch (e) {
          sendJson(res, 400, { error: `invalid JSON: ${(e as Error).message}` })
          return true
        }
        const parsed = parseFocusSet(raw, focusReport.pair)
        if (!parsed.ok) {
          sendJson(res, 400, { error: parsed.error })
          return true
        }
        await writeAtomic(join(focusDir, FOCUS_FILE), JSON.stringify(parsed.value, null, 2))
        await writeAtomic(
          join(focusDir, FOCUS_DIGEST),
          focusDigest(parsed.value, focusReport.findings),
        )
        const r = parsed.value.region
        console.log(
          r
            ? `focus saved: x ${Math.round(r.x)}, y ${Math.round(r.y)}, ${Math.round(r.w)}×${Math.round(r.h)} → ${FOCUS_DIGEST}`
            : `focus cleared → ${FOCUS_DIGEST}`,
        )
        sendJson(res, 200, parsed.value)
        return true
      }
      res.writeHead(405, { Allow: "GET, PUT" })
      res.end()
      return true
    }
    // GET/PUT the pair's triage verdicts (fix / ignore / snooze + note), keyed by Finding.key.
    const triageMatch = /^\/api\/pairs\/([^/]+)\/triage$/.exec(path)
    if (triageMatch) {
      const triageName = decodeURIComponent(triageMatch[1]!)
      const triageDir = dirFor(triageName)
      if (!triageDir) {
        sendJson(res, 404, { error: `unknown pair ${triageName}` })
        return true
      }
      const triageReportLoaded = await loadReport(triageDir)
      if (!triageReportLoaded.ok) {
        sendJson(res, 500, { error: triageReportLoaded.reason })
        return true
      }
      const triageReport = triageReportLoaded.value
      if (req.method === "GET") {
        sendJson(res, 200, await readTriage(triageDir, triageReport.pair))
        return true
      }
      if (req.method === "PUT") {
        const body = await readBody(req)
        if (body === undefined) {
          sendJson(res, 413, { error: "body too large" })
          return true
        }
        let raw: unknown
        try {
          raw = JSON.parse(body)
        } catch (e) {
          sendJson(res, 400, { error: `invalid JSON: ${(e as Error).message}` })
          return true
        }
        const parsed = parseTriageSet(raw, triageReport.pair)
        if (!parsed.ok) {
          sendJson(res, 400, { error: parsed.error })
          return true
        }
        await writeAtomic(join(triageDir, TRIAGE_FILE), JSON.stringify(parsed.value, null, 2))
        // The digest is what the fix loop reads: what a human already refused or deferred.
        await writeAtomic(
          join(triageDir, TRIAGE_DIGEST),
          triageDigest(parsed.value, new Date().toISOString()),
        )
        const counts = triageCounts(parsed.value, new Date().toISOString())
        console.log(
          `triage saved: ${parsed.value.entries.length} (${counts.fix} fix · ${counts.ignore} ignore · ${counts.snooze} snoozed)`,
        )
        sendJson(res, 200, parsed.value)
        return true
      }
      res.writeHead(405, { Allow: "GET, PUT" })
      res.end()
      return true
    }
    // The app calls /api/pairs/<dir>/annotations; an EMITTED report.html sits
    // in the run dir and calls ./api/annotations, so both shapes answer here.
    const match =
      /^\/api\/pairs\/([^/]+)\/annotations$/.exec(path) ??
      /^\/([^/]+)\/api\/annotations$/.exec(path) ??
      (options.single && path === "/api/annotations"
        ? ([path, options.runs[0]!.name] as unknown as RegExpExecArray)
        : null)
    if (!match) return false
    const name = decodeURIComponent(match[1]!)
    const runDir = dirFor(name)
    if (!runDir) {
      sendJson(res, 404, { error: `unknown pair ${name}` })
      return true
    }
    const loaded = await loadReport(runDir)
    if (!loaded.ok) {
      sendJson(res, 500, { error: loaded.reason })
      return true
    }
    const report = loaded.value
    const stored = await readAnnotations(runDir, report.pair)
    const elements = await readElements(runDir)
    const state = { set: elements ? reprojectAll(stored, elements) : stored }
    if (req.method === "GET") {
      sendJson(res, 200, state.set)
      return true
    }
    if (req.method === "PUT") {
      const body = await readBody(req)
      if (body === undefined) {
        sendJson(res, 413, { error: "body too large" })
        return true
      }
      let raw: unknown
      try {
        raw = JSON.parse(body)
      } catch (e) {
        sendJson(res, 400, { error: `invalid JSON: ${(e as Error).message}` })
        return true
      }
      const parsed = parseAnnotationSet(raw, report.pair)
      if (!parsed.ok) {
        sendJson(res, 400, { error: parsed.error })
        return true
      }
      state.set = parsed.value
      await writeAtomic(join(runDir, ANNOTATIONS_FILE), JSON.stringify(state.set, null, 2))
      await writeDigest(runDir, report, state.set)
      const c = counts(state.set)
      console.log(
        `annotations saved: ${state.set.annotations.length} (${c.open} open · ${c.implemented} implemented · ${c.done} done)`,
      )
      sendJson(res, 200, state.set)
      return true
    }
    res.writeHead(405, { Allow: "GET, PUT" })
    res.end()
    return true
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * One card's worth of numbers per run dir, read fresh (a set is ~40 files).
 * A run dir whose findings.json cannot be read — mid-write, truncated, not a
 * report — is listed as a `BrokenPair` with the reason, never skipped: one
 * bad pair never kills the set, and a pair that silently vanishes from the
 * list is the failure the list exists to prevent.
 */
async function summarisePairs(options: AppApiOptions): Promise<(PairSummary | BrokenPair)[]> {
  const out: (PairSummary | BrokenPair)[] = []
  for (const run of options.runs) {
    const loaded = await loadReport(run.dir)
    if (!loaded.ok) {
      out.push({
        dir: run.name,
        broken: true,
        reason: loaded.reason,
        ...(loaded.pair ? { pair: loaded.pair } : {}),
        ...(loaded.createdAt ? { createdAt: loaded.createdAt } : {}),
        ...(loaded.implRef ? { implRef: loaded.implRef } : {}),
      })
      continue
    }
    const report = loaded.value
    if (!report.verdict) {
      out.push({
        dir: run.name,
        broken: true,
        reason: "findings.json · no verdict (written by an older refdiff)",
        pair: report.pair,
        createdAt: report.createdAt,
        implRef: report.impl.ref,
      })
      continue
    }
    const notes = await readAnnotations(run.dir, report.pair)
    const c = counts(notes)
    const sev = (s: string) => report.findings.filter((f) => f.severity === s).length
    out.push({
      dir: run.name,
      pair: report.pair,
      pass: report.verdict.pass,
      critical: sev("critical"),
      major: sev("major"),
      minor: sev("minor"),
      findings: report.findings.length,
      suppressed: report.suppressed.length,
      confidence: report.alignment.confidence,
      createdAt: report.createdAt,
      designSource: report.design.source,
      implSource: report.impl.source,
      implRef: report.impl.ref,
      // The card's thumbnail is the run's own capture (decision D6) — only
      // when the file is really there; a hard-stopped capture has none.
      ...((await fileExists(join(run.dir, report.artifacts.implPng)))
        ? { implPng: run.name + "/" + report.artifacts.implPng }
        : {}),
      ...(report.delta
        ? {
            delta: {
              introduced: report.delta.introduced.length,
              resolved: report.delta.resolved.length,
              regressions: (report.delta.regressions ?? []).length,
            },
          }
        : {}),
      openNotes: c.open + c.implemented,
      notes: notes.annotations.length,
    })
  }
  return out
}

/**
 * The target is either ONE run dir (it has findings.json) or an out root whose
 * children are run dirs. Anything else is a usage error — a silent "0 pairs"
 * would look like an empty set instead of a wrong path.
 */
async function collectRunDirs(target: string): Promise<{ name: string; dir: string }[]> {
  const hasReport = async (dir: string): Promise<boolean> => {
    try {
      await readFile(join(dir, "findings.json"), "utf8")
      return true
    } catch {
      return false
    }
  }
  if (await hasReport(target)) return [{ name: basename(target), dir: target }]
  let names: string[]
  try {
    names = (await readdir(target, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch (e) {
    return usageError(`cannot read ${target}: ${(e as Error).message}`)
  }
  const runs: { name: string; dir: string }[] = []
  for (const name of names) {
    const dir = join(target, name)
    if (await hasReport(dir)) runs.push({ name, dir })
  }
  if (runs.length === 0) return usageError(`no findings.json in ${target} or its subdirectories`)
  return runs
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address)
}

/* ----------------------------------------------------------------- main -- */

async function main(): Promise<void> {
  let values: {
    out?: string
    serve?: boolean
    "read-only"?: boolean
    emit?: boolean
    port?: string
    host?: string
    "mark-implemented"?: string
    reply?: string
    digest?: boolean
    help?: boolean
  }
  let positionals: string[]
  try {
    ;({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        out: { type: "string" },
        serve: { type: "boolean" },
        "read-only": { type: "boolean" },
        emit: { type: "boolean" },
        port: { type: "string" },
        host: { type: "string" },
        "mark-implemented": { type: "string" },
        reply: { type: "string" },
        digest: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }))
  } catch (e) {
    return usageError((e as Error).message)
  }
  if (values.help) {
    console.log(USAGE)
    return
  }
  const targetArg = positionals[0]
  if (!targetArg) return usageError("missing <run-dir|out-root>")
  const target = resolve(targetArg)
  const found = await collectRunDirs(target)
  const set_ = found.length > 1 || found[0]!.dir !== target
  if (set_ && values.out)
    return usageError("--out takes a single run dir; a set writes each report into its own dir")
  if (set_ && values["mark-implemented"] !== undefined)
    return usageError("--mark-implemented takes a single run dir — note ids are per pair")
  if (values.reply !== undefined && values["mark-implemented"] === undefined)
    return usageError("--reply goes with --mark-implemented: it answers the notes being marked")

  const sources = await readEmbeddedSources()

  // --emit is the old behaviour: a self-contained report.html per run dir (and
  // an index for a set), for reading off disk with no server. Serving does NOT
  // need it — the app shell loads findings.json at runtime.
  if (values.emit || !values.serve) {
    for (const run of found) {
      if (set_) {
        // One bad pair never kills a set: report it in the list and move on.
        // A single run dir still fails loudly — there is nothing else to emit.
        const loaded = await loadReport(run.dir)
        if (!loaded.ok) {
          console.log(`  ${run.name} — unreadable, skipped: ${loaded.reason}`)
          continue
        }
      }
      await renderRun(run, {
        values,
        viewMathSource: sources.viewMath,
        annotationsSource: sources.annotations,
        triageSource: sources.triage,
        focusSource: sources.focus,
        railSource: sources.rail,
        indexHref: set_ ? "../index.html" : undefined,
        quiet: set_,
      })
    }
    if (set_) {
      const indexPath = join(target, "index.html")
      await writeFile(indexPath, renderAppShell({ ...shellSources(sources), root: target }), "utf8")
      console.log(`wrote ${indexPath} (${found.length} pairs)`)
    }
  }

  if (!values.serve) return
  const port = values.port ? Number(values.port) : 7378
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    return usageError(`bad --port ${values.port}`)
  const host = values.host ?? "127.0.0.1"
  const shell = renderAppShell({ ...shellSources(sources), root: target })
  const server = await serveDir(target, {
    port,
    host,
    handle: appApi({
      root: target,
      runs: found,
      single: !set_,
      shell,
      ...(values["read-only"] ? { readOnly: true } : {}),
    }),
  })
  const actualPort = new URL(server.origin).port
  console.log(
    `serving ${target} — ${found.length} pair${found.length === 1 ? "" : "s"}, loaded at request time`,
  )
  console.log(`  ${server.origin}/`)
  if (values["read-only"]) console.log("  read-only: every PUT under /api/ is refused (405); nothing is written")
  if (host === "0.0.0.0")
    for (const ip of lanAddresses()) console.log(`  http://${ip}:${actualPort}/`)
  console.log("Ctrl-C to stop")
  const stop = () => {
    void server.close().then(() => process.exit(0))
  }
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
}

interface EmbeddedSources {
  viewMath: string
  annotations: string
  indexView: string
  triage: string
  focus: string
  rail: string
}

/** The import-free modules the page embeds verbatim. */
async function readEmbeddedSources(): Promise<EmbeddedSources> {
  const [viewMath, annotations, indexView, triage, focus, rail] = await Promise.all([
    readFile(new URL("./view-math.js", import.meta.url), "utf8"),
    readFile(new URL("./annotations.js", import.meta.url), "utf8"),
    readFile(new URL("./index-view.js", import.meta.url), "utf8"),
    readFile(new URL("./triage.js", import.meta.url), "utf8"),
    readFile(new URL("./focus.js", import.meta.url), "utf8"),
    readFile(new URL("./rail.js", import.meta.url), "utf8"),
  ])
  return { viewMath, annotations, indexView, triage, focus, rail }
}

function shellSources(sources: EmbeddedSources) {
  return {
    viewMathSource: sources.viewMath,
    annotationsSource: sources.annotations,
    indexViewSource: sources.indexView,
    triageSource: sources.triage,
    focusSource: sources.focus,
    railSource: sources.rail,
  }
}

interface RenderRunOptions {
  values: { out?: string; digest?: boolean; serve?: boolean; "mark-implemented"?: string; reply?: string }
  viewMathSource: string
  annotationsSource: string
  triageSource: string
  focusSource: string
  railSource: string
  indexHref?: string | undefined
  /** A set prints one line per pair, not the single-run paragraph. */
  quiet: boolean
}

/** One run dir: load + re-project notes, apply --mark-implemented, write report.html. */
async function renderRun(
  run: { name: string; dir: string },
  options: RenderRunOptions,
): Promise<{ report: ComparisonReport; set: AnnotationSet }> {
  const { values, quiet } = options
  const runDir = run.dir
  const report = await readReport(runDir)

  // Annotations: load, re-project against the current capture, apply --mark-implemented.
  const stored = await readAnnotations(runDir, report.pair)
  const elements = await readElements(runDir)
  let set = elements ? reprojectAll(stored, elements) : stored
  if (set !== stored && !quiet) {
    const stale = set.annotations.filter((a) => a.stale).length
    console.log(
      `re-projected ${set.annotations.length} annotations against the current elements.json${stale ? ` (${stale} stale — element not found)` : ""}`,
    )
  }
  if (values["mark-implemented"] !== undefined) {
    const now = new Date().toISOString()
    const wanted =
      values["mark-implemented"] === "all"
        ? null
        : new Set(
            values["mark-implemented"]
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
    if (wanted && wanted.size === 0) return usageError("--mark-implemented needs ids or 'all'")
    const known = new Set(set.annotations.map((a) => a.id))
    for (const id of wanted ?? [])
      if (!known.has(id)) return usageError(`--mark-implemented: no annotation ${id}`)
    let n = 0
    const reply = values.reply
    set = {
      ...set,
      annotations: set.annotations.map((a) => {
        if (wanted && !wanted.has(a.id)) return a
        let next = transition(a, "implement", now)
        if (next !== a) n++
        // The reply answers the note whether or not the transition applied (a
        // note already implemented can still get the model's answer).
        if (reply !== undefined) next = setReply(next, reply, now)
        return next
      }),
    }
    console.log(`marked ${n} annotation${n === 1 ? "" : "s"} implemented${reply !== undefined ? " with a reply" : ""}`)
  }
  const changed = set !== stored
  if (changed) await writeAtomic(join(runDir, ANNOTATIONS_FILE), JSON.stringify(set, null, 2))
  if (changed || values.digest || (set.annotations.length > 0 && values.serve)) {
    await writeDigest(runDir, report, set)
    if (!quiet) console.log(`digest: ${DIGEST.text}, ${DIGEST.design}, ${DIGEST.impl}`)
  }

  const html = renderReport(report, {
    viewMathSource: options.viewMathSource,
    annotationsSource: options.annotationsSource,
    triageSource: options.triageSource,
    focusSource: options.focusSource,
    railSource: options.railSource,
    annotations: set,
    indexHref: options.indexHref,
  })
  const outPath = values.out ? resolve(values.out) : join(runDir, "report.html")
  await writeFile(outPath, html, "utf8")
  const c = counts(set)
  const notes = `${set.annotations.length} annotations: ${c.open} open · ${c.implemented} implemented · ${c.done} done`
  console.log(
    quiet
      ? `  ${run.name} — ${report.findings.length} findings, ${report.suppressed.length} suppressed, confidence ${report.alignment.confidence.toFixed(2)}${set.annotations.length ? `, ${c.open} open notes` : ""}`
      : `wrote ${outPath} (${report.findings.length} findings, ${report.suppressed.length} suppressed, ${notes})`,
  )
  return { report, set }
}

void main()
