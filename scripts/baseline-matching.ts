#!/usr/bin/env node
/**
 * baseline-matching — run every pair of every corpus and write ONE dated,
 * diffable picture of what the MATCHER did.
 *
 * This is step 2 of `docs/plan-divergent-matching.md`, and the guard for steps
 * 3–5. Those steps all make the matcher REFUSE more pairs, and every refusal
 * converts one match into one `missing-element` plus one `extra-element`: a
 * matcher that got more precise and a matcher that fell apart move the finding
 * count the same way. The `matched` / `d-only` / `i-only` columns are what tell
 * them apart, and a large `matched` drop on any pair is a REGRESSION, not a win.
 *
 *   node scripts/baseline-matching.ts                    # every corpus, today's file
 *   node scripts/baseline-matching.ts --only refdiff     # one corpus
 *   node scripts/baseline-matching.ts --out /tmp/x.md    # somewhere else
 *   node scripts/baseline-matching.ts --no-build         # trust the current dist
 *
 * Default output: `docs/baseline-matching-<YYYY-MM-DD>.md`.
 *
 * It BUILDS FIRST by default, because the CLIs run from `dist` and a compare
 * against a stale dist reports "+0 / −0" — indistinguishable from a change that
 * did nothing. That trap has cost this workstream a measurement already.
 *
 * A corpus whose impl server is not up is SKIPPED with its reason printed and
 * recorded in the document, never silently dropped and never fatal: losing the
 * whole baseline because one of two servers is down is the costliest failure
 * available here (`CLAUDE.md`, "one bad pair must never kill a run").
 */

import { spawn } from "node:child_process"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import { parseManifest, type PairSpec } from "../packages/core/dist/index.js"

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CLI = join(REPO, "packages", "core", "dist", "cli.js")

interface Corpus {
  name: string
  /** One line for the document: what these pairs are and what they measure. */
  describe: string
  /** Working directory the manifest's own relative paths resolve against. */
  cwd: string
  manifest: string
  designDir: string
  /** Where the impl is served. Probed before the run; unreachable ⇒ skip. */
  appUrl: string
  /** Run dirs land here (under the repo's gitignored `out/`). */
  outRoot: string
  /** Auth and anything else the pair set needs. */
  extraArgs: readonly string[]
  /** Printed when the corpus is skipped, so the reader can bring it back. */
  howToStart: string
  /**
   * Which of the manifest's pairs this corpus measures, resolved against the
   * manifest at run time into `--pair` ids. Absent ⇒ every pair.
   *
   * ONE manifest can declare pairs served by two different servers: uctoinak2's
   * 45 are 31 routes on its Next dev server and 14 Storybook stories on
   * another, and this box cannot hold both beside a capture browser. Splitting
   * on the impl SHAPE rather than on a hand-written id list means a pair added
   * to the manifest later lands in the corpus whose server can serve it,
   * instead of being reported as a capture failure in the other one.
   */
  implKind?: "route" | "story"
}

/**
 * THE CORPORA.
 *
 * `refdiff` is self-contained: the comps live in this repo and the impl is the
 * annotator serving this repo's committed demo root, so it reproduces anywhere.
 *
 * `uctoinak2` is a second checkout on the devbox and holds the witness pair the
 * whole plan is written against (`messages-accountant-desktop`). It cannot be
 * reproduced from this repo alone, which is exactly why it is declared here with
 * its preconditions in the open rather than run by hand and pasted in. Every
 * path and secret is an env var with the devbox's value as the default; the
 * secret is the placeholder that repo commits in its own `package.json` for
 * local test auth, not a credential.
 */
