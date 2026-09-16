# Setup — installing the skill, vendoring it, and the environment you measure IN

Two unrelated things that are both "once, not per run": getting the TOOL onto a machine or into
a repo, and the per-repo capture traps that make a run lie in ways that read as product bugs.

- **Installing / updating the skill** — `setup-dev.sh` (dev mode on a new machine, or `refdiff`
  missing from PATH), `sync-skill.sh` (vendor into a consuming repo, and re-running it IS the
  update). The three install modes are described in `SKILL.md` "Repo bindings"; which one you
  are in is `preflight.sh`'s `skill_mode`, and `skill_freshness` = `stale-<N>` / `differs` is
  the ASK that sends you here.
- **The environment pre-flight** below is about the REPO you are measuring. Read it when a
  capture fails, when `SKILL.md` rule 6 fires (a `CaptureError` means NOTHING was compared), or
  when a pair is green and you are not sure it measured anything.

## Vendoring the skill into a consumer (non-dev installs)

`sync-skill.sh` copies the skill into a repo (or into `~/.claude/skills/`) and stamps it, and
**re-running it IS the update** — it is the "sync" branch of `preflight.sh`'s `action=ask`
(`SKILL.md`, "Tool pre-flight"). Run it only
after the user picks that branch.

```bash
# from a checkout: vendor into a repo → <repo>/.claude/skills/refdiff/ + .skill-version
bash <checkout>/skills/refdiff/sync-skill.sh /path/to/repo --ref main
bash <checkout>/skills/refdiff/sync-skill.sh /path/to/repo --dry-run   # what would change

# from inside a vendored copy, with no checkout on the machine: update in place
bash .claude/skills/refdiff/sync-skill.sh
```

With no `--from` and no surrounding checkout it shallow-clones upstream to a temp dir, so the
command works on a machine that has never had refdiff. It **refuses** to overwrite a dev-mode
symlink (that would swap a live skill for a frozen one), and a stamp cut from a DIRTY source
records `dirty=true` rather than letting `preflight.sh` call it `current`. Commit the refreshed
`.claude/skills/refdiff/` on its own `chore/` branch; review the diff first.

## Dev-mode setup (new machine / VM)

