# Plan — the harness (2026-08-26, updated 2026-08-28)

Status: items 1–15 DONE and proven (sessions 1–13). **Item 16 is the live
plan** — the small ones left after the annotator redesign (phases 0–5,
`docs/plan-annotator-redesign.md`). The canonical handoff is
`docs/handoff-2026-08-28.md`. Everything from item 15 down is history.

## 12. A regression must have been ABSENT from the previous run — DONE (session 13, 2026-08-28)

Built as specified: `findRegressions(ledger, next, introduced, prev, options)`
— an introduced finding whose identity `prev` still holds (key; key + box
within tolerance for a textless one) is a multiplicity change, never a
regression; a text-keyed ledger entry needs its box when the key is not
unique in the run; the box stays a tie-break for a unique key. Three tests in
`delta.test.ts` (the 2 → 1 → 2 `#6B7280` shape, the guard, the "names only
the one at its place" case); the first and third go red without the fix.
`SKILL.md` §4 states the definition and drops the "false positive to
recognise" paragraph; `USAGE` + `docs/architecture.md` follow. Measured: the
dogfood run's `R2` on `refdiff-compare-desktop` is gone (`+0/−0`), 9/50/5/3
unchanged. Original spec below.

### 12 (original spec, for reference)

**Evidence (2026-08-28, phase 5):** `refdiff-compare-desktop` reported
`REGRESSION: 2` on `f9` (`missing-element|text|text:#6B7280`) and `f17`
(`position|text|text:color`). Both keys were PRESENT in the immediately
previous run (as `f9` / `f19`-ish, same message). What happened: the rail
has two identical `#6B7280` prop lines under order-moved rows (plan gap 32);
a hairline change flipped which pairs with which, the count of that key went
1 → 2, `diffFindings` (`packages/core/src/package/delta.ts`) paired one and
listed the other as `introduced`, and `findRegressions` matched it to a
ledger entry from 18:35 (phase 4 run 2) by key alone — `matchesEntry` uses
the box only for textless entries. Phases 3, 4 and 5 each spent a paragraph
explaining this "same-text reshuffle shape". The fix skill HALTS on
`REGRESSION`, so the loop's one hard stop is crying wolf.

**Fix (pure, `delta.ts`):**
- `findRegressions(ledger, next, introduced, prevFindings, …)`: a candidate
  whose `identityKey` occurs among `prev.findings` is not a regression — it
  did not "come back", its multiplicity changed. `diffReports` passes
  `prev.findings`.
- For a text-keyed key that is NOT unique in `next`, also require the ledger
  entry's `box` within `boxTolerance` (today the box is recorded but ignored
  for text entries). Keep the box a tie-break for unique keys — a fixture
  shift must not un-regress a real regression.
- Tests in `delta.test.ts` named for the case: "two identical `#6B7280`
  prop lines, one present in the previous run — not a regression" (fails
  without the fix), and "the same key absent from the previous run and in
  the ledger — still a regression".
- `skills/refdiff/SKILL.md` "Reading the measurements" (`delta`): state
  the definition — introduced AND absent from the previous run AND resolved
  by an earlier one. `docs/architecture.md` Open decisions: one line.

## 13. A non-identity alignment on a same-size page is itself a finding — DONE (session 13, 2026-08-28)

Built: pure `alignmentNote(alignment, sameSize)` in `structural/align.ts`
(same-size = `design.scope.fluid` or raw design width = impl width; epsilon
`|scale − 1| > 0.0005`, `|offset| > 0.5 px`), a new `FindingType`
`"alignment"` (boxless, minor, one per run, printed as `ALIGNMENT:`), delta
identity by type alone (the numbers move; gone = resolved, back = regression),
never aggregated, `refdiff accept` refuses it, `summary.md` / `summary.json`
gain the `align` column (`1 / 0,0`, `1×0.997 / 0,0.2`). Tests: `align.test.ts`
(identity → none; 1.00175 → note; anisotropic; other-size frame → none),
`summary.test.ts` (column + one cause across pairs), `delta.test.ts`,
`accepted.test.ts`. `SKILL.md` §1a / §2 / "Reading the measurements", `USAGE`,
`docs/architecture.md`. Measured: three pairs `1 / 0,0`; `refdiff-library-desktop`
gets the note (`1×0.997 / 0,0.2` — scaleY 0.9966 over the 1066 px fluid
frame, i.e. a ≈3.6 px chrome height difference the fit had been absorbing
unseen), so 9 → 10 there; 50/5/3 unchanged. Original spec below.

### 13 (original spec, for reference)

**Evidence (phase 5):** for five phases the fit absorbed `scale 1.00175,
offset (−0.54, −1.98)` on `refdiff-compare-desktop` and `scaleY 1.00067,
offsetY −0.52` on the mobile pair — the comps' content-box chrome (topbar
46+1, strip 38+1, tool strip 44+1, rail 320+1) — and no finding showed it;
`summary.md` prints only `conf`. It was found from a 1px on the phone sheet,
by hand. Fixing the sizes snapped both transforms to `scale 1, offset 0`.