const CORPORA: readonly Corpus[] = [
  {
    name: "refdiff",
    describe:
      "the annotator's own redesign comps against the annotator serving `fixtures/demo-root` — self-contained in this repo",
    cwd: REPO,
    manifest: "design/refdiff.manifest.mjs",
    designDir: "design/refdiff",
    appUrl: process.env["REFDIFF_APP_URL"] ?? "http://127.0.0.1:7378",
    outRoot: join(REPO, "out", "baseline", "refdiff"),
    extraArgs: [],
    howToStart:
      "svc up annotator (it may land on another port — pass --app-url or REFDIFF_APP_URL)",
  },
  {
    name: "uctoinak2",
    describe:
      "the Uctoinak app's 31 whole-PAGE pairs on its own dev server, including the witness `messages-accountant-desktop`",
    cwd: process.env["U2_ROOT"] ?? "/root/uctoinak2/.claude/worktrees/messages-redesign",
    manifest: "tools/design-compare/manifest.mjs",
    designDir: "tools/design-compare/design-reference",
    appUrl: process.env["DC_APP_URL"] ?? `http://localhost:${process.env["DC_PORT"] ?? "3210"}`,
    outRoot: join(REPO, "out", "baseline", "uctoinak2"),
    implKind: "route",
    extraArgs: [
      "--auth-post",
      "/api/test/session",
      "--auth-header",
      `x-test-secret: ${process.env["DC_TEST_SECRET"] ?? "playwright-local-placeholder-secret-min-32chars"}`,
    ],
    howToStart:
      "start that worktree's `design-live` svc unit (APP_ENV=test, NEXT_DIST_DIR=.next-design, its own DB) — see docs/plan-divergent-matching.md §Repro",
  },
  {
    // The SAME manifest as above, split off by `implKind` rather than declared
    // as a second pair set, because the split is about which SERVER answers,
    // not about which pairs belong together.
    //
    // It is also the corpus the guard was missing. The other two are whole
    // pages against page comps, where structural divergence dominates and only
    // 5 of 34 pairs cleared alignment confidence 0.5 — so the guard could
    // barely see harm done to the fine-detail polish loop, which is the harm
    // that matters most (`docs/plan-divergent-matching.md` step 3). A dialog or
    // a card captured from its own story is the polish loop's home ground: one
    // component, drawn once, against the comp of that component.
    //
    // Measured separately because Storybook beside the app's own dev server and
    // a Chromium capture run OOM-killed the app server on this 7 GB box
    // mid-corpus (`dmesg`: `Killed process … next-server`, 2026-09-15), costing
    // the other 31 pairs as well. Bring `design-live` down first; do not start
    // both and hope.
    name: "uctoinak2-storybook",
    describe:
      "the Uctoinak app's 14 COMPONENT pairs — dialogs, pickers and action cards captured from Storybook, which no route can reach",
    cwd: process.env["U2_ROOT"] ?? "/root/uctoinak2/.claude/worktrees/messages-redesign",
    manifest: "tools/design-compare/manifest.mjs",
    designDir: "tools/design-compare/design-reference",
    // The storybook origin IS this corpus's impl server, so it is what gets
    // probed for reachability. `--app-url` is unused by a story pair (it
    // resolves relative LIVE routes) and no auth is passed: a story renders the
    // component with its own fixtures, with no session to establish.
    appUrl: process.env["DC_STORYBOOK_URL"] ?? "http://localhost:6006",
    outRoot: join(REPO, "out", "baseline", "uctoinak2-storybook"),
    implKind: "story",
    extraArgs: ["--storybook-url", process.env["DC_STORYBOOK_URL"] ?? "http://localhost:6006"],
    howToStart:
      "`svc down design-live` in that worktree, then `svc up storybook` there (it lands on the worktree's own port — pass DC_STORYBOOK_URL)",
  },
]

interface RunOutcome {
  status: number | null
  stdout: string
}

/**
 * Run a command to completion. Never throws on a non-zero exit — the caller
 * decides. `tee` keeps the child's output on screen AND returns it: a corpus
 * run is minutes long and a silent one is indistinguishable from a hung one.
 */
function run(
  cmd: string,
  args: readonly string[],
  opts: { cwd: string; capture?: boolean; tee?: boolean },
): Promise<RunOutcome> {
  return new Promise((done) => {
    const piped = opts.capture === true || opts.tee === true
    const child = spawn(cmd, [...args], {
      cwd: opts.cwd,
      stdio: piped ? ["ignore", "pipe", "pipe"] : "inherit",
    })
    // STDERR IS CAPTURED TOO, and that is not tidiness: `compare` prints a pair's
    // typed capture error with `console.error`, so a stdout-only capture read a
    // run with four dead pairs as a run with none — and the document then said
    // "nothing missing" about a corpus that had silently shrunk, which is the
    // one thing this harness exists to stop. The streams are interleaved into
    // one log because the failure block and the pair header that gives it a name
    // are on different ones.
    let stdout = ""
    const take = (b: Buffer, to: NodeJS.WriteStream): void => {
      const s = b.toString()
      stdout += s
      if (opts.tee === true) to.write(s)
    }
    child.stdout?.on("data", (b: Buffer) => take(b, process.stdout))
    child.stderr?.on("data", (b: Buffer) => take(b, process.stderr))
    child.on("close", (status) => done({ status, stdout }))
  })
}

