# Matching baseline — 2026-09-16

The before-picture for `docs/plan-divergent-matching.md` steps 3–5, produced by
`node scripts/baseline-matching.ts` at refdiff `39104ad` (WORKING TREE DIRTY — the numbers below are not a committed state).

**How to read it.** The *Matching* table is the instrument. Steps 3–5 all make the matcher
refuse more pairs, and a refusal moves one element out of `matched` and adds one to BOTH
`d-only` and `i-only` — so the finding count moves the same way whether the matcher got
more precise or fell apart. **A large `matched` drop on any pair is a REGRESSION**, and
the pair to investigate is the one whose drop is not matched by a fall in `color`,
`typo`, `bord`, `rad` and `pos` in the *Findings by type* table.

`geom` is the share of surviving pairs that nothing but the alignment vouches for, and
`unver` (first table) is how many findings rest on one of those below the confidence
floor. Both should FALL as the matcher improves, while `text` holds.

Regenerate with the same command; it rewrites this file for today's date.

## refdiff — NOT RE-MEASURED IN THIS RUN

the annotator's own redesign comps against the annotator serving `fixtures/demo-root` — self-contained in this repo.

**The numbers below were measured 2026-09-16T14:46:29.287Z**, not now: not selected in this run (--only). They are a valid earlier measurement of the same corpus, and the document keeps them so the baseline stays whole — but anything compared against them is being compared across two different moments. To refresh: svc up annotator (it may land on another port — pass --app-url or REFDIFF_APP_URL), then `node scripts/baseline-matching.ts --only refdiff`.

```
cd /root/refdiff
node /root/refdiff/packages/core/dist/cli.js compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out /root/refdiff/out/baseline/refdiff
```

Not in the tables below:

- `refdiff-library-desktop` — disabled in the manifest: RefDiff Library.dc.html draws the card grid chunk 5 replaced — 489 findings at confidence 0.14
- `refdiff-library-mobile` — disabled in the manifest: RefDiff Library.dc.html draws the card grid chunk 5 replaced — 335 findings at confidence 0.67

9 pairs: 1 PASS / 8 FAIL — 2233 findings covering 3580 instances, 351 suppressed; delta +0 / −0
80 of 2233 findings are UNVERIFIED — nothing but a weak alignment paired their two elements, so their values are not evidence of drift
pairing evidence across the set: 221 by text, 34 by slot, 651 by geometry, 1327 resting on no pair
2038 unexplained · 195 explained: 139 comp rail row order, 37 comp mark numbering, 19 canvas zoom divergence

| pair                                 | verdict | findings (c/M/m) | inst | supp | unver | conf | align         | delta |
|--------------------------------------|---------|------------------|------|------|-------|------|---------------|-------|
| refdiff-compare-desktop              | FAIL    |     69 (20/43/6) |  103 |   66 |     0 | 0.72 | 1 / 0,0       | +0/−0 |
| refdiff-library-groups-desktop       | FAIL    | 560 (200/229/131) |  774 |    5 |     0 | 0.56 | 1 / 0,0       | +0/−0 |
| refdiff-library-groups-mobile        | FAIL    | 520 (130/247/143) |  722 |    2 |     0 | 0.85 | 1 / −1.0,−1.0 | +0/−0 |
| refdiff-compare-mobile               | FAIL    |       13 (3/8/2) |   25 |   29 |     0 | 0.97 | 1 / 0,0       | +0/−0 |
| refdiff-compare-mobile-toolbar       | PASS    |        4 (3/0/1) |    4 |   29 |     0 | 1.00 | 1 / 0,0       | +0/−0 |
| refdiff-compare-mobile-toolbar-ghost | FAIL    |    90 (21/56/13) |  174 |   40 |     5 | 0.46 | 1 / 0,0       | +0/−0 |
| refdiff-gallery-desktop              | FAIL    | 621 (152/328/141) | 1240 |   93 |    75 | 0.40 | 1 / 0,0       | +0/−0 |
| refdiff-gallery-mobile               | FAIL    |  246 (91/120/35) |  357 |   32 |     0 | 0.78 | 1 / 0,0       | +0/−0 |
| refdiff-compare-desktop-ghost        | FAIL    |   110 (37/55/18) |  181 |   55 |     0 | 0.56 | 1 / 0,0       | +0/−0 |

Matching — what the matcher PAIRED (pairs, not findings). A `matched` column that fell while
`d-only`/`i-only` rose is a REGRESSION, not a precision win: both move that way.
`phase` reads `rate` (matched / min leaves) and `axis` (the BETTER-fitting axis, not the
joint `conf`); `share` is reported and does not gate. On a `reconcile` pair a matched
collapse is expected; on a `polish` pair it is a bug. Reported, never enforced.

| pair                                 | design | impl | matched | text | slot | geom | d-only | i-only | vetoed | conf | axis | rate | share |     phase |
|--------------------------------------|--------|------|---------|------|------|------|--------|--------|--------|------|------|------|-------|-----------|
| refdiff-compare-desktop              |    263 |  194 |     179 |  150 |    1 |   28 |     84 |     15 |      1 | 0.72 | 1.00 | 0.92 |  0.84 |    polish |
| refdiff-library-groups-desktop       |    487 |  303 |     197 |   60 |    2 |  135 |    290 |    106 |     30 | 0.56 | 0.89 | 0.65 |  0.30 | reconcile |
| refdiff-library-groups-mobile        |    432 |  297 |     232 |   45 |    0 |  187 |    200 |     65 |     26 | 0.85 | 1.00 | 0.78 |  0.19 |    polish |
| refdiff-compare-mobile               |     98 |   64 |      64 |   47 |    1 |   16 |     34 |      0 |      0 | 0.97 | 1.00 | 1.00 |  0.73 |    polish |
| refdiff-compare-mobile-toolbar       |     89 |   55 |      55 |   41 |    0 |   14 |     34 |      0 |      0 | 1.00 | 1.00 | 1.00 |  0.75 |    polish |
| refdiff-compare-mobile-toolbar-ghost |    220 |  185 |     170 |  136 |    1 |   33 |     50 |     15 |      2 | 0.46 | 0.99 | 0.92 |  0.80 |    polish |
| refdiff-gallery-desktop              |    648 |  389 |     345 |   85 |    9 |  251 |    303 |     44 |      0 | 0.40 | 0.64 | 0.89 |  0.25 |    polish |
| refdiff-gallery-mobile               |    311 |  137 |     135 |   36 |    0 |   99 |    176 |      2 |      0 | 0.78 | 1.00 | 0.99 |  0.27 |    polish |
| refdiff-compare-desktop-ghost        |    273 |  204 |     178 |  146 |    1 |   31 |     95 |     26 |     10 | 0.56 | 1.00 | 0.87 |  0.82 |    polish |
| TOTAL (9)                            |   2821 | 1828 |    1555 |  746 |   15 |  794 |   1266 |    273 |     69 |      |      |      |       |     8P/1R |

Findings by type:

| pair                                 | miss | extra | text | pos | size | space | color | typo | bord | rad | pixel |  all |
|--------------------------------------|------|-------|------|-----|------|-------|-------|------|------|-----|-------|------|
| refdiff-compare-desktop              |   22 |    12 |    1 |  26 |    2 |     0 |     3 |    0 |    1 |   0 |     2 |   69 |
| refdiff-library-groups-desktop       |  290 |   106 |   44 |  55 |   11 |     6 |    27 |   12 |    2 |   5 |     2 |  560 |
| refdiff-library-groups-mobile        |  200 |    65 |   49 |  73 |   29 |    17 |    46 |   29 |    2 |   9 |     1 |  520 |
| refdiff-compare-mobile               |    3 |     0 |    1 |   4 |    0 |     1 |     1 |    1 |    0 |   1 |     1 |   13 |
| refdiff-compare-mobile-toolbar       |    3 |     0 |    0 |   0 |    0 |     0 |     0 |    0 |    0 |   0 |     1 |    4 |
| refdiff-compare-mobile-toolbar-ghost |   25 |    12 |    1 |  33 |    3 |     3 |     5 |    2 |    2 |   3 |     1 |   90 |
| refdiff-gallery-desktop              |  297 |    44 |   83 |  83 |   27 |    19 |    24 |   25 |    8 |  10 |     1 |  621 |
| refdiff-gallery-mobile               |  166 |     2 |   10 |  35 |   16 |     0 |     3 |    5 |    5 |   3 |     1 |  246 |
| refdiff-compare-desktop-ghost        |   43 |    24 |    2 |  24 |    2 |     2 |     7 |    1 |    1 |   1 |     3 |  110 |
| TOTAL (9)                            | 1049 |   265 |  191 | 333 |   90 |    48 |   116 |   75 |   21 |  32 |    13 | 2233 |

Across pairs (one row = one cause; `pairs` = how many cells show it):