**Fix:**
- `alignment.ts` / a pure `alignmentNote(alignment, sameSize)` next to
  `lowConfidenceFinding` (`pixel/checks.ts` is the precedent for a boxless
  minor note): when the design frame's css px EQUALS the pair viewport (the
  fluid-frame / same-size case — `scope screen-label fluid` in the capture
  log; a Figma frame of another size is layout, not scale) and
  `|scale − 1| > 0.0005` or `|offset| > 0.5px`, emit ONE minor, boxless
  finding: `expected { scale: 1, offsetX: 0, offsetY: 0 }`, `actual { scale,
  offsetX, offsetY }`, message "alignment is not the identity on a same-size
  page: the fit absorbed (…) — a systematic size difference in the chrome
  above or beside the anchors (box model?)". Decide the `type`: a new
  `"alignment"` member of `FindingType` (`types.ts:44`) is the honest one —
  it is neither a pixel region nor an element — and is a report-vocabulary
  change, so §1a + "Reading the measurements" in `SKILL.md` and the
  annotator's severity/type labels (`render.ts`, `rail.ts propRows`) travel
  with it. Not accepted-able by value (the numbers move); the note goes away
  when the sizes are right.
- `summary.md` / `summary.json` (`cli.ts` `writeSummary`, ~963): an `align`
  column — `1 / 0,0` or `1.002 / −0.5,−2.0` — beside `conf`.
- Tests: the pure note (identity → none; 1.00175 → note; a Figma frame of a
  different size → none), and the summary column.

## 14. Accept the CONTENTS of an accepted element — DONE (session 13, 2026-08-28)

Decided with Mato: **boxes only** (the numerals stay visible so a badge over
the region is never hidden) and **manifest-only** (`refdiff accept` never
writes it; `upsertAccepted` preserves a hand-added one). Built:
`AcceptedDeviation.contents?: true` (`types.ts`, `manifest.ts readAccepted`,
`accepted.ts readRecord`), a second pass in `applyPolicy` — every TEXTLESS
finding whose boxes lie within the boxes of a finding the rule hit (both
boxes of a paired finding, 1 px slack, decided from the first pass so contents
never excuse each other) is suppressed as `"<reason> (inside)"`. One
generalisation over the proposal: the container is ANY accepted finding with
a box, not only a presence finding — on the mobile Library the plate is
MATCHED to the tile (a `size` finding), so the manifest carries a D6
`size { w 34×26 → 44×56 }` rule with `contents`. Tests in `policy.test.ts`
(the three D6 shapes), `manifest.test.ts`, `accepted.test.ts`. `SKILL.md`
"Configuring a pair" + §2, `USAGE`, `docs/architecture.md`. Measured (this
repo's manifest, `contents: true` on the three D6 rules): 10/50/5/3 →
**7 / 48 / 0 / 2**, `+0 / −11`, 0 regressions — exactly the 8 + 3 the
evidence counted; `refdiff-library-mobile` PASSES. Original spec below.

### 14 (original spec, for reference)

**Evidence:** decision D6 (the card thumbnail is the run's own `impl.png`;
the comp draws a grey plate) costs 8 findings forever across the Library
pairs (3 desktop, 5 mobile: the plate's textless bars and the plate box
paired with our tile), and the artboard's 16×16 / 12×12 logo squares 3 more
on the compare pairs. `acceptedFromFinding` rightly refuses a bare
`{ type, role }` for a textless box, and a `regions` entry has no reason and
never expires. What DOES identify those boxes is their container: they lie
inside the design counterpart of an element already accepted (the `<img>`).

**Proposal:** `AcceptedDeviation` gains `contents?: true`: when the rule
accepts an element finding (extra/missing element), every TEXTLESS finding
whose box lies inside that element's box (one world space — `implBox`
against the accepted impl element, `designBox` against the design one) is
suppressed too, `suppressedBy: "accepted"`, `rule: "<reason> (inside)"`.
Content-shaped: the rule still names the image, and expires with it.

**Questions for Mato before building:**
1. Boxes only, or text too? The step numerals `1 2 3` inside the artboard
   are text; accepting text inside the image region would also hide a
   missing canvas MARK drawn over the same region (the badges are overlays on
   the artboard). Recommendation: boxes only; the numerals stay visible (5
   findings) as the price of never hiding a badge.
2. Should `refdiff accept` be able to write `contents: true` (a flag), or is
   it manifest-only?
3. Manifest shape change → `SKILL.md` "Configuring a pair" table,
   `docs/architecture.md` manifest example, `manifest.ts` `readAccepted`,
   `accepted.ts` `readRecord`.

