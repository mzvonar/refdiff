#!/usr/bin/env bash
# refdiff — tool pre-flight. Answers one question: is the thing you are about to
# MEASURE WITH current? Run it before the first `refdiff compare` of a session.
#
#   bash <skill-dir>/preflight.sh [--port <n> | --app-url <url>] [--quiet]
#
# It prints a fact block and exits:
#   0  proceed (warnings may be present — they never change the exit code)
#   1  HALT — a stale BUILD or a stale SERVED INSTANCE. Not a style complaint:
#      both make the numbers lie. The CLIs exec `<checkout>/packages/*/dist/cli.js`,
#      so a dist behind src measures code you did not write, and the annotator
#      renders its shell at process START, so a server older than dist serves code
#      you did not write. Either one reads as `+0/−0` — "my fix did nothing" —
#      which is indistinguishable from a fix that genuinely did nothing.
#   2  usage / IO error
#
# Never collapse 1 into 2: exit 2 is the crash detector, and routing "your build is
# stale" there makes it indistinguishable from "the pre-flight itself broke".
#
# UPSTREAM drift NEVER halts. It is surfaced so a drifted copy is visible rather
# than silent, and the caller decides (SKILL.md → "Tool pre-flight"). A hard stop
# on "behind origin" would be wrong: you are often deliberately ahead, or on a
# branch, and a stop mid-loop is worse than a printed line.
#
# Env:
#   REFDIFF_DIR             checkout to check (else: resolved from this skill's own
#                           location in dev mode, else from the `refdiff` wrapper on PATH)
#   REFDIFF_SKIP_FRESHNESS=1  skip every network fetch (upstream checks report skipped-opt-out)
set -uo pipefail

PORT=""; QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --app-url) PORT="$(printf '%s' "$2" | sed -n 's#.*:\([0-9][0-9]*\).*#\1#p')"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

# ---- helpers ---------------------------------------------------------------
# mtime in epoch seconds. GNU stat and BSD/macOS stat disagree on the flag, and this
# skill runs on both (Linux devbox + Mato's Mac), so try one and fall back.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
# Newest mtime of files matching a pattern under a dir; 0 when the dir is absent/empty.
newest() {
  local dir="$1" pat="$2" best=0 t f
  [ -d "$dir" ] || { echo 0; return; }
  while IFS= read -r f; do t=$(mtime "$f"); [ "$t" -gt "$best" ] && best="$t"; done \
    < <(find "$dir" -type f -name "$pat" 2>/dev/null)
  echo "$best"
}
say()  { [ "$QUIET" = 1 ] || printf '%s\n' "$*"; }
fact() { [ "$QUIET" = 1 ] || printf '  %-18s = %s\n' "$1" "$2"; FACTS="${FACTS}${1}=${2}"$'\n'; }
FACTS=""
WARNINGS=()
warn() { WARNINGS+=("$1"); }
HALT_REASON=""
halt() { HALT_REASON="$1"; }