| severity | type | role | pairs | findings | values | sample |
|----------|------|------|-------|----------|--------|--------|
| critical | missing-element | text | 9/9 | 599 |  | design "1" (7×14) has no counterpart in the implementation |
| critical | missing-element | surface | 7/9 | 240 |  | design surface at (1040, 1180) (320×35) has no counterpart in the implementation |
| critical | missing-element | box | 6/9 | 209 |  | design box at (685, 213) (8×8) has no counterpart in the implementation |
| major | position | text | 8/9 | 270 (×662) | x -288.7..1332→-260.4..1355, y -253.9..2348.5→-406.2..1690.5 | "Label color drift" is offset by (0, 183)px from the design position |
| major | extra-element | surface | 7/9 | 57 |  | implementation renders surface at (1040, 1047) (320×35) that the design does not have |
| major | size | text | 7/9 | 44 (×209) | h 4..31.1→8..44, w 5.2..256→8..268 | "Impl renders an element with no counterp…" renders 15px tall, design says 31px (width not compared: differing text) |
| major | size | surface | 7/9 | 32 (×112) | w 34..390→8..390, h 16..774→8..813 | surface at (1238, 970) renders 86×19, design says 99×19 |
| major | position | surface | 7/9 | 32 (×237) | x 0..1242→0..1238, y 86..1088→47..1082 | surface at (75, 302) is offset by (-18, -2.5)px from the design position |
| major | extra-element | text | 6/9 | 145 |  | implementation renders "4" (7×14) that the design does not have |
| major | position | box | 5/9 | 31 (×72) | x 40..1092→40..1092, y 114..1500→114..1468 | box at (673, 114) is offset by (23, 0)px from the design position ×11 |
| major | size | box | 5/9 | 14 (×45) | w 8..326→7..338, h 8..40.2→10.5..36 | box at (82, 269) renders 9×11, design says 20×8 ×10 |
| major | pixel-region | surface | 5/9 | 6 (×11) | shape diffRatio 0→0.1..0.2 | 8.9% of pixels differ in surface at (0, 47): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (59 regions, 1342×39px) |
| major | spacing | text | 4/9 | 23 (×38) | vertical gap 0.2..56→1.3..75.5 | vertical gap between "Button" and "Actions / Button" is 36px, design says 2px |
| major | spacing | surface | 4/9 | 5 (×17) | vertical gap 9..61.4→10.5..110.4 | vertical gap between surface at (57, 719) and surface at (57, 790) is 20px, design says 37px ×13 |
| major | color | text | 3/9 | 6 | color=rgb(76, 154, 255) → color=rgb(245, 166, 35) | "Minor" text color is rgb(245, 166, 35), design says rgb(76, 154, 255) (ΔE2000 55.3) |
| major | color | text | 3/9 | 5 (×15) | color=rgb(231, 233, 236) → color=rgb(166, 171, 179) | "r47" text color is rgb(166, 171, 179), design says rgb(231, 233, 236) (ΔE2000 15.6) |
| major | color | text | 3/9 | 5 | color=rgb(245, 166, 35) → color=rgb(166, 171, 179) | "Major" text color is rgb(166, 171, 179), design says rgb(245, 166, 35) (ΔE2000 32.3) |
| major | color | text | 3/9 | 4 (×33) | color=rgb(166, 171, 179) → color=rgb(231, 233, 236) | "history" text color is rgb(231, 233, 236), design says rgb(166, 171, 179) (ΔE2000 15.6) ×23 |
| major | border-radius | text | 3/9 | 4 (×9) | borderRadius=8 → borderRadius=0 | "Open sheet" border-radius is 0px, design says 8px |
| major | spacing | box | 3/9 | 4 (×9) | horizontal gap 8..22.9→3..39 | horizontal gap between box at (59, 269) and surface at (75, 261) is 3px, design says 8px ×4 |
| major | border-radius | text | 3/9 | 4 | borderRadius=6 → borderRadius=14 | "2" border-radius is 14px, design says 6px |
| major | spacing | box | 3/9 | 3 (×5) | vertical gap 7.1..63→9.6..42.5 | vertical gap between box at (622, 732) and box at (622, 803) is 42.5px, design says 63px |
| major | pixel-region | frame | 3/9 | 3 | unexplainedDiffRatio 0→0..0 | 3.51% of the frame differs OUTSIDE every matched element — nothing in the element model covers it, so no per-element finding can. 464 region(s); largest: 51×63 at (57, 549); 99×17 at (721, 209); 99×17 at (707, 799). A container's background, border, radius or width is the usual cause: containers are not leaf elements, so they are never matched and never diffed. |
| major | typography | text | 3/9 | 3 (×25) | fontFamily=IBM Plex Mono → fontFamily=IBM Plex Sans | "9" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono" ×7 |
| major | spacing | text | 2/9 | 7 (×15) | horizontal gap 0..48.9→3..46.5 | horizontal gap between "r45" and "arrow_right_alt" is 3px, design says 11px |
| major | spacing | surface | 2/9 | 6 (×11) | horizontal gap 0..20→17..42.8 | horizontal gap between surface at (68, 512) and "Minor" is 17px, design says 8px |
| major | color | text | 2/9 | 3 | color=rgb(231, 233, 236) → color=rgb(229, 72, 77) | "present" text color is rgb(229, 72, 77), design says rgb(231, 233, 236) (ΔE2000 40.4) |
| major | color | text | 2/9 | 3 | color=rgb(245, 166, 35) → color=rgb(76, 154, 255) | "wrong_location" text color is rgb(76, 154, 255), design says rgb(245, 166, 35) (ΔE2000 55.3) |
| major | color | text | 2/9 | 3 | color=rgb(245, 166, 35) → color=rgb(70, 167, 88) | "Major" text color is rgb(70, 167, 88), design says rgb(245, 166, 35) (ΔE2000 41.3) |
| major | color | box | 2/9 | 3 (×5) | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(79, 70, 229) | box at (59, 433) background is rgb(79, 70, 229), design says rgb(245, 166, 35) (ΔE2000 69) ×3 |
| major | color | text | 2/9 | 3 | color=rgb(76, 154, 255) → color=rgb(166, 171, 179) | "5" text color is rgb(166, 171, 179), design says rgb(76, 154, 255) (ΔE2000 20.9) |
| major | typography | text | 2/9 | 3 (×5) | fontFamily=IBM Plex Mono fontWeight=600 → fontFamily=IBM Plex Sans fontWeight=400 | "6" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", weight 400 vs 600 |
| major | color | text | 2/9 | 3 (×5) | color=rgb(255, 255, 255) → color=rgb(166, 171, 179) | "1 REGRESSED" text color is rgb(166, 171, 179), design says rgb(255, 255, 255) (ΔE2000 20.3) ×3 |
| major | color | text | 2/9 | 3 (×6) | color=rgb(229, 72, 77) → color=rgb(231, 233, 236) | "Montserrat 700" text color is rgb(231, 233, 236), design says rgb(229, 72, 77) (ΔE2000 40.4) ×4 |
| major | border | text | 2/9 | 3 (×10) | borderWidth=0 → borderWidth=1 borderColor=rgb(245, 166, 35) | "CONTINUE" border differs: border the design does not have ×8 |
| major | typography | text | 2/9 | 3 (×6) | fontFamily=Oswald fontSize=13.5 fontWeight=500 → fontFamily=IBM Plex Sans fontSize=9 fontWeight=400 | "CONTINUE" typography differs: family "IBM Plex Sans" vs "Oswald", size 9px vs 13.5px, weight 400 vs 500 ×4 |
| major | color | box | 2/9 | 2 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(79, 70, 229) | box at (59, 269) background is rgb(79, 70, 229), design says rgb(229, 72, 77) (ΔE2000 41.8) |
| major | color | box | 2/9 | 2 (×8) | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(79, 70, 229) | box at (59, 351) background is rgb(79, 70, 229), design says rgb(76, 154, 255) (ΔE2000 28.4) ×5 |
| major | color | text | 2/9 | 2 | color=rgb(229, 72, 77) → color=rgb(245, 166, 35) | "4" text color is rgb(245, 166, 35), design says rgb(229, 72, 77) (ΔE2000 37.5) |
| major | color | box | 2/9 | 2 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(245, 166, 35) | box at (622, 732) background is rgb(245, 166, 35), design says rgb(229, 72, 77) (ΔE2000 37.5) |
| major | color | text | 2/9 | 2 | color=rgb(166, 171, 179) → color=rgb(76, 154, 255) | "3" text color is rgb(76, 154, 255), design says rgb(166, 171, 179) (ΔE2000 20.9) |
| major | color | box | 2/9 | 2 | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(245, 166, 35) | box at (622, 874) background is rgb(245, 166, 35), design says rgb(76, 154, 255) (ΔE2000 55.3) |
| major | typography | text | 2/9 | 2 (×6) | fontFamily=Material Symbols Outlined → fontFamily=IBM Plex Mono | "history" typography differs: family "IBM Plex Mono" vs "Material Symbols Outlined" ×3 |
| major | color | text | 2/9 | 2 (×12) | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgba(245, 166, 35, 0.35) | "14" background is rgba(245, 166, 35, 0.35), design says rgb(245, 166, 35) (ΔE2000 19.1) ×4 |
| major | color | text | 2/9 | 2 (×8) | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgba(76, 154, 255, 0.35) | "5" background is rgba(76, 154, 255, 0.35), design says rgb(76, 154, 255) (ΔE2000 19.6) |
| major | border | text | 2/9 | 2 (×13) | borderWidth=0 → borderWidth=2 borderColor=rgba(255, 255, 255, 0.9) | "2" border differs: border the design does not have |
| major | color | text | 2/9 | 2 (×7) | color=rgba(109, 106, 240, 0.3) → color=rgb(166, 171, 179) | "CONTINUE" text color is rgb(166, 171, 179), design says rgba(109, 106, 240, 0.3) (ΔE2000 16.4) ×4 |
| major | color | text | 2/9 | 2 (×4) | color=rgb(166, 171, 179) → color=rgb(255, 255, 255) | "history" text color is rgb(255, 255, 255), design says rgb(166, 171, 179) (ΔE2000 20.3) ×3 |
| major | color | box | 1/9 | 2 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(76, 154, 255) | box at (650, 213) background is rgb(76, 154, 255), design says rgb(245, 166, 35) (ΔE2000 55.3) |
| major | color | text | 1/9 | 2 | color=rgb(245, 166, 35) → color=rgb(229, 72, 77) | "13" text color is rgb(229, 72, 77), design says rgb(245, 166, 35) (ΔE2000 37.5) |
| major | color | text | 1/9 | 2 | color=rgb(166, 171, 179) → color=rgb(245, 166, 35) | "history" text color is rgb(245, 166, 35), design says rgb(166, 171, 179) (ΔE2000 32.3) |
| major | color | text | 1/9 | 2 | color=rgb(91, 141, 239) → color=rgb(166, 171, 179) | "unfold_more" text color is rgb(166, 171, 179), design says rgb(91, 141, 239) (ΔE2000 20.8) |
| major | color | text | 1/9 | 2 | color=rgb(229, 72, 77) → color=rgb(166, 171, 179) | "4" text color is rgb(166, 171, 179), design says rgb(229, 72, 77) (ΔE2000 33.4) |
| major | typography | text | 1/9 | 2 | fontFamily=Material Symbols Outlined fontWeight=400 → fontFamily=IBM Plex Sans fontWeight=600 | "history" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", weight 600 vs 400 |
| major | typography | text | 1/9 | 2 | fontFamily=IBM Plex Mono fontWeight=400 → fontFamily=IBM Plex Sans fontWeight=600 | "r45" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", weight 600 vs 400 |
| major | border | text | 1/9 | 2 | borderWidth=1 borderColor=rgba(255, 255, 255, 0.85) → borderWidth=0 | "2" border differs: no border, design has one |
| major | typography | text | 1/9 | 2 | fontFamily=Oswald fontSize=15 fontWeight=500 → fontFamily=IBM Plex Sans fontSize=9 fontWeight=400 | "CONTINUE" typography differs: family "IBM Plex Sans" vs "Oswald", size 9px vs 15px, weight 400 vs 500 |
| major | typography | text | 1/9 | 2 | fontFamily=IBM Plex Mono fontSize=11 → fontFamily=IBM Plex Sans fontSize=12.5 | "Primary · lg · Disabled" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 12.5px vs 11px |
| major | typography | text | 1/9 | 2 | fontFamily=Montserrat fontSize=13.5 fontWeight=700 → fontFamily=IBM Plex Sans fontSize=9 fontWeight=400 | "Delete" typography differs: family "IBM Plex Sans" vs "Montserrat", size 9px vs 13.5px, weight 400 vs 700 |
| major | border | surface | 1/9 | 2 | borderWidth=1 borderColor=rgb(166, 171, 179) → borderWidth=0 | surface at (60, 623) border differs: no border, design has one |
| major | border | surface | 1/9 | 1 | borderWidth=1 borderColor=rgb(245, 166, 35) → borderWidth=1 borderColor=rgb(76, 154, 255) | surface at (1249, 1031) border differs: color rgb(76, 154, 255) vs rgb(245, 166, 35) (ΔE2000 55.3) |
| major | color | surface | 1/9 | 1 (×7) | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgba(79, 70, 229, 0.35) | surface at (75, 261) background is rgba(79, 70, 229, 0.35), design says rgb(244, 245, 247) (ΔE2000 20.8) ×7 |
| major | color | text | 1/9 | 1 | color=rgb(229, 72, 77) → color=rgb(70, 167, 88) | "Critical" text color is rgb(70, 167, 88), design says rgb(229, 72, 77) (ΔE2000 68.2) |
| major | color | box | 1/9 | 1 (×9) | backgroundColor=rgb(99, 102, 241) → backgroundColor=rgb(217, 219, 224) | box at (82, 269) background is rgb(217, 219, 224), design says rgb(99, 102, 241) (ΔE2000 37.7) ×9 |
| major | color | text | 1/9 | 1 | color=rgb(166, 171, 179) → color=rgb(229, 72, 77) | "No findings" text color is rgb(229, 72, 77), design says rgb(166, 171, 179) (ΔE2000 33.4) |
| major | color | box | 1/9 | 1 | backgroundColor=rgb(79, 70, 229) → backgroundColor=rgb(217, 219, 224) | box at (82, 310) background is rgb(217, 219, 224), design says rgb(79, 70, 229) (ΔE2000 46.2) |
| major | color | text | 1/9 | 1 | color=rgb(76, 154, 255) → color=rgb(70, 167, 88) | "Minor" text color is rgb(70, 167, 88), design says rgb(76, 154, 255) (ΔE2000 50.7) |
| major | color | text | 1/9 | 1 | color=rgb(91, 141, 239) → color=rgb(231, 233, 236) | "Show 31 more" text color is rgb(231, 233, 236), design says rgb(91, 141, 239) (ΔE2000 32.3) |
| major | border | text | 1/9 | 1 | borderWidth=1 borderColor=rgb(76, 77, 84) → borderWidth=0 | "Open sheet" border differs: no border, design has one |
| major | border | box | 1/9 | 1 | borderWidth=1 borderColor=rgb(70, 167, 88) → borderWidth=0 | box at (59, 310) border differs: no border, design has one |
| major | border-radius | text | 1/9 | 1 | borderRadius=0 → borderRadius=8.5 | "1 REGRESSED" border-radius is 8.5px, design says 0px |
| major | typography | text | 1/9 | 1 (×3) | fontFamily=IBM Plex Mono fontSize=11 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=13.5 fontWeight=600 | "Actions / Button" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 13.5px vs 11px, weight 600 vs 400 ×3 |
| major | typography | text | 1/9 | 1 (×7) | fontFamily=IBM Plex Mono fontSize=12 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=13.5 fontWeight=600 | "Primary · sm · Hover" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 13.5px vs 12px, weight 600 vs 400 ×7 |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Sans fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=14 fontWeight=400 | "Major" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 14px vs 11.5px, weight 400 vs 600 |
| major | typography | text | 1/9 | 1 | fontFamily=Material Symbols Outlined fontSize=16 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=12 fontWeight=600 | "grid_view" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 12px vs 16px, weight 600 vs 400 |
| major | color | box | 1/9 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(229, 72, 77) | box at (150, 319) background is rgb(229, 72, 77), design says rgb(245, 166, 35) (ΔE2000 37.5) |
| major | color | surface | 1/9 | 1 | backgroundColor=rgb(70, 71, 77) → backgroundColor=rgb(244, 245, 247) | surface at (52, 364) background is rgb(244, 245, 247), design says rgb(70, 71, 77) (ΔE2000 55.7) |
| major | color | box | 1/9 | 1 (×7) | backgroundColor=rgb(99, 102, 241) → backgroundColor=rgba(79, 70, 229, 0.35) | box at (75, 413) background is rgba(79, 70, 229, 0.35), design says rgb(99, 102, 241) (ΔE2000 27.5) ×7 |
| major | color | box | 1/9 | 1 | backgroundColor=rgb(79, 70, 229) → backgroundColor=rgba(79, 70, 229, 0.35) | box at (75, 467) background is rgba(79, 70, 229, 0.35), design says rgb(79, 70, 229) (ΔE2000 37.1) |
| major | color | surface | 1/9 | 1 | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgb(229, 72, 77) | surface at (68, 565) background is rgb(229, 72, 77), design says rgb(244, 245, 247) (ΔE2000 41.7) |
| major | color | text | 1/9 | 1 | color=rgb(245, 166, 35) → color=rgb(231, 233, 236) | "Major" text color is rgb(231, 233, 236), design says rgb(245, 166, 35) (ΔE2000 31.9) |
| major | color | surface | 1/9 | 1 | backgroundColor=rgb(70, 71, 77) → backgroundColor=rgb(245, 166, 35) | surface at (150, 898) background is rgb(245, 166, 35), design says rgb(70, 71, 77) (ΔE2000 53.5) |
| major | color | box | 1/9 | 1 | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(229, 72, 77) | box at (123, 1280) background is rgb(229, 72, 77), design says rgb(76, 154, 255) (ΔE2000 46.3) |
| major | color | box | 1/9 | 1 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(76, 154, 255) | box at (164, 1390) background is rgb(76, 154, 255), design says rgb(229, 72, 77) (ΔE2000 46.3) |
| major | color | box | 1/9 | 1 | backgroundColor=rgba(79, 70, 229, 0.35) → backgroundColor=rgb(217, 219, 224) | box at (69, 1473) background is rgb(217, 219, 224), design says rgba(79, 70, 229, 0.35) (ΔE2000 17.2) |
| major | color | surface | 1/9 | 1 | backgroundColor=rgba(60, 61, 66, 0.7) → backgroundColor=rgb(244, 245, 247) | surface at (52, 1564) background is rgb(244, 245, 247), design says rgba(60, 61, 66, 0.7) (ΔE2000 34.5) |
| major | color | box | 1/9 | 1 | backgroundColor=rgba(70, 71, 77, 0.7) → backgroundColor=rgb(79, 70, 229) | box at (57, 1569) background is rgb(79, 70, 229), design says rgba(70, 71, 77, 0.7) (ΔE2000 29.4) |
| major | color | text | 1/9 | 1 | color=rgb(166, 171, 179) → color=rgb(70, 167, 88) | "account_tree" text color is rgb(70, 167, 88), design says rgb(166, 171, 179) (ΔE2000 29.8) |
| major | color | text | 1/9 | 1 | color=rgb(229, 72, 77) → color=rgb(76, 154, 255) | "3" text color is rgb(76, 154, 255), design says rgb(229, 72, 77) (ΔE2000 46.3) |
| major | border | surface | 1/9 | 1 | borderWidth=0 → borderWidth=1 borderColor=rgb(76, 77, 84) | surface at (52, 341) border differs: border the design does not have |
| major | border | surface | 1/9 | 1 | borderWidth=1 borderColor=rgba(76, 77, 84, 0.7) → borderWidth=1 borderColor=rgb(76, 77, 84) | surface at (52, 1564) border differs: color rgb(76, 77, 84) vs rgba(76, 77, 84, 0.7) (ΔE2000 20.2) |
| major | typography | text | 1/9 | 1 (×3) | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=13 fontWeight=600 | "Primary · sm · Default" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 13px vs 11.5px, weight 600 vs 400 ×3 |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Sans fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=13 fontWeight=400 | "Minor" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 13px vs 11.5px, weight 400 vs 600 |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Sans fontSize=9.5 fontWeight=700 → fontFamily=Material Symbols Outlined fontSize=14 fontWeight=400 | "REGRESSION" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 14px vs 9.5px, weight 400 vs 700 |
| major | typography | text | 1/9 | 1 | fontFamily=Material Symbols Outlined fontSize=20 → fontFamily=IBM Plex Mono fontSize=12 | "grid_view" typography differs: family "IBM Plex Mono" vs "Material Symbols Outlined", size 12px vs 20px |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=14 fontWeight=400 | "4" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 14px vs 11.5px, weight 400 vs 600 |
| major | typography | text | 1/9 | 1 | fontFamily=Material Symbols Outlined fontSize=13 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=11.5 fontWeight=600 | "account_tree" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11.5px vs 13px, weight 600 vs 400 |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Sans fontSize=11 → fontFamily=IBM Plex Mono fontSize=12 | "not measured" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans", size 12px vs 11px |
| major | typography | text | 1/9 | 1 | fontFamily=Material Symbols Outlined fontSize=15 → fontFamily=IBM Plex Mono fontSize=11.5 | "folder" typography differs: family "IBM Plex Mono" vs "Material Symbols Outlined", size 11.5px vs 15px |
| major | color | text | 1/9 | 1 | backgroundColor=rgb(143, 126, 231) → backgroundColor=rgb(229, 72, 77) | "2" background is rgb(229, 72, 77), design says rgb(143, 126, 231) (ΔE2000 37.2) |
| major | extra-element | shape | 1/9 | 1 |  | implementation renders shape at (76, 251) (239×64) that the design does not have |
| major | color | text | 1/9 | 1 | color=rgb(107, 114, 128) → color=rgb(255, 255, 255) | "2" text color is rgb(255, 255, 255), design says rgb(107, 114, 128) (ΔE2000 39.2) |
| major | color | text | 1/9 | 1 | backgroundColor=rgb(229, 231, 235) → backgroundColor=rgb(143, 126, 231) | "2" background is rgb(143, 126, 231), design says rgb(229, 231, 235) (ΔE2000 32) |
| major | color | text | 1/9 | 1 | backgroundColor=rgb(143, 126, 231) → backgroundColor=rgba(229, 72, 77, 0.35) | "2" background is rgba(229, 72, 77, 0.35), design says rgb(143, 126, 231) (ΔE2000 33) |
| major | border | text | 1/9 | 1 | borderWidth=0 → borderWidth=2 borderColor=rgba(255, 255, 255, 0.315) | "public" border differs: border the design does not have |
| major | color | text | 1/9 | 1 | color=rgb(255, 255, 255) → color=rgb(76, 154, 255) | "Review" text color is rgb(76, 154, 255), design says rgb(255, 255, 255) (ΔE2000 35.5) |
| major | color | text | 1/9 | 1 (×6) | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(229, 72, 77) | "2" background is rgb(229, 72, 77), design says rgb(245, 166, 35) (ΔE2000 37.5) ×6 |
| major | color | text | 1/9 | 1 (×7) | color=rgba(166, 171, 179, 0.7) → color=rgb(255, 255, 255) | "h 28" text color is rgb(255, 255, 255), design says rgba(166, 171, 179, 0.7) (ΔE2000 13.5) ×7 |
| major | color | text | 1/9 | 1 (×4) | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(245, 166, 35) | "1" background is rgb(245, 166, 35), design says rgb(76, 154, 255) (ΔE2000 55.3) ×4 |
| major | color | text | 1/9 | 1 (×8) | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(245, 166, 35) | "1" background is rgb(245, 166, 35), design says rgb(229, 72, 77) (ΔE2000 37.5) ×8 |
| major | color | text | 1/9 | 1 (×5) | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(76, 154, 255) | "1" background is rgb(76, 154, 255), design says rgb(245, 166, 35) (ΔE2000 55.3) ×5 |
| major | color | text | 1/9 | 1 | color=rgb(109, 106, 240) → color=rgb(166, 171, 179) | "CONTINUE" text color is rgb(166, 171, 179), design says rgb(109, 106, 240) (ΔE2000 25.2) |
| major | color | text | 1/9 | 1 | color=rgb(129, 140, 248) → color=rgb(166, 171, 179) | "CONTINUE" text color is rgb(166, 171, 179), design says rgb(129, 140, 248) (ΔE2000 19.3) |
| major | color | text | 1/9 | 1 | backgroundColor=rgb(143, 126, 231) → backgroundColor=rgb(245, 166, 35) | "2" background is rgb(245, 166, 35), design says rgb(143, 126, 231) (ΔE2000 57.5) |
| major | color | text | 1/9 | 1 | backgroundColor=rgb(220, 38, 38) → backgroundColor=rgba(128, 132, 140, 0.06) | "Delete" background is rgba(128, 132, 140, 0.06), design says rgb(220, 38, 38) (ΔE2000 47.1) |
| major | color | text | 1/9 | 1 | color=rgba(255, 255, 255, 0.45) → color=rgb(166, 171, 179) | "Delete" text color is rgb(166, 171, 179), design says rgba(255, 255, 255, 0.45) (ΔE2000 20.3) |
| major | color | text | 1/9 | 1 | backgroundColor=rgba(220, 38, 38, 0.45) → backgroundColor=rgba(128, 132, 140, 0.06) | "Delete" background is rgba(128, 132, 140, 0.06), design says rgba(220, 38, 38, 0.45) (ΔE2000 27.4) |
| major | border | text | 1/9 | 1 | borderWidth=1 borderColor=rgb(229, 72, 77) → borderWidth=0 | "Review" border differs: no border, design has one |
| major | border | text | 1/9 | 1 | borderWidth=1 borderColor=rgb(109, 106, 240) borderStyle=solid → borderWidth=1 borderColor=rgb(245, 166, 35) borderStyle=dashed | "CONTINUE" border differs: dashed where the design is solid, color rgb(245, 166, 35) vs rgb(109, 106, 240) (ΔE2000 62.3) |
| major | border | text | 1/9 | 1 | borderWidth=1 borderColor=rgb(129, 140, 248) borderStyle=solid → borderWidth=1 borderColor=rgb(245, 166, 35) borderStyle=dashed | "CONTINUE" border differs: dashed where the design is solid, color rgb(245, 166, 35) vs rgb(129, 140, 248) (ΔE2000 56.8) |
| major | typography | text | 1/9 | 1 (×5) | fontFamily=IBM Plex Mono fontWeight=700 → fontFamily=IBM Plex Sans fontWeight=600 | "36 cells" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", weight 600 vs 700 ×5 |
| major | typography | text | 1/9 | 1 (×36) | fontSize=9.5 → fontSize=12 | "2" typography differs: size 12px vs 9.5px ×36 |
| major | typography | text | 1/9 | 1 (×7) | fontFamily=IBM Plex Mono fontSize=9.5 fontWeight=500 → fontFamily=IBM Plex Sans fontSize=12 fontWeight=700 | "h 28" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 12px vs 9.5px, weight 700 vs 500 ×7 |
| major | border-radius | text | 1/9 | 1 (×11) | borderRadius=0 → borderRadius=14 | "h 28" border-radius is 14px, design says 0px ×11 |
| major | typography | text | 1/9 | 1 | fontFamily=Material Symbols Outlined fontSize=10 lineHeight=10 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=12 lineHeight=12 fontWeight=700 | "undo" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 12px vs 10px, line-height 12px vs 10px, weight 700 vs 400 |
| major | typography | text | 1/9 | 1 | fontSize=9 → fontSize=12 | "REG" typography differs: size 12px vs 9px |
| major | typography | text | 1/9 | 1 | fontFamily=IBM Plex Sans fontWeight=700 → fontFamily=IBM Plex Mono fontWeight=500 | "3" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans", weight 500 vs 700 |
| major | typography | text | 1/9 | 1 (×3) | fontFamily=Material Symbols Outlined fontSize=11 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=12 fontWeight=700 | "history" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 12px vs 11px, weight 700 vs 400 ×3 |
| major | border | text | 1/9 | 1 | borderWidth=1 borderColor=rgba(109, 106, 240, 0.3) borderStyle=solid → borderWidth=1 borderColor=rgb(245, 166, 35) borderStyle=dashed | "CONTINUE" border differs: dashed where the design is solid, color rgb(245, 166, 35) vs rgba(109, 106, 240, 0.3) (ΔE2000 43.7) |
| major | typography | text | 1/9 | 1 | fontFamily=Oswald fontSize=12 fontWeight=500 → fontFamily=IBM Plex Sans fontSize=9 fontWeight=400 | "CONTINUE" typography differs: family "IBM Plex Sans" vs "Oswald", size 9px vs 12px, weight 400 vs 500 |
| major | color | text | 1/9 | 1 (×4) | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgba(229, 72, 77, 0.35) | "2" background is rgba(229, 72, 77, 0.35), design says rgb(229, 72, 77) (ΔE2000 27.7) ×4 |
| minor | text-content | text | 8/9 | 191 |  | text reads "3 suppressed by policy rules", design says "Impl renders an element with no counterpart in the design re" |
| minor | typography | text | 4/9 | 5 | fontSize=11 → fontSize=12 | "r47" typography differs: size 12px vs 11px |
| minor | extra-element | box | 3/9 | 53 |  | implementation renders box at (74, 251) (9×11) that the design does not have |
| minor | border-radius | text | 3/9 | 3 | borderRadius=0 → borderRadius=5 | "r45" border-radius is 5px, design says 0px |
| minor | border-radius | text | 2/9 | 3 | borderRadius=0 → borderRadius=4 | "undo" border-radius is 4px, design says 0px |
| minor | color | text | 2/9 | 3 | backgroundColor=rgba(129, 140, 248, 0.06) → backgroundColor=rgba(128, 132, 140, 0.06) | "CONTINUE" background is rgba(128, 132, 140, 0.06), design says rgba(129, 140, 248, 0.06) (ΔE2000 3) |
| minor | border-radius | text | 2/9 | 3 (×10) | borderRadius=6 → borderRadius=4 | "CONTINUE" border-radius is 4px, design says 6px ×8 |
| minor | border-radius | surface | 2/9 | 2 (×5) | borderRadius=5 → borderRadius=0 | surface at (861, 200) border-radius is 0px, design says 5px ×4 |
| minor | border-radius | box | 2/9 | 2 (×16) | borderRadius=4 → borderRadius=2 | box at (59, 269) border-radius is 2px, design says 4px ×10 |
| minor | typography | text | 2/9 | 2 (×7) | fontWeight=600 → fontWeight=400 | "Claude Design" typography differs: weight 400 vs 600 |
| minor | pixel-region |  | 2/9 | 2 | alignmentConfidence 0.5→0.4..0.5 | pixel channel skipped: alignment confidence 0.46 is below 0.5 — element geometry did not line up well enough to compare pixels |
| minor | border-radius | text | 2/9 | 2 (×38) | borderRadius=8 → borderRadius=14 | "public" border-radius is 14px, design says 8px |
| minor | typography | text | 2/9 | 2 (×15) | fontWeight=500 → fontWeight=600 | "Default" typography differs: weight 600 vs 500 ×10 |
| minor | extra-element | image | 1/9 | 8 |  | implementation renders image at (141, 337) (51×21) that the design does not have |
| minor | typography | text | 1/9 | 2 | fontWeight=400 → fontWeight=600 | "No findings" typography differs: weight 600 vs 400 |
| minor | color | text | 1/9 | 2 | color=rgb(255, 255, 255) → color=rgb(231, 233, 236) | "undo" text color is rgb(231, 233, 236), design says rgb(255, 255, 255) (ΔE2000 4.9) |
| minor | typography | text | 1/9 | 2 | fontSize=10 fontWeight=700 → fontSize=11 fontWeight=400 | "1 REGRESSED" typography differs: size 11px vs 10px, weight 400 vs 700 |
| minor | typography | text | 1/9 | 2 | fontWeight=700 → fontWeight=400 | "SKIPPED · NO IMPL CELL" typography differs: weight 400 vs 700 |
| minor | typography | text | 1/9 | 1 (×8) | fontSize=15 → fontSize=16 | "chevron_right" typography differs: size 16px vs 15px ×8 |
| minor | typography | text | 1/9 | 1 | fontSize=12 → fontSize=13.5 | "Show 31 more" typography differs: size 13.5px vs 12px |
| minor | color | surface | 1/9 | 1 (×5) | backgroundColor=rgb(42, 43, 46) → backgroundColor=rgb(51, 52, 56) | surface at (17, 390) background is rgb(51, 52, 56), design says rgb(42, 43, 46) (ΔE2000 3) ×5 |
| minor | color | surface | 1/9 | 1 | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgb(217, 219, 224) | surface at (68, 405) background is rgb(217, 219, 224), design says rgb(244, 245, 247) (ΔE2000 5.8) |
| minor | border-radius | text | 1/9 | 1 (×6) | borderRadius=0 → borderRadius=2 | "arrow_right_alt" border-radius is 2px, design says 0px ×6 |
| minor | typography | text | 1/9 | 1 (×5) | fontSize=18 lineHeight=18 → fontSize=20 lineHeight=20 | "chevron_right" typography differs: size 20px vs 18px, line-height 20px vs 18px ×5 |
| minor | typography | text | 1/9 | 1 | fontSize=11.5 fontWeight=400 → fontSize=13 fontWeight=600 | "No findings" typography differs: size 13px vs 11.5px, weight 600 vs 400 |
| minor | border-radius | text | 1/9 | 1 | borderRadius=7.5 → borderRadius=0 | "REGRESSION" border-radius is 0px, design says 7.5px |
| minor | typography | text | 1/9 | 1 | fontSize=11.5 → fontSize=13 | "Major" typography differs: size 13px vs 11.5px |
| minor | typography | text | 1/9 | 1 | fontSize=16 lineHeight=16 → fontSize=14 lineHeight=14 | "unfold_more" typography differs: size 14px vs 16px, line-height 14px vs 16px |
| minor | typography | text | 1/9 | 1 | fontSize=12 fontWeight=600 → fontSize=11 fontWeight=400 | "Show 31 more" typography differs: size 11px vs 12px, weight 400 vs 600 |
| minor | typography | text | 1/9 | 1 | fontSize=13 fontWeight=600 → fontSize=11.5 fontWeight=400 | "Checkbox" typography differs: size 11.5px vs 13px, weight 400 vs 600 |
| minor | typography | text | 1/9 | 1 | fontSize=13 → fontSize=14 | "arrow_right_alt" typography differs: size 14px vs 13px |
| minor | typography | text | 1/9 | 1 | fontSize=13 → fontSize=11.5 | "Radio" typography differs: size 11.5px vs 13px |
| minor | border-radius | box | 1/9 | 1 | borderRadius=2 → borderRadius=0 | box at (57, 1363) border-radius is 0px, design says 2px |
| minor | typography | text | 1/9 | 1 | fontSize=13 fontWeight=600 → fontSize=11 fontWeight=400 | "Foundations" typography differs: size 11px vs 13px, weight 400 vs 600 |
| minor | typography | text | 1/9 | 1 | fontSize=12 → fontSize=11 | "Elevation" typography differs: size 11px vs 12px |
| minor | missing-element | backdrop | 1/9 | 1 |  | design backdrop at (-331, -266) (829×902) has no counterpart in the implementation |
| minor | typography | text | 1/9 | 1 | fontSize=12 fontWeight=600 → fontSize=11 fontWeight=700 | "2" typography differs: size 11px vs 12px, weight 700 vs 600 |
| minor | border-radius | text | 1/9 | 1 | borderRadius=13.41 → borderRadius=6 | "2" border-radius is 6px, design says 13.41px |
| minor | border | text | 1/9 | 1 (×36) | borderWidth=1 borderColor=rgba(255, 255, 255, 0.85) → borderWidth=2 borderColor=rgba(255, 255, 255, 0.9) | "2" border differs: width 2px vs 1px ×36 |
| minor | border-radius | text | 1/9 | 1 | borderRadius=7 → borderRadius=0 | "Review" border-radius is 0px, design says 7px |
| minor | typography | text | 1/9 | 1 (×5) | fontSize=12 lineHeight=12 → fontSize=14 lineHeight=14 | "arrow_right_alt" typography differs: size 14px vs 12px, line-height 14px vs 12px ×5 |
| minor | typography | text | 1/9 | 1 | fontSize=12.5 fontWeight=600 → fontSize=10.5 fontWeight=400 | "Primary fill off-token" typography differs: size 10.5px vs 12.5px, weight 400 vs 600 |
| minor | typography | text | 1/9 | 1 | fontSize=9.5 fontWeight=700 → fontSize=10.5 fontWeight=400 | "2" typography differs: size 10.5px vs 9.5px, weight 400 vs 700 |
| minor | typography | text | 1/9 | 1 | fontSize=12.5 fontWeight=600 → fontSize=10.5 fontWeight=700 | "Disabled too faint" typography differs: size 10.5px vs 12.5px, weight 700 vs 600 |
| minor | border-radius | text | 1/9 | 1 | borderRadius=8 → borderRadius=4 | "1" border-radius is 4px, design says 8px |
| minor | extra-element | backdrop | 1/9 | 1 |  | implementation renders backdrop at (0, 45) (390×799) that the design does not have |
| minor | typography | text | 1/9 | 1 | fontSize=16 lineHeight=16 → fontSize=18 lineHeight=18 | "close" typography differs: size 18px vs 16px, line-height 18px vs 16px |
| minor | border-radius | text | 1/9 | 1 | borderRadius=6 → borderRadius=0 | "close" border-radius is 0px, design says 6px |
| minor | border | box | 1/9 | 1 | borderWidth=1 borderColor=rgb(229, 72, 77) → borderWidth=2 borderColor=rgb(229, 72, 77) | box at (142, 412) border differs: width 2px vs 1px |
| minor | pixel-region | backdrop | 1/9 | 1 | shape diffRatio 0→0.1 | 5% of pixels differ in backdrop at (159, -440): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (602 regions, 996×627px) |
| minor | pixel-region | box | 1/9 | 1 | shape diffRatio 0→0.1 | 14.4% of pixels differ in box at (639, 412): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (19 regions, 305×82px) |
| minor | typography | text | 1/9 | 1 | fontWeight=400 → fontWeight=700 | "missing" typography differs: weight 700 vs 400 |



