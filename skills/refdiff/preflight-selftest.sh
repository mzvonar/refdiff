#!/usr/bin/env bash
# Falsification for preflight.sh and sync-skill.sh. Builds SYNTHETIC offender trees in a
# temp dir and asserts the fact value and the EXIT CODE for each — because a check that has
# never been observed to fire is indistinguishable from one that cannot.
#
#   bash skills/refdiff/preflight-selftest.sh
#
# Every row states an EXACT fact value, never a substring of the output: a pre-flight that
# printed nothing at all would satisfy a `contains` row, and nothing else would notice.
# One PRISTINE control row is mandatory — every negative row also passes against a script
# that halts on everything.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

# A fake checkout: the two package.json files preflight probes, a src tree and a dist tree.
# `--quiet` suppresses the human block and leaves only the halt/verdict, so the assertions
# read the FACTS variable the script builds rather than screen-scraping prose.
mkfake() {
  local root="$1"
  mkdir -p "$root/packages/core/src" "$root/packages/core/dist" \
           "$root/packages/annotator/src" "$root/packages/annotator/dist" "$root/skills/refdiff"
  echo '{"name":"@refdiff/core"}'      > "$root/packages/core/package.json"
  echo '{"name":"@refdiff/annotator"}' > "$root/packages/annotator/package.json"
  echo 'export const a = 1'            > "$root/packages/core/src/index.ts"
  echo 'export const a = 1;'           > "$root/packages/core/dist/index.js"
  cp "$HERE/preflight.sh" "$HERE/sync-skill.sh" "$HERE/setup-dev.sh" "$HERE/SKILL.md" "$root/skills/refdiff/"
}
# Run preflight against a fake checkout and print "<exit> <fact-block>".
run() { local root="$1"; shift; REFDIFF_DIR="$root" REFDIFF_SKIP_FRESHNESS=1 bash "$root/skills/refdiff/preflight.sh" "$@" 2>&1; }
factof() { printf '%s\n' "$1" | sed -n "s/^  *$2 *= *//p" | head -1; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
echo "[ preflight self-test ]"

# --- 1. PRISTINE CONTROL. Without this row every row below passes on a script that halts
#        on everything, and on a clobbered fixture.
mkfake "$TMP/clean"; touch "$TMP/clean/packages/core/dist/index.js"   # dist newest
OUT=$(run "$TMP/clean"); EXIT=$?
F=$(factof "$OUT" build_freshness)
[ "$EXIT" = 0 ] && case "$F" in current*) ok "control: clean tree PROCEEDs (exit 0, build_freshness=current…)" ;;
  *) bad "control" "exit=$EXIT build_freshness='$F'" ;; esac || bad "control" "exit=$EXIT build_freshness='$F'"

# --- 2. STALE BUILD: src newer than dist. The halting check.
mkfake "$TMP/stale"; touch "$TMP/stale/packages/core/dist/index.js"
sleep 1; touch "$TMP/stale/packages/annotator/src/render.ts"
OUT=$(run "$TMP/stale"); EXIT=$?
F=$(factof "$OUT" build_freshness)
case "$F:$EXIT" in STALE*:1) ok "stale build HALTS (exit 1)" ;; *) bad "stale build" "exit=$EXIT build_freshness='$F'" ;; esac

# --- 3. MISSING BUILD: dist has no .js at all.
mkfake "$TMP/nobuild"; rm -f "$TMP/nobuild/packages/core/dist/index.js"
OUT=$(run "$TMP/nobuild"); EXIT=$?
F=$(factof "$OUT" build_freshness)
case "$F:$EXIT" in MISSING:1) ok "missing build HALTS (exit 1)" ;; *) bad "missing build" "exit=$EXIT build_freshness='$F'" ;; esac

# --- 4. A TEST-ONLY edit must NOT read as a stale build: tests are never compiled into dist.
#        This is the false-POSITIVE row; without it the check could be "halt whenever anything
#        under packages/ is newer than dist", which would fire on every test edit.
mkfake "$TMP/testedit"; touch "$TMP/testedit/packages/core/dist/index.js"
mkdir -p "$TMP/testedit/packages/core/test"; sleep 1
touch "$TMP/testedit/packages/core/test/thing.test.ts"
OUT=$(run "$TMP/testedit"); EXIT=$?
F=$(factof "$OUT" build_freshness)
case "$F:$EXIT" in current*:0) ok "a test-only edit does NOT halt (exit 0)" ;; *) bad "test-only edit" "exit=$EXIT build_freshness='$F'" ;; esac