## 15. Same-text pairs before nearest-box under a lateral shift — DONE (session 13, 2026-08-28)

Decided with Mato: `textMaxGamma` = **2 × `maxGamma`** (200 px by default).
Built as pass 1b in `structural/match.ts`: among candidates sharing a
normalized NON-unique text, assign greedily by γ within the band before pass
2 sees any mixed-text candidate (`via: "text"`); what the band rejects falls
through. Tests: the chip-row shift (design "Claude Design" x 435 pairs with
impl "Claude Design" x 513, not impl "Figma" x 446) and the band guard (a
`5` badge 300 px from a `5` chip stays unpaired; within the band the text
wins over a nearer `•`) — both red without the pass. `USAGE`, `SKILL.md`
(Presence bullet + §4's upgrade-churn shape), `docs/architecture.md`.

Measured: `refdiff-library-desktop` **7 → 3** (`position ×10` on the chip
row + the search `size` + the alignment note — the prediction was 2 + note);
`refdiff-compare-desktop` **48 → 32** (10/21/1): the ten minor
`text-content` "reads Figma, design says Claude Design" and the missing +
extra chains are gone, the comp's row order (gap 32) now reads as
`position` on the numerals themselves; both mobile pairs unchanged (0 / 2).
The delta on compare-desktop churned once (`+15 / −31`, `REGRESSION: 8`):
every "regressed" key is a numeral the OLD pairing had resolved in phases
3–4 by mis-pairing it with a neighbour — a ledger written under the old
pairing, not an app regression; recorded in `SKILL.md` §4 and the lessons
inbox (a matcher-version stamp on the ledger is the candidate fix).
Consuming repos: uctoinak2 `doc-detail-owner-desktop` (Storybook :6006, the
`redesign13` tree as it stands, `out/u2-before` vs `out/u2-after`) is
IDENTICAL before and after — 76 findings / 144 instances, 59 matched, 4
design-only / 2 impl-only; population-registry is not on this devbox, so the
Button set (141 / 13 causes) is NOT re-measured — do it on the Mac before
trusting the set numbers. Baseline now **3 / 32 / 0 / 2**. Original spec
below.

### 15 (original spec, for reference)

**Evidence:** the Library comp's `Pending` chip (gap 24) is not drawn; the
`flex:1` search field absorbs its 78px and every chip after it shifts.
`matchElements` (`structural/match.ts`) pass 1 pairs UNIQUE texts by content;
`Figma` / `Claude Design` are not unique (the cards' source chips repeat
them), so pass 2's greedy γ paired design `Claude Design` (x 435) with impl
`Figma` (x 446) — a text tie only breaks EQUAL γ — and one cause became six
findings (missing `Figma`, extra `Claude Design`, `text-content`, a
`position` on the wrong pair, plus the two real ones).

**Proposal:** a pass 1b for NON-unique texts: among candidates that share
normalized text, assign greedily by γ up to `textMaxGamma` (say 2×
`maxGamma`) BEFORE any mixed-text candidate is considered; pass 2 keeps its
γ for the rest. Expected on `refdiff-library-desktop`: 6 → 2 (`position ×8`
on the chip row + the search `size`), nothing else moves (the Library's
other 3 are D6).

**Questions:** (a) is text priority right when the same word sits in two
rows 300px apart — a badge `5` in row 5 paired with a `5` in a chip? The
band (`textMaxGamma`) is the guard; what value? (b) the `×N` aggregation
and the delta identity both assume today's pairing — re-measure the
uctoinak / population-registry baselines (handoff "How to run") before
merging, not only this repo's four pairs.

## 16. Small, after 12–15 — `--read-only` DONE (session 13); gap 18 + phase 6 TODO

- `refdiff-annotator --serve --read-only` — DONE. Pure `read-only.ts`
  (`readOnlyRefusal`: every non-GET under `/api/` → 405 with the reason;
  reads and static files pass), `/api/pairs` carries `readOnly: true`, the
  shell hands it to the report, and a refused save reads as the app's own
  sentence (`READ_ONLY_STATUS`, `saveErrorText` in `rail.ts`) on the rows it
  lost. Learned by measuring: an UP-FRONT status line is an element the comp
  does not draw and shifted the rail (compare-desktop 32 → 37, +6 R3), so
  the refusal is announced only on the first save attempted and the served
  page stays identical to the writable app (3 / 32 / 0 / 2 again). Tests:
  `test/read-only.test.ts`, `rail.test.ts`, `app-shell.test.ts`. `USAGE`,
  `SKILL.md` pre-flight, `docs/architecture.md`, `services.toml` (the
  measured instance now runs `--read-only`; verified `PUT → 405`,
  `"readOnly":true`), `refdiff.bindings.md` trap rewritten.
- Gap 18 (annotator plan): the keyboard-shortcut hint still has no drawn home
  — a design question for Mato, not code.
- Annotator redesign **phase 6 — Land it** (`docs/plan-annotator-redesign.md`):
  `SKILL.md` + bindings sweep, `docs/architecture.md` "Annotator" rewritten to
  the new IA, decisions into "Open decisions". Independent of 12–15; do it
  when Mato says, via `/next-phase`.

---


## 11. Corpus decisions + pixel calibration — harness half DONE (session 12)

(c) decided and measured: size-tolerated pairs stay pixel-diffed,
scale-normalized (resample floor 2.5–3.7 % < 5 % minor; the 13–24 % was a
real globe → plus-circle glyph swap); §4 sub-classification built
(`pixel/classify.ts`, `actual.changeKind`, Button set: 26 pixel findings →
ONE `shape` cause); `opacity` folded into colors on BOTH sides (DOM effective
opacity, Figma layer opacity). Button 184/15 → 167/14 → **141 / 13 causes**
(26 icon-placeholder `shape` findings accepted by `changeKind`);
doc-detail baseline unchanged 60/122; tx-picker 82 → 83/138 (the +1 is the
0.8-dimmed paired rows, now measured). (a) and (b) remain decisions in the
consuming repos. Details: handoff "What's DONE (session 12)". Original below.

### 11 (original, for reference)

The harness found the causes; the next moves are in the other repos and in
one calibration: (a) population-registry — the ×0.875 root font-size (one
line in `tokens.css`, DS-wide; trial numbers in the bindings file), tag the
Alert/Dialog story cells, expose the dialog header; (b) uctoinak-bmad — review
the S10/S11 loop edits and decide the tx-picker needs-a-human list (row
format, hidden paired rows, chip copy, "+" on incoming amounts, disabled CTA
style); (c) here — decide whether a size-tolerated icon (21 vs 24px) should
be pixel-diffed at all, then §4 sub-classification now that real
`pixel-region` findings exist. Details: handoff "What REMAINS".

## 10. Use the skill for real from a consuming repo — DONE (session 11)

Ran from population-registry (`ds-alert` 23 cells, `ds-button-fill` 41) and
uctoinak-bmad (`tx-picker-owner-desktop`). Every stumble became a harness fix
here: `refdiff summary` (per-set table + causes across pairs; Alert 153
findings → 10 causes, Button 201 → 16), Figma fill-width TEXT measured by
render bounds, decoration hoisting through icon siblings on BOTH sides,
`accepted.role`, finding identity by text (delta no longer churns when the
alignment moves), identity alignment for element pairs (confidence 1 → pixel
channel runs on cells). Skill gained the set-level loop rules. One DS-wide
cause found and measured (root `font-size` ×0.875: Alert 152/3 PASS → 79/15
PASS in a reverted trial). Details: handoff "What's DONE (session 11)".

## 8. The skill — bounded fix loop consuming reports — DONE (session 10)

Built as `skills/refdiff/SKILL.md` (canonical) + an installed copy
with repo bindings in `uctoinak-bmad/.claude/skills/refdiff/`. Two
harness additions the loop needed: a **regression ledger**
(`resolved-ledger.json` per run dir, pure `recordResolved` /
`findRegressions` in `package/delta.ts`, `delta.regressions` + a loud
`REGRESSION:` line) and **accepted deviations** (`IgnorePolicy.accepted[]`
`{ type, expected?, actual?, reason }`, manifest `ignore.accepted`, CLI
`--accept <json>`, suppressed as `accepted` with the reason as the rule).
`inspect` NOT built — `expected/actual` + crops sufficed for three
iterations. Proven on doc-detail, measured by the delta: 60/122 → 59/103 →
51/75 → **42/68**, alignment confidence 0.57 → 0.88, 0 regressions; details
in the handoff "What's DONE (session 10)". Original spec below.

### 8 (original spec, for reference)

Nothing consumes `findings.json` / `annotations.md` in a loop yet. Draft the
thin repo skill (uctoinak-bmad first, porting its "measure don't eyeball"
checklist): run → read findings (expected/actual first, crops second) → read
open annotations → fix → re-run → read `delta` → `--mark-implemented`.
Bounded (5 iterations, diminishing-returns cutoff), regression guard on a
re-introduced finding. `inspect` (§3.4) only if the loop needs it.

## 9. Per-variant manifest expansion for component sets — DONE (session 10)

Pure `adapters/figma-variants.ts` (`expandVariants(set, { selector, maps?,
only?, omit? })`, template `{Prop}` / `{Prop|map}` / composite
`{A,B|map}` over the set's `componentPropertyDefinitions`; skipped variants
returned with reasons), manifest `design.variants`, CLI expansion with ONE
nodes request + one variables request + one batched render per set handed to
`captureFigma({ prefetched })`. Proven on the DS Storybook :6008 via
`examples/population-registry-ds.manifest.mjs`: Button/Fill → 41 pairs (the
S9 proof pair reproduced exactly), Alert → 23 pairs, Dialog/Header → 4 pairs
+ 4 skipped (no story panel). Original spec below.

### 9 (original spec, for reference)

One `figma` manifest entry expands a COMPONENT_SET into N pairs (child
COMPONENT node id ↔ story cell selector from the variant's properties; pure,
tested mapping fed by `componentPropertyDefinitions`). Then prove
`alert/default` (6765:4792) and `dialog/header` (21397:2290).

---

Original plan (2026-08-26): slice 1 landed (`7cabfd9`): both adapters,
structural channel, packaging, CLI `compare`, proven on
`doc-detail-owner-desktop` and `tx-picker-owner-desktop`. Problem observed:
~170–200 findings per pair, dominated by true-but-uninteresting differences.
Three items, in order.

## 1. Ignore policies — DONE (2026-08-26, this session)

Landed exactly as specified below plus three measurement fixes the corpus
forced: text leaves are measured by glyph-ink box (block cells vs
shrink-wrapped spans no longer differ in `size`), pill radii are clamped
to the effective radius (no more `33554400px`), and viewport-filling
leaf boxes get role `backdrop` (minor presence only). `doc-detail`:
171 → 141 findings, 0 chrome, 23 data-slot suppressions visible, no
major `size`. Every remaining item is genuine — but two ROOT CAUSES
produce ~70 of them (see 1b). See handoff "Learnings".

## 1b. Systematic-finding aggregation — DONE (2026-08-26, session 4)

Landed as `structural/aggregate.ts` (pure; `aggregate(findings, { minInstances
= 3, deltaTolerance = 2 })`), run after `applyPolicy`, `--no-aggregate` to
disable. Categorical types (color/typography/border-radius/…) group on the
exact `(type, expected, actual)`; position/size cluster on "the same shift":
dominant-axis delta within ±2px of the cluster mean, the other axis free up
to half the shift (the alignment fit leaves a few px of residue across a
row). Aggregate = max severity, message "×N", `instances` + `members[]`
(every box); overlay marks each member with the same number, crop is the
primary's. Presence and text-content never aggregate. `doc-detail`:
100 → **57 findings covering 100 instances** — 8 missing, 2 extras (+2 minor
backdrops), ink token ×15, action-row shift ×7, lower-half shift ×4, badge
colors, 6 radii, and a genuine minor tail. Original spec below.

### 1b (original spec, for reference)

Same `(type, expected→actual)` across many matched pairs is ONE cause:
on `doc-detail` (after the Storybook font fix: 100 findings, 8 critical
/ 42 major / 50 minor) 15 color findings are "ink is #2c2419, design
says #1a1a1a" and ~10 position findings are the same ~-23px shift of
the action row. Pure stage `aggregate(findings) ->
Finding[]` collapsing ≥3 identical deltas into one finding with
`instances: number` + all boxes (overlay draws one mark per instance,
message says "×51"). Severity of the aggregate = max of members. This is
what makes the list SHORT without hiding anything. Then the doc-detail
list is: missing category row (Služby/Účt. kategória/▾), missing
Popis+description, missing "Zobraziť 1 ďalší návrh", one unmatched
suggestion amount, the ~16–25px vertical shift of the lower half, badge
colors (Návrh green vs ochre), 5 radii, 2 aggregates.

## 1 (original spec, for reference). Ignore policies for demo/seed data and artboard chrome

**Goal:** `findings.json` on `doc-detail-owner-desktop` shrinks to a
short list where every item is a real layout/style difference; the
verdict can actually pass on a matching pair.

Evidence from the real corpus (see handoff "Learnings"):
- Comps show different demo data than the stories → `missing-element`,
  `extra-element`, `text-content` spam on value slots.
- Every `.dc.html` frame is an artboard: label strip, state chips, dark
  backdrop, designer notes — none addressable as a modal-only node.

Work (all pure, in `packages/core/src/`):
- **Policy type** (`policy.ts`): `IgnorePolicy = { textPatterns?: RegExp
  | string[]; roles?; regions?: Box[]; scope?: string (CSS selector inside
  the design frame); dataSlots?: boolean }`. Serializable, per pair.
- **Design-side scope:** `DcHtmlSource.scope?: string` — adapter
  extracts + screenshots that inner node instead of the frame. Fallback
  heuristic when absent: largest child container by area (the backdrop /
  modal) — record which was used in the capture.
- **Data-slot rule:** a *matched* pair whose texts differ is data, not
  drift → `text-content` suppressed (or `info` severity) while
  position/size/color/typography checks still run on that pair. Also
  relax `matchElements` so value slots pair geometrically even when
  text differs (already does via γ; verify on the corpus, maybe role
  compatibility).
- **Apply stage** `applyPolicy(findings, policy) -> { kept, suppressed }`
  — suppressed findings written to `findings.json` under
  `suppressed` (never silently dropped; the model can see them).
- **Chrome filter:** design elements outside `scope`/backdrop dropped
  before matching (the label strip / notes are not UI).
- **CLI:** `--manifest <file>` mode running all pairs of a manifest
  (uctoinak's `manifest.mjs` shape + optional `ignore` per pair), plus
  `--ignore-text <regex>` for one-offs.
- **Tests:** policy application, scope fallback, data-slot rule.

Done when: doc-detail run lists the column-width shift, the missing
category row, the CTA section clipped by viewport, and little else.

## 2. Pixel channel — DONE (2026-08-26, session 5)

Landed as `packages/core/src/pixel/` (`diff.ts` effectful edge, `cluster.ts`
+ `checks.ts` pure) and pure `geometry.ts` (`toDesignNative` extracted from
packaging). Per-match AA-aware pixelmatch inside each element's OWN box
(design crop through the inverse alignment, resampled onto the impl grid,
±2px shift search), connected-components → one `pixel-region` finding per
element (union box, `actual: { diffRatio, diffPixels, clusters }`), Argos
thresholds 5/15/30%. Gate: confidence ≥ 0.5 else one boxless minor finding.
Pipeline `finalize(structural ++ pixel) → applyPolicy → aggregate → package`,
`--no-pixels`, `artifacts.diffMask`. `@blazediff/agent`: skipped as a dep,
`regions[]` protocol referenced (architecture.md "Open decisions").

Measured on doc-detail (design ×0.94): identical text differs 10–40%,
identical 10–14px icons/dots 12–16% even with shift — so the channel skips
text elements (element data describes them exactly) and anything under
16 CSS px. Result: 50 boxes diffed, **0 pixel findings, structural list
unchanged at 57/100** — no false positives; the header icons (14px) and the
badge (text, already a color finding) are the structural channel's. NCC
refinement not built: the residue is sub-pixel phase, which the shift
search absorbs. Original spec below.

### 2 (original spec, for reference)

Scoped AA-aware diff inside matched boxes (odiff-bin / pixelmatch v7),
cluster diff mask into boxes, Argos multi-threshold severity; runs only
when structural alignment confidence is sufficient (low confidence is
itself a finding). Evaluate `@blazediff/agent` first — adopt its
verdict/tiles protocol as the reference even if we don't depend on it.
NCC pixel alignment (~100 lines) lands here. Findings type
`pixel-region`, crops as usual. Do NOT start before item 1 — it would
only add noise to an untrustworthy list.

## 3. Hygiene / small checks — DONE except `inspect` (2026-08-26, session 6)

Landed: `border` check (width > 0.5px or ΔE2000 ≥ 2.5; major when a border
appears/vanishes or ΔE ≥ 8), `spacing` check as sibling gaps over
`MatchResult` (decision recorded in architecture.md "Open decisions":
nearest neighbour below/right adjacent on BOTH sides, design gap ≤ 64px,
tolerance 2px / major > 8px, aggregation clusters on Δgap per axis), pure
`package/delta.ts` `diffReports` → `report.delta` (identity by content +
nearest box, CLI reads the previous `findings.json` first and prints
"+N introduced / −M resolved"). Two extraction fixes the corpus forced:
decoration hoisting (border/radius/background from a single-child ancestor
chain — the `⋯` button's border lives on `<button>`, the design's on the
`<div>`) and transparent borders ignored; border/radius compared only between
comparable boxes. `inspect` deliberately NOT built — nothing consumes reports
yet. doc-detail: 57/100 → **60 findings / 122 instances** (+5 spacing: label→
value gap ×3, header→tabs 3px ×14, subtitle→amount ×3, two action-row
separators; +1 minor border color; +1 badge background made visible by the
hoist; −3 radius false positives on pills both sides draw), re-run delta
empty. Original spec below.

### 3 (original spec, for reference)

In this order — border first (data already extracted), spacing second
(decide sibling-gap vs container extraction; recommend sibling-gap),
relative verdict third (`delta` is typed, needs identity-by-content not by
id), `inspect` last and only if the model loop is consuming reports.

- `border` check (width/color) — extraction already collects both.
- `spacing` check (gap/padding) — extraction emits no containers today;
  decide leaf-vs-container granularity here.
- Relative verdict (`delta` vs previous run) — needed by the skill's
  regression guard.
- `inspect` subcommand (crop/zoom/sample-pixel) once the model loop
  starts consuming reports.

## 5. Figma design adapter — PROVEN (2026-08-27, session 9)

Proven on the population-registry DS (`M0hnCQJIUho3tcW6PcnHWH`, DS Storybook
:6008). Every `frames.json` "frame" is a COMPONENT_SET sheet, so the real
pairing is **one variant COMPONENT ↔ one story cell**: `--figma …:12:229`
(State=Default, 76×40, quality 1.00) vs `--story ds-button--fill --selector
'[data-rowkey="fill:label:md:Label:"][data-col="Default"]'` → aligned (8.1,
−2.5) @0.13, **4 findings**: size 33×19 vs 52×16, typography Oswald 12.25/500/
21 vs Montserrat 14/700/16 (genuine — the DS Storybook renders Oswald), minor
position (the size delta's half), pixel-skip note. Sheet vs grid
(`8226:4244` ↔ `ds-button--fill`): 76 leaves (42 text/27 icon/7 box) vs 70,
quality 0.64, confidence 0.00 (no unique text) — 137 findings at scale 1, 77
at `--design-scale auto`; both honest (different sheet layouts), neither
useful. Real-schema fixes: `textCase` ↔ `text-transform` applied on BOTH
sides, `--design-scale` (Figma default 1: its units ARE CSS px), decoration
hoisting may take the ROOT's paint (the captured node is the button), Storybook
`selector`, offset-only alignment when every design leaf is an anchor. Real
nodes response recorded as `test/fixtures/figma/nodes-button-fill-set.json`
(6 tests on it). Handoff "What's DONE (session 9)" has the details.

### 5 (as built, session 7)

Landed: `FigmaSource` + six typed errors (`pipeline.ts`), `adapters/figma-api.ts`
(`FigmaClient`: token from `$FIGMA_TOKEN` / `.figma-token` upwards, 429 →
cooldown record in `~/.cache/refdiff/figma-cooldown.json` and
`cooling-down` before any request until it passes, chunked `/v1/images` with
`use_absolute_bounds=true`, variables endpoint optional), pure
`adapters/figma-tree.ts` (`figmaTreeToElements` → leaves in root-box CSS px,
icon collapsing, decoration hoisting, `rgb()/rgba()` colors, tokens from
variables/shared styles, `figmaQuality`), `adapters/figma.ts` (`captureFigma`:
nodes → variables → map → gate → render → PNG-size check → `Capture{dpr=scale,
quality}`), CLI `--figma <fileKey:nodeId|URL> --figma-scale --min-design-quality`,
manifest `design: { kind: "figma", fileKey, nodeId }`, `findings.json`
`design.quality`. 27 tests on hand-authored fixtures (no token on this machine
to record real ones). **Step 7 (prove on a real frame vs its story) needs a
token + Mato's frame pick** — see handoff. Original spec below.

### 5 (original spec, for reference)

Second design-side source, same `Capture` contract: `FigmaSource` +
typed errors (`pipeline.ts`), REST edge ported from population-registry's
`figma-api.mjs` (token, 429 cooldown, chunked renders), pure node-tree →
`ElementNode[]` mapping with decoration hoisting, GIGO quality gate
(`--min-design-quality`, default 0.3, score echoed in the report), CLI
`--figma <fileKey>:<nodeId>` / manifest `design.kind: "figma"`. Prove on one
real frame vs its story. Then the live-URL impl adapter (§5 in the handoff).

## 7. Annotator — annotation half BUILT (2026-08-27, session 9)

`annotations.ts` (pure, embedded + imported): point/rect notes in world space
snapped to the nearest `ElementNode` of that side (regions by IoU, points by
smallest-containing, backdrops excluded), stored with element identity AND box;
`open → implemented → done` (`--mark-implemented <ids|all>`, editing reopens);
re-projection through element identity on every start (orphans → `stale`);
digest `annotations.md` + marked `annotations-{design,impl}.png`. Effects in
`cli.ts`: `annotations.json`, zero-dep `GET/PUT /api/annotations` on `serveDir`
(`handle` hook). Verified end-to-end with Playwright on doc-detail: two notes
placed, one marked done, `--mark-implemented all`, digest PNG markers land on
the design through the inverse Alignment. 175 tests. Viewer half below.

### 7 (viewer half, session 8)

`packages/annotator`: `refdiff-annotator <run-dir> [--out] [--serve
--port --host]` writes `report.html` into the run dir — FULL design and FULL
impl side by side, one shared pan/zoom with the design pane projected through
`Alignment`, numbered marks on both panes, finding list (severity/text
filters, j/k), detail with expected/actual + crops, suppressed + delta
visible. Pure `renderReport` + pure `view-math.ts` (17 tests); `serveDir` in
core gained `{ port, host }`. Verified on doc-detail and the live docs pair
(Playwright screenshot, zero console errors). NEXT half: element-anchored
human annotations (`open → implemented → done`) + a digest for the model —
see architecture.md "Annotator".

## 6. Live-URL impl adapter — PROVEN (2026-08-26, session 8)

Run against uctoinak `serve-live.sh` (seeds `functional-sro` + the two
`__test__` members into the TEST DB and starts `dev:e2e` on :3100):
`docs-owner-desktop` captured the authenticated owner page at 1280×900 @2x,
31 leaves (nav, heading, filter pills, search, sort, empty state); the comp
has 87 → 119 findings / 126 instances, 7 data-slot suppressions, alignment
confidence 0.00 (almost no shared text), pixel channel skipped. All of that
is DATA, not drift: the seed has 0 documents, so every comp row is
"missing" — a documents seed for the live pairs is the next corpus step.
Typed errors proven for real: `auth-failed` (wrong secret → 404 from the
session POST), `login-redirect` (no auth → `/app/sign-in?callbackURL=…`),
`error-page` (authed unknown org / unknown route → heading "Stránka sa
nenašla"; the app's not-found is a SOFT 404: 307 → 200, only the content
check catches it), `http-error` (API route → status 404), `unreachable`
(`ERR_CONNECTION_REFUSED`). Original note below.

### 6 (original, for reference). Live-URL impl adapter — BUILT, NOT YET PROVEN (session 7)

`adapters/live-url.ts`: `LiveUrlSource { url, viewport?, selector?, waitFor?,
auth?, fullPage? }`, auth = Playwright storage state or a session POST (the
uctoinak `/api/test/session` shape), pure `classifyPage` (login path / password
form on another path → `login-redirect`; error phrase in title/heading or a
near-empty body → `error-page`), HTTP ≥ 400 → `http-error`, same
`extractElementTree` (viewport origin when no `selector`). CLI `--url
--selector --wait-for --full-page --app-url --auth-state --auth-post
--auth-header`; manifest `app: { source: "live", route, role }` now runs
instead of being skipped. Needs the uctoinak app in `dev:e2e` mode to prove.

## 4. Pixel-region sub-classification — DONE (session 12)

Built as pure `pixel/classify.ts` (`regionSignals` → `classifyChange` →
`color | hue-rotation | shape | added | removed | stroke | noise`), fed by the
crops `diffMatches` now returns on each `MatchDiff`; `actual.changeKind` +
message; `aggregate` / `summary` group on `(role, changeKind)`. Calibrated on
the DS Button icons, where exact edge Dice inside the differing region
separates the same glyph resampled (0.90–0.95) from a different glyph
(0.27–0.45) — the ±1 px tolerant Dice (0.78–0.80 for both) was rejected.
Synthetic fixtures per class in `classify.test.ts`; evidence in research.md
§6b, decision in architecture.md. A shift-search tie-break bug fixed on the
way (`shiftOffsets`). Original spec below.

### 4 (original spec, for reference)

Trigger: the first real pair where the pixel channel emits findings
(images, illustrations, gradients, shadows ≥16px). Until then a
`pixel-region` finding only says "N% differ"; the model still has to look.

What to take (own pure implementation, no dependency — the package is
native-only, mis-calibrated for cross-render pairs, see architecture.md
"Open decisions"): per region, computed over the DIFFERING pixels of the
two crops we already hold in memory, in `pixel/classify.ts`:

- **Chroma stats** (YIQ): `chromaCos` — cosine between the mean chroma
  vectors of both sides (≈1 same hue → brightness/opacity change; negative
  → hue rotation); `sat1`/`sat2` mean chroma magnitude; `chromaRough` —
  roughness of the chroma-delta field (smooth = recolor, patchy =
  replaced content); `meanDy` signed luminance delta.
- **Structure**: `luminanceNcc` over changed pixels (high = same shape,
  different color); `edgeCorrelation` + `structureAsymmetry` (edge density
  img2 − img1: positive = something appeared, negative = disappeared).
- **Shape**: `fillRatio`, `borderRatio`, `innerFillRatio`, row/col
  occupancy — distinguishes an outline-only change (stroke/border) from a
  filled one.
- **Background blend**: distance of the changed pixels from the local
  background on each side (`bgDistanceImg1/2`) → "addition" (blends with bg
  on the design side only) vs "deletion".

Map onto our vocabulary as `Finding.actual.changeKind`: `color` (high NCC,
low edge change), `hue-rotation` (chromaCos < 0), `shape` (edges
uncorrelated, both sides have structure), `added` / `removed`
(asymmetric), `stroke` (borderRatio ≫ innerFill), `noise` (tiny, low
color delta, correlated edges — the resample residue we measured). Message
becomes code-actionable: "icon glyph differs in shape", "illustration
recolored (same shape)", "shadow present in design only". Their exact
verdicts to keep as regression fixtures: on doc-detail it correctly called
the `Návrh` badge and the 6px status dot `color-change`. Tests: synthetic
crop pairs per class (recolor, hue-rotate, outline change, add, remove,
resample-noise). Aggregation then groups on `(type, changeKind)`.