## uctoinak2 — NOT RE-MEASURED IN THIS RUN

the Uctoinak app's 31 whole-PAGE pairs on its own dev server, including the witness `messages-accountant-desktop`.

**The numbers below were measured 2026-09-16T14:41:48.965Z**, not now: not selected in this run (--only). They are a valid earlier measurement of the same corpus, and the document keeps them so the baseline stays whole — but anything compared against them is being compared across two different moments. To refresh: start that worktree's `design-live` svc unit (APP_ENV=test, NEXT_DIST_DIR=.next-design, its own DB) — see docs/plan-divergent-matching.md §Repro, then `node scripts/baseline-matching.ts --only uctoinak2`.

```
cd /root/uctoinak2/.claude/worktrees/messages-redesign
node /root/refdiff/packages/core/dist/cli.js compare --manifest tools/design-compare/manifest.mjs --design-dir tools/design-compare/design-reference \
  --app-url http://localhost:3210 --out /root/refdiff/out/baseline/uctoinak2 \
  --auth-post /api/test/session --auth-header "x-test-secret: playwright-local-placeholder-secret-min-32chars" --pair docs-owner-desktop,docs-owner-mobile,docs-accountant-desktop,docs-accountant-mobile,today-owner-desktop,portfolio-accountant-desktop,portfolio-accountant-mobile,client-detail-chrome-accountant-desktop,client-detail-chrome-accountant-mobile,client-overview-accountant-desktop,client-overview-accountant-mobile,client-pending-accountant-desktop,client-pending-accountant-mobile,settings-owner-desktop,settings-owner-mobile,settings-accountant-desktop,settings-accountant-mobile,settings-members-owner-desktop,settings-team-accountant-desktop,invite-org-desktop,invite-org-mobile,invite-firm-desktop,invite-firm-mobile,client-settings-accountant-desktop,client-settings-accountant-mobile,messages-owner-desktop,messages-owner-mobile,messages-accountant-desktop,messages-accountant-mobile,client-members-accountant-desktop,client-members-accountant-mobile
```

Not in the tables below:

- `docs-owner-desktop` — **impl capture failed** (`error-page`), so it produced no report at all.
- `docs-owner-mobile` — **impl capture failed** (`error-page`), so it produced no report at all.

29 pairs: 0 PASS / 29 FAIL — 3627 findings covering 4186 instances, 8 suppressed; delta +0 / −0
475 of 3627 findings are UNVERIFIED — nothing but a weak alignment paired their two elements, so their values are not evidence of drift
pairing evidence across the set: 724 by text, 30 by slot, 1083 by geometry, 1790 resting on no pair

| pair                                    | verdict | findings (c/M/m) | inst | supp | unver | conf | align                     | delta |
|-----------------------------------------|---------|------------------|------|------|-------|------|---------------------------|-------|
| docs-accountant-desktop                 | FAIL    |  221 (106/80/35) |  256 |    0 |    12 | 0.00 | 1.173×1.162 / −15.3,0     | +0/−0 |
| docs-accountant-mobile                  | FAIL    |   170 (66/62/42) |  180 |    0 |    24 | 0.10 | 1.026 / 0,0               | +0/−0 |
| today-owner-desktop                     | FAIL    |    74 (26/36/12) |   78 |    0 |     0 | 0.50 | 1.101×1.032 / −263.8,−9.8 | +0/−0 |
| portfolio-accountant-desktop            | FAIL    |   192 (37/98/57) |  279 |    0 |    22 | 0.29 | 1.141×1.097 / −43.7,−9.3  | +0/−0 |
| portfolio-accountant-mobile             | FAIL    |   160 (25/83/52) |  200 |    0 |    27 | 0.10 | 1.011×0.790 / −2.1,272.9  | +0/−0 |
| client-detail-chrome-accountant-desktop | FAIL    |   111 (21/54/36) |  147 |    0 |    13 | 0.00 | 1.162 / −14.9,0           | +0/−0 |
| client-detail-chrome-accountant-mobile  | FAIL    |     87 (8/47/32) |   99 |    0 |    12 | 0.38 | 0.800×1.223 / 4.0,−14.2   | +0/−0 |
| client-overview-accountant-desktop      | FAIL    | 317 (119/126/72) |  373 |    0 |    45 | 0.08 | 0.990×1 / 7.8,0           | +0/−0 |
| client-overview-accountant-mobile       | FAIL    |  214 (49/103/62) |  232 |    0 |    45 | 0.13 | 1 / 0,0                   | +0/−0 |
| client-pending-accountant-desktop       | FAIL    |   157 (81/53/23) |  187 |    8 |     8 | 0.38 | 0.602×1.398 / 49.6,−99.6  | +0/−0 |
| client-pending-accountant-mobile        | FAIL    |   149 (73/40/36) |  168 |    0 |    22 | 0.38 | 0.861×0.913 / −3.4,−1.4   | +0/−0 |
| settings-owner-desktop                  | FAIL    |   104 (26/41/37) |  106 |    0 |    18 | 0.13 | 0.970×1.083 / 0.7,0       | +0/−0 |
| settings-owner-mobile                   | FAIL    |    61 (20/16/25) |   81 |    0 |     5 | 0.25 | 1.035×1.026 / −0.7,0      | +0/−0 |
| settings-accountant-desktop             | FAIL    |    79 (14/27/38) |   90 |    0 |    17 | 0.38 | 1.106×0.892 / −6.8,6.0    | +0/−0 |
| settings-accountant-mobile              | FAIL    |    76 (24/22/30) |   85 |    0 |     9 | 0.38 | 1.061×0.793 / −4.0,24.3   | +0/−0 |
| settings-members-owner-desktop          | FAIL    |   121 (29/59/33) |  127 |    0 |    17 | 0.13 | 1.456×1.083 / −29.8,0     | +0/−0 |
| settings-team-accountant-desktop        | FAIL    |    98 (12/48/38) |  107 |    0 |    13 | 0.38 | 1.097×0.962 / −4.8,1.7    | +0/−0 |
| invite-org-desktop                      | FAIL    |     37 (18/9/10) |   37 |    0 |     0 | 0.00 | 1.162×1.285 / 0,−10.3     | +0/−0 |
| invite-org-mobile                       | FAIL    |      30 (16/5/9) |   30 |    0 |     1 | 0.00 | 1.026 / 0,0               | +0/−0 |
| invite-firm-desktop                     | FAIL    |     37 (18/12/7) |   37 |    0 |     0 | 0.13 | 1.162×1.285 / −33.7,−10.3 | +0/−0 |
| invite-firm-mobile                      | FAIL    |      30 (16/5/9) |   30 |    0 |     1 | 0.00 | 1.026 / 0,0               | +0/−0 |
| client-settings-accountant-desktop      | FAIL    |    113 (9/54/50) |  142 |    0 |     0 | 0.50 | 1.017×1.125 / 4.8,5.5     | +0/−0 |
| client-settings-accountant-mobile       | FAIL    |     89 (9/42/38) |   98 |    0 |    13 | 0.33 | 1.061×1.406 / −3.0,32.3   | +0/−0 |
| messages-owner-desktop                  | FAIL    |  189 (18/103/68) |  220 |    0 |    33 | 0.07 | 1 / 0,0                   | +0/−0 |
| messages-owner-mobile                   | FAIL    |   117 (16/65/36) |  138 |    0 |    13 | 0.00 | 0.990×0.995 / 18.5,0      | +0/−0 |
| messages-accountant-desktop             | FAIL    |  226 (36/128/62) |  259 |    0 |    36 | 0.07 | 1.091×1 / −10.5,0         | +0/−0 |
| messages-accountant-mobile              | FAIL    |   145 (17/86/42) |  154 |    0 |    29 | 0.00 | 0.834×0.995 / 35.8,0      | +0/−0 |
| client-members-accountant-desktop       | FAIL    |   129 (20/68/41) |  142 |    0 |    21 | 0.00 | 1.162 / 0,0               | +0/−0 |
| client-members-accountant-mobile        | FAIL    |    94 (12/46/36) |  104 |    0 |    19 | 0.25 | 1.065×1.469 / −3.2,−40.6  | +0/−0 |

Matching — what the matcher PAIRED (pairs, not findings). A `matched` column that fell while
`d-only`/`i-only` rose is a REGRESSION, not a precision win: both move that way.
`phase` reads `rate` (matched / min leaves) and `axis` (the BETTER-fitting axis, not the
joint `conf`); `share` is reported and does not gate. On a `reconcile` pair a matched
collapse is expected; on a `polish` pair it is a bug. Reported, never enforced.

| pair                                    | design | impl | matched | text | slot | geom | d-only | i-only | vetoed | conf | axis | rate | share |     phase |
|-----------------------------------------|--------|------|---------|------|------|------|--------|--------|--------|------|------|------|-------|-----------|
| docs-accountant-desktop                 |    160 |   57 |      30 |   16 |    1 |   13 |    130 |     27 |      0 | 0.00 | 0.50 | 0.53 |  0.53 | reconcile |
| docs-accountant-mobile                  |    114 |   48 |      30 |   13 |    1 |   16 |     84 |     18 |      1 | 0.10 | 0.30 | 0.63 |  0.43 | reconcile |
| today-owner-desktop                     |     42 |   36 |      10 |    4 |    0 |    6 |     32 |     26 |      1 | 0.50 | 0.50 | 0.28 |  0.40 | reconcile |
| portfolio-accountant-desktop            |    114 |  102 |      66 |   37 |    0 |   29 |     48 |     36 |      1 | 0.29 | 0.59 | 0.65 |  0.56 | reconcile |
| portfolio-accountant-mobile             |     76 |   73 |      44 |   15 |    0 |   29 |     32 |     29 |      0 | 0.10 | 0.60 | 0.60 |  0.34 | reconcile |
| client-detail-chrome-accountant-desktop |     48 |   57 |      26 |   11 |    2 |   13 |     22 |     31 |      0 | 0.00 | 0.38 | 0.54 |  0.42 | reconcile |
| client-detail-chrome-accountant-mobile  |     31 |   48 |      22 |   10 |    0 |   12 |      9 |     26 |      0 | 0.38 | 0.63 | 0.71 |  0.45 |    polish |
| client-overview-accountant-desktop      |    194 |   90 |      56 |   23 |    0 |   33 |    138 |     34 |      1 | 0.08 | 0.50 | 0.62 |  0.41 | reconcile |
| client-overview-accountant-mobile       |    103 |   82 |      44 |   12 |    1 |   31 |     59 |     38 |      1 | 0.13 | 0.13 | 0.54 |  0.27 | reconcile |
| client-pending-accountant-desktop       |    124 |   44 |      18 |   12 |    0 |    6 |    106 |     26 |      2 | 0.38 | 0.63 | 0.41 |  0.67 | reconcile |
| client-pending-accountant-mobile        |    103 |   36 |      25 |    9 |    0 |   16 |     78 |     11 |      2 | 0.38 | 0.50 | 0.69 |  0.36 | reconcile |
| settings-owner-desktop                  |     46 |   31 |      19 |    9 |    0 |   10 |     27 |     12 |      2 | 0.13 | 0.50 | 0.61 |  0.47 | reconcile |
| settings-owner-mobile                   |     42 |   28 |      21 |    9 |    0 |   12 |     21 |      7 |      0 | 0.25 | 0.88 | 0.75 |  0.43 |    polish |
| settings-accountant-desktop             |     36 |   23 |      18 |    5 |    2 |   11 |     18 |      5 |      0 | 0.38 | 0.63 | 0.78 |  0.28 |    polish |
| settings-accountant-mobile              |     45 |   28 |      21 |    7 |    0 |   14 |     24 |      7 |      0 | 0.38 | 0.75 | 0.75 |  0.33 |    polish |
| settings-members-owner-desktop          |     46 |   46 |      16 |    8 |    0 |    8 |     30 |     30 |      1 | 0.13 | 0.38 | 0.35 |  0.50 | reconcile |
| settings-team-accountant-desktop        |     36 |   44 |      20 |    5 |    1 |   14 |     16 |     24 |      0 | 0.38 | 0.50 | 0.56 |  0.25 | reconcile |
| invite-org-desktop                      |     25 |    8 |       4 |    4 |    0 |    0 |     21 |      4 |      0 | 0.00 | 0.38 | 0.50 |  1.00 | reconcile |
| invite-org-mobile                       |     23 |    8 |       4 |    3 |    0 |    1 |     19 |      4 |      0 | 0.00 | 0.00 | 0.50 |  0.75 | reconcile |
| invite-firm-desktop                     |     25 |    8 |       4 |    4 |    0 |    0 |     21 |      4 |      0 | 0.13 | 0.25 | 0.50 |  1.00 | reconcile |
| invite-firm-mobile                      |     23 |    8 |       4 |    3 |    0 |    1 |     19 |      4 |      0 | 0.00 | 0.00 | 0.50 |  0.75 | reconcile |
| client-settings-accountant-desktop      |     47 |   54 |      36 |   18 |    0 |   18 |     11 |     18 |      0 | 0.50 | 0.56 | 0.77 |  0.50 |    polish |
| client-settings-accountant-mobile       |     27 |   46 |      18 |   10 |    1 |    7 |      9 |     28 |      0 | 0.33 | 0.56 | 0.67 |  0.56 | reconcile |
| messages-owner-desktop                  |     65 |   77 |      44 |   21 |    0 |   23 |     21 |     33 |      0 | 0.07 | 0.07 | 0.68 |  0.48 | reconcile |
| messages-owner-mobile                   |     43 |   61 |      24 |   17 |    0 |    7 |     19 |     37 |      0 | 0.00 | 0.64 | 0.56 |  0.71 | reconcile |
| messages-accountant-desktop             |     80 |  106 |      41 |   19 |    0 |   22 |     39 |     65 |      1 | 0.07 | 0.50 | 0.51 |  0.46 | reconcile |
| messages-accountant-mobile              |     45 |   68 |      26 |   11 |    0 |   15 |     19 |     42 |      0 | 0.00 | 0.70 | 0.58 |  0.42 | reconcile |
| client-members-accountant-desktop       |     51 |   55 |      29 |   12 |    0 |   17 |     22 |     26 |      0 | 0.00 | 0.00 | 0.57 |  0.41 | reconcile |
| client-members-accountant-mobile        |     29 |   47 |      17 |    4 |    0 |   13 |     12 |     30 |      1 | 0.25 | 0.38 | 0.59 |  0.24 | reconcile |
| TOTAL (29)                              |   1843 | 1419 |     737 |  331 |    9 |  397 |   1106 |    682 |     14 |      |      |      |       |    5P/24R |

Findings by type:

| pair                                    | miss | extra | text | pos | size | space | color | typo | bord | rad | pixel | align |  all |
|-----------------------------------------|------|-------|------|-----|------|-------|-------|------|------|-----|-------|-------|------|
| docs-accountant-desktop                 |  129 |    27 |    8 |  26 |    5 |     3 |     4 |    7 |    3 |   8 |     1 |     0 |  221 |
| docs-accountant-mobile                  |   83 |    18 |    7 |  20 |    9 |     4 |     8 |   13 |    4 |   3 |     1 |     0 |  170 |
| today-owner-desktop                     |   30 |    26 |    3 |   4 |    1 |     0 |     2 |    3 |    1 |   2 |     2 |     0 |   74 |
| portfolio-accountant-desktop            |   48 |    36 |    8 |  38 |   12 |    10 |    17 |   11 |    4 |   7 |     1 |     0 |  192 |
| portfolio-accountant-mobile             |   32 |    29 |   11 |  34 |    8 |    15 |    15 |   11 |    2 |   2 |     1 |     0 |  160 |
| client-detail-chrome-accountant-desktop |   22 |    31 |   10 |  20 |    3 |     2 |     4 |    7 |    2 |   9 |     1 |     0 |  111 |
| client-detail-chrome-accountant-mobile  |    9 |    26 |    3 |  19 |   10 |     4 |     3 |    8 |    1 |   3 |     1 |     0 |   87 |
| client-overview-accountant-desktop      |  136 |    34 |   19 |  48 |   15 |    10 |    19 |   17 |    6 |  11 |     1 |     1 |  317 |
| client-overview-accountant-mobile       |   59 |    38 |   19 |  33 |   12 |     3 |    15 |   23 |    6 |   5 |     1 |     0 |  214 |
| client-pending-accountant-desktop       |   94 |    26 |    3 |   9 |   10 |     3 |     4 |    2 |    0 |   4 |     1 |     1 |  157 |
| client-pending-accountant-mobile        |   77 |    11 |    5 |  19 |   10 |     5 |     4 |    9 |    3 |   4 |     1 |     1 |  149 |
| settings-owner-desktop                  |   26 |    11 |    9 |  16 |    5 |     3 |    12 |   13 |    1 |   7 |     1 |     0 |  104 |
| settings-owner-mobile                   |   21 |     7 |    3 |  16 |    5 |     3 |     2 |    3 |    0 |   0 |     1 |     0 |   61 |
| settings-accountant-desktop             |   18 |     5 |   11 |  14 |    3 |     4 |     8 |   11 |    0 |   4 |     1 |     0 |   79 |
| settings-accountant-mobile              |   24 |     7 |    3 |  17 |    6 |     8 |     4 |    6 |    0 |   0 |     1 |     0 |   76 |
| settings-members-owner-desktop          |   29 |    29 |    9 |  16 |    4 |     1 |    12 |   14 |    0 |   6 |     1 |     0 |  121 |
| settings-team-accountant-desktop        |   16 |    24 |   13 |  17 |    3 |     3 |     8 |   10 |    0 |   3 |     1 |     0 |   98 |
| invite-org-desktop                      |   21 |     4 |    0 |   4 |    4 |     1 |     2 |    0 |    0 |   0 |     1 |     0 |   37 |
| invite-org-mobile                       |   19 |     4 |    0 |   1 |    2 |     0 |     1 |    2 |    0 |   0 |     1 |     0 |   30 |
| invite-firm-desktop                     |   21 |     4 |    0 |   4 |    4 |     1 |     2 |    0 |    0 |   0 |     1 |     0 |   37 |
| invite-firm-mobile                      |   19 |     4 |    0 |   1 |    2 |     0 |     1 |    2 |    0 |   0 |     1 |     0 |   30 |
| client-settings-accountant-desktop      |   11 |    18 |   10 |  27 |   10 |     6 |    11 |    9 |    2 |   8 |     1 |     0 |  113 |
| client-settings-accountant-mobile       |    9 |    28 |    5 |  13 |   10 |     2 |     7 |    9 |    2 |   3 |     1 |     0 |   89 |
| messages-owner-desktop                  |   20 |    33 |   17 |  42 |   12 |     9 |    16 |   18 |    7 |  14 |     1 |     0 |  189 |
| messages-owner-mobile                   |   18 |    36 |    3 |  20 |   10 |     2 |    10 |    8 |    2 |   7 |     1 |     0 |  117 |
| messages-accountant-desktop             |   38 |    65 |   15 |  33 |   10 |     5 |    19 |   16 |    8 |  16 |     1 |     0 |  226 |
| messages-accountant-mobile              |   17 |    41 |    9 |  26 |   10 |     2 |    15 |   12 |    5 |   7 |     1 |     0 |  145 |
| client-members-accountant-desktop       |   21 |    26 |   13 |  28 |    6 |     4 |    10 |   10 |    1 |   9 |     1 |     0 |  129 |
| client-members-accountant-mobile        |   12 |    30 |   14 |  12 |    3 |     1 |     9 |    9 |    0 |   3 |     1 |     0 |   94 |
| TOTAL (29)                              | 1079 |   678 |  230 | 577 |  204 |   114 |   244 |  263 |   60 | 145 |    30 |     3 | 3627 |