# --- 5. MODE detection: a .skill-version stamp makes it vendored, its absence dev.
mkfake "$TMP/mode"; touch "$TMP/mode/packages/core/dist/index.js"
OUT=$(run "$TMP/mode"); M=$(factof "$OUT" skill_mode)
case "$M" in dev\ *) ok "mode: no stamp → dev" ;; *) bad "mode dev" "skill_mode='$M'" ;; esac
printf 'sha=deadbeef\nref=main\norigin=https://example.invalid/x.git\n' > "$TMP/mode/skills/refdiff/.skill-version"
OUT=$(run "$TMP/mode"); M=$(factof "$OUT" skill_mode); S=$(factof "$OUT" skill_freshness)
case "$M" in vendored\ *) ok "mode: stamp → vendored" ;; *) bad "mode vendored" "skill_mode='$M'" ;; esac
case "$S" in skipped-opt-out) ok "REFDIFF_SKIP_FRESHNESS=1 skips the network" ;; *) bad "opt-out" "skill_freshness='$S'" ;; esac

# --- 6. An UNREADABLE stamp is `unknown`, never silently `current`. A stamp missing its sha
#        must not be mistaken for a copy that is up to date.
mkfake "$TMP/badstamp"; touch "$TMP/badstamp/packages/core/dist/index.js"
printf 'ref=main\n' > "$TMP/badstamp/skills/refdiff/.skill-version"
OUT=$(REFDIFF_DIR="$TMP/badstamp" bash "$TMP/badstamp/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
S=$(factof "$OUT" skill_freshness)
case "$S:$EXIT" in unknown:0) ok "unreadable stamp → unknown, and does NOT halt" ;; *) bad "bad stamp" "exit=$EXIT skill_freshness='$S'" ;; esac

# --- 7. NO CHECKOUT anywhere: report it, warn, but do not halt — there is nothing to be
#        stale, and setup-dev.sh is the remedy the warning names.
mkdir -p "$TMP/bare/skills/refdiff"; cp "$HERE/preflight.sh" "$TMP/bare/skills/refdiff/"
OUT=$(env -u REFDIFF_DIR PATH=/usr/bin:/bin REFDIFF_SKIP_FRESHNESS=1 bash "$TMP/bare/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
B=$(factof "$OUT" build_freshness)
case "$B:$EXIT" in skipped-no-checkout:0) ok "no checkout → skipped-no-checkout, no halt" ;; *) bad "no checkout" "exit=$EXIT build_freshness='$B'" ;; esac

# --- 8. sync-skill.sh REFUSES to overwrite a dev-mode symlink with a frozen copy.
mkdir -p "$TMP/consumer/.claude/skills"
ln -s "$HERE" "$TMP/consumer/.claude/skills/refdiff"
OUT=$(bash "$HERE/sync-skill.sh" "$TMP/consumer" 2>&1); EXIT=$?
case "$EXIT" in 2) ok "sync refuses to clobber a dev-mode symlink (exit 2)" ;; *) bad "symlink guard" "exit=$EXIT: $OUT" ;; esac
rm "$TMP/consumer/.claude/skills/refdiff"

# --- 9. sync-skill.sh vendors, stamps, and the stamped copy then reads as `current` against
#        the very checkout it came from — the round trip, which is what proves the stamp and
#        the reader agree on a format.
OUT=$(bash "$HERE/sync-skill.sh" "$TMP/consumer" --from "$(cd "$HERE/../.." && pwd)" 2>&1); EXIT=$?
T="$TMP/consumer/.claude/skills/refdiff"
if [ "$EXIT" = 0 ] && [ -f "$T/.skill-version" ] && [ -f "$T/SKILL.md" ] && [ -f "$T/preflight.sh" ]; then
  ok "sync vendors SKILL.md + preflight.sh + sync-skill.sh + a stamp"
else bad "sync vendor" "exit=$EXIT: $OUT"; fi
VS=$(sed -n 's/^sha=//p' "$T/.skill-version" | head -1)
HS=$(git -C "$(cd "$HERE/../.." && pwd)" rev-parse HEAD)
[ "$VS" = "$HS" ] && ok "the stamp records the source HEAD exactly" || bad "stamp sha" "stamp='$VS' head='$HS'"
OUT=$(REFDIFF_SKIP_FRESHNESS=1 bash "$T/preflight.sh" 2>&1)
M=$(factof "$OUT" skill_mode)
case "$M" in vendored\ *) ok "the vendored copy reports itself vendored" ;; *) bad "round trip" "skill_mode='$M'" ;; esac