# ---- 0. where does this skill live, and in which mode? ----------------------
# DEV: the skill dir is (or is symlinked to) <checkout>/skills/refdiff, so SKILL.md is
#      the checkout's own file and cannot drift from it. Nothing to sync.
# VENDORED: the skill dir is a COPY carrying .skill-version (written by sync-skill.sh).
#      SKILL.md is frozen at that sha and CAN drift from upstream.
SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  LINK=$(readlink "$SELF")
  case "$LINK" in /*) SELF="$LINK" ;; *) SELF="$(dirname "$SELF")/$LINK" ;; esac
done
SKILL_DIR="$(cd "$(dirname "$SELF")" && pwd)"

say "[ refdiff pre-flight ]"

if [ -f "$SKILL_DIR/.skill-version" ]; then
  MODE="vendored"
elif [ -f "$SKILL_DIR/../../packages/core/package.json" ]; then
  MODE="dev"
else
  MODE="unknown"
fi
fact skill_mode "$MODE ($SKILL_DIR)"

# ---- 1. the checkout the CLIs actually run from -----------------------------
# This matters in BOTH modes: vendoring copies the skill TEXT, never the engine.
# `refdiff` is always a wrapper that execs <checkout>/packages/core/dist/cli.js, so
# a vendored consumer still runs a checkout's dist and can still have a stale build.
CO=""
if [ -n "${REFDIFF_DIR:-}" ] && [ -f "${REFDIFF_DIR}/packages/core/package.json" ]; then
  CO="$REFDIFF_DIR"
elif [ "$MODE" = "dev" ]; then
  CO="$(cd "$SKILL_DIR/../.." && pwd)"
elif command -v refdiff >/dev/null 2>&1; then
  # Parse the wrapper setup-dev.sh wrote: exec node "<checkout>/packages/core/dist/cli.js" "$@"
  W=$(sed -n 's#.*exec node "\(.*\)/packages/core/dist/cli.js".*#\1#p' "$(command -v refdiff)" | head -1)
  [ -n "$W" ] && [ -f "$W/packages/core/package.json" ] && CO="$W"
fi

if [ -z "$CO" ]; then
  fact checkout "NONE FOUND"
  fact build_freshness "skipped-no-checkout"
  fact checkout_freshness "skipped-no-checkout"
  warn "no refdiff checkout found — the CLI cannot run. Set REFDIFF_DIR, or install with: bash ${SKILL_DIR}/setup-dev.sh"
else
  BRANCH=$(git -C "$CO" branch --show-current 2>/dev/null || echo "")
  HEAD_SHORT=$(git -C "$CO" rev-parse --short HEAD 2>/dev/null || echo "?")
  fact checkout "$CO (${BRANCH:-DETACHED} @ ${HEAD_SHORT})"

  # 1a. BUILD FRESHNESS — the halting check.
  DIST_CORE=$(newest "$CO/packages/core/dist" "*.js")
  DIST_ANN=$(newest "$CO/packages/annotator/dist" "*.js")
  DIST=$DIST_CORE; [ "$DIST_ANN" -gt "$DIST" ] && DIST=$DIST_ANN
  # Only packages/*/src counts, never packages/*/test: tests are not compiled into dist,
  # so a test edit must not read as a stale build. (preflight-selftest.sh row 4.)
  SRC=0
  for d in "$CO"/packages/*/src; do t=$(newest "$d" "*.ts"); [ "$t" -gt "$SRC" ] && SRC="$t"; done
  if [ "$DIST" = 0 ]; then
    fact build_freshness "MISSING"
    halt "dist/ is not built in ${CO}. The CLIs exec dist/cli.js and there is nothing there. Run: (cd ${CO} && pnpm build)"
  elif [ "$SRC" -gt "$DIST" ]; then
    # Name the files that are ACTUALLY newer than the newest dist output, by comparing
    # mtimes. `find -newer <dist-dir>` was wrong here and named untouched files: a directory's
    # mtime is when its entries last changed, not when its contents were last written, so it
    # sat far behind every .js inside it and every src file looked newer.
    NEWER=""
    while IFS= read -r f; do
      [ "$(mtime "$f")" -gt "$DIST" ] && NEWER="${NEWER}${f#$CO/} "
    done < <(find "$CO"/packages/*/src -type f -name '*.ts' 2>/dev/null | head -200)
    NEWER=$(printf '%s' "$NEWER" | tr ' ' '\n' | head -3 | tr '\n' ' ')
    fact build_freshness "STALE (src is $((SRC - DIST))s newer than dist)"
    halt "the build is BEHIND the source in ${CO} — you would measure code you did not write, and read it as +0/−0. Newer than dist: ${NEWER:-packages/*/src}. Run: (cd ${CO} && pnpm build)  — or start the watcher: (cd ${CO} && pnpm dev &)"
  else
    fact build_freshness "current (dist is $((DIST - SRC))s newer than src)"
  fi

  # 1b. CHECKOUT vs its own origin — surfaced, never a halt.
  if [ "${REFDIFF_SKIP_FRESHNESS:-0}" = "1" ]; then
    fact checkout_freshness "skipped-opt-out"
  elif [ -z "$BRANCH" ]; then
    fact checkout_freshness "skipped-detached"
  else
    git -C "$CO" fetch --quiet origin "$BRANCH" 2>/dev/null || true
    COUNTS=$(git -C "$CO" rev-list --left-right --count "origin/${BRANCH}...HEAD" 2>/dev/null || echo "")
    if [ -z "$COUNTS" ]; then
      fact checkout_freshness "unknown"
      warn "could not compare ${CO} against origin/${BRANCH} — no upstream ref?"
    else
      BEHIND=$(printf '%s' "$COUNTS" | awk '{print $1}')
      AHEAD=$(printf '%s' "$COUNTS" | awk '{print $2}')
      if [ "$BEHIND" = 0 ] && [ "$AHEAD" = 0 ]; then fact checkout_freshness "current"
      elif [ "$BEHIND" = 0 ]; then fact checkout_freshness "ahead-${AHEAD}"
      elif [ "$AHEAD" = 0 ]; then
        fact checkout_freshness "behind-${BEHIND}"
        warn "the checkout is ${BEHIND} commit(s) behind origin/${BRANCH}. The CLI and (in dev mode) SKILL.md are both that old. Pull + rebuild, or proceed knowingly — this never blocks."
      else
        fact checkout_freshness "diverged-${BEHIND}b/${AHEAD}a"
        warn "the checkout has diverged from origin/${BRANCH} (${BEHIND} behind, ${AHEAD} ahead) — proceed knowingly."
      fi
    fi
  fi