Across pairs (one row = one cause; `pairs` = how many cells show it):

| severity | type | role | pairs | findings | values | sample |
|----------|------|------|-------|----------|--------|--------|
| critical | missing-element | text | 29/29 | 816 |  | design "2" (7×13) has no counterpart in the implementation |
| critical | missing-element | surface | 29/29 | 161 |  | design surface at (-14, 1) (272×1086) has no counterpart in the implementation |
| critical | missing-element | box | 22/29 | 96 |  | design box at (1162, 238) (56×14) has no counterpart in the implementation |
| critical | pixel-region | icon | 1/29 | 1 | shape diffRatio 0→0.8 | 80.4% of pixels differ in icon at (979, 22): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (1 region, 16×16px; design 20×19 resampled onto 16×16) |
| major | position | text | 29/29 | 521 (×594) | x -30.5..1243.9→13.7..1225, y -5.4..1421.9→17.5..1045 | "&" is offset by (-59.7, 1.3)px from the design position |
| major | extra-element | text | 29/29 | 325 |  | implementation renders "4" (9×14) that the design does not have |
| major | size | text | 29/29 | 161 (×275) | w 3..512→5..517, h 8.7..88.7→12..108 | "Požiadať o doklad" renders 102×14, design says 120×16 |
| major | extra-element | surface | 27/29 | 193 |  | implementation renders surface at (0, 0) (240×900) that the design does not have |
| major | spacing | text | 24/29 | 72 (×143) | vertical gap 0..55.5→4..65 | vertical gap between "Správy" and "Požiadavky" is 33px, design says 23.2px ×3 |
| major | color | text | 18/29 | 21 (×30) | color=rgb(44, 36, 25) → color=rgb(138, 125, 108) | "Portfólio" text color is rgb(138, 125, 108), design says rgb(44, 36, 25) (ΔE2000 31.2) |
| major | size | surface | 15/29 | 29 (×41) | w 10.2..399.9→16..402, h 18.5..1040.4→14..1080 | surface at (85, 360) renders 79×14, design says 87×18 |
| major | spacing | text | 15/29 | 28 (×31) | horizontal gap 2.9..54.9→8..135.8 | horizontal gap between "Exportovať" and "Požiadať o doklad" is 40px, design says 43.4px |
| major | border-radius | text | 15/29 | 19 (×28) | borderRadius=9 → borderRadius=0 | "Portfólio" border-radius is 0px, design says 9px |
| major | position | box | 13/29 | 23 (×29) | x 17.6..1062.6→16..1031, y 18.1..748→19..759 | box at (293, 99) is offset by (-23.1, 49.8)px from the design position |
| major | position | surface | 13/29 | 23 (×36) | x -28.8..962→0..1014, y 1..963.4→0..1012.5 | surface at (85, 360) is offset by (41.9, 32.5)px from the design position |
| major | extra-element | box | 13/29 | 18 |  | implementation renders box at (16, 294) (278×36) that the design does not have |
| major | color | text | 12/29 | 12 (×69) | color=rgb(95, 85, 70) → color=rgb(138, 125, 108) | "Prehľad" text color is rgb(138, 125, 108), design says rgb(95, 85, 70) (ΔE2000 15.6) ×9 |
| major | size | box | 11/29 | 13 | w 1.1..331→8..351, h 0.9..105.2→1..40 | box at (293, 99) renders 230×32, design says 246×37 |
| major | border-radius | text | 11/29 | 13 (×19) | borderRadius=0 → borderRadius=12 | "Správy" border-radius is 12px, design says 0px |
| major | color | text | 10/29 | 11 (×15) | color=rgb(255, 253, 249) → color=rgb(138, 125, 108) | "2" text color is rgb(138, 125, 108), design says rgb(255, 253, 249) (ΔE2000 34.1) |
| major | position | icon | 10/29 | 10 | x 282..1211.5→303.5..1221.5, y 19.5..38.3→21.5..39.5 | icon at (1208, 38) is offset by (13.6, 1.2)px from the design position |
| major | border | text | 9/29 | 14 | borderWidth=0 → borderWidth=1 borderColor=rgb(224, 213, 196) | "Filter" border differs: border the design does not have |
| major | color | text | 9/29 | 13 | color=rgb(138, 125, 108) → color=rgb(44, 36, 25) | "nevyriešených" text color is rgb(44, 36, 25), design says rgb(138, 125, 108) (ΔE2000 31.2) |
| major | border | icon | 7/29 | 7 | borderWidth=0 → borderWidth=1 borderColor=rgb(232, 223, 210) | icon at (1208, 38) border differs: border the design does not have |
| major | border-radius | text | 6/29 | 10 | borderRadius=8 → borderRadius=0 | "6" border-radius is 0px, design says 8px |
| major | color | text | 6/29 | 8 (×10) | color=rgb(95, 85, 70) → color=rgb(44, 36, 25) | "Exportovať" text color is rgb(44, 36, 25), design says rgb(95, 85, 70) (ΔE2000 16.2) |
| major | color | text | 6/29 | 7 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(244, 237, 226) | "MH" background is rgb(244, 237, 226), design says rgb(184, 92, 36) (ΔE2000 40.7) |
| major | border-radius | text | 6/29 | 6 | borderRadius=0 → borderRadius=18 | "Filter" border-radius is 18px, design says 0px |
| major | missing-element | icon | 5/29 | 6 |  | design icon at (1087, 37) (22×21) has no counterpart in the implementation |
| major | border-radius | icon | 5/29 | 5 | borderRadius=0 → borderRadius=19 | icon at (1208, 38) border-radius is 19px, design says 0px |
| major | color | text | 4/29 | 7 (×9) | color=rgb(184, 92, 36) → color=rgb(44, 36, 25) | "Žiadosť o doklad" text color is rgb(44, 36, 25), design says rgb(184, 92, 36) (ΔE2000 34.7) ×3 |
| major | color | text | 4/29 | 6 | color=rgb(185, 171, 151) → color=rgb(44, 36, 25) | "ÚČTOVNÉ PARAMETRE" text color is rgb(44, 36, 25), design says rgb(185, 171, 151) (ΔE2000 51.2) |
| major | spacing | surface | 4/29 | 5 | vertical gap 19.9..41.8→23..51.7 | vertical gap between surface at (346, 17) and "Viac" is 23px, design says 20.5px |
| major | color | text | 4/29 | 4 | color=rgb(138, 125, 108) → color=rgb(184, 92, 36) | "Exportovať" text color is rgb(184, 92, 36), design says rgb(138, 125, 108) (ΔE2000 20.6) |
| major | border | surface | 4/29 | 4 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=0 | surface at (346, 17) border differs: no border, design has one |
| major | border-radius | icon | 4/29 | 4 (×7) | borderRadius=0 → borderRadius=18 | icon at (356, 28) border-radius is 18px, design says 0px ×4 |
| major | border | text | 4/29 | 4 (×6) | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=0 | "Požiadať" border differs: no border, design has one ×3 |
| major | color | text | 4/29 | 4 | color=rgb(95, 85, 70) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "Jazyk a región" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(95, 85, 70) (ΔE2000 30.7) |
| major | color | text | 4/29 | 4 | color=rgb(168, 154, 133) → color=rgb(138, 125, 108) | "Prepnúť organizáciu" text color is rgb(138, 125, 108), design says rgb(168, 154, 133) (ΔE2000 10.1) |
| major | typography | text | 4/29 | 4 | fontSize=9.5 → fontSize=12 | "Prepnúť organizáciu" typography differs: size 12px vs 9.5px |
| major | color | text | 3/29 | 4 (×13) | color=rgb(185, 171, 151) → color=rgb(138, 125, 108) | "VYŽADUJE AKCIU" text color is rgb(138, 125, 108), design says rgb(185, 171, 151) (ΔE2000 15) ×6 |
| major | color | text | 3/29 | 3 | color=rgb(138, 125, 108) → color=rgb(255, 253, 249) | "▾" text color is rgb(255, 253, 249), design says rgb(138, 125, 108) (ΔE2000 34.1) |
| major | border-radius | text | 3/29 | 3 | borderRadius=0 → borderRadius=11 | "▾" border-radius is 11px, design says 0px |
| major | border-radius | text | 3/29 | 3 | borderRadius=8 → borderRadius=18 | "2" border-radius is 18px, design says 8px |
| major | border | text | 3/29 | 3 | borderWidth=0 → borderWidth=1 borderColor=rgb(232, 223, 210) | "Zavrieť obdobie" border differs: border the design does not have |
| major | border | text | 3/29 | 3 | borderWidth=0 → borderWidth=1 borderColor=rgba(232, 223, 210, 0.5) | "~2× týždenne" border differs: border the design does not have |
| major | spacing | box | 3/29 | 3 | horizontal gap 15.4..61→8..33 | horizontal gap between box at (159, 24) and "Nastavenia" is 8px, design says 15.5px |
| major | color | text | 3/29 | 3 | color=rgb(44, 36, 25) → color=rgb(248, 243, 236) | "Nastavenia" text color is rgb(248, 243, 236), design says rgb(44, 36, 25) (ΔE2000 76.6) |
| major | color | text | 3/29 | 3 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(184, 92, 36) | "Uložiť zmeny" background is rgb(184, 92, 36), design says rgb(44, 36, 25) (ΔE2000 34.7) |
| major | color | text | 3/29 | 3 | color=rgb(185, 171, 151) → color=rgb(95, 85, 70) | "Včera" text color is rgb(95, 85, 70), design says rgb(185, 171, 151) (ΔE2000 32.8) |
| major | typography | text | 2/29 | 4 | fontSize=12 → fontSize=16 | "‹ Späť do aplikácie" typography differs: size 16px vs 12px |
| major | color | text | 2/29 | 3 | color=rgb(78, 122, 90) → color=rgb(138, 125, 108) | "Návrh 96 %" text color is rgb(138, 125, 108), design says rgb(78, 122, 90) (ΔE2000 22.3) |
| major | color | text | 2/29 | 3 | color=rgb(143, 95, 28) → color=rgb(138, 125, 108) | "⇄" text color is rgb(138, 125, 108), design says rgb(143, 95, 28) (ΔE2000 17.7) |
| major | typography | text | 2/29 | 3 | fontSize=10 → fontSize=14 | "ČAKÁ NA VLASTNÍKA" typography differs: size 14px vs 10px |
| major | typography | text | 2/29 | 3 | fontFamily=Public Sans fontSize=11 fontWeight=600 → fontFamily=Newsreader fontSize=18 fontWeight=500 | "ÚČTOVNÉ PARAMETRE" typography differs: family "Newsreader" vs "Public Sans", size 18px vs 11px, weight 500 vs 600 |
| major | typography | text | 2/29 | 3 | fontFamily=Public Sans fontSize=12 fontWeight=600 → fontFamily=Newsreader fontSize=18 fontWeight=500 | "ÚČTOVNÉ PARAMETRE" typography differs: family "Newsreader" vs "Public Sans", size 18px vs 12px, weight 500 vs 600 |
| major | border | text | 2/29 | 3 | borderWidth=1 borderColor=rgb(184, 92, 36) → borderWidth=0 | "Bloček mám odfotený v mobile, nahrám ho …" border differs: no border, design has one |
| major | border-radius | text | 2/29 | 3 | borderRadius=17 → borderRadius=0 | "Preposlať e-mailom" border-radius is 0px, design says 17px |
| major | border | text | 2/29 | 3 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=0 | "Dobrý deň, poslali sme zálohu 1 200 € na…" border differs: no border, design has one |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(255, 253, 249) | "2" background is rgb(255, 253, 249), design says rgb(178, 60, 46) (ΔE2000 50.4) |
| major | border-radius | text | 2/29 | 2 | borderRadius=0 → borderRadius=10 | "Exportovať" border-radius is 10px, design says 0px |
| major | pixel-region | frame | 2/29 | 2 | unexplainedDiffRatio 0→0..0.1 | 8.37% of the frame differs OUTSIDE every matched element — nothing in the element model covers it, so no per-element finding can. 325 region(s); largest: 1031×475 at (0, 265); 207×57 at (966, 14); 290×5 at (617, 146). A container's background, border, radius or width is the usual cause: containers are not leaf elements, so they are never matched and never diffed. |
| major | color | text | 2/29 | 2 | color=rgb(95, 85, 70) → color=lab(33.7174 55.8993 41.0293) | "25. 7. · o 11 dní" text color is lab(33.7174 55.8993 41.0293), design says rgb(95, 85, 70) (ΔE2000 26.3) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(44, 74, 110) | "KP" background is rgb(44, 74, 110), design says rgb(184, 92, 36) (ΔE2000 42.7) |
| major | color | box | 2/29 | 2 | backgroundColor=rgb(160, 111, 20) → backgroundColor=rgb(178, 60, 46) | box at (516, 315) background is rgb(178, 60, 46), design says rgb(160, 111, 20) (ΔE2000 26.9) |
| major | color | box | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(78, 122, 90) | box at (516, 381) background is rgb(78, 122, 90), design says rgb(178, 60, 46) (ΔE2000 48.2) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(78, 122, 90) → backgroundColor=rgb(185, 132, 25) | "ŠL" background is rgb(185, 132, 25), design says rgb(78, 122, 90) (ΔE2000 32.7) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(138, 125, 108) → backgroundColor=rgb(184, 92, 36) | "PD" background is rgb(184, 92, 36), design says rgb(138, 125, 108) (ΔE2000 20.6) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(244, 237, 226) | "2" background is rgb(244, 237, 226), design says rgb(178, 60, 46) (ΔE2000 47.6) |
| major | typography | text | 2/29 | 2 | fontSize=9.5 lineHeight=16 fontWeight=600 → fontSize=14 lineHeight=20 fontWeight=400 | "2" typography differs: size 14px vs 9.5px, line-height 20px vs 16px, weight 400 vs 600 |
| major | color | text | 2/29 | 2 | color=rgb(248, 243, 236) → color=rgb(44, 36, 25) | "Zavrieť obdobie" text color is rgb(44, 36, 25), design says rgb(248, 243, 236) (ΔE2000 76.6) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(248, 243, 236) | "Zavrieť obdobie" background is rgb(248, 243, 236), design says rgb(44, 36, 25) (ΔE2000 76.6) |
| major | color | text | 2/29 | 2 | color=rgb(178, 60, 46) → color=rgb(138, 125, 108) | "najstaršia 12 dní" text color is rgb(138, 125, 108), design says rgb(178, 60, 46) (ΔE2000 25.7) |
| major | color | text | 2/29 | 2 | color=rgb(143, 95, 28) → color=rgba(44, 36, 25, 0.5) | "~2× týždenne" text color is rgba(44, 36, 25, 0.5), design says rgb(143, 95, 28) (ΔE2000 25.8) |
| major | color | text | 2/29 | 2 | color=rgb(44, 36, 25) → color=lab(37.8822 37.1699 52.2718) | "24,90 €" text color is lab(37.8822 37.1699 52.2718), design says rgb(44, 36, 25) (ΔE2000 27.6) |
| major | color | text | 2/29 | 2 | color=rgb(95, 85, 70) → color=rgb(253, 251, 247) | "Notifikácie" text color is rgb(253, 251, 247), design says rgb(95, 85, 70) (ΔE2000 49.7) |
| major | color | text | 2/29 | 2 | color=rgb(168, 154, 133) → color=oklab(0.265965 0.00576137 0.0220057 / 0.75) | "ORGANIZÁCIA" text color is oklab(0.265965 0.00576137 0.0220057 / 0.75), design says rgb(168, 154, 133) (ΔE2000 25.7) |
| major | typography | text | 2/29 | 2 | fontSize=12 fontWeight=600 → fontSize=16 fontWeight=500 | "Nastavenia" typography differs: size 16px vs 12px, weight 500 vs 600 |
| major | typography | text | 2/29 | 2 | fontSize=10 fontWeight=600 → fontSize=13 fontWeight=500 | "ORGANIZÁCIA" typography differs: size 13px vs 10px, weight 500 vs 600 |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(44, 36, 25) | "MH" background is rgb(44, 36, 25), design says rgb(184, 92, 36) (ΔE2000 34.7) |
| major | color | text | 2/29 | 2 | color=rgb(95, 85, 70) → color=rgb(248, 243, 236) | "Notifikácie a súhrn" text color is rgb(248, 243, 236), design says rgb(95, 85, 70) (ΔE2000 48.2) |
| major | typography | text | 2/29 | 2 | fontFamily=Newsreader fontSize=16 → fontFamily=Public Sans fontSize=14 | "Nastavenia" typography differs: family "Public Sans" vs "Newsreader", size 14px vs 16px |
| major | color | surface | 2/29 | 2 | backgroundColor=rgb(78, 122, 90) → backgroundColor=rgb(184, 92, 36) | surface at (982, 163) background is rgb(184, 92, 36), design says rgb(78, 122, 90) (ΔE2000 40.7) |
| major | color | text | 2/29 | 2 (×6) | backgroundColor=rgb(95, 85, 70) → backgroundColor=rgb(244, 237, 226) | "MH" background is rgb(244, 237, 226), design says rgb(95, 85, 70) (ΔE2000 47) ×3 |
| major | border-radius | text | 2/29 | 2 | borderRadius=18 → borderRadius=0 | "MH" border-radius is 0px, design says 18px |
| major | border-radius | text | 2/29 | 2 (×5) | borderRadius=16 → borderRadius=0 | "Bloček mám odfotený v mobile, nahrám ho …" border-radius is 0px, design says 16px |
| major | border-radius | text | 2/29 | 2 | borderRadius=19 → borderRadius=0 | "MH" border-radius is 0px, design says 19px |
| major | typography | text | 2/29 | 2 | fontFamily=Newsreader fontSize=16 fontWeight=600 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "Kaviareň Prameň" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 16px, weight 400 vs 600 |
| major | typography | text | 2/29 | 2 | fontFamily=Public Sans fontSize=10 fontWeight=400 → fontFamily=Newsreader fontSize=14 fontWeight=600 | "klient · Hrubá & Co." typography differs: family "Newsreader" vs "Public Sans", size 14px vs 10px, weight 600 vs 400 |
| major | color | text | 1/29 | 2 | color=rgb(44, 36, 25) → color=rgba(44, 36, 25, 0.5) | "Pripomenúť" text color is rgba(44, 36, 25, 0.5), design says rgb(44, 36, 25) (ΔE2000 39.2) |
| major | spacing | box | 1/29 | 2 | vertical gap 39.5→53 | vertical gap between box at (62, 405) and box at (62, 456) is 53px, design says 39.5px |
| major | typography | text | 1/29 | 2 | fontFamily=Newsreader fontSize=24 fontWeight=500 → fontFamily=Public Sans fontSize=14 fontWeight=600 | "7" typography differs: family "Public Sans" vs "Newsreader", size 14px vs 24px, weight 600 vs 500 |
| major | color | text | 1/29 | 2 | color=rgb(143, 95, 28) → color=rgb(44, 36, 25) | "Vyžaduje pozornosť" text color is rgb(44, 36, 25), design says rgb(143, 95, 28) (ΔE2000 28.3) |
| major | typography | text | 1/29 | 2 | fontSize=10.5 fontWeight=400 → fontSize=14 fontWeight=600 | "Transakcie" typography differs: size 14px vs 10.5px, weight 600 vs 400 |
| major | color | text | 1/29 | 2 | color=rgb(44, 36, 25) → color=lab(27.3812 1.32917 3.57789) | "Dobrý deň, poslali sme zálohu 1 200 € na…" text color is lab(27.3812 1.32917 3.57789), design says rgb(44, 36, 25) (ΔE2000 9.7) |
| major | color | text | 1/29 | 2 | color=rgb(255, 253, 249) → color=lab(31.2288 30.2627 40.0378) | "Stačí zálohová faktúra alebo potvrdenie …" text color is lab(31.2288 30.2627 40.0378), design says rgb(255, 253, 249) (ΔE2000 60.9) |
| major | border-radius | text | 1/29 | 2 | borderRadius=0 → borderRadius=14 | "16:02" border-radius is 14px, design says 0px |
| major | color | text | 1/29 | 2 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(255, 253, 249) | "KP" background is rgb(255, 253, 249), design says rgb(184, 92, 36) (ΔE2000 44.2) |
| major | typography | text | 1/29 | 2 | fontFamily=Newsreader fontSize=13 → fontFamily=Public Sans fontSize=11 | "Vyžaduje akciu" typography differs: family "Public Sans" vs "Newsreader", size 11px vs 13px |
| major | border-radius | text | 1/29 | 2 | borderRadius=0 → borderRadius=12.25 | "Vlastníčka" border-radius is 12.25px, design says 0px |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=rgb(95, 85, 70) | "84,20 €" text color is rgb(95, 85, 70), design says rgb(44, 36, 25) (ΔE2000 16.2) |
| major | color | text | 1/29 | 1 | color=rgb(78, 122, 90) → color=rgb(248, 243, 236) | "Návrh 96 %" text color is rgb(248, 243, 236), design says rgb(78, 122, 90) (ΔE2000 41.9) |
| major | color | text | 1/29 | 1 | color=rgb(78, 122, 90) → color=rgb(95, 85, 70) | "Platba kartou ·· 4412 · zhoda 96 %" text color is rgb(95, 85, 70), design says rgb(78, 122, 90) (ΔE2000 22.8) |
| major | border | text | 1/29 | 1 | borderWidth=0 → borderWidth=1 borderColor=rgb(44, 36, 25) | "Návrh 96 %" border differs: border the design does not have |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=13 fontWeight=600 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "Júl 2026" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 13px, weight 400 vs 600 |
| major | border | box | 1/29 | 1 | borderWidth=1 borderColor=rgb(253, 251, 247) → borderWidth=0 | box at (991, 18) border differs: no border, design has one |
| major | color | text | 1/29 | 1 | color=rgb(185, 132, 25) → color=rgb(160, 111, 20) | "Vyžadujú pozornosť" text color is rgb(160, 111, 20), design says rgb(185, 132, 25) (ΔE2000 8.2) |
| major | color | box | 1/29 | 1 | backgroundColor=rgb(185, 132, 25) → backgroundColor=rgb(160, 111, 20) | box at (750, 114) background is rgb(160, 111, 20), design says rgb(185, 132, 25) (ΔE2000 8.2) |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=rgba(44, 36, 25, 0.6) | "2" text color is rgba(44, 36, 25, 0.6), design says rgb(44, 36, 25) (ΔE2000 30.3) |
| major | color | surface | 1/29 | 1 | backgroundColor=rgb(248, 230, 226) → backgroundColor=oklab(0.537988 -0.0618201 0.0327166 / 0.1) | surface at (505, 373) background is oklab(0.537988 -0.0618201 0.0327166 / 0.1), design says rgb(248, 230, 226) (ΔE2000 10.6) |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(95, 85, 70) → backgroundColor=rgb(185, 132, 25) | "AT" background is rgb(185, 132, 25), design says rgb(95, 85, 70) (ΔE2000 29.2) |
| major | border-radius | text | 1/29 | 1 (×3) | borderRadius=0 → borderRadius=12.57 | "Po termíne" border-radius is 12.57px, design says 0px ×3 |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=rgb(160, 111, 20) | "Hrubá Co." text color is rgb(160, 111, 20), design says rgb(44, 36, 25) (ΔE2000 34.2) |
| major | color | text | 1/29 | 1 | color=rgb(184, 92, 36) → color=rgba(44, 36, 25, 0.6) | "&" text color is rgba(44, 36, 25, 0.6), design says rgb(184, 92, 36) (ΔE2000 23.5) |
| major | color | box | 1/29 | 1 | backgroundColor=rgb(78, 122, 90) → backgroundColor=rgb(185, 132, 25) | box at (62, 508) background is rgb(185, 132, 25), design says rgb(78, 122, 90) (ΔE2000 32.7) |
| major | color | box | 1/29 | 1 | backgroundColor=rgb(160, 111, 20) → backgroundColor=rgb(78, 122, 90) | box at (62, 610) background is rgb(78, 122, 90), design says rgb(160, 111, 20) (ΔE2000 30.4) |
| major | border | box | 1/29 | 1 | borderWidth=2 borderColor=rgb(255, 253, 249) → borderWidth=0 | box at (62, 508) border differs: no border, design has one |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=20 fontWeight=600 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "Hrubá Co." typography differs: family "Public Sans" vs "Newsreader", size 12px vs 20px, weight 400 vs 600 |
| major | typography | text | 1/29 | 1 | fontSize=11 fontWeight=400 → fontSize=14 fontWeight=500 | "nevyriešených" typography differs: size 14px vs 11px, weight 500 vs 400 |
| major | color | text | 1/29 | 1 | color=rgb(138, 125, 108) → color=rgb(95, 85, 70) | "STAV" text color is rgb(95, 85, 70), design says rgb(138, 125, 108) (ΔE2000 15.6) |
| major | typography | text | 1/29 | 1 | fontSize=10 fontWeight=400 → fontSize=13 fontWeight=500 | "klient · Hrubá & Co." typography differs: size 13px vs 10px, weight 500 vs 400 |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=12 fontWeight=600 → fontFamily=Newsreader fontSize=26 fontWeight=500 | "Doklady · Kaviareň Prameň" typography differs: family "Newsreader" vs "Public Sans", size 26px vs 12px, weight 500 vs 600 |
| major | color | text | 1/29 | 1 | color=rgb(95, 85, 70) → color=rgba(44, 36, 25, 0.5) | "Pripomenúť" text color is rgba(44, 36, 25, 0.5), design says rgb(95, 85, 70) (ΔE2000 24.3) |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=rgb(184, 92, 36) | "Požiadať" text color is rgb(184, 92, 36), design says rgb(44, 36, 25) (ΔE2000 34.7) |
| major | color | box | 1/29 | 1 | backgroundColor=rgb(78, 122, 90) → backgroundColor=rgb(244, 237, 226) | box at (840, 298) background is rgb(244, 237, 226), design says rgb(78, 122, 90) (ΔE2000 40.8) |
| major | color | text | 1/29 | 1 | color=rgb(138, 125, 108) → color=lab(37.8822 37.1699 52.2718) | "▤" text color is lab(37.8822 37.1699 52.2718), design says rgb(138, 125, 108) (ΔE2000 25.9) |
| major | color | text | 1/29 | 1 | color=rgb(143, 95, 28) → color=lab(37.8822 37.1699 52.2718) | "2 dni" text color is lab(37.8822 37.1699 52.2718), design says rgb(143, 95, 28) (ΔE2000 13.5) |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=24 fontWeight=500 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "132" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 24px, weight 400 vs 500 |
| major | color | text | 1/29 | 1 | color=rgb(138, 125, 108) → color=rgba(44, 36, 25, 0.5) | "Transakcie" text color is rgba(44, 36, 25, 0.5), design says rgb(138, 125, 108) (ΔE2000 9.1) |
| major | color | text | 1/29 | 1 | color=rgb(178, 60, 46) → color=rgb(44, 36, 25) | "⇄" text color is rgb(44, 36, 25), design says rgb(178, 60, 46) (ΔE2000 31.8) |
| major | border | text | 1/29 | 1 | borderWidth=1 borderColor=rgb(240, 223, 192) → borderWidth=0 | "Vyžaduje pozornosť" border differs: no border, design has one |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=11.5 fontWeight=600 → fontFamily=Newsreader fontSize=26 fontWeight=500 | "Vyžaduje pozornosť" typography differs: family "Newsreader" vs "Public Sans", size 26px vs 11.5px, weight 500 vs 600 |
| major | border-radius | text | 1/29 | 1 | borderRadius=12 → borderRadius=0 | "Vyžaduje pozornosť" border-radius is 0px, design says 12px |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=20 fontWeight=500 → fontFamily=Public Sans fontSize=14 fontWeight=400 | "218" typography differs: family "Public Sans" vs "Newsreader", size 14px vs 20px, weight 400 vs 500 |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=12 → fontFamily=Newsreader fontSize=14 | "Správy" typography differs: family "Newsreader" vs "Public Sans", size 14px vs 12px |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=11 fontWeight=400 → fontFamily=Newsreader fontSize=26 fontWeight=500 | "Blokuje uzávierku Júl · najstaršia čaká …" typography differs: family "Newsreader" vs "Public Sans", size 26px vs 11px, weight 500 vs 400 |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "Organizácia" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(44, 36, 25) (ΔE2000 47.5) |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=25 fontWeight=500 → fontFamily=Public Sans fontSize=12 fontWeight=600 | "Organizácia" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 25px, weight 600 vs 500 |
| major | border-radius | text | 1/29 | 1 | borderRadius=0 → borderRadius=8 | "IČO" border-radius is 8px, design says 0px |
| major | border-radius | text | 1/29 | 1 | borderRadius=21 → borderRadius=12 | "Uložiť" border-radius is 12px, design says 21px |
| major | color | text | 1/29 | 1 | color=rgb(168, 154, 133) → color=rgb(255, 253, 249) | "▾" text color is rgb(255, 253, 249), design says rgb(168, 154, 133) (ΔE2000 25.2) |
| major | border-radius | text | 1/29 | 1 | borderRadius=0 → borderRadius=9.6 | "DIČ" border-radius is 9.6px, design says 0px |
| major | typography | text | 1/29 | 1 | fontSize=16 fontWeight=600 → fontSize=26 fontWeight=500 | "Nastavenia" typography differs: size 26px vs 16px, weight 500 vs 600 |
| major | color | text | 1/29 | 1 | color=rgb(248, 243, 236) → color=rgb(95, 85, 70) | "Všetky" text color is rgb(95, 85, 70), design says rgb(248, 243, 236) (ΔE2000 48.2) |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(255, 253, 249) | "Všetky" background is rgb(255, 253, 249), design says rgb(44, 36, 25) (ΔE2000 77.8) |
| major | color | text | 1/29 | 1 | color=rgb(184, 92, 36) → color=rgb(138, 125, 108) | "Žiadosť o doklad" text color is rgb(138, 125, 108), design says rgb(184, 92, 36) (ΔE2000 20.6) |
| major | color | text | 1/29 | 1 | color=rgb(185, 171, 151) → color=lab(31.2288 30.2627 40.0378) | "Martin Hruška" text color is lab(31.2288 30.2627 40.0378), design says rgb(185, 171, 151) (ΔE2000 43.9) |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=lab(31.2288 30.2627 40.0378) | "Dobrý deň, k platbe Slovnaft, a.s. z 8. …" text color is lab(31.2288 30.2627 40.0378), design says rgb(44, 36, 25) (ΔE2000 22.4) |
| major | color | text | 1/29 | 1 | color=rgb(95, 85, 70) → color=lab(27.3812 1.32917 3.57789) | "Preposlať e-mailom" text color is lab(27.3812 1.32917 3.57789), design says rgb(95, 85, 70) (ΔE2000 9) |
| major | color | text | 1/29 | 1 | color=rgb(255, 253, 249) → color=lab(27.3812 1.32917 3.57789) | "Bloček mám odfotený v mobile, nahrám ho …" text color is lab(27.3812 1.32917 3.57789), design says rgb(255, 253, 249) (ΔE2000 60.6) |
| major | border | text | 1/29 | 1 | borderWidth=1 borderColor=rgb(44, 36, 25) → borderWidth=1 borderColor=rgb(224, 213, 196) | "Všetky" border differs: color rgb(224, 213, 196) vs rgb(44, 36, 25) (ΔE2000 70.9) |
| major | typography | text | 1/29 | 1 | fontSize=13 fontWeight=500 → fontSize=9.5 fontWeight=700 | "Dnes" typography differs: size 9.5px vs 13px, weight 700 vs 500 |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=38 lineHeight=43.7 fontWeight=500 → fontFamily=Public Sans fontSize=22 lineHeight=33 fontWeight=700 | "Správy" typography differs: family "Public Sans" vs "Newsreader", size 22px vs 38px, line-height 33px vs 43.7px, weight 700 vs 500 |
| major | border-radius | text | 1/29 | 1 | borderRadius=22 → borderRadius=9.6 | "＋ Nová žiadosť" border-radius is 9.6px, design says 22px |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=21 lineHeight=25.2 fontWeight=500 → fontFamily=Public Sans fontSize=18 lineHeight=27 fontWeight=600 | "Slovnaft, a.s. — chýba doklad" typography differs: family "Public Sans" vs "Newsreader", size 18px vs 21px, line-height 27px vs 25.2px, weight 600 vs 500 |
| major | typography | text | 1/29 | 1 | fontSize=12.5 lineHeight=19.38 → fontSize=16 lineHeight=24 | "Dobrý deň, k platbe Slovnaft, a.s. z 8. …" typography differs: size 16px vs 12.5px, line-height 24px vs 19.38px |
| major | typography | text | 1/29 | 1 | fontSize=11 fontWeight=500 → fontSize=14 fontWeight=400 | "⇄" typography differs: size 14px vs 11px, weight 400 vs 500 |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=28 fontWeight=500 → fontFamily=Public Sans fontSize=22 fontWeight=700 | "Správy" typography differs: family "Public Sans" vs "Newsreader", size 22px vs 28px, weight 700 vs 500 |
| major | typography | text | 1/29 | 1 | fontSize=9.5 fontWeight=600 → fontSize=12 fontWeight=500 | "Nahrať" typography differs: size 12px vs 9.5px, weight 500 vs 600 |
| major | color | text | 1/29 | 1 | color=rgb(184, 92, 36) → color=rgb(95, 85, 70) | "Otázka" text color is rgb(95, 85, 70), design says rgb(184, 92, 36) (ΔE2000 24) |
| major | color | text | 1/29 | 1 | color=rgb(138, 125, 108) → color=rgba(138, 125, 108, 0.7) | "＋" text color is rgba(138, 125, 108, 0.7), design says rgb(138, 125, 108) (ΔE2000 13.1) |
| major | typography | text | 1/29 | 1 | fontSize=9 fontWeight=600 → fontSize=14 fontWeight=400 | "ZK" typography differs: size 14px vs 9px, weight 400 vs 600 |
| major | typography | text | 1/29 | 1 | fontSize=16 → fontSize=11 | "＋" typography differs: size 11px vs 16px |
| major | border-radius | text | 1/29 | 1 | borderRadius=20 → borderRadius=0 | "＋" border-radius is 0px, design says 20px |
| major | color | text | 1/29 | 1 | color=rgb(95, 85, 70) → color=rgb(255, 253, 249) | "‹" text color is rgb(255, 253, 249), design says rgb(95, 85, 70) (ΔE2000 50.1) |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(184, 92, 36) | "‹" background is rgb(184, 92, 36), design says rgb(255, 253, 249) (ΔE2000 44.2) |
| major | color | text | 1/29 | 1 | color=rgb(255, 253, 249) → color=rgb(95, 85, 70) | "ZK" text color is rgb(95, 85, 70), design says rgb(255, 253, 249) (ΔE2000 50.1) |
| major | color | text | 1/29 | 1 | color=rgb(255, 253, 249) → color=rgb(44, 36, 25) | "ZK" text color is rgb(44, 36, 25), design says rgb(255, 253, 249) (ΔE2000 77.8) |
| major | border-radius | text | 1/29 | 1 | borderRadius=10 → borderRadius=0 | "＋ Pozvať člena" border-radius is 0px, design says 10px |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(78, 122, 90) | "PK" background is rgb(78, 122, 90), design says rgb(44, 36, 25) (ΔE2000 33.2) |
| minor | extra-element | icon | 28/29 | 110 |  | implementation renders icon at (972, 202) (14×14) that the design does not have |
| minor | pixel-region |  | 27/29 | 27 | alignmentConfidence 0.5→0..0.4 | pixel channel skipped: alignment confidence 0.00 is below 0.5 — element geometry did not line up well enough to compare pixels |
| minor | text-content | text | 25/29 | 230 |  | text reads "Kaviareň Prameň · s.r.o. · DPH mesačne", design says "3 na vybavenie · DPH termín o 11 dní" |
| minor | extra-element | backdrop | 23/29 | 32 |  | implementation renders backdrop at (0, 0) (1280×900) that the design does not have |
| minor | typography | text | 15/29 | 17 (×26) | fontSize=11 → fontSize=12 | "KP" typography differs: size 12px vs 11px |
| minor | typography | text | 14/29 | 18 | fontSize=10 → fontSize=12 | "klient · Hrubá & Co." typography differs: size 12px vs 10px |
| minor | typography | text | 13/29 | 16 (×27) | fontWeight=600 → fontWeight=500 | "Portfólio" typography differs: weight 500 vs 600 |
| minor | border-radius | text | 13/29 | 14 (×33) | borderRadius=8 → borderRadius=12 | "Prehľad" border-radius is 12px, design says 8px ×4 |
| minor | typography | text | 9/29 | 11 | fontWeight=500 → fontWeight=600 | "−68,40 €" typography differs: weight 600 vs 500 |
| minor | border-radius | text | 9/29 | 10 (×27) | borderRadius=9 → borderRadius=12 | "⋯" border-radius is 12px, design says 9px ×8 |
| minor | typography | text | 8/29 | 9 (×20) | fontSize=10.5 → fontSize=12 | "KAVIAREŇ PRAMEŇ" typography differs: size 12px vs 10.5px |
| minor | color | text | 7/29 | 9 | color=rgb(248, 243, 236) → color=rgb(255, 253, 249) | "Všetko" text color is rgb(255, 253, 249), design says rgb(248, 243, 236) (ΔE2000 2.6) |
| minor | typography | text | 6/29 | 8 | fontWeight=600 → fontWeight=400 | "Príjem dokladov e-mailom" typography differs: weight 400 vs 600 |
| minor | color | text | 6/29 | 8 | color=rgb(168, 154, 133) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "ÚČET" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(168, 154, 133) (ΔE2000 4.8) |
| minor | typography | text | 6/29 | 7 (×17) | fontSize=10 fontWeight=500 → fontSize=12 fontWeight=400 | "Správy" typography differs: size 12px vs 10px, weight 400 vs 500 |
| minor | typography | text | 6/29 | 7 | fontSize=12.5 → fontSize=14 | "Požiadať o doklad" typography differs: size 14px vs 12.5px |
| minor | typography | text | 6/29 | 6 | fontSize=10 fontWeight=600 → fontSize=12 fontWeight=500 | "Portfólio" typography differs: size 12px vs 10px, weight 500 vs 600 |
| minor | typography | text | 5/29 | 6 (×13) | fontSize=13 → fontSize=14 | "Požiadať o doklad" typography differs: size 14px vs 13px |
| minor | border | text | 5/29 | 5 (×14) | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=1 borderColor=rgb(232, 223, 210) | "Exportovať" border differs: color rgb(232, 223, 210) vs rgb(224, 213, 196) (ΔE2000 2.8) |
| minor | typography | text | 5/29 | 5 (×12) | fontSize=13 fontWeight=600 → fontSize=14 fontWeight=500 | "Kaviareň Prameň" typography differs: size 14px vs 13px, weight 500 vs 600 ×4 |
| minor | border-radius | text | 4/29 | 7 | borderRadius=8 → borderRadius=10 | "Žiadosť o doklad" border-radius is 10px, design says 8px |
| minor | color | text | 4/29 | 6 (×10) | color=rgb(95, 85, 70) → color=oklab(0.265965 0.00576137 0.0220057 / 0.75) | "Profil a účet" text color is oklab(0.265965 0.00576137 0.0220057 / 0.75), design says rgb(95, 85, 70) (ΔE2000 3.9) |
| minor | typography | text | 4/29 | 4 (×22) | fontSize=12 → fontSize=13 | "Prehľad" typography differs: size 13px vs 12px ×7 |
| minor | typography | text | 4/29 | 4 | fontSize=16 → fontSize=14 | "Kaviareň Prameň" typography differs: size 14px vs 16px |
| minor | border-radius | text | 4/29 | 4 | borderRadius=17 → borderRadius=12 | "MH" border-radius is 12px, design says 17px |
| minor | typography | text | 4/29 | 4 | fontSize=13 fontWeight=500 → fontSize=12 fontWeight=600 | "Jazyk a región" typography differs: size 12px vs 13px, weight 600 vs 500 |
| minor | color | text | 4/29 | 4 | color=rgb(95, 85, 70) → color=rgba(44, 36, 25, 0.7) | "Vybavené" text color is rgba(44, 36, 25, 0.7), design says rgb(95, 85, 70) (ΔE2000 7) |
| minor | border | text | 4/29 | 4 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=1 borderColor=rgba(232, 223, 210, 0.7) | "Vybavené" border differs: color rgba(232, 223, 210, 0.7) vs rgb(232, 223, 210) (ΔE2000 2.7) |
| minor | typography | text | 4/29 | 4 | fontSize=12 → fontSize=10.5 | "Vybavené" typography differs: size 10.5px vs 12px |
| minor | typography | text | 3/29 | 4 | fontSize=12.5 fontWeight=600 → fontSize=14 fontWeight=500 | "Štvrťročné" typography differs: size 14px vs 12.5px, weight 500 vs 600 |
| minor | typography | text | 3/29 | 3 (×11) | fontWeight=500 → fontWeight=400 | "9 dokladov" typography differs: weight 400 vs 500 |
| minor | spacing | icon | 3/29 | 3 | vertical gap 30.3..43→33..50 | vertical gap between icon at (1144, 37) and surface at (962, 94) is 33.5px, design says 35.7px |
| minor | alignment |  | 3/29 | 3 | scale=1 offsetX=0 offsetY=0 → scale=0.99028 scaleY=1 offsetX=7.75 offsetY=0 | alignment is not the identity on a same-size page: the fit absorbed scale 0.99028 × 1.00000 (x × y), offset (7.75, 0.00)px — a systematic size difference in the chrome above or beside the anchors (box model?); fix the sizes and the transform snaps to scale 1, offset 0 |
| minor | typography | text | 3/29 | 3 | fontSize=10.5 fontWeight=400 → fontSize=12 fontWeight=600 | "DPH mesačne" typography differs: size 12px vs 10.5px, weight 600 vs 400 |
| minor | border-radius | text | 3/29 | 3 | borderRadius=7 → borderRadius=9.6 | "KP" border-radius is 9.6px, design says 7px |
| minor | typography | text | 3/29 | 3 | fontSize=10.5 fontWeight=400 → fontSize=12 fontWeight=500 | "Martin Hruška" typography differs: size 12px vs 10.5px, weight 500 vs 400 |
| minor | typography | text | 2/29 | 4 | fontSize=18 → fontSize=19 | "účtoinak" typography differs: size 19px vs 18px |
| minor | border | text | 2/29 | 3 | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=1 borderColor=rgba(232, 223, 210, 0.5) | "Pripomenúť" border differs: color rgba(232, 223, 210, 0.5) vs rgb(224, 213, 196) (ΔE2000 7.3) |
| minor | typography | text | 2/29 | 3 | fontSize=13.5 fontWeight=600 → fontSize=12 fontWeight=400 | "Autoservis Turňa" typography differs: size 12px vs 13.5px, weight 400 vs 600 |
| minor | border-radius | text | 2/29 | 2 (×4) | borderRadius=14 → borderRadius=18 | "Všetky · 9" border-radius is 18px, design says 14px |
| minor | typography | text | 2/29 | 2 | fontSize=10 fontWeight=600 → fontSize=12 fontWeight=400 | "DOKLAD" typography differs: size 12px vs 10px, weight 400 vs 600 |
| minor | typography | text | 2/29 | 2 | fontSize=11 fontWeight=400 → fontSize=12 fontWeight=600 | "▾" typography differs: size 12px vs 11px, weight 600 vs 400 |
| minor | border-radius | text | 2/29 | 2 (×4) | borderRadius=10 → borderRadius=12 | "KP" border-radius is 12px, design says 10px ×3 |
| minor | border-radius | text | 2/29 | 2 | borderRadius=8 → borderRadius=11 | "4" border-radius is 11px, design says 8px |
| minor | color | text | 2/29 | 2 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(248, 243, 236) | "Požiadať o doklad" background is rgb(248, 243, 236), design says rgb(255, 253, 249) (ΔE2000 2.6) |
| minor | typography | text | 2/29 | 2 | fontSize=10.5 fontWeight=600 → fontSize=12 fontWeight=400 | "Uzavreté" typography differs: size 12px vs 10.5px, weight 400 vs 600 |
| minor | typography | text | 2/29 | 2 | fontSize=12 → fontSize=14 | "Žiadosť: výpis z terminálu" typography differs: size 14px vs 12px |
| minor | color | text | 2/29 | 2 | color=rgb(213, 201, 182) → color=oklab(0.596632 0.00792834 0.0285945 / 0.5) | "›" text color is oklab(0.596632 0.00792834 0.0285945 / 0.5), design says rgb(213, 201, 182) (ΔE2000 5.2) |
| minor | color | text | 2/29 | 2 | color=rgb(168, 154, 133) → color=oklab(0.596632 0.00792834 0.0285945 / 0.8) | "Org-nastavenia platia len pre vybranú or…" text color is oklab(0.596632 0.00792834 0.0285945 / 0.8), design says rgb(168, 154, 133) (ΔE2000 3.1) |
| minor | typography | text | 2/29 | 2 | fontSize=13 fontWeight=500 → fontSize=14 fontWeight=600 | "Zabezpečenie" typography differs: size 14px vs 13px, weight 600 vs 500 |
| minor | typography | text | 2/29 | 2 | fontSize=10 lineHeight=15 → fontSize=12 lineHeight=18 | "Org-nastavenia platia len pre vybranú or…" typography differs: size 12px vs 10px, line-height 18px vs 15px |
| minor | color | text | 2/29 | 2 | color=rgb(255, 253, 249) → color=rgb(248, 243, 236) | "MH" text color is rgb(248, 243, 236), design says rgb(255, 253, 249) (ΔE2000 2.6) |
| minor | typography | text | 2/29 | 2 | fontSize=13 fontWeight=500 → fontSize=14 fontWeight=400 | "‹ Späť do portfólia" typography differs: size 14px vs 13px, weight 400 vs 500 |
| minor | typography | text | 2/29 | 2 | fontSize=25 → fontSize=24 | "Predvoľby portfólia" typography differs: size 24px vs 25px |
| minor | color | box | 2/29 | 2 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(248, 243, 236) | box at (1004, 167) background is rgb(248, 243, 236), design says rgb(255, 253, 249) (ΔE2000 2.6) |
| minor | typography | text | 2/29 | 2 | fontSize=10.5 fontWeight=600 → fontSize=13 fontWeight=500 | "KAVIAREŇ PRAMEŇ" typography differs: size 13px vs 10.5px, weight 500 vs 600 |
| minor | border-radius | text | 2/29 | 2 (×4) | borderRadius=18 → borderRadius=16 | "MH" border-radius is 16px, design says 18px ×3 |
| minor | typography | text | 2/29 | 2 | fontSize=11.5 fontWeight=600 → fontSize=14 fontWeight=400 | "ZK" typography differs: size 14px vs 11.5px, weight 400 vs 600 |
| minor | border-radius | text | 2/29 | 2 | borderRadius=14 → borderRadius=10 | "Vybavené" border-radius is 10px, design says 14px |
| minor | typography | text | 1/29 | 2 | fontSize=14 fontWeight=400 → fontSize=12 fontWeight=600 | "⇄" typography differs: size 12px vs 14px, weight 600 vs 400 |
| minor | typography | text | 1/29 | 2 | fontSize=13 fontWeight=400 → fontSize=14 fontWeight=600 | "⇄" typography differs: size 14px vs 13px, weight 600 vs 400 |
| minor | typography | text | 1/29 | 2 | fontSize=12 fontWeight=500 → fontSize=13 fontWeight=600 | "IČO" typography differs: size 13px vs 12px, weight 600 vs 500 |
| minor | border | text | 1/29 | 2 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=1 borderColor=rgb(224, 213, 196) | "Žiadosti" border differs: color rgb(224, 213, 196) vs rgb(232, 223, 210) (ΔE2000 2.8) |
| minor | typography | text | 1/29 | 1 | fontSize=11 fontWeight=600 → fontSize=13 fontWeight=400 | "Návrh 96 %" typography differs: size 13px vs 11px, weight 400 vs 600 |
| minor | color | surface | 1/29 | 1 | backgroundColor=rgb(242, 248, 243) → backgroundColor=rgb(255, 253, 249) | surface at (85, 360) background is rgb(255, 253, 249), design says rgb(242, 248, 243) (ΔE2000 4.2) |
| minor | typography | text | 1/29 | 1 | fontSize=14 → fontSize=12 | "84,20 €" typography differs: size 12px vs 14px |
| minor | typography | text | 1/29 | 1 | fontSize=10.5 fontWeight=600 → fontSize=12 fontWeight=500 | "Návrh 96 %" typography differs: size 12px vs 10.5px, weight 500 vs 600 |
| minor | typography | text | 1/29 | 1 | fontSize=11 lineHeight=15.4 fontWeight=400 → fontSize=12 lineHeight=18 fontWeight=500 | "Platba kartou ·· 4412 · zhoda 96 %" typography differs: size 12px vs 11px, line-height 18px vs 15.4px, weight 500 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=11 → fontSize=13 | "Blok · 11. 7. 2026 · nahral(a) Zuzana" typography differs: size 13px vs 11px |
| minor | typography | text | 1/29 | 1 | fontSize=14 fontWeight=500 → fontSize=12 fontWeight=400 | "25,00 €" typography differs: size 12px vs 14px, weight 400 vs 500 |
| minor | border-radius | box | 1/29 | 1 | borderRadius=5 → borderRadius=0 | box at (991, 18) border-radius is 0px, design says 5px |
| minor | typography | text | 1/29 | 1 | fontSize=10 fontWeight=400 → fontSize=12 fontWeight=600 | "▾" typography differs: size 12px vs 10px, weight 600 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=15.5 fontWeight=600 → fontSize=12 fontWeight=400 | "−84,20 €" typography differs: size 12px vs 15.5px, weight 400 vs 600 |
| minor | spacing | surface | 1/29 | 1 (×5) | horizontal gap 16→12 | horizontal gap between surface at (267, 94) and surface at (498, 94) is 12px, design says 16px ×5 |
| minor | color | text | 1/29 | 1 | color=rgba(44, 36, 25, 0.45) → color=rgba(44, 36, 25, 0.5) | "Pripomenúť" text color is rgba(44, 36, 25, 0.5), design says rgba(44, 36, 25, 0.45) (ΔE2000 3.5) |
| minor | typography | text | 1/29 | 1 | fontSize=27 → fontSize=26 | "Portfólio klientov" typography differs: size 26px vs 27px |
| minor | typography | text | 1/29 | 1 (×4) | fontSize=26 → fontSize=24 | "6" typography differs: size 24px vs 26px ×4 |
| minor | typography | text | 1/29 | 1 (×4) | fontSize=11.5 fontWeight=600 → fontSize=12.8 fontWeight=500 | "Pripomenúť" typography differs: size 12.8px vs 11.5px, weight 500 vs 600 ×4 |
| minor | typography | text | 1/29 | 1 | fontWeight=400 → fontWeight=500 | "25. 7. · o 11 dní" typography differs: weight 500 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=13 fontWeight=500 → fontSize=12 fontWeight=400 | "0" typography differs: size 12px vs 13px, weight 400 vs 500 |
| minor | typography | text | 1/29 | 1 | fontSize=20 fontWeight=600 → fontSize=24 fontWeight=500 | "&" typography differs: size 24px vs 20px, weight 500 vs 600 |
| minor | typography | text | 1/29 | 1 (×3) | fontSize=12 → fontSize=11.2 | "KP" typography differs: size 11.2px vs 12px ×3 |
| minor | border-radius | box | 1/29 | 1 | borderRadius=7.5 → borderRadius=12 | box at (62, 508) border-radius is 12px, design says 7.5px |
| minor | typography | text | 1/29 | 1 | fontSize=11.5 fontWeight=400 → fontSize=14 fontWeight=600 | "Dokumenty" typography differs: size 14px vs 11.5px, weight 600 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=11 fontWeight=500 → fontSize=12 fontWeight=400 | "najstaršia 12 dní" typography differs: size 12px vs 11px, weight 400 vs 500 |
| minor | border-radius | box | 1/29 | 1 | borderRadius=4 → borderRadius=0 | box at (840, 229) border-radius is 0px, design says 4px |
| minor | typography | text | 1/29 | 1 | fontSize=12 fontWeight=600 → fontSize=14 fontWeight=500 | "~2× týždenne" typography differs: size 14px vs 12px, weight 500 vs 600 |
| minor | typography | text | 1/29 | 1 | fontSize=10.5 fontWeight=400 → fontSize=13 fontWeight=500 | "Čaká na akciu" typography differs: size 13px vs 10.5px, weight 500 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=11.5 fontWeight=500 → fontSize=13 fontWeight=600 | "Bankový súhlas" typography differs: size 13px vs 11.5px, weight 600 vs 500 |
| minor | typography | text | 1/29 | 1 | fontSize=15 → fontSize=12 | "▤" typography differs: size 12px vs 15px |
| minor | typography | text | 1/29 | 1 | fontSize=12 fontWeight=500 → fontSize=14 fontWeight=600 | "Názov organizácie" typography differs: size 14px vs 12px, weight 600 vs 500 |
| minor | typography | text | 1/29 | 1 | fontSize=13 → fontSize=12 | "Automatické priradenie nových klientov" typography differs: size 12px vs 13px |
| minor | typography | text | 1/29 | 1 | fontSize=11.5 → fontSize=14 | "Priradiť voľnému účtovníkovi" typography differs: size 14px vs 11.5px |
| minor | typography | text | 1/29 | 1 | fontSize=12 → fontSize=12.8 | "DIČ" typography differs: size 12.8px vs 12px |
| minor | typography | text | 1/29 | 1 | fontSize=13 fontWeight=600 → fontSize=11 fontWeight=400 | "Pripomenúť pred termínom" typography differs: size 11px vs 13px, weight 400 vs 600 |
| minor | typography | text | 1/29 | 1 | fontSize=11 lineHeight=15.95 → fontSize=12 lineHeight=18 | "Registrovaný platiteľ DPH." typography differs: size 12px vs 11px, line-height 18px vs 15.95px |
| minor | color | text | 1/29 | 1 | backgroundColor=rgb(244, 237, 226) → backgroundColor=rgb(255, 253, 249) | "ZK" background is rgb(255, 253, 249), design says rgb(244, 237, 226) (ΔE2000 4.7) |
| minor | border-radius | text | 1/29 | 1 | borderRadius=0 → borderRadius=7.5 | "Dnes" border-radius is 7.5px, design says 0px |
| minor | typography | text | 1/29 | 1 | fontSize=14 lineHeight=21 → fontSize=12 lineHeight=18 | "Vlákna s vaším účtovníkom — Hrubá & Co." typography differs: size 12px vs 14px, line-height 18px vs 21px |
| minor | border-radius | text | 1/29 | 1 (×3) | borderRadius=15 → borderRadius=18 | "Všetky" border-radius is 18px, design says 15px ×3 |
| minor | border-radius | text | 1/29 | 1 | borderRadius=15 → borderRadius=10 | "Vybavené" border-radius is 10px, design says 15px |
| minor | border-radius | text | 1/29 | 1 | borderRadius=10 → borderRadius=14 | "⇄" border-radius is 14px, design says 10px |
| minor | typography | text | 1/29 | 1 | fontSize=13 lineHeight=19.5 → fontSize=16 lineHeight=24 | "Bloček mám odfotený v mobile, nahrám ho …" typography differs: size 16px vs 13px, line-height 24px vs 19.5px |
| minor | border-radius | icon | 1/29 | 1 | borderRadius=20 → borderRadius=18 | icon at (312, 34) border-radius is 18px, design says 20px |
| minor | border-radius | text | 1/29 | 1 | borderRadius=16 → borderRadius=10 | "Vybavené" border-radius is 10px, design says 16px |
| minor | border-radius | text | 1/29 | 1 (×3) | borderRadius=19 → borderRadius=16 | "MH" border-radius is 16px, design says 19px ×3 |
| minor | color | text | 1/29 | 1 | backgroundColor=rgb(246, 239, 228) → backgroundColor=rgb(255, 253, 249) | "Otázka" background is rgb(255, 253, 249), design says rgb(246, 239, 228) (ΔE2000 4.4) |
| minor | typography | text | 1/29 | 1 | fontSize=14 → fontSize=16 | "Záloha na kávovar" typography differs: size 16px vs 14px |
| minor | typography | text | 1/29 | 1 | fontSize=10 fontWeight=400 → fontSize=12 fontWeight=500 | "Včera" typography differs: size 12px vs 10px, weight 500 vs 400 |
| minor | typography | text | 1/29 | 1 | fontSize=10 → fontSize=11 | "2. 7." typography differs: size 11px vs 10px |
| minor | size | icon | 1/29 | 1 (×4) | w 14.2→20, h 16.9→16 | icon at (326, 27) renders 20×16, design says 14×17 ×4 |
| minor | typography | text | 1/29 | 1 | fontSize=15 fontWeight=400 → fontSize=12 fontWeight=600 | "‹" typography differs: size 12px vs 15px, weight 600 vs 400 |
| minor | border-radius | text | 1/29 | 1 | borderRadius=19 → borderRadius=12 | "‹" border-radius is 12px, design says 19px |
| minor | typography | text | 1/29 | 1 | fontSize=12 fontWeight=600 → fontSize=12.8 fontWeight=500 | "＋ Pozvať člena" typography differs: size 12.8px vs 12px, weight 500 vs 600 |
| minor | typography | text | 1/29 | 1 | fontSize=11 fontWeight=400 → fontSize=13 fontWeight=600 | "peter@pramen.sk" typography differs: size 13px vs 11px, weight 600 vs 400 |



