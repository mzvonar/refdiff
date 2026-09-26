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
# plugin-freshness.sh asks ONCE per session per plugin per version, keyed on
# CLAUDE_CODE_SESSION_ID — which makes it STATEFUL, and a stateful dependency inherited from the
# ambient environment is not a test fixture. Left alone, this file inherited the real session's id,
# so rows sharing a loaded version collided with each other AND the suite gave a different answer
# on its second run. Empty disables the ack; the ack itself is covered in claude-skills-public's
# scripts/tests/plugin-freshness.test.sh, which controls the id explicitly.
export CLAUDE_CODE_SESSION_ID=""
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

# --- 9a. EVERY file in the skill dir was vendored, except the ones NOT_VENDORED names.
#         The set used to be a hand-maintained list and had already drifted unnoticed; this
#         row is what makes that unshippable. It asserts over the REAL directory, so it
#         starts failing the moment a file is added there that does not arrive.
MISSING=""
for f in $(cd "$HERE" && ls -A); do
  [ -f "$HERE/$f" ] || continue
  case " preflight-selftest.sh .skill-version " in *" $f "*) continue ;; esac
  [ -f "$T/$f" ] || MISSING="${MISSING:+$MISSING }$f"
done
[ -z "$MISSING" ] && ok "every non-excluded file in skills/refdiff/ reached the consumer" \
  || bad "vendored set" "never arrived: $MISSING"

# --- 9b. The exclusion is REAL. Without this row, 9a also passes on a sync that copies the
#         directory indiscriminately — a different bug wearing the same green.
[ -f "$T/preflight-selftest.sh" ] && bad "NOT_VENDORED" "preflight-selftest.sh was shipped" \
  || ok "the dev-only self-test is NOT vendored"