When the user asks to set the skill up in dev mode, or `refdiff` is
not on PATH, run the bundled script — it is idempotent and touches no
consuming repo:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-$(dirname "$(readlink -f ~/.claude/skills/refdiff/SKILL.md)")/../..}/skills/refdiff/setup-dev.sh" --watch
# options: --checkout <dir> (default $REFDIFF_DIR, else ~/.local/share/refdiff; cloned from
#          github.com/mzvonar/refdiff if missing)  --no-browser  (skip Playwright Chromium)
#          --no-links  (skip the dev-mode skill symlinks; automatic under a plugin install)
```

It makes these true, then verifies (`refdiff --help`, test count):
the checkout exists; deps + Playwright Chromium installed; both packages
built; wrapper scripts installed into the first writable dir already on PATH
(`$PNPM_HOME/bin`, `$PNPM_HOME`, `~/.local/bin`, `~/bin` — it names the dir it
chose, and the PATH line to add if none was on PATH); in dev mode only, the skill is user-level —
`~/.claude/skills/refdiff` (and `~/.claude-personal` if present) → the checkout, through
`~/.claude-shared/skills` only when that dir already exists (under a plugin install the
plugin is the skill and no link is made);
with `--watch`, `pnpm dev` runs in the background (`<checkout>/.dev.log`) so
edits to `packages/*/src` reach the linked CLIs without a manual build. In dev mode edits
to `SKILL.md` are live immediately (symlink); under a plugin install change the skill upstream
(`/dev-tools:update-skill`). Needs Node ≥22, pnpm, git, and
network for the clone / Chromium download (in a sandboxed shell, run it with
the sandbox off). Then the repo you are in needs only its manifest and a
`refdiff.bindings.md` — write the bindings with the user if absent.

## Environment pre-flight (fill in per repo)

This one is about the REPO you are measuring; `SKILL.md`'s "Tool pre-flight" is about the
tool you are measuring WITH. Run that one first — it is scripted and it halts.

The repo's `refdiff.bindings.md` holds the specifics; these are the
failure shapes that recur everywhere and impersonate product bugs.

- **A green pair proves the STATE matches the comp; it says nothing about
  whether a user can REACH that state.** Every pair pins the URL, viewport and
  steps that put the app into the state it measures — that is what makes it
  reproducible, and it is also a blind spot with no finding to report: the
  default the user actually gets is measured by no pair unless one pins THAT.
  Measured instance: a phone layout sat at confidence 1.00 with 15 findings while
  the app still booted into the layout it replaced, because the boot line could
  not read back the value its own setter persisted — three mobile pairs, all
  green, none of them capturing a bare URL. When a change adds or replaces a
  DEFAULT (a preset, a saved preference, a feature flag), verify it in the
  product the way a user meets it — a browser at that viewport reading
  `document.body.className` and the controls' computed `display` — and then pin
  the old state on the pair that used to get it by default, or that pair silently
  changes subject.
  **And probe the RETURNING user, not only a fresh one: seed the storage the
  product writes.** A fresh browser is the one case that cannot see a stale
  preference, so a clean-context probe passes while every existing user keeps the
  old behaviour. Same instance, second round: the new default was correct in a
  fresh context and the reporter still saw the old layout, because every earlier
  visit had persisted the old value and the new boot line honoured it. A default
  that a stored value can override is not a default — either stop storing it, or
  seed the old value in the probe and assert what the user gets.
- **The served annotator WRITES into what it serves.** `refdiff-annotator
  <root> --serve` persists every note, verdict and focus region into the run
  dir (`annotations.json` / `triage.json` / `focus.json` + digests). Read
  `focus.md` before working "in the focused region": it names the rectangle in
  impl CSS px and lists every in-scope finding — in scope meaning the region
  covers most of the finding's box (or the box contains the region), so a
  full-width element that merely runs through the rectangle is deliberately
  OUT. When
  the served root is a committed fixture, or the impl a `compare` run is
  measuring, serve it `--read-only`: every PUT is refused with 405, the
  page is otherwise identical (the rail names the refusal only on the first
  save attempted), and the measure is of the tree you committed.
  Review sessions that must save notes serve without the flag, on another
  port.
- **A cold route can blow the 30 s navigation budget.** A dev server compiling a
  route on first hit fails as `navigation-failed` / `Timeout 30000ms exceeded`,
  which reads exactly like a broken page. Warm the route once (`curl -L`), then
  re-run before believing it.
- **A direct DB seed does not invalidate the app's caches.** Insert a row with
  SQL and a cached read still serves the old answer — typically as a soft 404
  (HTTP **200** with a not-found body, so only a content check catches it).
  Restart the app after seeding, then re-capture.
- **A matching `fontFamily` does not prove the font loaded.** The
  `typography` channel reads the COMPUTED family — the declared stack's first
  name whether or not its woff2 arrived — so a 404'd `@font-face` reports the
  right family on both sides while the pixels are the system font, and no
  finding says so (the loud case, every finding naming the fallback family, is
  the one below). Pair any self-hosted or newly wired font with a load check:
  `[...document.fonts]` statuses in the captured page, or an audit of zero
  non-200 font requests.
- **A comp's prop DEFAULTS decide what gets captured.** A `.dc.html` comp is
  captured in its default state; a designed state behind a non-default prop
  (`showDeltaStrip: false`, an `errorState` selector) ships UNMEASURED and any
  impl that draws it pays a layout shift against the capture. Read the
  `data-props` block first; ask the designer to flip a default that should
  be the demo state, and list the rest as unmeasured by decision.
- **CSS variables set on a decorator wrapper do not reach portalled content.**
  Dialogs and sheets portal to `<body>`; if the font/theme variables live on a
  Storybook decorator `<div>`, overlay stories render in the browser default and
  EVERY `typography` finding names the same fallback family. Put the variables
  where the app puts them (`<html>`), not on a wrapper.
- **A full-bleed comp is captured at the pair viewport; a fixed artboard is
  not.** The dc-html adapter opens its canvas 120px wider than
  `app.viewport` so a fixed-size frame never reflows against the window edge.
  A comp with no fixed width (`width:100%`, `min-height:100vh` page comps)
  would grow into that slack and capture 120px wider than the impl — every
  right-aligned control offset, confidence gone — so the adapter detects the
  frame reaching the canvas edge, snaps the window to the exact viewport and
  RELOADS there (a resize alone leaves any mount-time layout — a canvas that
  fits its artboard once, on load — where the wider window put it). The design
  capture line then reads `scope … fluid` and its css px equal the pair
  viewport. A fluid comp WITHOUT `app.viewport` on the pair
  captures at the 1560px default canvas: give every full-bleed pair a viewport.
- Storybook: token / global-CSS edits may not HMR — restart before trusting
  a re-run; confirm a color via the `color` finding, not the screenshot.
- Live app: seeds present? auth working? A soft 404 compares "fine".
- Figma: `$FIGMA_TOKEN`; a 429 writes a cooldown record and the CLI refuses
  to burn budget until it passes (`figma-rate-limited`). **A cooldown is not a
  cache** — it makes the failure cheap AFTER you are over the limit; it never
  keeps you under it. **A full manifest run costs one API call per set for the
  node subtree, one for the variables map, and one per five nodes for the image
  renders** — measured at 83 for a 14-entry / 208-pair manifest — and TWO full
  runs back to back exhausted the `high` limit-type mid-A/B, after which nine
  entries failed to expand and the second arm silently covered 130 pairs
  instead of 205. If you are A/B-ing anything, expect to pay twice.
- **The Figma cache is on by default and keyed by the file VERSION**
  (`--no-figma-cache` to disable). It stores the rendered PNGs and the variables
  map under `~/.cache/refdiff/figma/<fileKey>/<version>/`, and **never the node
  subtree**: that call is what returns the version every key is built from, so
  caching it would cache the freshness probe itself. One live call per set buys
  the guarantee — **an edited Figma file gets a new version, so every key misses
  and the run refetches**, with stale version directories pruned on sight. Same
  manifest: 83 calls cold, 14 warm. It is the opposite of a file-existence cache
  (`does refs/foo.png exist?`), which cannot tell "cached" from "stale" and will
  happily serve a render of a design nobody has seen for days.
- The unit of a design-system comparison is one variant COMPONENT ↔ one
  story cell (`--selector`), never the whole sheet.