## uctoinak2-storybook

the Uctoinak app's 14 COMPONENT pairs — dialogs, pickers and action cards captured from Storybook, which no route can reach.

Measured 2026-09-16T14:48:53.285Z.

```
cd /root/uctoinak2/.claude/worktrees/messages-redesign
node /root/refdiff/packages/core/dist/cli.js compare --manifest tools/design-compare/manifest.mjs --design-dir tools/design-compare/design-reference \
  --app-url http://localhost:6006 --out /root/refdiff/out/baseline/uctoinak2-storybook \
  --storybook-url http://localhost:6006 --pair doc-detail-owner-desktop,doc-detail-owner-mobile,doc-detail-accountant-desktop,doc-detail-accountant-mobile,tx-picker-owner-desktop,tx-picker-owner-mobile,tx-picker-accountant-desktop,tx-picker-accountant-mobile,tx-picker-all-requested-desktop,tx-picker-all-requested-mobile,card-unidentified-doc-desktop,card-unidentified-doc-mobile,card-not-a-statement-desktop,card-not-a-statement-mobile
```

> **11 pair(s) below captured only on a SECOND attempt**: `doc-detail-owner-desktop`, `doc-detail-owner-mobile`, `doc-detail-accountant-desktop`, `doc-detail-accountant-mobile`, `tx-picker-owner-desktop`, `tx-picker-owner-mobile`, `tx-picker-accountant-desktop`, `tx-picker-accountant-mobile`, `tx-picker-all-requested-desktop`, `tx-picker-all-requested-mobile`, `card-unidentified-doc-desktop`. Their numbers are this run's, not carried over — a first capture pays a cold server's compile out of its navigation budget. A pair that needs this every run is a slow server or a flaky pair, not a measurement.

