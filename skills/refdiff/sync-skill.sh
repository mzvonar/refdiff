#!/usr/bin/env bash
# refdiff — vendor this skill into a consumer, or update a copy already vendored there.
#
#   bash sync-skill.sh <dest> [--ref <ref>] [--from <checkout>] [--dry-run]
#   bash <vendored>/sync-skill.sh            # no <dest>: update the copy this script lives in
#
# <dest> is a repo root (the skill lands in <dest>/.claude/skills/refdiff/) or an explicit
# skills directory (…/skills → …/skills/refdiff/). It writes a `.skill-version` stamp so
# preflight.sh can tell the copy's sha from upstream's, and re-running it IS the update.
#
# WHY VENDOR AT ALL, when dev mode is a symlink and never drifts: a symlink needs a checkout
# on the machine, so it does not survive a fresh clone, CI, a cloud session or a teammate. A
# vendored copy does — at the cost of being a COPY, which is the thing that can go stale, which
# is why the stamp and preflight.sh's check exist. Pick per consumer, not per taste:
#   dev mode  — you are DEVELOPING refdiff itself on this machine (SKILL.md is the checkout's)
#   vendored  — a consuming repo that wants the skill to arrive with a `git clone`
#
# The skill TEXT is all that is vendored. The ENGINE is not: `refdiff` and `refdiff-annotator`
# are wrappers that exec <checkout>/packages/*/dist/cli.js, so a vendored consumer still needs
# setup-dev.sh once per machine. That asymmetry is deliberate — a 40 MB engine has no business
# in a consumer's git history — and it is why preflight.sh checks the BUILD in both modes.
set -euo pipefail

ORIGIN_DEFAULT="https://github.com/mzvonar/refdiff.git"
DEST=""; REF="main"; FROM=""; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ref)  REF="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) DEST="$1"; shift ;;
  esac
done

say() { printf '\033[1m%s\033[0m\n' "$*"; }