# --- 10..14. The ASK path. Upstream drift must PAUSE THE RUN and put the choice to the
#        user — not print a line and carry on, which is what a warning at exit 0 is. These
#        rows use a LOCAL git repo as "upstream" so they need no network and cannot flake.
mkgit() {   # $1 = upstream dir, $2 = clone dir. Leaves the clone ONE commit behind.
  local up="$1" co="$2"
  git init -q -b main "$up"
  mkfake "$up"
  git -C "$up" -c user.email=t@t -c user.name=t add -A >/dev/null
  git -C "$up" -c user.email=t@t -c user.name=t commit -qm one
  git clone -q "$up" "$co"
  echo later > "$up/NEWER.md"
  git -C "$up" -c user.email=t@t -c user.name=t add -A >/dev/null
  git -C "$up" -c user.email=t@t -c user.name=t commit -qm two
  touch "$co/packages/core/dist/index.js"          # dist newest, so only the ASK is in play
}

# 10. dev mode, checkout behind its own origin → ask, exit 3.
mkgit "$TMP/up10" "$TMP/co10"
OUT=$(REFDIFF_DIR="$TMP/co10" bash "$TMP/co10/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); C=$(factof "$OUT" checkout_freshness)
case "$C:$A:$EXIT" in behind-1:ask:3) ok "checkout behind origin → action=ask, exit 3" ;;
  *) bad "checkout behind" "checkout_freshness='$C' action='$A' exit=$EXIT" ;; esac
printf '%s\n' "$OUT" | grep -q "^ASK: " && ok "  …and the question is printed for the user" || bad "ask text" "no ASK: line"

# 11. vendored copy behind, with local objects → a COUNT.
mkgit "$TMP/up11" "$TMP/co11"
FIRST=$(git -C "$TMP/co11" rev-parse HEAD)
printf 'sha=%s\nref=main\norigin=%s\n' "$FIRST" "$TMP/up11" > "$TMP/co11/skills/refdiff/.skill-version"
OUT=$(REFDIFF_DIR="$TMP/co11" bash "$TMP/co11/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in stale-1:ask:3) ok "vendored copy behind (local objects) → stale-1, ask, exit 3" ;;
  *) bad "vendored stale" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 12. vendored copy, NO local objects → ls-remote can only say `differs`, never `behind`.
#     The direction is unknowable without the objects and guessing it would be a lie.
mkgit "$TMP/up12" "$TMP/co12"
FIRST=$(git -C "$TMP/co12" rev-parse HEAD)
mkfake "$TMP/nogit12"; touch "$TMP/nogit12/packages/core/dist/index.js"
printf 'sha=%s\nref=main\norigin=%s\n' "$FIRST" "$TMP/up12" > "$TMP/nogit12/skills/refdiff/.skill-version"
OUT=$(REFDIFF_DIR="$TMP/nogit12" bash "$TMP/nogit12/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in differs:ask:3) ok "vendored copy, no objects → differs (not behind), ask, exit 3" ;;
  *) bad "vendored differs" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac
printf '%s\n' "$OUT" | grep -q "never BEHIND" && ok "  …and it tells the reader not to say BEHIND" || bad "differs wording" "missing"

# 13. A copy AT the tip must NOT ask. Without this row every row above passes on a script
#     that asks unconditionally.
mkgit "$TMP/up13" "$TMP/co13"
TIP=$(git -C "$TMP/up13" rev-parse main)
printf 'sha=%s\nref=main\norigin=%s\n' "$TIP" "$TMP/up13" > "$TMP/co13/skills/refdiff/.skill-version"
git -C "$TMP/co13" fetch -q origin main; git -C "$TMP/co13" reset -q --hard FETCH_HEAD
touch "$TMP/co13/packages/core/dist/index.js"
OUT=$(REFDIFF_DIR="$TMP/co13" bash "$TMP/co13/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in current:proceed:0) ok "control: copy at the tip → no ask (proceed, exit 0)" ;;
  *) bad "at tip" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 14. HALT outranks ASK for the exit code, and BOTH are printed — a pull usually fixes the
#     build too, so the user meets one decision, not a halt followed by a question.
mkgit "$TMP/up14" "$TMP/co14"
# core/src/index.ts, not annotator/src/render.ts: mkfake leaves annotator/src EMPTY and git
# does not track empty directories, so it does not exist in a clone. The first draft of this
# row touched a path that was not there, `touch` failed, and the row reported the ASK it was
# meant to be testing PRECEDENCE against — a green-for-the-wrong-reason that only the exact
# action assertion caught.
sleep 1; touch "$TMP/co14/packages/core/src/index.ts"
OUT=$(REFDIFF_DIR="$TMP/co14" bash "$TMP/co14/skills/refdiff/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action)
HAS_ASK=$(printf '%s\n' "$OUT" | grep -c "^ASK: ")
case "$A:$EXIT:$HAS_ASK" in halt:1:1) ok "halt outranks ask (exit 1) and the ask is still printed" ;;
  *) bad "halt vs ask" "action='$A' exit=$EXIT ask-lines=$HAS_ASK" ;; esac

echo ""
echo "  ${PASS} passed, ${FAIL} failed"
[ "$FAIL" = 0 ] || exit 1