14 pairs: 0 PASS / 14 FAIL — 1309 findings covering 1961 instances, 1 suppressed; delta +0 / −0
89 of 1309 findings are UNVERIFIED — nothing but a weak alignment paired their two elements, so their values are not evidence of drift
pairing evidence across the set: 484 by text, 45 by slot, 543 by geometry, 237 resting on no pair

| pair                            | verdict | findings (c/M/m) | inst | supp | unver | conf | align                     | delta |
|---------------------------------|---------|------------------|------|------|-------|------|---------------------------|-------|
| card-unidentified-doc-mobile    | FAIL    |     64 (3/39/22) |   66 |    0 |     0 | 0.60 | 0.726×1.172 / 37.5,−17.2  | +0/−0 |
| card-not-a-statement-desktop    | FAIL    |     63 (2/30/31) |   68 |    0 |     0 | 0.64 | 1.053×0.990 / −10.2,−27.4 | +0/−0 |
| card-not-a-statement-mobile     | FAIL    |     69 (2/34/33) |   79 |    0 |     0 | 0.73 | 0.714×1.066 / 39.7,−16.3  | +0/−0 |
| doc-detail-owner-desktop        | FAIL    |     85 (4/29/52) |  156 |    0 |     0 | 0.84 | 0.941×0.970 / 5.0,−1.5    | +0/−0 |
| doc-detail-owner-mobile         | FAIL    |     86 (5/28/53) |  155 |    0 |     0 | 0.83 | 1.046×0.982 / −1.6,61.7   | +0/−0 |
| doc-detail-accountant-desktop   | FAIL    |     89 (4/31/54) |  160 |    0 |     0 | 0.84 | 0.941×0.970 / 5.0,−1.5    | +0/−0 |
| doc-detail-accountant-mobile    | FAIL    |     87 (5/29/53) |  156 |    0 |     0 | 0.83 | 1.046×0.982 / −1.6,61.7   | +0/−0 |
| tx-picker-owner-desktop         | FAIL    |    105 (9/38/58) |  204 |    0 |     0 | 0.52 | 1.008×1.053 / 70.0,56.0   | +0/−0 |
| tx-picker-owner-mobile          | FAIL    |   136 (20/69/47) |  207 |    0 |    29 | 0.00 | 1.060×1.031 / −5.8,0      | +0/−0 |
| tx-picker-accountant-desktop    | FAIL    |   140 (21/57/62) |  207 |    0 |    24 | 0.42 | 1.006×1.112 / 69.3,68.3   | +0/−0 |
| tx-picker-accountant-mobile     | FAIL    |   152 (17/83/52) |  196 |    0 |    36 | 0.00 | 1.057×1.031 / −4.4,0      | +0/−0 |
| tx-picker-all-requested-desktop | FAIL    |     86 (1/31/54) |  114 |    1 |     0 | 0.73 | 1.051×1.091 / 13.7,−14.5  | +0/−0 |
| tx-picker-all-requested-mobile  | FAIL    |     88 (3/37/48) |  128 |    0 |     0 | 0.75 | 1.052×1 / −5.2,−24.1      | +0/−0 |
| card-unidentified-doc-desktop   | FAIL    |     59 (2/27/30) |   65 |    0 |     0 | 0.55 | 1.031×1.064 / 6.6,−32.6   | +0/−0 |

Matching — what the matcher PAIRED (pairs, not findings). A `matched` column that fell while
`d-only`/`i-only` rose is a REGRESSION, not a precision win: both move that way.
`phase` reads `rate` (matched / min leaves) and `axis` (the BETTER-fitting axis, not the
joint `conf`); `share` is reported and does not gate. On a `reconcile` pair a matched
collapse is expected; on a `polish` pair it is a bug. Reported, never enforced.

