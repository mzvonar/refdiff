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

import { parseManifest } from "../packages/core/dist/index.js"

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
      "the Uctoinak app's 45 page and component pairs, including the witness `messages-accountant-desktop`",
    cwd: process.env["U2_ROOT"] ?? "/root/uctoinak2/.claude/worktrees/messages-redesign",
    manifest: "tools/design-compare/manifest.mjs",
    designDir: "tools/design-compare/design-reference",
    appUrl: process.env["DC_APP_URL"] ?? `http://localhost:${process.env["DC_PORT"] ?? "3210"}`,
    outRoot: join(REPO, "out", "baseline", "uctoinak2"),
    extraArgs: [
      "--auth-post",
      "/api/test/session",
      "--auth-header",
      `x-test-secret: ${process.env["DC_TEST_SECRET"] ?? "playwright-local-placeholder-secret-min-32chars"}`,
      // 14 of this corpus's 45 pairs capture a Storybook story, not a route.
      // Named explicitly rather than left to `VC_STORYBOOK_URL`, so the
      // reproduction command printed in the document is the whole command.
      //
      // Those 14 are NOT in the committed baseline, and it is a resource limit
      // rather than an oversight: running Storybook beside the app's own dev
      // server and a Chromium capture run OOM-killed the app server on the
      // 7 GB devbox mid-corpus (`dmesg`: `Killed process … next-server`,
      // 2026-09-15), which cost the other 31 pairs as well. Give the box more
      // memory, or measure them in a pass of their own with the app server
      // down; do not simply start both and hope.
      "--storybook-url",
      process.env["DC_STORYBOOK_URL"] ?? "http://localhost:6006",
    ],
    howToStart:
      "start that worktree's `design-live` svc unit (APP_ENV=test, NEXT_DIST_DIR=.next-design, its own DB) — see docs/plan-divergent-matching.md §Repro",
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
function captureFailures(log: string): { pair: string; side: string; kind: string }[] {
  const out: { pair: string; side: string; kind: string }[] = []
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
 */
async function warm(c: Corpus): Promise<number> {
  let mod: Record<string, unknown>
  try {
    mod = (await import(pathToFileURL(resolve(c.cwd, c.manifest)).href)) as Record<string, unknown>
  } catch {
    return 0
  }
  const parsed = parseManifest(mod["manifest"] ?? mod["default"], mod["sections"])
  if (!parsed.ok) return 0
  const storybookUrl = c.extraArgs[c.extraArgs.indexOf("--storybook-url") + 1]
  const urls = new Set<string>()
  for (const p of parsed.value.pairs) {
    if ("storyId" in p.impl) {
      if (storybookUrl !== undefined)
        urls.add(`${storybookUrl}/iframe.html?id=${encodeURIComponent(p.impl.storyId)}`)
    } else if (p.impl.route.startsWith("http")) urls.add(p.impl.route)
    else urls.add(new URL(p.impl.route, c.appUrl).href)
  }
  for (const u of urls) {
    // One at a time: a dev server compiling twenty routes at once is slower
    // than one compiling them in turn, and nothing here is in a hurry.
    await fetch(u, { signal: AbortSignal.timeout(180_000), redirect: "manual" }).catch(() => {})
  }
  return urls.size
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
  failed: { pair: string; side: string; kind: string }[]
  disabled: { pair: string; why: string }[]
  carriedOver: string[]
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
      command: compareCommand(c),
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
function compareCommand(c: Corpus): string {
  const extra =
    c.extraArgs.length > 0
      ? " \\\n  " + c.extraArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")
      : ""
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
  return (
    (lines.length === 0 ? "" : `\nNot in the tables below:\n\n${lines.join("\n")}\n`) +
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

/** Is anything answering there? A GET, because some dev servers 404 a HEAD. */
async function reachable(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: "manual" })
    return res.status >= 500 ? `answered ${res.status}` : undefined
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
    const why = await reachable(c.appUrl)
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
    const compare = await run(
      "node",
      [
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
      ],
      { cwd: c.cwd, tee: true },
    )
    // Exit 1 is "some pair FAILED its verdict", which is the normal state of a
    // drifted corpus and exactly what a baseline records. Exit 2 is a capture
    // error on at least one pair: the run still produced every other pair's
    // report, so those are kept and the rest are NAMED — a pair that never
    // captured leaves no run dir, so the table below cannot show it missing.
    const notes: CorpusNotes = {
      corpus: c.name,
      measuredAt: startedAt,
      appUrl: c.appUrl,
      command: compareCommand(c),
      failed: captureFailures(compare.stdout),
      disabled: skippedPairs(compare.stdout),
      carriedOver: await carriedOver(c.outRoot, startedAt),
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
