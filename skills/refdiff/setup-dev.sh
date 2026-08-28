#!/usr/bin/env bash
# refdiff — dev-mode setup for a new machine / VM. Idempotent; re-run any time.
#
#   bash ~/.claude-shared/skills/refdiff/setup-dev.sh [--checkout <dir>] [--watch] [--no-browser]
#
# What it makes true:
#   1. a refdiff checkout exists (default ~/Development/refdiff; cloned if missing)
#   2. deps installed, Playwright Chromium present, both packages built
#   3. `refdiff` and `refdiff-annotator` on PATH via `pnpm link --global` (run from dist)
#   4. the skill is USER-level: ~/.claude/skills/refdiff (and ~/.claude-personal if present) →
#      <checkout>/skills/refdiff, via ~/.claude-shared/skills when that dir already exists
#   5. --watch: `pnpm dev` (tsc --watch, both packages) running in the background so dist follows edits
# Nothing is written into consuming repos; they only carry a manifest + refdiff.bindings.md.
set -euo pipefail

REPO_URL="https://github.com/mzvonar/refdiff.git"
CHECKOUT="${REFDIFF_DIR:-$HOME/Development/refdiff}"
WATCH=0
BROWSER=1
while [ $# -gt 0 ]; do
  case "$1" in
    --checkout) CHECKOUT="$2"; shift 2 ;;
    --watch) WATCH=1; shift ;;
    --no-browser) BROWSER=0; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "missing: $1 ($2)" >&2; exit 1; }; }

need node "Node ≥22"
need pnpm "corepack enable && corepack prepare pnpm@10 --activate"
need git "git"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 22 ] || { echo "Node ≥22 required, have $(node -v)" >&2; exit 1; }

# 1. checkout
if [ -d "$CHECKOUT/.git" ]; then
  say "checkout: $CHECKOUT ($(git -C "$CHECKOUT" rev-parse --short HEAD), $(git -C "$CHECKOUT" branch --show-current))"
else
  say "cloning $REPO_URL → $CHECKOUT"
  mkdir -p "$(dirname "$CHECKOUT")"
  git clone --quiet "$REPO_URL" "$CHECKOUT"
fi
cd "$CHECKOUT"

# 2. deps, browser, build
say "pnpm install"
pnpm install --frozen-lockfile --reporter=silent 2>/dev/null || pnpm install --reporter=silent
if [ "$BROWSER" = 1 ]; then
  say "playwright chromium"
  ( cd packages/core && pnpm exec playwright install chromium >/dev/null )
fi
say "pnpm build"
pnpm build >/dev/null

# 3. global bins. Two pnpm behaviours make this fiddly, and both bite on a fresh machine:
#      - `pnpm setup` only appends the PATH line to the shell PROFILE; it does not change
#        THIS shell, so the very next `pnpm link --global` in this script still fails.
#      - `pnpm bin -g` does not report the dir when the dir is not already on PATH: it
#        prints NOTHING and (in pnpm 10) still exits 0. So it cannot be used to discover
#        the dir — querying it is the chicken-and-egg, not the answer.
#    Hence: derive the dir ourselves, put it on PATH, and only then trust `pnpm bin -g`.
pnpm_bin_candidate() {
  if [ -n "${PNPM_HOME:-}" ]; then echo "$PNPM_HOME"; return; fi
  cfg="$(pnpm config get global-bin-dir 2>/dev/null || true)"
  if [ -n "$cfg" ] && [ "$cfg" != "undefined" ] && [ "$cfg" != "null" ]; then echo "$cfg"; return; fi
  case "$(uname)" in
    Darwin) echo "$HOME/Library/pnpm" ;;
    *) echo "${XDG_DATA_HOME:-$HOME/.local/share}/pnpm" ;;
  esac
}
add_to_path() {
  case ":$PATH:" in
    *":$1:"*) ;;
    *) export PATH="$1:$PATH" ;;
  esac
}
add_to_path "$(pnpm_bin_candidate)"
GBIN="$(pnpm bin -g 2>/dev/null || true)"
if [ -z "$GBIN" ]; then
  say "pnpm setup (global bin dir)"
  pnpm setup >/dev/null 2>&1 || true
  export PNPM_HOME="${PNPM_HOME:-$(pnpm_bin_candidate)}"
  add_to_path "$PNPM_HOME"
  GBIN="$(pnpm bin -g 2>/dev/null || true)"