| pair                            | design | impl | matched | text | slot | geom | d-only | i-only | vetoed | conf | axis | rate | share |  phase |
|---------------------------------|--------|------|---------|------|------|------|--------|--------|--------|------|------|------|-------|--------|
| card-unidentified-doc-mobile    |     21 |   21 |      16 |   10 |    0 |    6 |      5 |      5 |      0 | 0.60 | 1.00 | 0.76 |  0.63 | polish |
| card-not-a-statement-desktop    |     26 |   20 |      20 |   11 |    0 |    9 |      6 |      0 |      0 | 0.64 | 0.91 | 1.00 |  0.55 | polish |
| card-not-a-statement-mobile     |     26 |   20 |      19 |   11 |    0 |    8 |      7 |      1 |      0 | 0.73 | 0.91 | 0.95 |  0.58 | polish |
| doc-detail-owner-desktop        |     70 |   65 |      62 |   40 |    1 |   21 |      8 |      3 |      0 | 0.84 | 0.94 | 0.95 |  0.65 | polish |
| doc-detail-owner-mobile         |     68 |   66 |      60 |   38 |    0 |   22 |      8 |      6 |      1 | 0.83 | 0.93 | 0.91 |  0.63 | polish |
| doc-detail-accountant-desktop   |     70 |   66 |      63 |   40 |    1 |   22 |      7 |      3 |      0 | 0.84 | 0.94 | 0.95 |  0.63 | polish |
| doc-detail-accountant-mobile    |     68 |   67 |      60 |   38 |    0 |   22 |      8 |      7 |      1 | 0.83 | 0.93 | 0.90 |  0.63 | polish |
| tx-picker-owner-desktop         |     93 |   96 |      86 |   33 |    6 |   47 |      7 |     10 |      0 | 0.52 | 0.81 | 0.92 |  0.38 | polish |
| tx-picker-owner-mobile          |     97 |   78 |      71 |   27 |    3 |   41 |     26 |      7 |      0 | 0.00 | 0.82 | 0.91 |  0.38 | polish |
| tx-picker-accountant-desktop    |     97 |   83 |      71 |   30 |    3 |   38 |     26 |     12 |      0 | 0.42 | 0.74 | 0.86 |  0.42 | polish |
| tx-picker-accountant-mobile     |     93 |   81 |      70 |   27 |    3 |   40 |     23 |     11 |      0 | 0.00 | 0.80 | 0.86 |  0.39 | polish |
| tx-picker-all-requested-desktop |     43 |   48 |      42 |   17 |    2 |   23 |      1 |      6 |      0 | 0.73 | 1.00 | 0.98 |  0.40 | polish |
| tx-picker-all-requested-mobile  |     43 |   48 |      40 |   14 |    2 |   24 |      3 |      8 |      0 | 0.75 | 0.83 | 0.93 |  0.35 | polish |
| card-unidentified-doc-desktop   |     21 |   21 |      18 |   11 |    0 |    7 |      3 |      3 |      0 | 0.55 | 0.82 | 0.86 |  0.61 | polish |
| TOTAL (14)                      |    836 |  780 |     698 |  347 |   21 |  330 |    138 |     82 |      2 |      |      |      |       | 14P/0R |

Findings by type:

| pair                            | miss | extra | text | pos | size | space | color | typo | bord | rad | pixel |  all |
|---------------------------------|------|-------|------|-----|------|-------|-------|------|------|-----|-------|------|
| card-unidentified-doc-mobile    |    5 |     4 |    2 |  16 |   12 |     5 |     4 |    8 |    2 |   5 |     1 |   64 |
| card-not-a-statement-desktop    |    6 |     0 |    2 |  13 |   11 |     7 |     5 |    9 |    3 |   6 |     1 |   63 |
| card-not-a-statement-mobile     |    4 |     1 |    3 |  12 |   14 |     8 |     7 |    9 |    4 |   6 |     1 |   69 |
| doc-detail-owner-desktop        |    7 |     3 |   14 |  25 |    8 |     4 |     8 |    8 |    1 |   4 |     3 |   85 |
| doc-detail-owner-mobile         |    8 |     6 |   14 |  20 |    4 |    11 |     8 |    8 |    1 |   4 |     2 |   86 |
| doc-detail-accountant-desktop   |    7 |     3 |   15 |  26 |    9 |     4 |     8 |    9 |    1 |   4 |     3 |   89 |
| doc-detail-accountant-mobile    |    8 |     7 |   14 |  20 |    4 |    11 |     8 |    8 |    1 |   4 |     2 |   87 |
| tx-picker-owner-desktop         |    7 |    10 |   19 |  22 |    6 |     6 |    19 |    5 |    6 |   1 |     4 |  105 |
| tx-picker-owner-mobile          |   26 |     7 |   15 |  32 |   14 |     5 |    22 |    8 |    4 |   2 |     1 |  136 |
| tx-picker-accountant-desktop    |   26 |    12 |   15 |  31 |    5 |     6 |    23 |    9 |    8 |   4 |     1 |  140 |
| tx-picker-accountant-mobile     |   23 |    11 |   16 |  36 |   16 |     3 |    25 |   11 |    6 |   4 |     1 |  152 |
| tx-picker-all-requested-desktop |    1 |     6 |   10 |  12 |   12 |     5 |    20 |    6 |    7 |   5 |     2 |   86 |
| tx-picker-all-requested-mobile  |    3 |     8 |   12 |  16 |   10 |     4 |    18 |    6 |    6 |   5 |     0 |   88 |
| card-unidentified-doc-desktop   |    3 |     2 |    2 |  14 |    8 |     6 |     5 |   10 |    2 |   6 |     1 |   59 |
| TOTAL (14)                      |  134 |    80 |  153 | 295 |  133 |    85 |   180 |  114 |   52 |  60 |    23 | 1309 |

Across pairs (one row = one cause; `pairs` = how many cells show it):

