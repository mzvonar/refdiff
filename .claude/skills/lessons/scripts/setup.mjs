#!/usr/bin/env node
// Idempotent bootstrap for the `lessons` skill in ANY repo:
//   1. creates docs/lessons-inbox.md (the transient capture buffer) if missing
//   2. appends the standing capture rule to CLAUDE.md if missing (creating CLAUDE.md if absent)
// Commits nothing. Safe to re-run.

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function repoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

const INBOX_REL = "docs/lessons-inbox.md";

const INBOX_TEMPLATE = `# Lessons inbox

Transient, append-only buffer for durable lessons captured during **ad-hoc work** (outside \`/run-story\`, which has its own lesson pipeline). This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the \`/lessons\` skill promotes each to its real destination (a skill body, CLAUDE.md, an ADR, engineering-anchors, the wiki, memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the \`/lessons\` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

## YYYY-MM-DD — short title of the lesson   (example row — delete once you add a real one)
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard
`;

const CLAUDE_MARKER = "Lessons capture (ad-hoc work)";

const CLAUDE_BLOCK = `
---

## Lessons capture (ad-hoc work) — append, process later

Outside \`/run-story\` there is no lesson → guideline pipeline, so reusable insights from ad-hoc work get lost. **Whenever ad-hoc work surfaces a durable lesson — a correction worth keeping, a non-obvious gotcha, a rejected approach and why, a rule that should exist — append a dated entry to [\`docs/lessons-inbox.md\`](docs/lessons-inbox.md)** the moment it's noticed (don't fix-and-forget; scrollback isn't reliably re-scannable later). The inbox is a transient buffer, never a durable home. Later, when the user says **"process the lessons"**, the \`/lessons\` skill drains it and promotes each entry to its real home (a skill body, CLAUDE.md via \`/update-guidelines\`, an ADR, \`docs/engineering-anchors.md\`, the wiki, or memory) or discards it. Standing instruction. Full format + routing → \`/lessons\`.
`;

function main() {
  const root = repoRoot();
  const inboxPath = join(root, INBOX_REL);
  const claudePath = join(root, "CLAUDE.md");

  const created = [];
  const skipped = [];

  if (existsSync(inboxPath)) {
    skipped.push(`${INBOX_REL} (already exists)`);
  } else {
    mkdirSync(dirname(inboxPath), { recursive: true });
    writeFileSync(inboxPath, INBOX_TEMPLATE);
    created.push(INBOX_REL);
  }

  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, `# Project Guidelines\n${CLAUDE_BLOCK}`);
    created.push("CLAUDE.md (created + capture rule)");
  } else {
    const current = readFileSync(claudePath, "utf8");
    if (current.includes(CLAUDE_MARKER)) {
      skipped.push("CLAUDE.md capture rule (already present)");
    } else {
      writeFileSync(claudePath, `${current.trimEnd()}\n${CLAUDE_BLOCK}`);
      created.push("CLAUDE.md capture rule (appended)");
    }
  }

  console.log("lessons skill — setup");
  console.log(`  repo root: ${root}`);
  if (created.length) console.log(`  created:   ${created.join(", ")}`);
  if (skipped.length) console.log(`  skipped:   ${skipped.join(", ")}`);
  console.log("Nothing committed — review and commit when ready.");
}

main();