# Resolve where THIS script lives, following symlinks, so a self-update knows its own copy.
SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  L=$(readlink "$SELF"); case "$L" in /*) SELF="$L" ;; *) SELF="$(dirname "$SELF")/$L" ;; esac
done
SELF_DIR="$(cd "$(dirname "$SELF")" && pwd)"

# ---- destination -----------------------------------------------------------
if [ -z "$DEST" ]; then
  # No <dest>: only meaningful from inside a vendored copy — update it in place.
  if [ -f "$SELF_DIR/.skill-version" ]; then
    TARGET="$SELF_DIR"
    REF=$(sed -n 's/^ref=//p' "$SELF_DIR/.skill-version" | head -1 || true); REF="${REF:-main}"
  else
    echo "usage: sync-skill.sh <dest> [--ref <ref>] [--from <checkout>]" >&2
    echo "  (no <dest> is only valid from inside a vendored copy — this one has no .skill-version)" >&2
    exit 2
  fi
elif [ -d "$DEST/.claude" ] || [ -d "$DEST/.git" ]; then
  TARGET="$DEST/.claude/skills/refdiff"
elif [ "$(basename "$DEST")" = "skills" ]; then
  TARGET="$DEST/refdiff"
else
  TARGET="$DEST/.claude/skills/refdiff"
fi

# Refuse to overwrite a DEV-MODE symlink with a copy. That would silently convert a live
# skill into a frozen one and leave the developer editing a file nothing reads.
if [ -L "$TARGET" ]; then
  echo "refusing: ${TARGET} is a SYMLINK (dev mode). Vendoring would replace a live skill with a frozen copy." >&2
  echo "  remove the symlink first if you really mean to vendor here: rm '${TARGET}'" >&2
  exit 2
fi

# ---- source ----------------------------------------------------------------
# --from a checkout, else the checkout this script lives in, else a shallow temp clone so
# the command works on a machine that has never had refdiff (the whole point of vendored mode).
TMP=""
# `return 0` is load-bearing, not tidiness: an EXIT trap's LAST command sets the script's exit
# status, so a bare `[ -n "$TMP" ] && rm -rf "$TMP"` exits 1 on every successful run that did not
# need a temp clone. Caught by preflight-selftest.sh row 9, which is why that row asserts the
# exit code and not just that the files landed.
cleanup() { [ -n "$TMP" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT
if [ -n "$FROM" ]; then
  SRC_REPO="$FROM"
elif [ -f "$SELF_DIR/../../packages/core/package.json" ]; then
  SRC_REPO="$(cd "$SELF_DIR/../.." && pwd)"
else
  TMP=$(mktemp -d); say "no local checkout — shallow-cloning ${ORIGIN_DEFAULT} @ ${REF}"
  git clone --quiet --depth 1 --branch "$REF" "$ORIGIN_DEFAULT" "$TMP/refdiff"
  SRC_REPO="$TMP/refdiff"
fi
SRC="$SRC_REPO/skills/refdiff"
[ -d "$SRC" ] || { echo "no skill at ${SRC}" >&2; exit 2; }

# The sha to stamp is the source's HEAD when it is a git checkout. A DIRTY source is stamped
# with the sha anyway and SAID SO: a stamp that silently claims a clean commit for a tree with
# uncommitted edits is worse than no stamp, because preflight.sh would then call it `current`.
if git -C "$SRC_REPO" rev-parse --git-dir >/dev/null 2>&1; then
  SHA=$(git -C "$SRC_REPO" rev-parse HEAD)
  ORIGIN=$(git -C "$SRC_REPO" remote get-url origin 2>/dev/null || echo "$ORIGIN_DEFAULT")
  DIRTY=$(git -C "$SRC_REPO" status --porcelain -- skills/refdiff | head -1)
else
  echo "source ${SRC_REPO} is not a git checkout — cannot stamp a version" >&2; exit 2
fi

FILES="SKILL.md setup-dev.sh preflight.sh sync-skill.sh"
say "vendor ${SRC} → ${TARGET}"
say "  ref=${REF} sha=${SHA:0:8}${DIRTY:+  (SOURCE IS DIRTY — the stamp will say so)}"

if [ "$DRY" = 1 ]; then
  for f in $FILES; do
    if [ -f "$TARGET/$f" ] && cmp -s "$SRC/$f" "$TARGET/$f"; then echo "  = $f"; else echo "  ~ $f"; fi
  done
  exit 0
fi

# A dirty source is stamped with HEAD's sha regardless — the alternative is no stamp at all —
# but the stamp SAYS SO on its own line, so a reader (and preflight.sh's `current`) is never
# told a clean commit describes a tree that had uncommitted edits in it.
DIRTY_LINE=""
[ -n "$DIRTY" ] && DIRTY_LINE="dirty=true  # source had uncommitted changes under skills/refdiff at vendor time"

mkdir -p "$TARGET"
for f in $FILES; do
  [ -f "$SRC/$f" ] || { echo "missing in source: $f" >&2; exit 2; }
  cp "$SRC/$f" "$TARGET/$f"
done
chmod +x "$TARGET/setup-dev.sh" "$TARGET/preflight.sh" "$TARGET/sync-skill.sh"

cat > "$TARGET/.skill-version" <<STAMP
# refdiff skill — vendored copy, managed by sync-skill.sh. DO NOT edit by hand.
# Update:  bash $(basename "$TARGET")/sync-skill.sh            (from the consumer's skills dir)
#     or:  bash <refdiff-checkout>/skills/refdiff/sync-skill.sh <this-repo> --ref ${REF}
# preflight.sh compares sha= against origin= ${REF} and ASKS before anything is changed.
sha=${SHA}
ref=${REF}
origin=${ORIGIN}
files=${FILES}
${DIRTY_LINE}
STAMP

say "wrote ${TARGET}/.skill-version"
say "next: bash ${TARGET}/preflight.sh    # confirms the stamp reads as current"