fi

# ---- 2. VENDORED skill copy vs upstream ------------------------------------
# Dev mode is a symlink into the checkout, so there is no copy that can drift and
# nothing to sync; 1b already covers it. This check exists only for a vendored copy.
if [ "$MODE" != "vendored" ]; then
  fact skill_freshness "skipped-${MODE}-mode"
elif [ "${REFDIFF_SKIP_FRESHNESS:-0}" = "1" ]; then
  fact skill_freshness "skipped-opt-out"
else
  V_SHA=$(sed -n 's/^sha=//p'    "$SKILL_DIR/.skill-version" | head -1)
  V_REF=$(sed -n 's/^ref=//p'    "$SKILL_DIR/.skill-version" | head -1); V_REF="${V_REF:-main}"
  V_ORG=$(sed -n 's/^origin=//p' "$SKILL_DIR/.skill-version" | head -1)
  if [ -z "$V_SHA" ] || [ -z "$V_ORG" ]; then
    fact skill_freshness "unknown"
    warn ".skill-version is present but unreadable (need sha= and origin=) — re-vendor with sync-skill.sh"
  elif [ -n "$CO" ] && git -C "$CO" cat-file -e "${V_SHA}^{commit}" 2>/dev/null; then
    # A local checkout has the objects, so the answer can be a COUNT.
    git -C "$CO" fetch --quiet origin "$V_REF" 2>/dev/null || true
    U_SHA=$(git -C "$CO" rev-parse --verify "origin/${V_REF}^{commit}" 2>/dev/null || echo "")
    if [ -z "$U_SHA" ]; then fact skill_freshness "unknown"
    elif [ "$U_SHA" = "$V_SHA" ]; then fact skill_freshness "current"
    else
      N=$(git -C "$CO" rev-list --count "${V_SHA}..${U_SHA}" 2>/dev/null || echo "?")
      fact skill_freshness "stale-${N}"
      warn "the VENDORED skill copy is ${N} commit(s) behind ${V_ORG} ${V_REF} (copy=${V_SHA:0:8}, upstream=${U_SHA:0:8}). ASK the user: sync now, or proceed with the stale copy. Sync: bash ${SKILL_DIR}/sync-skill.sh"
    fi
  else
    # No objects locally. `ls-remote` still answers "is the copy at the tip?" without a
    # clone — which run-story cannot do, because its upstream needs a local checkout.
    # It cannot say BEHIND vs AHEAD, and saying "behind" without the objects would be a
    # guess, so the honest word is `differs`.
    U_SHA=$(git ls-remote "$V_ORG" "refs/heads/${V_REF}" 2>/dev/null | awk '{print $1}' | head -1)
    if [ -z "$U_SHA" ]; then
      fact skill_freshness "skipped-unreachable"
      warn "could not reach ${V_ORG} to check the vendored copy — offline? Proceeding."
    elif [ "$U_SHA" = "$V_SHA" ]; then
      fact skill_freshness "current"
    else
      fact skill_freshness "differs"
      warn "the VENDORED skill copy is NOT at the tip of ${V_ORG} ${V_REF} (copy=${V_SHA:0:8}, upstream=${U_SHA:0:8}). Without local objects the direction is unknowable — it is 'differs', not 'behind'. ASK the user: sync now, or proceed. Sync: bash ${SKILL_DIR}/sync-skill.sh"
    fi
  fi
