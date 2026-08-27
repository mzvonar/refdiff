#!/usr/bin/env bash
# design-fix-loop — dev-mode setup for a new machine / VM. Idempotent; re-run any time.
#
#   bash ~/.claude-shared/skills/design-fix-loop/setup-dev.sh [--checkout <dir>] [--watch] [--no-browser]
#
# What it makes true:
#   1. a visual-compare checkout exists (default ~/Development/visual-compare; cloned if missing)
#   2. deps installed, Playwright Chromium present, both packages built
#   3. `visual-compare` and `visual-compare-annotator` on PATH via `pnpm link --global` (run from dist)
#   4. the skill is USER-level: ~/.claude/skills/design-fix-loop (and ~/.claude-personal if present) →
#      <checkout>/skills/design-fix-loop, via ~/.claude-shared/skills when that dir already exists
#   5. --watch: `pnpm dev` (tsc --watch, both packages) running in the background so dist follows edits
# Nothing is written into consuming repos; they only carry a manifest + design-fix-loop.bindings.md.
set -euo pipefail

REPO_URL="https://github.com/mzvonar/visual-compare.git"
CHECKOUT="${VISUAL_COMPARE_DIR:-$HOME/Development/visual-compare}"
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

# 3. global bins (pnpm needs a global bin dir; `pnpm setup` creates one on a fresh machine)
if ! pnpm bin -g >/dev/null 2>&1; then
  say "pnpm setup (global bin dir)"
  pnpm setup >/dev/null 2>&1 || true
fi
say "pnpm link --global (core, annotator)"
( cd packages/core && pnpm link --global >/dev/null )
( cd packages/annotator && pnpm link --global >/dev/null )
GBIN="$(pnpm bin -g 2>/dev/null || true)"
if ! command -v visual-compare >/dev/null 2>&1; then
  echo "note: $GBIN is not on PATH in this shell — add it to your profile:  export PATH=\"$GBIN:\$PATH\""
fi

# 4. user-level skill symlinks. With the two-profile setup (~/.claude-shared exists) follow its
#    convention: shared → checkout, profiles → shared. On a plain machine (only ~/.claude) link the
#    profile straight to the checkout — never create ~/.claude-shared where it is not in use.
SKILL_SRC="$CHECKOUT/skills/design-fix-loop"
LINK_TARGET="$SKILL_SRC"
if [ -d "$HOME/.claude-shared" ]; then
  mkdir -p "$HOME/.claude-shared/skills"
  ln -sfn "$SKILL_SRC" "$HOME/.claude-shared/skills/design-fix-loop"
  LINK_TARGET="$HOME/.claude-shared/skills/design-fix-loop"
fi
linked=0
for profile in "$HOME/.claude" "$HOME/.claude-personal"; do
  [ -d "$profile" ] || continue
  mkdir -p "$profile/skills"
  if [ -e "$profile/skills/design-fix-loop" ] && [ ! -L "$profile/skills/design-fix-loop" ]; then
    echo "note: $profile/skills/design-fix-loop is a real directory, not replacing it (remove it to link the checkout)"
    continue
  fi
  ln -sfn "$LINK_TARGET" "$profile/skills/design-fix-loop"
  say "skill: $profile/skills/design-fix-loop → $LINK_TARGET"
  linked=1
done
if [ "$linked" = 0 ]; then
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$LINK_TARGET" "$HOME/.claude/skills/design-fix-loop"
  say "skill: ~/.claude/skills/design-fix-loop → $LINK_TARGET (no profile dir existed; created ~/.claude/skills)"
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
"${GBIN:-.}/visual-compare" --help 2>/dev/null | head -1 || node packages/core/dist/cli.js --help | head -1
echo "tests: $(pnpm -r test 2>&1 | grep -oE 'Tests +[0-9]+ passed' | awk '{s+=$2} END {print s+0}') passing"
echo
echo "dev mode ready. Edit $SKILL_SRC/SKILL.md or packages/*/src — the skill is live, dist follows with pnpm dev."
echo "A consuming repo needs only: its manifest + a design-fix-loop.bindings.md (see SKILL.md 'Repo bindings')."