fi
[ -n "$GBIN" ] && add_to_path "$GBIN"
# A link failure must not cost the skill symlinks (step 4) — they are independent.
say "pnpm link --global (core, annotator)"
linked_bins=1
( cd packages/core && pnpm link --global >/dev/null ) || linked_bins=0
( cd packages/annotator && pnpm link --global >/dev/null ) || linked_bins=0
if [ "$linked_bins" = 0 ]; then
  echo "warn: pnpm link --global failed — the CLIs are not on PATH. Run them from the checkout" >&2
  echo "      (node $CHECKOUT/packages/core/dist/cli.js) or fix pnpm's global bin dir and re-run." >&2
elif ! command -v refdiff >/dev/null 2>&1; then
  echo "note: $GBIN is not on PATH in your profile — add it:  export PATH=\"$GBIN:\$PATH\""
fi

# 4. user-level skill symlinks. With the two-profile setup (~/.claude-shared exists) follow its
#    convention: shared → checkout, profiles → shared. On a plain machine (only ~/.claude) link the
#    profile straight to the checkout — never create ~/.claude-shared where it is not in use.
SKILL_SRC="$CHECKOUT/skills/refdiff"
LINK_TARGET="$SKILL_SRC"
if [ -d "$HOME/.claude-shared" ]; then
  mkdir -p "$HOME/.claude-shared/skills"
  ln -sfn "$SKILL_SRC" "$HOME/.claude-shared/skills/refdiff"
  LINK_TARGET="$HOME/.claude-shared/skills/refdiff"
fi
linked=0
for profile in "$HOME/.claude" "$HOME/.claude-personal"; do
  [ -d "$profile" ] || continue
  mkdir -p "$profile/skills"
  if [ -e "$profile/skills/refdiff" ] && [ ! -L "$profile/skills/refdiff" ]; then
    echo "note: $profile/skills/refdiff is a real directory, not replacing it (remove it to link the checkout)"
    continue
  fi
  ln -sfn "$LINK_TARGET" "$profile/skills/refdiff"
  say "skill: $profile/skills/refdiff → $LINK_TARGET"
  linked=1
done
if [ "$linked" = 0 ]; then
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$LINK_TARGET" "$HOME/.claude/skills/refdiff"
  say "skill: ~/.claude/skills/refdiff → $LINK_TARGET (no profile dir existed; created ~/.claude/skills)"
fi

# 5. watcher
if [ "$WATCH" = 1 ]; then
  if pgrep -f "tsc -p tsconfig(.build)?.json --watch" >/dev/null 2>&1; then
    say "watcher already running (pnpm dev)"
  else
    say "starting pnpm dev (tsc --watch) in the background → $CHECKOUT/.dev.log"
    nohup pnpm dev >"$CHECKOUT/.dev.log" 2>&1 &
    disown || true
  fi
fi

# verify
say "verify"
"${GBIN:-.}/refdiff" --help 2>/dev/null | head -1 || node packages/core/dist/cli.js --help | head -1
echo "tests: $(pnpm -r test 2>&1 | grep -oE 'Tests +[0-9]+ passed' | awk '{s+=$2} END {print s+0}') passing"
echo
echo "dev mode ready. Edit $SKILL_SRC/SKILL.md or packages/*/src — the skill is live, dist follows with pnpm dev."
echo "A consuming repo needs only: its manifest + a refdiff.bindings.md (see SKILL.md 'Repo bindings')."