/**
 * The pairs that never produced a report, from the run log. A pair that fails
 * to CAPTURE leaves no run dir, so it is invisible to `summary` — the corpus
 * would silently shrink and the table would still look complete. Naming them is
 * the difference between "these 5 pairs are the corpus" and "these 5 are the
 * ones that still work".
 */
interface CaptureFailure {
  pair: string
  side: string
  kind: string
}

function captureFailures(log: string): CaptureFailure[] {
  const out: CaptureFailure[] = []
  const re = /^(\S+): (design|impl) capture failed[^\n]*\n\{\n\s*"kind": "([^"]+)"/gm
  for (const m of log.matchAll(re)) out.push({ pair: m[1]!, side: m[2]!, kind: m[3]! })
  return out
}

/** Pairs the manifest declares but marks `disabled` — declared, deliberately not measured. */
function skippedPairs(log: string): { pair: string; why: string }[] {
  const out: { pair: string; why: string }[] = []
  for (const m of log.matchAll(/^skipping (\S+): disabled — (.+)$/gm))
    out.push({ pair: m[1]!, why: m[2]! })
  return out
}

/**
 * Run dirs under the out root whose report predates THIS run — the mirror of
 * `captureFailures`, and the more dangerous half.
 *
 * `refdiff summary` reads every run dir under the root, by design (several sets
 * share one). So a pair that captured last week and failed today does not
 * disappear from the table: its old numbers stay, indistinguishable from fresh
 * ones, and a baseline silently becomes part measurement and part memory. The
 * table cannot show this — every row in it is internally correct.
 */