| severity | type | role | pairs | findings | values | sample |
|----------|------|------|-------|----------|--------|--------|
| critical | missing-element | text | 13/14 | 75 |  | design "E2 · NEZARADITEĽNÝ DOKUMENT · MOBIL" (161×14) has no counterpart in the implementation |
| critical | missing-element | surface | 13/14 | 32 |  | design surface at (51, 464) (255×52) has no counterpart in the implementation |
| critical | missing-element | box | 10/14 | 24 |  | design box at (51, 80) (36×77) has no counterpart in the implementation |
| critical | pixel-region | surface | 5/14 | 5 (×8) | shape diffRatio 0→0.2..0.7 | 21.1% of pixels differ in surface at (80, 623): shape differs (edges do not line up — a different glyph or drawing) (3 regions, 18×18px; design 19×19 resampled onto 18×18) |
| critical | pixel-region | surface | 1/14 | 1 | color diffRatio 0→0.9 | 91% of pixels differ in surface at (93, 833): recolored (same shape, darker) (1 region, 514×11px; design 518×58 resampled onto 514×63) |
| major | position | text | 14/14 | 233 (×358) | x 14.7..899.5→18..865, y 30.1..1085.8→27.1..1019.1 | "✉" is offset by (19.8, -0.7)px from the design position |
| major | size | text | 14/14 | 91 (×155) | w 4.2..529.6→12..556, h 9.7..76.1→11..110.4 | "NOVÝ DOKUMENT" renders 82×36, design says 74×14 |
| major | spacing | text | 14/14 | 44 (×183) | vertical gap 1.1..63.1→4..53.3 | vertical gap between "Stavrek s.r.o." and "Iný dokument · 7. 7. 2026" is 13.5px, design says 7.4px |
| major | spacing | text | 13/14 | 32 (×38) | horizontal gap 9.4..58.6→8..75.6 | horizontal gap between "Nepotrebuje párovanie" and "✉" is 75.6px, design says 20.3px |
| major | pixel-region | frame | 10/14 | 10 | unexplainedDiffRatio 0→0..0.4 | 9.87% of the frame differs OUTSIDE every matched element — nothing in the element model covers it, so no per-element finding can. 95 region(s); largest: 324×64 at (18, 347); 358×566 at (0, 0); 62×89 at (60, 82). A container's background, border, radius or width is the usual cause: containers are not leaf elements, so they are never matched and never diffed. |
| major | extra-element | text | 9/14 | 29 |  | implementation renders "7. 7. 2026" (54×14) that the design does not have |
| major | position | box | 9/14 | 18 (×40) | x 14.7..826.1→18..834, y 77.7..847.8→64.8..858 | box at (51, 447) is offset by (-27.3, 5.6)px from the design position |
| major | position | surface | 8/14 | 38 (×92) | x -4.7..106.3→0..106, y 115.4..979.6→60.8..1008.3 | surface at (66, 607) is offset by (-3.2, -27.1)px from the design position |
| major | size | surface | 8/14 | 22 (×40) | w 21.1..632.6→16..634, h 20.6..731.3→16..736 | surface at (66, 607) renders 634×63, design says 633×51 |
| major | extra-element | surface | 8/14 | 17 |  | implementation renders surface at (40, 24) (680×692) that the design does not have |
| major | color | text | 8/14 | 12 (×30) | color=rgb(185, 171, 151) → color=rgb(138, 125, 108) | "ČÍSLO FAKTÚRY" text color is rgb(138, 125, 108), design says rgb(185, 171, 151) (ΔE2000 15) ×10 |
| major | color | text | 7/14 | 9 | color=rgb(95, 85, 70) → color=rgb(138, 125, 108) | "Nevyzerá to ako faktúra ani pokladničný …" text color is rgb(138, 125, 108), design says rgb(95, 85, 70) (ΔE2000 15.6) |
| major | size | box | 6/14 | 12 | w 8..94.8→12..101.5, h 1.1..32→1..20 | box at (42, 89) renders 20×20, design says 21×3 |
| major | size | backdrop | 6/14 | 8 | w 410.1..968.6→402..920, h 310.3..820.1→306.3..800 | backdrop at (-10, -8) renders 920×306, design says 969×325 |
| major | color | text | 6/14 | 8 | color=rgb(138, 125, 108) → color=rgba(138, 125, 108, 0.8) | "Prevod · 24. 6." text color is rgba(138, 125, 108, 0.8), design says rgb(138, 125, 108) (ΔE2000 9.1) |
| major | color | text | 6/14 | 7 (×12) | color=rgb(138, 125, 108) → color=rgb(44, 36, 25) | "ZÚČT. OBDOBIE" text color is rgb(44, 36, 25), design says rgb(138, 125, 108) (ΔE2000 31.2) |
| major | position | backdrop | 6/14 | 6 (×23) | x -10.2..70→0..70, y -23.1..80.2→0..90 | backdrop at (-10, -8) is offset by (10.2, 7.5)px from the design position |
| major | color | text | 6/14 | 6 | backgroundColor=rgb(221, 210, 193) → backgroundColor=rgba(184, 92, 36, 0.5) | "Priradiť k dokladu" background is rgba(184, 92, 36, 0.5), design says rgb(221, 210, 193) (ΔE2000 14.3) |
| major | border | text | 5/14 | 5 | borderWidth=0 → borderWidth=1 borderColor=rgb(224, 213, 196) | "Vyberte správny typ" border differs: border the design does not have |
| major | border-radius | text | 5/14 | 5 | borderRadius=0 → borderRadius=12.25 | "Návrh" border-radius is 12.25px, design says 0px |
| major | color | text | 4/14 | 6 | color=rgb(44, 36, 25) → color=rgba(138, 125, 108, 0.8) | "−96,30 €" text color is rgba(138, 125, 108, 0.8), design says rgb(44, 36, 25) (ΔE2000 41.8) |
| major | spacing | box | 4/14 | 5 (×21) | vertical gap 30..58.4→38..45.2 | vertical gap between box at (42, 110) and "Je toto naozaj bankový výpis?" is 41.6px, design says 58.4px |
| major | color | text | 4/14 | 5 (×13) | color=rgb(44, 36, 25) → color=rgb(138, 125, 108) | "Prevod · Alza.sk s.r.o." text color is rgb(138, 125, 108), design says rgb(44, 36, 25) (ΔE2000 31.2) ×4 |
| major | color | text | 4/14 | 4 | color=rgb(138, 125, 108) → color=oklch(0.473 0.137 46.201) | "2 dni" text color is oklch(0.473 0.137 46.201), design says rgb(138, 125, 108) (ΔE2000 25.9) |
| major | border | text | 4/14 | 4 | borderWidth=0 → borderWidth=1 borderColor=rgb(184, 92, 36) | "Zaradiť medzi doklady" border differs: border the design does not have |
| major | typography | text | 4/14 | 4 | fontSize=10.5 fontWeight=600 → fontSize=14 fontWeight=500 | "NOVÝ DOKUMENT" typography differs: size 14px vs 10.5px, weight 500 vs 600 |
| major | typography | text | 4/14 | 4 | fontSize=10 fontWeight=600 → fontSize=14 fontWeight=500 | "ALEBO JE TO" typography differs: size 14px vs 10px, weight 500 vs 600 |
| major | border-radius | text | 4/14 | 4 | borderRadius=0 → borderRadius=16 | "Vyberte správny typ" border-radius is 16px, design says 0px |
| major | typography | text | 4/14 | 4 | fontSize=11 → fontSize=14 | "▾" typography differs: size 14px vs 11px |
| major | border-radius | text | 4/14 | 4 | borderRadius=0 → borderRadius=12 | "Odložiť na neskôr" border-radius is 12px, design says 0px |
| major | color | text | 4/14 | 4 | color=rgb(248, 243, 236) → color=rgb(138, 125, 108) | "↗" text color is rgb(138, 125, 108), design says rgb(248, 243, 236) (ΔE2000 32) |
| major | color | text | 4/14 | 4 (×72) | color=rgb(26, 26, 26) → color=rgb(44, 36, 25) | "Detail" text color is rgb(44, 36, 25), design says rgb(26, 26, 26) (ΔE2000 8.4) ×18 |
| major | color | text | 4/14 | 4 | color=rgb(163, 128, 31) → color=rgb(78, 122, 90) | "Návrh" text color is rgb(78, 122, 90), design says rgb(163, 128, 31) (ΔE2000 27.8) |
| major | color | box | 4/14 | 4 | backgroundColor=rgb(163, 128, 31) → backgroundColor=rgb(78, 122, 90) | box at (650, 145) background is rgb(78, 122, 90), design says rgb(163, 128, 31) (ΔE2000 27.8) |
| major | color | text | 4/14 | 4 | color=rgb(26, 26, 26) → color=rgb(138, 125, 108) | "07/2026" text color is rgb(138, 125, 108), design says rgb(26, 26, 26) (ΔE2000 35.6) |
| major | color | text | 4/14 | 4 | color=rgb(160, 111, 20) → color=rgb(78, 122, 90) | "71 % zhoda" text color is rgb(78, 122, 90), design says rgb(160, 111, 20) (ΔE2000 30.4) |
| major | spacing | surface | 4/14 | 4 (×13) | vertical gap 15.6..24.2→21..37.8 | vertical gap between surface at (18, 781) and "Zobraziť 1 ďalší návrh" is 21px, design says 23.1px |
| major | border | surface | 4/14 | 4 | borderWidth=1 borderColor=rgb(207, 196, 178) → borderWidth=1 borderColor=oklab(0.596632 0.00792834 0.0285945 / 0.2) | surface at (106, 915) border differs: color oklab(0.596632 0.00792834 0.0285945 / 0.2) vs rgb(207, 196, 178) (ΔE2000 10) |
| major | color | text | 3/14 | 3 | color=rgb(138, 125, 108) → color=rgba(184, 92, 36, 0.8) | "netreba doklad" text color is rgba(184, 92, 36, 0.8), design says rgb(138, 125, 108) (ΔE2000 17.6) |
| major | color | text | 3/14 | 3 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(255, 253, 249) | "Všetky" background is rgb(255, 253, 249), design says rgb(44, 36, 25) (ΔE2000 77.8) |
| major | color | text | 3/14 | 3 | color=rgb(95, 85, 70) → color=rgb(248, 243, 236) | "Bez dokladu" text color is rgb(248, 243, 236), design says rgb(95, 85, 70) (ΔE2000 48.2) |
| major | color | text | 3/14 | 3 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(44, 36, 25) | "Bez dokladu" background is rgb(44, 36, 25), design says rgb(255, 253, 249) (ΔE2000 77.8) |
| major | border | text | 3/14 | 3 | borderWidth=1 borderColor=rgb(44, 36, 25) → borderWidth=1 borderColor=rgb(224, 213, 196) | "Všetky" border differs: color rgb(224, 213, 196) vs rgb(44, 36, 25) (ΔE2000 70.9) |
| major | border | text | 3/14 | 3 | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=1 borderColor=rgb(44, 36, 25) | "Bez dokladu" border differs: color rgb(44, 36, 25) vs rgb(224, 213, 196) (ΔE2000 70.9) |
| major | color | text | 2/14 | 4 | color=rgb(60, 98, 71) → color=rgb(78, 122, 90) | "91 %" text color is rgb(78, 122, 90), design says rgb(60, 98, 71) (ΔE2000 8.6) |
| major | border | surface | 2/14 | 4 | borderWidth=1 borderColor=rgb(238, 228, 213) → borderWidth=1 borderColor=oklab(0.537988 -0.0618201 0.0327166 / 0.4) | surface at (93, 389) border differs: color oklab(0.537988 -0.0618201 0.0327166 / 0.4) vs rgb(238, 228, 213) (ΔE2000 14.1) |
| major | color | text | 2/14 | 4 | color=rgb(78, 122, 90) → color=rgb(138, 125, 108) | "91 %" text color is rgb(138, 125, 108), design says rgb(78, 122, 90) (ΔE2000 22.3) |
| major | color | box | 2/14 | 4 | backgroundColor=rgb(204, 191, 169) → backgroundColor=oklab(0.596632 0.00792834 0.0285945 / 0.096) | box at (97, 431) background is oklab(0.596632 0.00792834 0.0285945 / 0.096), design says rgb(204, 191, 169) (ΔE2000 14.7) |
| major | color | text | 2/14 | 4 | color=rgb(163, 86, 42) → color=rgba(184, 92, 36, 0.8) | "má otvorenú žiadosť" text color is rgba(184, 92, 36, 0.8), design says rgb(163, 86, 42) (ΔE2000 14) |
| major | color | text | 2/14 | 4 | color=rgb(189, 176, 154) → color=rgba(138, 125, 108, 0.8) | "Karta · 8. 7. · žiadosť otvorená 8. 7." text color is rgba(138, 125, 108, 0.8), design says rgb(189, 176, 154) (ΔE2000 8.1) |
| major | border | box | 2/14 | 4 | borderWidth=0 → borderWidth=1 borderColor=oklab(0.596632 0.00792834 0.0285945 / 0.2) | box at (97, 431) border differs: border the design does not have |
| major | border | surface | 2/14 | 4 | borderWidth=1 borderColor=rgb(221, 210, 193) → borderWidth=0 | surface at (97, 432) border differs: no border, design has one |
| major | border-radius | surface | 2/14 | 3 | borderRadius=10 → borderRadius=0 | surface at (27, 796) border-radius is 0px, design says 10px |
| major | color | box | 2/14 | 2 | backgroundColor=rgb(185, 171, 151) → backgroundColor=oklab(0.523251 0.135163 0.077823 / 0.05) | box at (42, 89) background is oklab(0.523251 0.135163 0.077823 / 0.05), design says rgb(185, 171, 151) (ΔE2000 19.7) |
| major | color | text | 2/14 | 2 | color=rgb(138, 125, 108) → color=oklch(0.432 0.095 166.913) | "ÚČT. KATEGÓRIA" text color is oklch(0.432 0.095 166.913), design says rgb(138, 125, 108) (ΔE2000 30.2) |
| major | typography | text | 2/14 | 2 | fontFamily=ui-monospace fontSize=10 fontWeight=400 → fontFamily=Public Sans fontSize=11 fontWeight=600 | "sken dokladu" typography differs: family "Public Sans" vs "ui-monospace", size 11px vs 10px, weight 600 vs 400 |
| major | typography | text | 2/14 | 2 | fontSize=9.5 fontWeight=600 → fontSize=12 fontWeight=500 | "ÚČT. KATEGÓRIA" typography differs: size 12px vs 9.5px, weight 500 vs 600 |
| major | border-radius | text | 2/14 | 2 | borderRadius=0 → borderRadius=10 | "ÚČT. KATEGÓRIA" border-radius is 10px, design says 0px |
| major | typography | text | 2/14 | 2 | fontSize=9.5 fontWeight=600 → fontSize=12.5 fontWeight=500 | "ZÚČT. OBDOBIE" typography differs: size 12.5px vs 9.5px, weight 500 vs 600 |
| major | color | text | 2/14 | 2 | color=rgb(185, 171, 151) → color=rgb(44, 36, 25) | "ZÚČT. OBDOBIE" text color is rgb(44, 36, 25), design says rgb(185, 171, 151) (ΔE2000 51.2) |
| major | typography | text | 2/14 | 2 | fontFamily=ui-monospace fontSize=8.5 fontWeight=400 → fontFamily=Public Sans fontSize=11 fontWeight=600 | "sken dokladu" typography differs: family "Public Sans" vs "ui-monospace", size 11px vs 8.5px, weight 600 vs 400 |
| major | typography | text | 2/14 | 2 | fontSize=9 fontWeight=600 → fontSize=12.5 fontWeight=500 | "ZÚČT. OBDOBIE" typography differs: size 12.5px vs 9px, weight 500 vs 600 |
| major | color | text | 2/14 | 2 | color=rgb(44, 36, 25) → color=rgb(78, 122, 90) | "−148,90 €" text color is rgb(78, 122, 90), design says rgb(44, 36, 25) (ΔE2000 33.2) |
| major | color | text | 2/14 | 2 | color=rgb(95, 85, 70) → color=rgb(44, 36, 25) | "Každá transakcia bez dokladu už má otvor…" text color is rgb(44, 36, 25), design says rgb(95, 85, 70) (ΔE2000 16.2) |
| major | border | text | 2/14 | 2 | borderWidth=0 → borderWidth=1 borderColor=rgb(232, 223, 210) | "Každá transakcia bez dokladu už má otvor…" border differs: border the design does not have |
| major | border-radius | box | 1/14 | 2 | borderRadius=0 → borderRadius=8 | box at (97, 431) border-radius is 8px, design says 0px |
| major | border-radius | surface | 1/14 | 2 | borderRadius=9 → borderRadius=0 | surface at (97, 432) border-radius is 0px, design says 9px |
| major | border-radius | box | 1/14 | 2 | borderRadius=0 → borderRadius=9 | box at (27, 442) border-radius is 9px, design says 0px |
| major | border-radius | text | 1/14 | 1 | borderRadius=10 → borderRadius=21.14 | "Nepotrebuje párovanie" border-radius is 21.14px, design says 10px |
| major | typography | text | 1/14 | 1 | fontSize=12.5 lineHeight=19.38 → fontSize=16 lineHeight=22.86 | "Nevyzerá to ako faktúra ani pokladničný …" typography differs: size 16px vs 12.5px, line-height 22.86px vs 19.38px |
| major | color | box | 1/14 | 1 | backgroundColor=rgb(185, 171, 151) → backgroundColor=rgb(44, 36, 25) | box at (64, 117) background is rgb(44, 36, 25), design says rgb(185, 171, 151) (ΔE2000 51.2) |
| major | border | text | 1/14 | 1 | borderWidth=2 borderColor=rgb(255, 253, 249) → borderWidth=0 | "↗" border differs: no border, design has one |
| major | border-radius | text | 1/14 | 1 | borderRadius=13 → borderRadius=0 | "↗" border-radius is 0px, design says 13px |
| major | typography | text | 1/14 | 1 | fontSize=8 fontWeight=600 → fontSize=12 fontWeight=500 | "▾" typography differs: size 12px vs 8px, weight 500 vs 600 |
| major | color | backdrop | 1/14 | 1 | backgroundColor=rgb(251, 248, 242) → backgroundColor=rgba(44, 36, 25, 0.42) | backdrop at (-6, 24) background is rgba(44, 36, 25, 0.42), design says rgb(251, 248, 242) (ΔE2000 20.6) |
| major | color | text | 1/14 | 1 | color=rgb(44, 36, 25) → color=rgba(184, 92, 36, 0.8) | "Prevod · Slovnaft a.s." text color is rgba(184, 92, 36, 0.8), design says rgb(44, 36, 25) (ΔE2000 41.4) |
| major | typography | text | 1/14 | 1 | fontSize=14 fontWeight=500 → fontSize=10.5 fontWeight=600 | "Prevod · Slovnaft a.s." typography differs: size 10.5px vs 14px, weight 600 vs 500 |
| major | border-radius | text | 1/14 | 1 | borderRadius=0 → borderRadius=9.88 | "Prevod · Slovnaft a.s." border-radius is 9.88px, design says 0px |
| major | color | backdrop | 1/14 | 1 | backgroundColor=rgb(248, 243, 236) → backgroundColor=rgba(44, 36, 25, 0.42) | backdrop at (-4, 24) background is rgba(44, 36, 25, 0.42), design says rgb(248, 243, 236) (ΔE2000 19.7) |
| major | color | text | 1/14 | 1 | color=rgba(44, 36, 25, 0.45) → color=rgb(44, 36, 25) | "Kaviareň Prameň" text color is rgb(44, 36, 25), design says rgba(44, 36, 25, 0.45) (ΔE2000 44) |
| major | color | text | 1/14 | 1 | backgroundColor=rgba(184, 92, 36, 0.45) → backgroundColor=rgb(184, 92, 36) | "KP" background is rgb(184, 92, 36), design says rgba(184, 92, 36, 0.45) (ΔE2000 26.6) |
| major | color | text | 1/14 | 1 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(255, 253, 249) | "KP" background is rgb(255, 253, 249), design says rgb(184, 92, 36) (ΔE2000 44.2) |
| major | border | surface | 1/14 | 1 | borderWidth=1 borderColor=rgb(207, 196, 178) → borderWidth=0 | surface at (27, 796) border differs: no border, design has one |
| major | border-radius | text | 1/14 | 1 | borderRadius=0 → borderRadius=9.5 | "Vklad · 21. 6. · TB ··2841 · netreba dok…" border-radius is 9.5px, design says 0px |
| major | border-radius | text | 1/14 | 1 | borderRadius=0 → borderRadius=9 | "Každá transakcia bez dokladu už má otvor…" border-radius is 9px, design says 0px |
| major | border-radius | text | 1/14 | 1 | borderRadius=0 → borderRadius=11 | "Každá transakcia bez dokladu už má otvor…" border-radius is 11px, design says 0px |
| minor | text-content | text | 14/14 | 153 |  | text reads "Iný dokument", design says "Iný dokument · 7. 7. 2026" |
| minor | extra-element | backdrop | 10/14 | 19 |  | implementation renders backdrop at (0, 0) (358×566) that the design does not have |
| minor | extra-element | icon | 7/14 | 11 |  | implementation renders icon at (54, 122) (24×24) that the design does not have |
| minor | typography | text | 6/14 | 8 (×34) | fontWeight=600 → fontWeight=400 | "i" typography differs: weight 400 vs 600 |
| minor | color | text | 6/14 | 7 (×9) | color=rgb(185, 171, 151) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "ALEBO JE TO" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(185, 171, 151) (ΔE2000 4) |
| minor | border | text | 5/14 | 5 | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=1 borderColor=rgb(232, 223, 210) | "Nie, je to iný dokument" border differs: color rgb(232, 223, 210) vs rgb(224, 213, 196) (ΔE2000 2.8) |
| minor | color | surface | 4/14 | 8 | backgroundColor=rgb(255, 253, 249) → backgroundColor=oklab(0.537988 -0.0618201 0.0327166 / 0.08) | surface at (93, 389) background is oklab(0.537988 -0.0618201 0.0327166 / 0.08), design says rgb(255, 253, 249) (ΔE2000 3.3) |
| minor | color | text | 4/14 | 6 | color=rgb(78, 138, 90) → color=rgb(78, 122, 90) | "+1 240,50 €" text color is rgb(78, 122, 90), design says rgb(78, 138, 90) (ΔE2000 6.8) |
| minor | typography | text | 4/14 | 6 | fontWeight=600 → fontWeight=500 | "Všetky" typography differs: weight 500 vs 600 |
| minor | color | text | 4/14 | 4 | backgroundColor=rgb(244, 237, 226) → backgroundColor=oklch(0.987 0.022 95.277) | "2 dni" background is oklch(0.987 0.022 95.277), design says rgb(244, 237, 226) (ΔE2000 4.1) |
| minor | typography | text | 4/14 | 4 | fontSize=10.5 → fontSize=12 | "Nepotrebuje párovanie" typography differs: size 12px vs 10.5px |
| minor | typography | text | 4/14 | 4 | fontSize=10 fontWeight=600 → fontSize=12 fontWeight=500 | "2 dni" typography differs: size 12px vs 10px, weight 500 vs 600 |
| minor | border-radius | text | 4/14 | 4 | borderRadius=8 → borderRadius=10 | "2 dni" border-radius is 10px, design says 8px |
| minor | border-radius | text | 4/14 | 4 (×8) | borderRadius=12 → borderRadius=16.8 | "Nevyzerá to ako faktúra ani pokladničný …" border-radius is 16.8px, design says 12px |
| minor | color | text | 4/14 | 4 | color=rgb(138, 125, 108) → color=rgb(154, 140, 118) | "sken dokladu" text color is rgb(154, 140, 118), design says rgb(138, 125, 108) (ΔE2000 5.7) |
| minor | border | text | 4/14 | 4 | borderWidth=1 borderColor=rgb(236, 211, 189) → borderWidth=1 borderColor=rgb(224, 213, 196) | "Spárovať manuálne" border differs: color rgb(224, 213, 196) vs rgb(236, 211, 189) (ΔE2000 5.6) |
| minor | typography | text | 4/14 | 4 | fontSize=12.5 fontWeight=500 → fontSize=9.5 fontWeight=600 | "07/2026" typography differs: size 9.5px vs 12.5px, weight 600 vs 500 |
| minor | extra-element | box | 4/14 | 4 |  | implementation renders box at (181, 62) (40×4) that the design does not have |
| minor | border | surface | 4/14 | 4 (×25) | borderWidth=1 borderColor=rgb(207, 196, 178) → borderWidth=1 borderColor=oklab(0.596632 0.00792834 0.0285945 / 0.5) | surface at (106, 407) border differs: color oklab(0.596632 0.00792834 0.0285945 / 0.5) vs rgb(207, 196, 178) (ΔE2000 4.3) ×8 |
| minor | missing-element | backdrop | 3/14 | 3 |  | design backdrop at (38, 6) (283×560) has no counterpart in the implementation |
| minor | typography | text | 3/14 | 3 | fontSize=12.5 → fontSize=14 | "Vyberte správny typ" typography differs: size 14px vs 12.5px |
| minor | border-radius | text | 3/14 | 3 | borderRadius=10 → borderRadius=12.57 | "Nie sme si istí" border-radius is 12.57px, design says 10px |
| minor | border-radius | text | 3/14 | 3 | borderRadius=13 → borderRadius=11 | "↗" border-radius is 11px, design says 13px |
| minor | border-radius | text | 3/14 | 3 (×7) | borderRadius=8 → borderRadius=12 | "⋯" border-radius is 12px, design says 8px ×3 |
| minor | typography | text | 3/14 | 3 | fontSize=10.5 → fontSize=9.5 | "EXTRAHOVANÉ ÚDAJE" typography differs: size 9.5px vs 10.5px |
| minor | pixel-region |  | 3/14 | 3 | alignmentConfidence 0.5→0..0.4 | pixel channel skipped: alignment confidence 0.00 is below 0.5 — element geometry did not line up well enough to compare pixels |
| minor | typography | text | 3/14 | 3 | fontWeight=500 → fontWeight=600 | "Bez dokladu" typography differs: weight 600 vs 500 |
| minor | typography | text | 2/14 | 4 | fontSize=13 fontWeight=600 → fontSize=12 fontWeight=400 | "i" typography differs: size 12px vs 13px, weight 400 vs 600 |
| minor | border-radius | text | 2/14 | 4 | borderRadius=16 → borderRadius=13 | "i" border-radius is 13px, design says 16px |
| minor | color | text | 2/14 | 4 | backgroundColor=rgb(220, 236, 223) → backgroundColor=oklab(0.537988 -0.0618201 0.0327166 / 0.15) | "91 %" background is oklab(0.537988 -0.0618201 0.0327166 / 0.15), design says rgb(220, 236, 223) (ΔE2000 5.4) |
| minor | color | surface | 2/14 | 4 | backgroundColor=rgb(239, 232, 219) → backgroundColor=oklab(0.596632 0.00792834 0.0285945 / 0.32) | surface at (97, 432) background is oklab(0.596632 0.00792834 0.0285945 / 0.32), design says rgb(239, 232, 219) (ΔE2000 5.3) |
| minor | color | text | 2/14 | 4 | backgroundColor=rgb(241, 228, 216) → backgroundColor=oklab(0.57685 0.0910033 0.101805 / 0.096) | "má otvorenú žiadosť" background is oklab(0.57685 0.0910033 0.101805 / 0.096), design says rgb(241, 228, 216) (ΔE2000 3.8) |
| minor | typography | text | 2/14 | 3 | fontSize=11.5 → fontSize=10.5 | "Doklad klienta sa pripojí k vybranej tra…" typography differs: size 10.5px vs 11.5px |
| minor | typography | text | 2/14 | 3 | fontSize=11.5 lineHeight=17.83 → fontSize=10.5 lineHeight=15.23 | "Každá transakcia bez dokladu už má otvor…" typography differs: size 10.5px vs 11.5px, line-height 15.23px vs 17.83px |
| minor | typography | text | 2/14 | 2 | lineHeight=20.8 → lineHeight=19.2 | "Stavrek s.r.o." typography differs: line-height 19.2px vs 20.8px |
| minor | color | text | 2/14 | 2 | backgroundColor=rgb(249, 239, 219) → backgroundColor=oklab(0.578224 0.0272613 0.111881 / 0.12) | "Nie sme si istí" background is oklab(0.578224 0.0272613 0.111881 / 0.12), design says rgb(249, 239, 219) (ΔE2000 3.6) |
| minor | typography | text | 2/14 | 2 | fontSize=20 lineHeight=26 → fontSize=16 lineHeight=19.2 | "vypis_TB_jun_2026.pdf" typography differs: size 16px vs 20px, line-height 19.2px vs 26px |
| minor | typography | text | 2/14 | 2 | fontSize=13.5 → fontSize=12 | "Nahrané 7. 7. 2026" typography differs: size 12px vs 13.5px |
| minor | border-radius | text | 2/14 | 2 | borderRadius=14 → borderRadius=16.8 | "Je toto naozaj bankový výpis?" border-radius is 16.8px, design says 14px |
| minor | typography | text | 2/14 | 2 | fontSize=13 → fontSize=14 | "Vyberte správny typ" typography differs: size 14px vs 13px |
| minor | typography | text | 2/14 | 2 | fontSize=17 → fontSize=16 | "Faktúra — Alza.sk" typography differs: size 16px vs 17px |
| minor | border-radius | text | 2/14 | 2 | borderRadius=12 → borderRadius=9.6 | "sken dokladu" border-radius is 9.6px, design says 12px |
| minor | pixel-region | surface | 2/14 | 2 | stroke diffRatio 0→0.1 | 5% of pixels differ in surface at (80, 682): outline/stroke differs (the difference hugs the perimeter) (1 region, 18×13px; design 19×19 resampled onto 18×18) |
| minor | typography | text | 2/14 | 2 | fontSize=16 → fontSize=15 | "Faktúra — Alza.sk" typography differs: size 15px vs 16px |
| minor | typography | text | 2/14 | 2 | fontSize=24 → fontSize=22 | "1 249,00 €" typography differs: size 22px vs 24px |
| minor | typography | text | 2/14 | 2 | fontSize=9 fontWeight=600 → fontSize=11 fontWeight=500 | "ÚČT. KATEGÓRIA" typography differs: size 11px vs 9px, weight 500 vs 600 |
| minor | color | text | 2/14 | 2 | backgroundColor=rgb(244, 237, 226) → backgroundColor=oklab(0.57685 0.0910033 0.101805 / 0.096) | "netreba doklad" background is oklab(0.57685 0.0910033 0.101805 / 0.096), design says rgb(244, 237, 226) (ΔE2000 3.3) |
| minor | border | surface | 2/14 | 2 | borderWidth=1 borderColor=rgb(238, 228, 213) borderStyle=solid → borderWidth=1 borderColor=rgba(232, 223, 210, 0.8) borderStyle=dashed | surface at (93, 897) border differs: dashed where the design is solid |
| minor | pixel-region | box | 2/14 | 2 | shape diffRatio 0→0.1 | 5.2% of pixels differ in box at (93, 272): shape differs (edges do not line up — a different glyph or drawing) (31 regions, 267×14px; design 518×40 resampled onto 514×38) |
| minor | color | text | 2/14 | 2 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(248, 243, 236) | "Zrušiť" background is rgb(248, 243, 236), design says rgb(255, 253, 249) (ΔE2000 2.6) |
| minor | typography | text | 2/14 | 2 | fontSize=12 → fontSize=14 | "Zrušiť" typography differs: size 14px vs 12px |
| minor | typography | text | 2/14 | 2 | fontSize=12 fontWeight=600 → fontSize=14 fontWeight=500 | "Priradiť k dokladu" typography differs: size 14px vs 12px, weight 500 vs 600 |
| minor | color | text | 2/14 | 2 (×8) | color=rgb(162, 149, 127) → color=rgba(138, 125, 108, 0.8) | "Slovnaft, a.s." text color is rgba(138, 125, 108, 0.8), design says rgb(162, 149, 127) (ΔE2000 3.4) ×4 |
| minor | border | surface | 2/14 | 2 | borderWidth=1 borderColor=rgb(207, 196, 178) → borderWidth=1 borderColor=rgb(224, 213, 196) | surface at (99, 348) border differs: color rgb(224, 213, 196) vs rgb(207, 196, 178) (ΔE2000 4.2) |
| minor | typography | text | 1/14 | 2 | fontSize=11.5 fontWeight=400 → fontSize=14 fontWeight=500 | "Prevod · 9. 7." typography differs: size 14px vs 11.5px, weight 500 vs 400 |
| minor | border-radius | text | 1/14 | 2 | borderRadius=7.5 → borderRadius=9.5 | "má doklad" border-radius is 9.5px, design says 7.5px |
| minor | typography | text | 1/14 | 2 | fontSize=13 fontWeight=500 → fontSize=10.5 fontWeight=400 | "Platba kartou ·· 4412 · METRO" typography differs: size 10.5px vs 13px, weight 400 vs 500 |
| minor | typography | text | 1/14 | 2 | fontSize=12 → fontSize=11 | "Bez dokladu" typography differs: size 11px vs 12px |
| minor | typography | text | 1/14 | 1 | lineHeight=25.2 → lineHeight=28 | "Je toto naozaj bankový výpis?" typography differs: line-height 28px vs 25.2px |
| minor | typography | text | 1/14 | 1 | fontSize=11 fontWeight=600 → fontSize=12 fontWeight=400 | "↗" typography differs: size 12px vs 11px, weight 400 vs 600 |
| minor | typography | text | 1/14 | 1 | fontSize=16 lineHeight=22.4 → fontSize=18 lineHeight=28 | "Je toto naozaj bankový výpis?" typography differs: size 18px vs 16px, line-height 28px vs 22.4px |
| minor | typography | text | 1/14 | 1 (×4) | fontSize=13.5 fontWeight=500 → fontSize=11.5 fontWeight=400 | "Prevod · Alza.sk s.r.o." typography differs: size 11.5px vs 13.5px, weight 400 vs 500 ×4 |
| minor | typography | text | 1/14 | 1 (×5) | fontSize=11.5 fontWeight=400 → fontSize=13.5 fontWeight=500 | "Prevod · 9. 7." typography differs: size 13.5px vs 11.5px, weight 500 vs 400 ×5 |
| minor | typography | text | 1/14 | 1 | fontSize=13 fontWeight=600 → fontSize=14 fontWeight=500 | "Priradiť k dokladu" typography differs: size 14px vs 13px, weight 500 vs 600 |
| minor | typography | text | 1/14 | 1 (×3) | fontSize=14 fontWeight=500 → fontSize=11.5 fontWeight=400 | "Platba kartou ·· 4412 · ALZA.SK" typography differs: size 11.5px vs 14px, weight 400 vs 500 ×3 |
| minor | typography | text | 1/14 | 1 | fontSize=12.5 → fontSize=11.5 | "Kaviareň Prameň" typography differs: size 11.5px vs 12.5px |
| minor | border-radius | surface | 1/14 | 1 | borderRadius=10 → borderRadius=16.8 | surface at (88, 220) border-radius is 16.8px, design says 10px |
| minor | border-radius | box | 1/14 | 1 | borderRadius=4 → borderRadius=7.2 | box at (100, 229) border-radius is 7.2px, design says 4px |
| minor | typography | text | 1/14 | 1 (×4) | fontSize=12.5 fontWeight=500 → fontSize=10.5 fontWeight=400 | "Platba kartou ·· 4412 · ALZA.SK" typography differs: size 10.5px vs 12.5px, weight 400 vs 500 ×4 |
| minor | typography | text | 1/14 | 1 (×4) | fontSize=10.5 fontWeight=400 → fontSize=12.5 fontWeight=500 | "Karta · 10. 7. · TB ··2841" typography differs: size 12.5px vs 10.5px, weight 500 vs 400 ×4 |
| minor | color | text | 1/14 | 1 | backgroundColor=rgb(244, 237, 226) → backgroundColor=rgb(255, 253, 249) | "účtovník" background is rgb(255, 253, 249), design says rgb(244, 237, 226) (ΔE2000 4.7) |
| minor | typography | text | 1/14 | 1 | fontSize=14 → fontSize=11.5 | "Kaviareň Prameň" typography differs: size 11.5px vs 14px |
| minor | typography | text | 1/14 | 1 | fontSize=11.5 fontWeight=600 → fontSize=10 fontWeight=400 | "Kaviareň Prameň" typography differs: size 10px vs 11.5px, weight 400 vs 600 |
| minor | border-radius | text | 1/14 | 1 | borderRadius=7.5 → borderRadius=10.5 | "účtovník" border-radius is 10.5px, design says 7.5px |
| minor | typography | text | 1/14 | 1 | fontSize=13 → fontSize=11 | "Platba kartou ·· 4412 · ALZA.SK" typography differs: size 11px vs 13px |
| minor | typography | text | 1/14 | 1 (×3) | fontSize=10.5 fontWeight=400 → fontSize=13 fontWeight=500 | "Karta · 12. 7. · TB ··2841" typography differs: size 13px vs 10.5px, weight 500 vs 400 ×3 |
| minor | typography | text | 1/14 | 1 | fontWeight=400 → fontWeight=600 | "Vklad · 21. 6. · TB ··2841 · netreba dok…" typography differs: weight 600 vs 400 |
| minor | typography | text | 1/14 | 1 | fontSize=12 lineHeight=18 → fontSize=10.5 lineHeight=15.75 | "Dobrý deň, prosím nahrajte nám doklad — …" typography differs: size 10.5px vs 12px, line-height 15.75px vs 18px |
| minor | typography | text | 1/14 | 1 | fontSize=13 lineHeight=20.15 → fontSize=12 lineHeight=16.8 | "Zmluva o dielo na rekonštrukciu skladový…" typography differs: size 12px vs 13px, line-height 16.8px vs 20.15px |
| minor | typography | text | 1/14 | 1 | fontSize=13 lineHeight=20.15 → fontSize=16 lineHeight=22.86 | "Nevyzerá to ako faktúra ani pokladničný …" typography differs: size 16px vs 13px, line-height 22.86px vs 20.15px |