# --- 9c. A file nobody listed ANYWHERE still ships. 9a proves today's directory arrives;
#         this proves the mechanism is a GLOB and not a list that happens to be current,
#         which is the whole point — the next `reconcile.md` must ship without anyone
#         remembering to edit sync-skill.sh.
NEWSRC="$TMP/newfile-src"; mkdir -p "$NEWSRC/skills/refdiff"
cp "$HERE"/*.sh "$HERE/SKILL.md" "$NEWSRC/skills/refdiff/"
echo "# planted by the self-test" > "$NEWSRC/skills/refdiff/reconcile.md"
git init -q -b main "$NEWSRC" >/dev/null 2>&1
git -C "$NEWSRC" add -A
git -C "$NEWSRC" -c user.email=selftest@refdiff -c user.name=selftest commit -qm planted
OUT=$(bash "$NEWSRC/skills/refdiff/sync-skill.sh" "$TMP/consumer-new" --from "$NEWSRC" 2>&1); EXIT=$?
NT="$TMP/consumer-new/.claude/skills/refdiff"
if [ "$EXIT" = 0 ] && [ -f "$NT/reconcile.md" ]; then
  ok "a NEW file ships with no edit to sync-skill.sh"
else bad "new file not vendored" "exit=$EXIT present=$([ -f "$NT/reconcile.md" ] && echo yes || echo no): $OUT"; fi

# --- 9d. The stamp records what was ACTUALLY sent. A stamp still naming four hardcoded
#         files would be a quiet lie about a five-file copy, and the stamp is the only
#         thing a consumer can read to learn what they got.
FL=$(sed -n 's/^files=//p' "$NT/.skill-version" 2>/dev/null | head -1)
case " $FL " in *" reconcile.md "*) ok "the stamp's files= names the new file" ;;
  *) bad "stamp files=" "files='$FL'" ;; esac

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

# 15-17. PLUGIN mode: the version THIS SESSION resolved vs the one installed. These rows are the
#     reason the check exists — a session pins its version at its first call to the skill and
#     never moves, so `skipped-plugin-mode` was printing while a session served 1.4.0 against an
#     installed 1.6.x for its entire length. Hermetic: CLAUDE_CONFIG_DIR points at a synthetic
#     install record, so nothing here depends on what is installed on this machine.
mkplugin() { # mkplugin <root> <loaded-version>  → echoes the fake skill dir
  local root="$1" v="$2"
  local d="$root/.claude/plugins/cache/claude-skills-public/refdiff/$v/skills/refdiff"
  mkdir -p "$d"; cp "$HERE/preflight.sh" "$HERE/plugin-freshness.sh" "$d/"
  echo "$d"
}
mkrecord() { # mkrecord <config-dir> <installed-version> <catalog-version>
  mkdir -p "$1/plugins/marketplaces/claude-skills-public/.claude-plugin"
  printf '{"plugins":{"refdiff@claude-skills-public":[{"scope":"local","version":"%s"}]}}\n' "$2" \
    > "$1/plugins/installed_plugins.json"
  printf '{"claude-skills-public":{"installLocation":"%s/plugins/marketplaces/claude-skills-public"}}\n' "$1" \
    > "$1/plugins/known_marketplaces.json"
  printf '{"plugins":[{"name":"refdiff","version":"%s"}]}\n' "$3" \
    > "$1/plugins/marketplaces/claude-skills-public/.claude-plugin/marketplace.json"
}
mkfake "$TMP/co15"; touch "$TMP/co15/packages/core/dist/index.js"
CFG="$TMP/cfg15"; mkrecord "$CFG" "1.6.2" "1.6.2"

# 15. The session is behind the install record → ask, and the fact NAMES both versions.
D=$(mkplugin "$TMP/plug-stale" "1.4.0")
OUT=$(CLAUDE_CONFIG_DIR="$CFG" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in "stale-session 1.4.0 < 1.6.2:ask:3") ok "plugin: session serving an older version than the record → ask (exit 3)" ;;
  *) bad "plugin stale-session" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 16. CONTROL for 15 — same machinery, matching versions, no ask. Without it row 15 passes on a
#     check that fires unconditionally.
D=$(mkplugin "$TMP/plug-ok" "1.6.2")
OUT=$(CLAUDE_CONFIG_DIR="$CFG" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in "current (serving 1.6.2):proceed:0") ok "control: plugin at the installed version → proceed (exit 0)" ;;
  *) bad "plugin current" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 17. The OTHER direction: the install itself is behind the catalog. Same ask, different remedy
#     (update, not reload), so it must not be reported as a stale SESSION.
CFG2="$TMP/cfg17"; mkrecord "$CFG2" "1.6.0" "1.6.2"
D=$(mkplugin "$TMP/plug-old-install" "1.6.0")
OUT=$(CLAUDE_CONFIG_DIR="$CFG2" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in "stale-install 1.6.0 < 1.6.2:ask:3") ok "plugin: install behind the catalog → ask, reported as stale-INSTALL" ;;
  *) bad "plugin stale-install" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 18-20. UNKNOWN IS NOT CURRENT. Every one of these printed `current (serving 1.4.0)` before
#     2026-09-26 — an affirmative claim about a record it had failed to read. A deep review found
#     it; these rows are why it cannot come back. The three inputs are distinct on purpose: absent,
#     malformed, and present-but-silent-about-this-plugin all reach the same `|| true`.
D=$(mkplugin "$TMP/plug-norec" "1.4.0")
CFG18="$TMP/cfg18"; mkrecord "$CFG18" "1.6.2" "1.6.2"; rm -f "$CFG18/plugins/installed_plugins.json"
OUT=$(CLAUDE_CONFIG_DIR="$CFG18" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in unknown:proceed:0) ok "plugin: install record ABSENT → unknown, never 'current' (proceed, exit 0)" ;;
  *) bad "plugin unknown/absent" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

CFG19="$TMP/cfg19"; mkrecord "$CFG19" "1.6.2" "1.6.2"; printf '{oops' > "$CFG19/plugins/installed_plugins.json"
OUT=$(CLAUDE_CONFIG_DIR="$CFG19" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in unknown:proceed:0) ok "plugin: install record MALFORMED → unknown, never 'current'" ;;
  *) bad "plugin unknown/malformed" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

CFG20="$TMP/cfg20"; mkrecord "$CFG20" "1.6.2" "1.6.2"
printf '{"plugins":{"somethingelse@claude-skills-public":[{"scope":"local","version":"9.9.9"}]}}\n' \
  > "$CFG20/plugins/installed_plugins.json"
OUT=$(CLAUDE_CONFIG_DIR="$CFG20" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in unknown:proceed:0) ok "plugin: record names no version for THIS plugin → unknown, never 'current'" ;;
  *) bad "plugin unknown/other-plugin" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 21. AHEAD IS NOT DRIFT, and it must not be reported backwards. A session serving a version
#     NEWER than the record (a downgrade, or the highest record sitting at another scope) used to
#     satisfy the old `loaded != installed` test and print `stale-session 1.7.0 < 1.6.2` — the
#     versions the wrong way round, with "reload" attached to a problem reloading cannot fix.
CFG21="$TMP/cfg21"; mkrecord "$CFG21" "1.6.2" "1.6.2"
D=$(mkplugin "$TMP/plug-ahead" "1.7.0")
OUT=$(CLAUDE_CONFIG_DIR="$CFG21" REFDIFF_DIR="$TMP/co15" bash "$D/preflight.sh" 2>&1); EXIT=$?
A=$(factof "$OUT" action); S=$(factof "$OUT" skill_freshness)
case "$S:$A:$EXIT" in "current (serving 1.7.0):proceed:0") ok "plugin: session AHEAD of the record → current, not a backwards stale-session" ;;
  *) bad "plugin ahead" "skill_freshness='$S' action='$A' exit=$EXIT" ;; esac

# 22. The two asks carry DIFFERENT remedies, and that difference is the reason there are two of
#     them. Rows 15/17 assert the fact label; nothing asserted the prose the user actually reads.
OUT=$(CLAUDE_CONFIG_DIR="$CFG" REFDIFF_DIR="$TMP/co15" bash "$(mkplugin "$TMP/plug-ask1" "1.4.0")/preflight.sh" 2>&1)
R1=$(printf '%s\n' "$OUT" | grep -c -- "/reload-plugins")
OUT=$(CLAUDE_CONFIG_DIR="$CFG2" REFDIFF_DIR="$TMP/co15" bash "$(mkplugin "$TMP/plug-ask2" "1.6.0")/preflight.sh" 2>&1)
R2=$(printf '%s\n' "$OUT" | grep -c -- "claude plugin update")
case "$R1:$R2" in 1:1) ok "plugin: stale-session says RELOAD, stale-install says UPDATE" ;;
  *) bad "plugin ask remedies" "reload-lines=$R1 update-lines=$R2" ;; esac

echo ""
echo "  ${PASS} passed, ${FAIL} failed"
[ "$FAIL" = 0 ] || exit 1