async function carriedOver(outRoot: string, since: string): Promise<string[]> {
  let names: string[]
  try {
    names = (await readdir(outRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const stale: string[] = []
  for (const name of names.sort()) {
    try {
      const raw = await readFile(join(outRoot, name, "findings.json"), "utf8")
      const createdAt = (JSON.parse(raw) as { createdAt?: string }).createdAt
      if (createdAt !== undefined && createdAt < since) stale.push(name)
    } catch {
      // No report, or an unreadable one: `summary` will ignore it too.
    }
  }
  return stale
}

/** The `compare` argv for this corpus, minus whichever pairs the caller wants. */
function compareArgs(c: Corpus): string[] {
  return [
    CLI,
    "compare",
    "--manifest",
    c.manifest,
    "--design-dir",
    c.designDir,
    "--app-url",
    c.appUrl,
    "--out",
    c.outRoot,
    ...c.extraArgs,
  ]
}

/**
 * Run the pairs that failed to CAPTURE a second time, once, and believe the
 * second answer.
 *
 * Not flakiness tolerance — a measured asymmetry between the two kinds of impl
 * server. `warm()` above pre-compiles a ROUTE, and that is why the route corpus
 * loses no pairs to a cold start any more. It cannot pre-compile a STORY: every
 * story is behind one static `iframe.html`, so the fetch that warms a route
 * warms nothing here and the first capture of each story pays the compile out
 * of its 30 s navigation budget. Measured: the first uctoinak2-storybook pass
 * reported 8 of 14 pairs as `navigation-failed`/`unreachable`, and on the next
 * invocation 4 of those 8 captured unchanged — the other 4 were a genuinely
 * broken story and said so, louder (`story-error`).
 *
 * That last clause is what makes this safe. A retry cannot turn a real failure
 * into a pass; it can only stop the guard from silently shrinking by four pairs
 * because Vite was cold. What it CAN hide is a pair that fails half the time,
 * so the pairs that needed a second attempt are recorded and printed — a
 * corpus that needs retrying every run is telling you something.
 */
async function retryFailed(
  c: Corpus,
  failed: readonly CaptureFailure[],
): Promise<{ attempted: string[]; failed: CaptureFailure[] } | undefined> {
  const attempted = [...new Set(failed.map((f) => f.pair))]
  if (attempted.length === 0) return undefined
  console.log(
    `\nretrying ${attempted.length} pair(s) that failed to capture: ${attempted.join(", ")}`,
  )
  const again = await run("node", [...compareArgs(c), "--pair", attempted.join(",")], {
    cwd: c.cwd,
    tee: true,
  })
  // The retried set IS every pair that had failed, so the second run's failures
  // are the whole surviving list — no merge with the first run's, which would
  // only risk re-adding a pair that has since captured.
  return { attempted, failed: captureFailures(again.stdout) }
}

/**
 * The manifest pairs THIS corpus measures: every pair whose impl shape matches
 * its `implKind`, or all of them when it declares none.
 *
 * `undefined` means the manifest could not be READ, which is a different thing
 * from "this corpus has no pairs" and must not be flattened into it: the
 * callers then warm nothing and pass no `--pair`, leaving `compare` to load the
 * same file and fail with its own message. This helper is not allowed to be the
 * thing that decides a corpus is empty.
 */
async function pairsOf(c: Corpus): Promise<PairSpec[] | undefined> {
  let mod: Record<string, unknown>
  try {
    mod = (await import(pathToFileURL(resolve(c.cwd, c.manifest)).href)) as Record<string, unknown>
  } catch {
    return undefined
  }
  const parsed = parseManifest(mod["manifest"] ?? mod["default"], mod["sections"])
  if (!parsed.ok) return undefined
  if (c.implKind === undefined) return parsed.value.pairs
  const wantStory = c.implKind === "story"
  return parsed.value.pairs.filter((p) => "storyId" in p.impl === wantStory)
}

/**
 * The `--pair` filter that restricts `compare` to this corpus's own pairs, and
 * an empty list for a corpus that takes the whole manifest.
 *
 * It goes into the command the document PRINTS as well as the one it runs. A
 * reproduction command that quietly measured a different set than the table
 * above it is the exact failure this harness exists to catch, one level up.
 */
async function pairArgs(c: Corpus): Promise<string[]> {
  if (c.implKind === undefined) return []
  const pairs = await pairsOf(c)
  if (pairs === undefined || pairs.length === 0) return []
  return ["--pair", pairs.map((p) => p.id).join(",")]
}

/**
 * GET every URL the corpus is about to capture, once, sequentially, before the
 * run — and ignore every answer.
 *
 * A dev server compiles on demand, and the capture adapter navigates with a
 * 30 s budget. On a cold server the FIRST request to a route can exceed that
 * and the pair dies `navigation-failed` — a measurement of the bundler, not of
 * the matcher, and one that removes the pair from the baseline entirely.
 * Measured on the first full run here: 2 of 45 pairs lost that way on routes
 * that compare fine once warm, which is the guard for steps 3–5 quietly losing
 * pairs to whatever the box was doing that afternoon.
 *
 * Warming cannot mask a real failure: a route that 404s or errors does so just
 * as loudly on the second request.
 *
 * **It does nothing at all for a STORY pair, and that is not fixable here.**
 * Every story lives behind the same `iframe.html`, which is served as a static
 * shell; the story's own module is compiled when the BROWSER asks for it, so a
 * `fetch` of that URL returns 200 having compiled nothing. Measured: the first
 * uctoinak2-storybook pass lost 8 of 14 pairs to a cold Vite, warmed or not,
 * and the four that were not genuinely broken captured on the next invocation.
 * The URLs are still requested — it costs a second and proves the server is
 * answering — but the pairs this actually saves are `retryFailed`'s, below.
 */
/** Every distinct impl URL this corpus will capture, in manifest order. */
async function implUrls(c: Corpus): Promise<string[]> {
  const pairs = await pairsOf(c)
  if (pairs === undefined) return []
  const storybookUrl = c.extraArgs[c.extraArgs.indexOf("--storybook-url") + 1]
  const urls = new Set<string>()
  for (const p of pairs) {
    if ("storyId" in p.impl) {
      if (storybookUrl !== undefined)
        urls.add(`${storybookUrl}/iframe.html?id=${encodeURIComponent(p.impl.storyId)}`)
    } else if (p.impl.route.startsWith("http")) urls.add(p.impl.route)
    else urls.add(new URL(p.impl.route, c.appUrl).href)
  }
  return [...urls]
}

async function warm(c: Corpus): Promise<number> {
  const urls = await implUrls(c)
  for (const u of urls) {
    // One at a time: a dev server compiling twenty routes at once is slower
    // than one compiling them in turn, and nothing here is in a hurry.
    await fetch(u, { signal: AbortSignal.timeout(180_000), redirect: "manual" }).catch(() => {})
  }
  return urls.length
}

/**
 * What one corpus run knew that its out root does not record — kept beside the
 * run dirs so a LATER invocation can render this corpus's section without
 * re-measuring it.
 *
 * That matters because the corpora cannot always be measured together: one
 * dev server, one browser and 7 GB of RAM is already the limit here, and a run
 * that tried both at once was killed mid-corpus. Measuring them in separate
 * passes is fine; a document that silently dropped whichever corpus was not
 * measured today would not be.
 */
interface CorpusNotes {
  corpus: string
  measuredAt: string
  appUrl: string
  command: string
  failed: CaptureFailure[]
  disabled: { pair: string; why: string }[]
  carriedOver: string[]
  /**
   * Pairs that failed to capture on the first attempt and were run again. The
   * ones NOT also in `failed` are the ones a second attempt recovered, and they
   * are recorded rather than quietly absorbed: a corpus that needs the retry
   * every run has a slow server or a flaky pair, and only this list says so.
   */
  retried?: string[]
  /** Set when the notes were reconstructed from the reports, so the lists above are incomplete. */
  partial?: string
}

const NOTES_FILE = "baseline-notes.json"

async function readNotes(c: Corpus): Promise<CorpusNotes | undefined> {
  try {
    return JSON.parse(await readFile(join(c.outRoot, NOTES_FILE), "utf8")) as CorpusNotes
  } catch {
    // No notes file: either nothing ever ran here, or the run predates this
    // record. Reports carry their own `createdAt`, so the one thing that must
    // not be guessed — WHEN — can still be read off them. What is genuinely
    // lost is the list of pairs that failed to capture, which lived only in
    // that run's console; the section says so rather than implying the corpus
    // was complete.
    const newest = await newestReport(c.outRoot)
    if (newest === undefined) return undefined
    return {
      corpus: c.name,
      measuredAt: newest,
      appUrl: c.appUrl,
      command: await compareCommand(c),
      failed: [],
      disabled: [],
      carriedOver: [],
      partial: "run log not retained — the pairs that failed to capture in that run are not listed",
    }
  }
}

/** The newest `createdAt` among the run dirs under `root`, if any. */
async function newestReport(root: string): Promise<string | undefined> {
  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return undefined
  }
  let newest: string | undefined
  for (const name of names) {
    try {
      const raw = await readFile(join(root, name, "findings.json"), "utf8")
      const createdAt = (JSON.parse(raw) as { createdAt?: string }).createdAt
      if (createdAt !== undefined && (newest === undefined || createdAt > newest))
        newest = createdAt
    } catch {
      // Not a run dir.
    }
  }
  return newest
}

/** The compare invocation, verbatim, so the document carries its own reproduction. */
async function compareCommand(c: Corpus): Promise<string> {
  const args = [...c.extraArgs, ...(await pairArgs(c))]
  const extra =
    args.length > 0 ? " \\\n  " + args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ") : ""
  return (
    `cd ${c.cwd}\nnode ${CLI} compare --manifest ${c.manifest} --design-dir ${c.designDir} \\\n` +
    `  --app-url ${c.appUrl} --out ${c.outRoot}${extra}`
  )
}

/** What the run log knew, as the prose that goes above the tables. */
function notMeasuredList(n: CorpusNotes): string {
  const lines = [
    ...n.failed.map(
      (f) =>
        `- \`${f.pair}\` — **${f.side} capture failed** (\`${f.kind}\`), so it produced no report at all.`,
    ),
    ...n.disabled.map((d) => `- \`${d.pair}\` — disabled in the manifest: ${d.why}`),
  ]
  const stale =
    n.carriedOver.length === 0
      ? ""
      : `\n> **${n.carriedOver.length} row(s) below are CARRIED OVER from an earlier run**, not measured then — ` +
        `their pair did not capture and \`summary\` reads every run dir under the root: ` +
        `${n.carriedOver.map((s) => `\`${s}\``).join(", ")}. Read them as history, not as this baseline.\n`
  const partial = n.partial === undefined ? "" : `\n> Incomplete record: ${n.partial}.\n`
  // The recovered pairs are in the tables and look like every other row, so the
  // only place a reader can learn that they needed two attempts is here.
  const stillFailing = new Set(n.failed.map((f) => f.pair))
  const recovered = (n.retried ?? []).filter((p) => !stillFailing.has(p))
  const retried =
    recovered.length === 0
      ? ""
      : `\n> **${recovered.length} pair(s) below captured only on a SECOND attempt**: ` +
        `${recovered.map((p) => `\`${p}\``).join(", ")}. Their numbers are this run's, not carried over — ` +
        `a first capture pays a cold server's compile out of its navigation budget. A pair that needs ` +
        `this every run is a slow server or a flaky pair, not a measurement.\n`
  return (
    (lines.length === 0 ? "" : `\nNot in the tables below:\n\n${lines.join("\n")}\n`) +
    retried +
    stale +
    partial
  )
}