fi

# ---- 3. the SERVED annotator instance (opt-in: --port / --app-url) ----------
# The annotator renders its page shell at process START, so an instance older than
# dist serves the previous build however fresh dist is. Same failure signature as a
# stale build — a delta of +0/−0 — and it has cost a session 25 minutes before.
if [ -z "$PORT" ]; then
  fact server_freshness "skipped-no-port"
elif [ -z "$CO" ] || [ "${DIST:-0}" = 0 ]; then
  fact server_freshness "skipped-no-build"
else
  SRV_PID=$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null | head -1)
  [ -z "$SRV_PID" ] && SRV_PID=$(ss -ltnp 2>/dev/null | grep ":${PORT} " | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
  if [ -z "$SRV_PID" ]; then
    fact server_freshness "no-listener-on-${PORT}"
    warn "nothing is listening on port ${PORT} — start the annotator before measuring."
  else
    # Process start time in epoch seconds, GNU ps then BSD ps.
    SRV_T=$(ps -o lstart= -p "$SRV_PID" 2>/dev/null | head -1)
    SRV_EPOCH=$(date -d "$SRV_T" +%s 2>/dev/null || date -j -f "%a %b %d %T %Y" "$SRV_T" +%s 2>/dev/null || echo 0)
    if [ "$SRV_EPOCH" = 0 ]; then
      fact server_freshness "unknown"
      warn "could not read the start time of pid ${SRV_PID} — restart the server by hand if you have rebuilt."
    elif [ "$DIST" -gt "$SRV_EPOCH" ]; then
      fact server_freshness "STALE (pid ${SRV_PID} started $((DIST - SRV_EPOCH))s before the build)"
      halt "the annotator on port ${PORT} (pid ${SRV_PID}) is OLDER than dist — it renders its shell at start, so it is serving the PREVIOUS build. Kill it by PID, poll until the port is free, restart, and verify by CONTENT (grep the served shell for a string you just added)."
    else
      fact server_freshness "current (pid ${SRV_PID} started $((SRV_EPOCH - DIST))s after the build)"
    fi
  fi
fi

# ---- verdict ---------------------------------------------------------------
if [ "$QUIET" != 1 ] && [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  for w in "${WARNINGS[@]}"; do echo "  WARN: $w"; done
fi
if [ -n "$HALT_REASON" ]; then
  echo ""
  echo "HALT: ${HALT_REASON}"
  exit 1
fi
[ "$QUIET" = 1 ] || { echo ""; echo "PROCEED"; }
exit 0