/** The tables for a corpus, from its out root. */
async function tablesFor(c: Corpus): Promise<string> {
  const summary = await run("node", [CLI, "summary", c.outRoot], { cwd: REPO, capture: true })
  return stripTitle(summary.stdout)
}

async function measuredSection(c: Corpus, n: CorpusNotes): Promise<string> {
  return (
    `## ${c.name}\n\n${c.describe}.\n\nMeasured ${n.measuredAt}.\n\n` +
    `\`\`\`\n${n.command}\n\`\`\`\n${notMeasuredList(n)}\n` +
    (await tablesFor(c))
  )
}

/**
 * A corpus this invocation did not measure. Its previous numbers are shown when
 * there are any — dated, and headed by why they were not refreshed — because
 * "these are from this morning" is a usable baseline and a missing section is
 * not. With no previous run there is nothing honest to show at all.
 */
async function carriedSection(
  c: Corpus,
  previous: CorpusNotes | undefined,
  why: string,
): Promise<string> {
  if (previous === undefined) {
    return (
      `## ${c.name} — NEVER MEASURED\n\n${c.describe}.\n\n` +
      `Not measured in this run (${why}) and there is no earlier run under \`${c.outRoot}\` to show. ` +
      `To include it: ${c.howToStart}.`
    )
  }
  return (
    `## ${c.name} — NOT RE-MEASURED IN THIS RUN\n\n${c.describe}.\n\n` +
    `**The numbers below were measured ${previous.measuredAt}**, not now: ${why}. They are a valid ` +
    `earlier measurement of the same corpus, and the document keeps them so the baseline stays whole — ` +
    `but anything compared against them is being compared across two different moments. ` +
    `To refresh: ${c.howToStart}, then \`node scripts/baseline-matching.ts --only ${c.name}\`.\n\n` +
    `\`\`\`\n${previous.command}\n\`\`\`\n${notMeasuredList(previous)}\n` +
    (await tablesFor(c))
  )
}

/**
 * Is this corpus's impl server answering? A GET, because some dev servers 404 a
 * HEAD — and against a URL the corpus ACTUALLY CAPTURES, not the bare origin.
 *
 * Probing `/` skipped the whole uctoinak2 corpus once: that app has no unlocalised
 * root, so `/` 500s while every one of its 31 routes answers 307 and captures
 * fine. A probe that can reject a server on a path no pair visits is not
 * measuring the precondition it claims to — and the cost of getting it wrong is
 * 29 pairs silently replaced by yesterday's numbers.
 */
async function reachable(c: Corpus): Promise<string | undefined> {
  const url = (await implUrls(c))[0] ?? c.appUrl
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "manual" })
    return res.status >= 500 ? `answered ${res.status} for ${url}` : undefined
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * `refdiff summary` titles its own output `# refdiff summary — <root>`, which
 * would put a run-directory path where this document wants a corpus name. The
 * body below it is what we keep.
 */
function stripTitle(text: string): string {
  return text.replace(/^# .*\n+/, "")
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      only: { type: "string", multiple: true },
      out: { type: "string" },
      "no-build": { type: "boolean" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    console.log(
      "Usage: node scripts/baseline-matching.ts [--only <corpus>]... [--out <file.md>] [--no-build]\n\n" +
        // Each corpus has its own server, so the URL is per-corpus and belongs
        // in the environment beside it, not in one flag that could only ever
        // mean one of them.
        CORPORA.map((c) => `  ${c.name}\t${c.appUrl}`).join("\n") +
        "\n\nOverride a URL with REFDIFF_APP_URL / DC_APP_URL (or DC_PORT, U2_ROOT).",
    )
    return
  }

  const wanted = values.only
  const selected = CORPORA.filter((c) => wanted === undefined || wanted.includes(c.name))
  if (selected.length === 0) {
    console.error(`no corpus matched --only; known: ${CORPORA.map((c) => c.name).join(", ")}`)
    process.exit(2)
  }

  if (!values["no-build"]) {
    console.log("building (the CLIs run from dist; a stale one reports +0/−0) …")
    const built = await run("pnpm", ["-r", "build"], { cwd: REPO })
    if (built.status !== 0) {
      console.error("build failed — refusing to measure a dist that may not be the source")
      process.exit(2)
    }
  }

  const sha = (
    await run("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, capture: true })
  ).stdout.trim()
  const dirty =
    (await run("git", ["status", "--porcelain"], { cwd: REPO, capture: true })).stdout.trim()
      .length > 0
  const today = new Date().toISOString().slice(0, 10)

  const sections: string[] = []
  // EVERY corpus is rendered, whether or not it was measured in THIS run. The
  // devbox cannot hold two dev servers and a capture browser at once, so the
  // corpora are measured in separate passes — and a document that dropped a
  // corpus whenever its server was down would be a different document each
  // time, unusable as the before-picture steps 3–5 diff against. What each
  // section says instead is WHEN its numbers were measured.
  for (const c of CORPORA) {
    const previous = await readNotes(c)
    if (!selected.includes(c)) {
      sections.push(await carriedSection(c, previous, "not selected in this run (--only)"))
      continue
    }
    console.log(`\n=== corpus ${c.name} — ${c.appUrl} ===`)
    const why = await reachable(c)
    if (why !== undefined) {
      console.error(`SKIPPED ${c.name}: ${c.appUrl} not reachable (${why})`)
      sections.push(
        await carriedSection(
          c,
          previous,
          `its impl server at \`${c.appUrl}\` did not answer (${why})`,
        ),
      )
      continue
    }
    await mkdir(c.outRoot, { recursive: true })
    const warmed = await warm(c)
    if (warmed > 0) console.log(`warmed ${warmed} impl URL(s) before measuring`)
    const startedAt = new Date().toISOString()
    const compare = await run("node", [...compareArgs(c), ...(await pairArgs(c))], {
      cwd: c.cwd,
      tee: true,
    })
    // Exit 1 is "some pair FAILED its verdict", which is the normal state of a
    // drifted corpus and exactly what a baseline records. Exit 2 is a capture
    // error on at least one pair: the run still produced every other pair's
    // report, so those are kept and the rest are NAMED — a pair that never
    // captured leaves no run dir, so the table below cannot show it missing.
    const firstFailed = captureFailures(compare.stdout)
    const retried = await retryFailed(c, firstFailed)
    const notes: CorpusNotes = {
      corpus: c.name,
      measuredAt: startedAt,
      appUrl: c.appUrl,
      command: await compareCommand(c),
      failed: retried?.failed ?? firstFailed,
      disabled: skippedPairs(compare.stdout),
      carriedOver: await carriedOver(c.outRoot, startedAt),
      ...(retried === undefined ? {} : { retried: retried.attempted }),
    }
    await writeFile(join(c.outRoot, NOTES_FILE), JSON.stringify(notes, null, 2))
    sections.push(await measuredSection(c, notes))
  }

  const doc = `# Matching baseline — ${today}

The before-picture for \`docs/plan-divergent-matching.md\` steps 3–5, produced by
\`node scripts/baseline-matching.ts\` at refdiff \`${sha}\`${dirty ? " (WORKING TREE DIRTY — the numbers below are not a committed state)" : ""}.

**How to read it.** The *Matching* table is the instrument. Steps 3–5 all make the matcher
refuse more pairs, and a refusal moves one element out of \`matched\` and adds one to BOTH
\`d-only\` and \`i-only\` — so the finding count moves the same way whether the matcher got
more precise or fell apart. **A large \`matched\` drop on any pair is a REGRESSION**, and
the pair to investigate is the one whose drop is not matched by a fall in \`color\`,
\`typo\`, \`bord\`, \`rad\` and \`pos\` in the *Findings by type* table.

\`geom\` is the share of surviving pairs that nothing but the alignment vouches for, and
\`unver\` (first table) is how many findings rest on one of those below the confidence
floor. Both should FALL as the matcher improves, while \`text\` holds.

Regenerate with the same command; it rewrites this file for today's date.

${sections.join("\n\n")}
`

  const outFile = resolve(REPO, values.out ?? join("docs", `baseline-matching-${today}.md`))
  await writeFile(outFile, doc)
  console.log(`\nwrote ${outFile}`)
}

await main()
