# Matching baseline — 2026-09-15

The before-picture for `docs/plan-divergent-matching.md` steps 3–5, produced by
`node scripts/baseline-matching.ts` at refdiff `29c43ee` (WORKING TREE DIRTY — the numbers below are not a committed state).

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

## refdiff

the annotator's own redesign comps against the annotator serving `fixtures/demo-root` — self-contained in this repo.

Measured 2026-09-15T18:12:14.905Z.

```
cd /root/refdiff
node /root/refdiff/packages/core/dist/cli.js compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out /root/refdiff/out/baseline/refdiff
```

Not in the tables below:

- `refdiff-compare-mobile-toolbar-ghost` — **impl capture failed** (`step-failed`), so it produced no report at all.
- `refdiff-gallery-desktop` — **impl capture failed** (`selector-not-found`), so it produced no report at all.
- `refdiff-gallery-mobile` — **impl capture failed** (`selector-not-found`), so it produced no report at all.
- `refdiff-compare-desktop-ghost` — **impl capture failed** (`step-failed`), so it produced no report at all.
- `refdiff-library-desktop` — disabled in the manifest: RefDiff Library.dc.html draws the card grid chunk 5 replaced — 489 findings at confidence 0.14
- `refdiff-library-mobile` — disabled in the manifest: RefDiff Library.dc.html draws the card grid chunk 5 replaced — 335 findings at confidence 0.67

5 pairs: 0 PASS / 5 FAIL — 1555 findings covering 1918 instances, 120 suppressed; delta +0 / −0
130 of 1555 findings are UNVERIFIED — nothing but a weak alignment paired their two elements, so their values are not evidence of drift
pairing evidence across the set: 87 by text, 22 by slot, 536 by geometry, 910 resting on no pair
1468 unexplained · 87 explained: 63 comp rail row order, 18 canvas zoom divergence, 6 comp mark numbering

| pair                           | verdict | findings (c/M/m) | inst | supp | unver | conf | align           | delta |
|--------------------------------|---------|------------------|------|------|-------|------|-----------------|-------|
| refdiff-compare-desktop        | FAIL    |    95 (26/58/11) |  117 |   64 |     0 | 0.68 | 1 / 0,0         | +0/−0 |
| refdiff-library-groups-desktop | FAIL    | 796 (227/423/146) |  883 |    0 |   117 | 0.30 | 1 / 0,0         | +0/−0 |
| refdiff-library-groups-mobile  | FAIL    | 563 (143/290/130) |  776 |    0 |     0 | 0.70 | 1 / −1.0,−1.0   | +0/−0 |
| refdiff-compare-mobile         | FAIL    |      19 (0/13/6) |   35 |   28 |     0 | 0.91 | 1 / 0,0         | +0/−0 |
| refdiff-compare-mobile-toolbar | FAIL    |     82 (2/53/27) |  107 |   28 |    13 | 0.36 | 1×0.936 / 0,2.4 | +0/−0 |

Matching — what the matcher PAIRED (pairs, not findings). A `matched` column that fell while
`d-only`/`i-only` rose is a REGRESSION, not a precision win: both move that way.

| pair                           | design | impl | matched | text | slot | geom | d-only | i-only | vetoed | conf |
|--------------------------------|--------|------|---------|------|------|------|--------|--------|--------|------|
| refdiff-compare-desktop        |    263 |  194 |     171 |  143 |    0 |   28 |     92 |     23 |      1 | 0.68 |
| refdiff-library-groups-desktop |    487 |  280 |     120 |   19 |    4 |   97 |    367 |    160 |      4 | 0.30 |
| refdiff-library-groups-mobile  |    432 |  224 |     178 |   23 |    5 |  150 |    254 |     46 |      0 | 0.70 |
| refdiff-compare-mobile         |     98 |   71 |      67 |   49 |    1 |   17 |     31 |      4 |      0 | 0.91 |
| refdiff-compare-mobile-toolbar |     89 |   71 |      53 |   38 |    0 |   15 |     36 |     18 |      0 | 0.36 |
| TOTAL (5)                      |   1369 |  840 |     589 |  272 |   10 |  307 |    780 |    251 |      5 |      |

Findings by type:

| pair                           | miss | extra | text | pos | size | space | color | typo | bord | rad | pixel | align |  all |
|--------------------------------|------|-------|------|-----|------|-------|-------|------|------|-----|-------|-------|------|
| refdiff-compare-desktop        |   31 |    19 |    2 |  27 |    3 |     2 |     6 |    1 |    1 |   1 |     2 |     0 |   95 |
| refdiff-library-groups-desktop |  367 |   160 |   60 |  82 |   30 |     9 |    34 |   40 |    4 |   9 |     1 |     0 |  796 |
| refdiff-library-groups-mobile  |  254 |    46 |   65 |  88 |   29 |     7 |    34 |   28 |    3 |   8 |     1 |     0 |  563 |
| refdiff-compare-mobile         |    0 |     3 |    2 |   7 |    2 |     2 |     1 |    0 |    0 |   0 |     2 |     0 |   19 |
| refdiff-compare-mobile-toolbar |    5 |    17 |    4 |  30 |    8 |     3 |     3 |    6 |    1 |   3 |     1 |     1 |   82 |
| TOTAL (5)                      |  657 |   245 |  133 | 234 |   72 |    23 |    78 |   75 |    9 |  21 |     7 |     1 | 1555 |

Across pairs (one row = one cause; `pairs` = how many cells show it):

| severity | type | role | pairs | findings | values | sample |
|----------|------|------|-------|----------|--------|--------|
| critical | missing-element | text | 4/5 | 358 |  | design "1" (5×10) has no counterpart in the implementation |
| critical | missing-element | surface | 4/5 | 105 |  | design surface at (1040, 1180) (320×35) has no counterpart in the implementation |
| major | position | text | 5/5 | 175 (×248) | x 16..1211→13..1211, y 16..2348.5→15..1389 | "+3 introduced" is offset by (77, -0.9)px from the design position ×3 |
| major | size | box | 5/5 | 21 (×41) | w 1..315→7..304, h 8..19→5..38 | box at (307, 58) renders 66×15, design says 1×16 |
| major | extra-element | text | 4/5 | 121 |  | implementation renders "4" (7×14) that the design does not have |
| major | extra-element | surface | 4/5 | 74 |  | implementation renders surface at (1040, 1021) (320×35) that the design does not have |
| major | position | surface | 4/5 | 33 (×76) | x 0..861→0..807.5, y 10.4..1384→7..1342 | surface at (384, 207) is offset by (19.6, -17.5)px from the design position ×3 |
| major | missing-element | box | 3/5 | 194 |  | design box at (1082, 159) (128×14) has no counterpart in the implementation |
| major | extra-element | box | 3/5 | 37 |  | implementation renders box at (82, 115) (257×19) that the design does not have |
| major | size | text | 3/5 | 27 (×51) | w 7..161→8..142.7, h 8.4..24→7..61.5 | "8 stale" renders 74×7, design says 34×14 ×3 |
| major | position | box | 3/5 | 26 (×47) | x 42.1..673→32..645, y 114..1390→105..1370 | box at (673, 114) is offset by (-28, 0)px from the design position ×10 |
| major | size | surface | 3/5 | 24 (×40) | w 34..390→34..390, h 16..686.9→7..695.9 | surface at (861, 306) renders 72×14, design says 48×16 |
| major | extra-element | shape | 3/5 | 12 |  | implementation renders shape at (93, 343) (402×93) that the design does not have |
| major | spacing | box | 3/5 | 6 | horizontal gap 3..34→4..26.2 | horizontal gap between box at (52, 115) and "Both sources" is 21px, design says 32px |
| major | color | text | 3/5 | 5 | color=rgb(231, 233, 236) → color=rgb(229, 72, 77) | "present" text color is rgb(229, 72, 77), design says rgb(231, 233, 236) (ΔE2000 40.4) |
| major | spacing | box | 3/5 | 5 (×13) | vertical gap 3..22.5→8..31 | vertical gap between box at (93, 221) and "5" is 15.8px, design says 20.6px |
| major | color | text | 3/5 | 4 | color=rgb(229, 72, 77) → color=rgb(166, 171, 179) | "DESIGN ONLY" text color is rgb(166, 171, 179), design says rgb(229, 72, 77) (ΔE2000 33.4) |
| major | spacing | surface | 3/5 | 4 (×8) | vertical gap 14.5..61.4→9.8..83.4 | vertical gap between surface at (57, 861) and surface at (57, 932) is 9.8px, design says 37px |
| major | border-radius | text | 3/5 | 3 | borderRadius=8 → borderRadius=0 | "Open sheet" border-radius is 0px, design says 8px |
| major | spacing | text | 2/5 | 5 (×12) | vertical gap 2..56→6..121.2 | vertical gap between "Open sheet" and "Open sheet" is 120px, design says 56px |
| major | pixel-region | surface | 2/5 | 3 (×5) | shape diffRatio 0→0.1..0.2 | 11.2% of pixels differ in surface at (0, 47): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (54 regions, 1342×39px) |
| major | color | text | 2/5 | 3 | color=rgb(245, 166, 35) → color=rgb(166, 171, 179) | "Major" text color is rgb(166, 171, 179), design says rgb(245, 166, 35) (ΔE2000 32.3) |
| major | color | text | 2/5 | 3 | color=rgb(231, 233, 236) → color=rgb(245, 166, 35) | "Select" text color is rgb(245, 166, 35), design says rgb(231, 233, 236) (ΔE2000 31.9) |
| major | typography | text | 2/5 | 3 (×5) | fontFamily=IBM Plex Sans → fontFamily=IBM Plex Mono | "12 min ago" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans" |
| major | typography | text | 2/5 | 3 (×7) | fontFamily=IBM Plex Mono → fontFamily=IBM Plex Sans | "r47" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono" |
| major | color | box | 2/5 | 2 | backgroundColor=rgb(30, 42, 90) → backgroundColor=rgb(245, 166, 35) | box at (93, 221) background is rgb(245, 166, 35), design says rgb(30, 42, 90) (ΔE2000 71.9) |
| major | color | text | 2/5 | 2 (×14) | color=rgb(166, 171, 179) → color=rgb(255, 255, 255) | "SOURCE" text color is rgb(255, 255, 255), design says rgb(166, 171, 179) (ΔE2000 20.3) ×4 |
| major | color | text | 2/5 | 2 (×19) | color=rgb(231, 233, 236) → color=rgb(166, 171, 179) | "Primary · sm · Active" text color is rgb(166, 171, 179), design says rgb(231, 233, 236) (ΔE2000 15.6) ×9 |
| major | color | text | 2/5 | 2 (×9) | color=rgb(76, 154, 255) → color=rgb(166, 171, 179) | "Minor" text color is rgb(166, 171, 179), design says rgb(76, 154, 255) (ΔE2000 20.9) ×3 |
| major | color | text | 2/5 | 2 | color=rgb(245, 166, 35) → color=rgb(70, 167, 88) | "6" text color is rgb(70, 167, 88), design says rgb(245, 166, 35) (ΔE2000 41.3) |
| major | color | text | 2/5 | 2 (×4) | color=rgb(255, 255, 255) → color=rgb(166, 171, 179) | "undo" text color is rgb(166, 171, 179), design says rgb(255, 255, 255) (ΔE2000 20.3) ×3 |
| major | color | text | 2/5 | 2 | color=rgb(231, 233, 236) → color=rgb(70, 167, 88) | "Switch" text color is rgb(70, 167, 88), design says rgb(231, 233, 236) (ΔE2000 34.7) |
| major | border | surface | 2/5 | 2 (×8) | borderWidth=1 borderColor=rgb(76, 77, 84) → borderWidth=0 | surface at (384, 726) border differs: no border, design has one ×3 |
| major | typography | text | 2/5 | 2 (×6) | fontFamily=IBM Plex Mono fontWeight=400 → fontFamily=IBM Plex Sans fontWeight=600 | "r47" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", weight 600 vs 400 |
| major | typography | text | 2/5 | 2 | fontFamily=IBM Plex Mono fontWeight=600 → fontFamily=IBM Plex Sans fontWeight=400 | "3" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", weight 400 vs 600 |
| major | spacing | text | 2/5 | 2 (×6) | horizontal gap 13..17→8..16 | horizontal gap between "Claude Design" and box at (164, 1390) is 8px, design says 17px |
| major | color | text | 1/5 | 2 | color=rgb(166, 171, 179) → color=rgb(229, 72, 77) | "3 h ago" text color is rgb(229, 72, 77), design says rgb(166, 171, 179) (ΔE2000 33.4) |
| major | color | box | 1/5 | 2 | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(229, 72, 77) | box at (59, 351) background is rgb(229, 72, 77), design says rgb(76, 154, 255) (ΔE2000 46.3) |
| major | border | text | 1/5 | 2 | borderWidth=1 borderColor=rgb(76, 77, 84) → borderWidth=1 borderColor=rgb(70, 167, 88) | "Open sheet" border differs: color rgb(70, 167, 88) vs rgb(76, 77, 84) (ΔE2000 40.2) |
| major | typography | text | 1/5 | 2 | fontFamily=IBM Plex Sans fontWeight=600 → fontFamily=IBM Plex Mono fontWeight=400 | "Minor" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans", weight 400 vs 600 |
| major | typography | text | 1/5 | 2 | fontFamily=IBM Plex Mono fontSize=11.5 → fontFamily=Material Symbols Outlined fontSize=14 | "r47" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 14px vs 11.5px |
| major | border-radius | surface | 1/5 | 2 | borderRadius=10 → borderRadius=0 | surface at (384, 726) border-radius is 0px, design says 10px |
| major | typography | text | 1/5 | 2 | fontFamily=Material Symbols Outlined fontSize=16 → fontFamily=IBM Plex Sans fontSize=11 | "grid_view" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11px vs 16px |
| major | typography | text | 1/5 | 2 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=14 fontWeight=400 | "4" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 14px vs 11.5px, weight 400 vs 600 |
| major | color | text | 1/5 | 2 | color=rgb(255, 255, 255) → color=rgb(229, 72, 77) | "undo" text color is rgb(229, 72, 77), design says rgb(255, 255, 255) (ΔE2000 42.8) |
| major | color | text | 1/5 | 2 | color=rgb(91, 141, 239) → color=rgb(70, 167, 88) | "unfold_more" text color is rgb(70, 167, 88), design says rgb(91, 141, 239) (ΔE2000 50.1) |
| major | color | box | 1/5 | 2 | backgroundColor=rgb(79, 70, 229) → backgroundColor=rgb(70, 71, 77) | box at (57, 992) background is rgb(70, 71, 77), design says rgb(79, 70, 229) (ΔE2000 27.2) |
| major | color | text | 1/5 | 2 | color=rgb(231, 233, 236) → color=rgb(76, 154, 255) | "45 cells" text color is rgb(76, 154, 255), design says rgb(231, 233, 236) (ΔE2000 30.6) |
| major | typography | text | 1/5 | 2 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=13 fontWeight=600 | "Primary · sm · Default" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 13px vs 11.5px, weight 600 vs 400 |
| major | typography | text | 1/5 | 2 | fontFamily=Material Symbols Outlined fontSize=18 → fontFamily=IBM Plex Sans fontSize=11 | "chevron_right" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11px vs 18px |
| major | typography | text | 1/5 | 2 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=13 fontWeight=400 | "5" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 13px vs 11.5px, weight 400 vs 600 |
| major | border-radius | text | 1/5 | 2 | borderRadius=0 → borderRadius=18.5 | "list_alt" border-radius is 18.5px, design says 0px |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(59, 74, 140) → backgroundColor=rgb(245, 166, 35) | box at (590, 221) background is rgb(245, 166, 35), design says rgb(59, 74, 140) (ΔE2000 64.3) |
| major | color | text | 1/5 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(143, 126, 231) | "4" background is rgb(143, 126, 231), design says rgb(245, 166, 35) (ΔE2000 57.5) |
| major | border | text | 1/5 | 1 | borderWidth=0 → borderWidth=2 borderColor=rgba(255, 255, 255, 0.9) | "4" border differs: border the design does not have |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontSize=10 fontWeight=700 → fontFamily=IBM Plex Mono fontSize=11 fontWeight=400 | "DESIGN ONLY" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans", size 11px vs 10px, weight 400 vs 700 |
| major | extra-element | image | 1/5 | 1 |  | implementation renders image at (47, 160) (275×132) that the design does not have |
| major | color | text | 1/5 | 1 (×3) | color=rgb(166, 171, 179) → color=rgb(231, 233, 236) | "CELLS" text color is rgb(231, 233, 236), design says rgb(166, 171, 179) (ΔE2000 15.6) ×3 |
| major | color | box | 1/5 | 1 (×3) | backgroundColor=rgb(79, 70, 229) → backgroundColor=rgb(229, 72, 77) | box at (62, 205) background is rgb(229, 72, 77), design says rgb(79, 70, 229) (ΔE2000 41.8) ×3 |
| major | color | text | 1/5 | 1 | color=rgb(245, 166, 35) → color=rgb(255, 255, 255) | "13" text color is rgb(255, 255, 255), design says rgb(245, 166, 35) (ΔE2000 32.5) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(99, 102, 241) → backgroundColor=rgb(245, 166, 35) | box at (82, 351) background is rgb(245, 166, 35), design says rgb(99, 102, 241) (ΔE2000 63.3) |
| major | color | text | 1/5 | 1 (×3) | color=rgb(166, 171, 179) → color=rgb(70, 167, 88) | "12 min ago" text color is rgb(70, 167, 88), design says rgb(166, 171, 179) (ΔE2000 29.8) ×3 |
| major | color | text | 1/5 | 1 | color=rgb(76, 154, 255) → color=rgb(255, 255, 255) | "Minor" text color is rgb(255, 255, 255), design says rgb(76, 154, 255) (ΔE2000 35.5) |
| major | color | text | 1/5 | 1 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(70, 71, 77) | "REGRESSION" background is rgb(70, 71, 77), design says rgb(229, 72, 77) (ΔE2000 35.8) |
| major | color | text | 1/5 | 1 | color=rgb(245, 166, 35) → color=rgb(231, 233, 236) | "Major" text color is rgb(231, 233, 236), design says rgb(245, 166, 35) (ΔE2000 31.9) |
| major | color | text | 1/5 | 1 | color=rgb(76, 154, 255) → color=rgb(231, 233, 236) | "Minor" text color is rgb(231, 233, 236), design says rgb(76, 154, 255) (ΔE2000 30.6) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(245, 166, 35) | box at (59, 638) background is rgb(245, 166, 35), design says rgb(76, 154, 255) (ΔE2000 55.3) |
| major | color | text | 1/5 | 1 | color=rgb(91, 141, 239) → color=rgb(245, 166, 35) | "unfold_more" text color is rgb(245, 166, 35), design says rgb(91, 141, 239) (ΔE2000 55.7) |
| major | color | text | 1/5 | 1 | color=rgb(91, 141, 239) → color=rgb(166, 171, 179) | "Show 31 more" text color is rgb(166, 171, 179), design says rgb(91, 141, 239) (ΔE2000 20.8) |
| major | color | text | 1/5 | 1 | color=rgb(229, 72, 77) → color=rgb(70, 167, 88) | "4" text color is rgb(70, 167, 88), design says rgb(229, 72, 77) (ΔE2000 68.2) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(217, 219, 224) → backgroundColor=rgb(245, 166, 35) | box at (87, 951) background is rgb(245, 166, 35), design says rgb(217, 219, 224) (ΔE2000 31.8) |
| major | color | text | 1/5 | 1 | color=rgb(166, 171, 179) → color=rgb(245, 166, 35) | "12 min ago" text color is rgb(245, 166, 35), design says rgb(166, 171, 179) (ΔE2000 32.3) |
| major | border | text | 1/5 | 1 (×5) | borderWidth=0 → borderWidth=1 borderColor=rgb(70, 167, 88) | "CELLS" border differs: border the design does not have ×5 |
| major | border-radius | text | 1/5 | 1 (×7) | borderRadius=0 → borderRadius=9 | "SOURCE" border-radius is 9px, design says 0px ×7 |
| major | border-radius | text | 1/5 | 1 (×5) | borderRadius=0 → borderRadius=10 | "CELLS" border-radius is 10px, design says 0px ×5 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=10.5 fontWeight=700 | "r47" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 10.5px vs 11.5px, weight 700 vs 400 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=600 → fontFamily=IBM Plex Sans fontSize=10.5 fontWeight=700 | "13" typography differs: family "IBM Plex Sans" vs "IBM Plex Mono", size 10.5px vs 11.5px, weight 700 vs 600 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontSize=11.5 fontWeight=600 → fontFamily=Material Symbols Outlined fontSize=14 fontWeight=400 | "Minor" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 14px vs 11.5px, weight 400 vs 600 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontSize=11 → fontFamily=Material Symbols Outlined fontSize=14 | "3 h ago" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 14px vs 11px |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=16 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=11.5 fontWeight=600 | "unfold_more" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11.5px vs 16px, weight 600 vs 400 |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=12 → fontFamily=IBM Plex Sans fontSize=11 | "history" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11px vs 12px |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined → fontFamily=IBM Plex Sans | "undo" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined" |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontSize=10 fontWeight=700 → fontFamily=IBM Plex Mono fontSize=11.5 fontWeight=400 | "2 REGRESSED" typography differs: family "IBM Plex Mono" vs "IBM Plex Sans", size 11.5px vs 10px, weight 400 vs 700 |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=12 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=10.5 fontWeight=700 | "auto_awesome" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 10.5px vs 12px, weight 700 vs 400 |
| major | typography | text | 1/5 | 1 | fontSize=12 lineHeight=12 → fontSize=26 lineHeight=26 | "undo" typography differs: size 26px vs 12px, line-height 26px vs 12px |
| major | typography | text | 1/5 | 1 | fontSize=16 lineHeight=16 → fontSize=12 lineHeight=12 | "grid_view" typography differs: size 12px vs 16px, line-height 12px vs 16px |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined lineHeight=14 fontWeight=400 → fontFamily=IBM Plex Sans lineHeight=17.55 fontWeight=600 | "chat_bubble" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", line-height 17.55px vs 14px, weight 600 vs 400 |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=16 → fontFamily=IBM Plex Sans fontSize=11.5 | "grid_view" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11.5px vs 16px |
| major | color | surface | 1/5 | 1 (×4) | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgb(60, 61, 66) | surface at (52, 273) background is rgb(60, 61, 66), design says rgb(244, 245, 247) (ΔE2000 61.2) ×4 |
| major | color | text | 1/5 | 1 (×3) | color=rgb(245, 166, 35) → color=rgb(229, 72, 77) | "13" text color is rgb(229, 72, 77), design says rgb(245, 166, 35) (ΔE2000 37.5) ×3 |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(229, 72, 77) | box at (150, 319) background is rgb(229, 72, 77), design says rgb(245, 166, 35) (ΔE2000 37.5) |
| major | color | surface | 1/5 | 1 (×5) | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgb(70, 71, 77) | surface at (68, 405) background is rgb(70, 71, 77), design says rgb(244, 245, 247) (ΔE2000 55.7) ×5 |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(70, 71, 77) | box at (52, 413) background is rgb(70, 71, 77), design says rgb(229, 72, 77) (ΔE2000 35.8) |
| major | color | surface | 1/5 | 1 (×4) | backgroundColor=rgb(244, 245, 247) → backgroundColor=rgb(76, 77, 84) | surface at (68, 459) background is rgb(76, 77, 84), design says rgb(244, 245, 247) (ΔE2000 52.6) ×4 |
| major | color | box | 1/5 | 1 (×4) | backgroundColor=rgb(76, 154, 255) → backgroundColor=rgb(70, 71, 77) | box at (52, 520) background is rgb(70, 71, 77), design says rgb(76, 154, 255) (ΔE2000 39.8) ×4 |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(76, 77, 84) | box at (52, 627) background is rgb(76, 77, 84), design says rgb(245, 166, 35) (ΔE2000 51.1) |
| major | color | text | 1/5 | 1 | color=rgb(255, 255, 255) → color=rgb(245, 166, 35) | "REGRESSION" text color is rgb(245, 166, 35), design says rgb(255, 255, 255) (ΔE2000 32.5) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(70, 71, 77) | box at (52, 786) background is rgb(70, 71, 77), design says rgb(245, 166, 35) (ΔE2000 53.5) |
| major | color | text | 1/5 | 1 | color=rgb(76, 154, 255) → color=rgb(70, 167, 88) | "Minor" text color is rgb(70, 167, 88), design says rgb(76, 154, 255) (ΔE2000 50.7) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(79, 70, 229) → backgroundColor=rgb(76, 77, 84) | box at (57, 1006) background is rgb(76, 77, 84), design says rgb(79, 70, 229) (ΔE2000 26.4) |
| major | color | box | 1/5 | 1 | backgroundColor=rgb(229, 72, 77) → backgroundColor=rgb(245, 166, 35) | box at (164, 1390) background is rgb(245, 166, 35), design says rgb(229, 72, 77) (ΔE2000 37.5) |
| major | border | surface | 1/5 | 1 | borderWidth=0 → borderWidth=1 borderColor=rgb(76, 77, 84) | surface at (52, 1167) border differs: border the design does not have |
| major | border | text | 1/5 | 1 | borderWidth=0 → borderWidth=1 borderColor=rgb(76, 77, 84) | "r47" border differs: border the design does not have |
| major | typography | text | 1/5 | 1 (×4) | fontFamily=Material Symbols Outlined fontSize=20 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=10 fontWeight=700 | "grid_view" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 10px vs 20px, weight 700 vs 400 ×4 |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=13 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=10.5 fontWeight=600 | "arrow_right_alt" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 10.5px vs 13px, weight 600 vs 400 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Mono fontSize=11 → fontFamily=Material Symbols Outlined fontSize=13 | "r45" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 13px vs 11px |
| major | typography | text | 1/5 | 1 (×6) | fontFamily=Material Symbols Outlined fontSize=18 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=10 fontWeight=700 | "chevron_right" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 10px vs 18px, weight 700 vs 400 ×6 |
| major | border-radius | text | 1/5 | 1 (×6) | borderRadius=0 → borderRadius=8.5 | "chevron_right" border-radius is 8.5px, design says 0px ×6 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontWeight=600 → fontFamily=Material Symbols Outlined fontWeight=400 | "Minor" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", weight 400 vs 600 |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=12 → fontFamily=IBM Plex Mono fontSize=11 | "history" typography differs: family "IBM Plex Mono" vs "Material Symbols Outlined", size 11px vs 12px |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=20 → fontFamily=IBM Plex Sans fontSize=11 | "grid_view" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 11px vs 20px |
| major | typography | text | 1/5 | 1 | fontSize=10 fontWeight=700 → fontSize=13 fontWeight=600 | "1 REGRESSED" typography differs: size 13px vs 10px, weight 600 vs 700 |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Sans fontSize=11 → fontFamily=Material Symbols Outlined fontSize=13 | "·" typography differs: family "Material Symbols Outlined" vs "IBM Plex Sans", size 13px vs 11px |
| major | typography | text | 1/5 | 1 | fontFamily=IBM Plex Mono fontSize=11 → fontFamily=Material Symbols Outlined fontSize=18 | "r47" typography differs: family "Material Symbols Outlined" vs "IBM Plex Mono", size 18px vs 11px |
| major | spacing | surface | 1/5 | 1 | horizontal gap 32→17 | horizontal gap between surface at (8, 750) and surface at (256, 749) is 17px, design says 32px |
| major | color | text | 1/5 | 1 | backgroundColor=rgb(245, 166, 35) → backgroundColor=rgb(76, 77, 84) | "!" background is rgb(76, 77, 84), design says rgb(245, 166, 35) (ΔE2000 51.1) |
| major | border | text | 1/5 | 1 | borderWidth=1 borderColor=rgb(51, 52, 56) → borderWidth=0 | "!" border differs: no border, design has one |
| major | typography | text | 1/5 | 1 | fontFamily=Material Symbols Outlined fontSize=18 fontWeight=400 → fontFamily=IBM Plex Sans fontSize=13 fontWeight=600 | "list_alt" typography differs: family "IBM Plex Sans" vs "Material Symbols Outlined", size 13px vs 18px, weight 600 vs 400 |
| minor | text-content | text | 5/5 | 133 |  | text reads "vs run 2026-08-28 08:10", design says "Run 47 vs 46" |
| minor | typography | text | 2/5 | 3 | fontSize=12 → fontSize=13 | "undo" typography differs: size 13px vs 12px |
| minor | color | text | 2/5 | 2 | color=rgb(231, 233, 236) → color=rgb(255, 255, 255) | "r47" text color is rgb(255, 255, 255), design says rgb(231, 233, 236) (ΔE2000 4.9) |
| minor | pixel-region |  | 2/5 | 2 | alignmentConfidence 0.5→0.3..0.4 | pixel channel skipped: alignment confidence 0.30 is below 0.5 — element geometry did not line up well enough to compare pixels |
| minor | typography | text | 2/5 | 2 (×8) | fontSize=11.5 → fontSize=10.5 | "Compare" typography differs: size 10.5px vs 11.5px ×5 |
| minor | typography | text | 2/5 | 2 | fontWeight=600 → fontWeight=400 | "Compare" typography differs: weight 400 vs 600 |
| minor | color | text | 1/5 | 2 | backgroundColor=rgb(60, 61, 66) → backgroundColor=rgb(51, 52, 56) | "Open sheet" background is rgb(51, 52, 56), design says rgb(60, 61, 66) (ΔE2000 3) |
| minor | typography | text | 1/5 | 2 | fontWeight=700 → fontWeight=600 | "CELLS" typography differs: weight 600 vs 700 |
| minor | typography | text | 1/5 | 2 | fontWeight=400 → fontWeight=700 | "12 min ago" typography differs: weight 700 vs 400 |
| minor | typography | text | 1/5 | 2 | fontSize=12 lineHeight=12 → fontSize=14 lineHeight=14 | "design_services" typography differs: size 14px vs 12px, line-height 14px vs 12px |
| minor | border-radius | box | 1/5 | 2 | borderRadius=2 → borderRadius=4 | box at (62, 951) border-radius is 4px, design says 2px |
| minor | border-radius | surface | 1/5 | 2 | borderRadius=5 → borderRadius=0 | surface at (179, 472) border-radius is 0px, design says 5px |
| minor | border-radius | text | 1/5 | 1 | borderRadius=10 → borderRadius=6 | "4" border-radius is 6px, design says 10px |
| minor | typography | text | 1/5 | 1 (×3) | fontSize=12 → fontSize=10.5 | "Open sheet" typography differs: size 10.5px vs 12px ×3 |
| minor | border-radius | text | 1/5 | 1 (×3) | borderRadius=8 → borderRadius=10 | "Open sheet" border-radius is 10px, design says 8px ×3 |
| minor | typography | text | 1/5 | 1 (×4) | fontWeight=400 → fontWeight=600 | "3 h ago" typography differs: weight 600 vs 400 ×4 |
| minor | typography | text | 1/5 | 1 | fontSize=11.5 fontWeight=600 → fontSize=10.5 fontWeight=700 | "Minor" typography differs: size 10.5px vs 11.5px, weight 700 vs 600 |
| minor | border-radius | text | 1/5 | 1 | borderRadius=0 → borderRadius=3 | "Primary · md · Focus" border-radius is 3px, design says 0px |
| minor | typography | text | 1/5 | 1 | fontSize=11.5 → fontSize=13.5 | "Minor" typography differs: size 13.5px vs 11.5px |
| minor | typography | text | 1/5 | 1 (×3) | fontSize=13.5 → fontSize=11.5 | "Checkbox" typography differs: size 11.5px vs 13.5px ×3 |
| minor | color | surface | 1/5 | 1 (×6) | backgroundColor=rgb(42, 43, 46) → backgroundColor=rgb(51, 52, 56) | surface at (17, 390) background is rgb(51, 52, 56), design says rgb(42, 43, 46) (ΔE2000 3) ×6 |
| minor | color | text | 1/5 | 1 | color=rgb(255, 255, 255) → color=rgb(231, 233, 236) | "1 REGRESSED" text color is rgb(231, 233, 236), design says rgb(255, 255, 255) (ΔE2000 4.9) |
| minor | pixel-region | frame | 1/5 | 1 | unexplainedDiffRatio 0→0 | 1.13% of the frame differs OUTSIDE every matched element — nothing in the element model covers it, so no per-element finding can. 58 region(s); largest: 26×32 at (72, 274); 29×17 at (53, 341); 358×15 at (16, 379). A container's background, border, radius or width is the usual cause: containers are not leaf elements, so they are never matched and never diffed. |
| minor | border-radius | box | 1/5 | 1 (×7) | borderRadius=2 → borderRadius=0 | box at (82, 292) border-radius is 0px, design says 2px ×7 |
| minor | typography | text | 1/5 | 1 | fontSize=10 fontWeight=700 → fontSize=11.5 fontWeight=600 | "1 REGRESSED" typography differs: size 11.5px vs 10px, weight 600 vs 700 |
| minor | border-radius | text | 1/5 | 1 | borderRadius=0 → borderRadius=4 | "undo" border-radius is 4px, design says 0px |
| minor | typography | text | 1/5 | 1 | fontSize=9.5 fontWeight=700 → fontSize=11.5 fontWeight=600 | "REGRESSION" typography differs: size 11.5px vs 9.5px, weight 600 vs 700 |
| minor | border-radius | text | 1/5 | 1 | borderRadius=7.5 → borderRadius=0 | "REGRESSION" border-radius is 0px, design says 7.5px |
| minor | typography | text | 1/5 | 1 | fontSize=16 lineHeight=16 → fontSize=13 lineHeight=13 | "unfold_more" typography differs: size 13px vs 16px, line-height 13px vs 16px |
| minor | typography | text | 1/5 | 1 (×4) | fontSize=13 → fontSize=11.5 | "Checkbox" typography differs: size 11.5px vs 13px ×4 |
| minor | border-radius | text | 1/5 | 1 | borderRadius=0 → borderRadius=6 | "r47" border-radius is 6px, design says 0px |
| minor | pixel-region | surface | 1/5 | 1 | noise diffRatio 0→0.1 | 8.5% of pixels differ in surface at (217, 157): rasterization residue along shared edges (same shape, same color) (17 regions, 165×37px) |
| minor | alignment |  | 1/5 | 1 | scale=1 offsetX=0 offsetY=0 → scale=1 scaleY=0.93585 offsetX=0 offsetY=2.41 | alignment is not the identity on a same-size page: the fit absorbed scale 1.00000 × 0.93585 (x × y), offset (0.00, 2.41)px — a systematic size difference in the chrome above or beside the anchors (box model?); fix the sizes and the transform snaps to scale 1, offset 0 |
| minor | typography | text | 1/5 | 1 (×5) | fontSize=11 → fontSize=12 | "Off" typography differs: size 12px vs 11px ×5 |
| minor | typography | text | 1/5 | 1 | fontSize=18 lineHeight=18 → fontSize=16 lineHeight=16 | "hub" typography differs: size 16px vs 18px, line-height 16px vs 18px |
| minor | typography | text | 1/5 | 1 (×7) | fontSize=16 lineHeight=16 → fontSize=18 lineHeight=18 | "pan_tool" typography differs: size 18px vs 16px, line-height 18px vs 16px ×7 |
| minor | typography | text | 1/5 | 1 | fontSize=16 → fontSize=17 | "fit_screen" typography differs: size 17px vs 16px |



## uctoinak2

the Uctoinak app's 45 page and component pairs, including the witness `messages-accountant-desktop`.

Measured 2026-09-15T18:13:57.912Z.

```
cd /root/uctoinak2/.claude/worktrees/messages-redesign
node /root/refdiff/packages/core/dist/cli.js compare --manifest tools/design-compare/manifest.mjs --design-dir tools/design-compare/design-reference \
  --app-url http://localhost:3210 --out /root/refdiff/out/baseline/uctoinak2 \
  --auth-post /api/test/session --auth-header "x-test-secret: playwright-local-placeholder-secret-min-32chars" --storybook-url http://localhost:6006
```

Not in the tables below:

- `docs-owner-desktop` — **impl capture failed** (`error-page`), so it produced no report at all.
- `docs-owner-mobile` — **impl capture failed** (`error-page`), so it produced no report at all.
- `doc-detail-owner-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `doc-detail-owner-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `doc-detail-accountant-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `doc-detail-accountant-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-owner-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-owner-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-accountant-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-accountant-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-all-requested-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `tx-picker-all-requested-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `card-unidentified-doc-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `card-unidentified-doc-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `card-not-a-statement-desktop` — **impl capture failed** (`unreachable`), so it produced no report at all.
- `card-not-a-statement-mobile` — **impl capture failed** (`unreachable`), so it produced no report at all.

29 pairs: 0 PASS / 29 FAIL — 3652 findings covering 4218 instances, 8 suppressed; delta +0 / −0
495 of 3652 findings are UNVERIFIED — nothing but a weak alignment paired their two elements, so their values are not evidence of drift
pairing evidence across the set: 724 by text, 77 by slot, 1081 by geometry, 1770 resting on no pair

| pair                                    | verdict | findings (c/M/m) | inst | supp | unver | conf | align                     | delta |
|-----------------------------------------|---------|------------------|------|------|-------|------|---------------------------|-------|
| docs-accountant-desktop                 | FAIL    |  221 (106/80/35) |  256 |    0 |    12 | 0.00 | 1.173×1.162 / −15.3,0     | +0/−0 |
| docs-accountant-mobile                  | FAIL    |   174 (65/64/45) |  184 |    0 |    28 | 0.10 | 1.026 / 0,0               | +0/−0 |
| today-owner-desktop                     | FAIL    |    78 (25/38/15) |   82 |    0 |     0 | 0.50 | 1.101×1.032 / −263.8,−9.8 | +0/−0 |
| portfolio-accountant-desktop            | FAIL    |   192 (37/98/57) |  279 |    0 |    22 | 0.29 | 1.141×1.097 / −43.7,−9.3  | +0/−0 |
| portfolio-accountant-mobile             | FAIL    |   160 (25/83/52) |  200 |    0 |    27 | 0.10 | 1.011×0.790 / −2.1,272.9  | +0/−0 |
| client-detail-chrome-accountant-desktop | FAIL    |   111 (21/54/36) |  147 |    0 |    13 | 0.00 | 1.162 / −14.9,0           | +0/−0 |
| client-detail-chrome-accountant-mobile  | FAIL    |     87 (8/47/32) |   99 |    0 |    12 | 0.38 | 0.800×1.223 / 4.0,−14.2   | +0/−0 |
| client-overview-accountant-desktop      | FAIL    | 318 (118/126/74) |  375 |    0 |    46 | 0.08 | 0.990×1 / 7.8,0           | +0/−0 |
| client-overview-accountant-mobile       | FAIL    |  216 (48/104/64) |  235 |    0 |    47 | 0.13 | 1 / 0,0                   | +0/−0 |
| client-pending-accountant-desktop       | FAIL    |   159 (80/54/25) |  189 |    8 |    11 | 0.38 | 0.602×1.398 / 49.6,−99.6  | +0/−0 |
| client-pending-accountant-mobile        | FAIL    |   151 (72/40/39) |  170 |    0 |    24 | 0.38 | 0.861×0.913 / −3.4,−1.4   | +0/−0 |
| settings-owner-desktop                  | FAIL    |   109 (25/44/40) |  111 |    0 |    22 | 0.13 | 0.970×1.083 / 0.7,0       | +0/−0 |
| settings-owner-mobile                   | FAIL    |    61 (20/16/25) |   81 |    0 |     5 | 0.25 | 1.035×1.026 / −0.7,0      | +0/−0 |
| settings-accountant-desktop             | FAIL    |    79 (14/27/38) |   90 |    0 |    17 | 0.38 | 1.106×0.892 / −6.8,6.0    | +0/−0 |
| settings-accountant-mobile              | FAIL    |    76 (24/22/30) |   85 |    0 |     9 | 0.38 | 1.061×0.793 / −4.0,24.3   | +0/−0 |
| settings-members-owner-desktop          | FAIL    |   123 (28/59/36) |  129 |    0 |    19 | 0.13 | 1.456×1.083 / −29.8,0     | +0/−0 |
| settings-team-accountant-desktop        | FAIL    |    98 (12/48/38) |  107 |    0 |    13 | 0.38 | 1.097×0.962 / −4.8,1.7    | +0/−0 |
| invite-org-desktop                      | FAIL    |     37 (18/9/10) |   37 |    0 |     0 | 0.00 | 1.162×1.285 / 0,−10.3     | +0/−0 |
| invite-org-mobile                       | FAIL    |      30 (16/5/9) |   30 |    0 |     1 | 0.00 | 1.026 / 0,0               | +0/−0 |
| invite-firm-desktop                     | FAIL    |     37 (18/12/7) |   37 |    0 |     0 | 0.13 | 1.162×1.285 / −33.7,−10.3 | +0/−0 |
| invite-firm-mobile                      | FAIL    |      30 (16/5/9) |   30 |    0 |     1 | 0.00 | 1.026 / 0,0               | +0/−0 |
| client-settings-accountant-desktop      | FAIL    |    113 (9/54/50) |  142 |    0 |     0 | 0.50 | 1.017×1.125 / 4.8,5.5     | +0/−0 |
| client-settings-accountant-mobile       | FAIL    |     89 (9/42/38) |   98 |    0 |    13 | 0.33 | 1.061×1.406 / −3.0,32.3   | +0/−0 |
| messages-owner-desktop                  | FAIL    |  189 (18/103/68) |  220 |    0 |    33 | 0.07 | 1 / 0,0                   | +0/−0 |
| messages-owner-mobile                   | FAIL    |   117 (16/65/36) |  138 |    0 |    13 | 0.00 | 0.990×0.995 / 18.5,0      | +0/−0 |
| messages-accountant-desktop             | FAIL    |  225 (35/127/63) |  262 |    0 |    34 | 0.07 | 1.091×1 / −10.5,0         | +0/−0 |
| messages-accountant-mobile              | FAIL    |   145 (17/86/42) |  154 |    0 |    29 | 0.00 | 0.834×0.995 / 35.8,0      | +0/−0 |
| client-members-accountant-desktop       | FAIL    |   129 (20/68/41) |  142 |    0 |    21 | 0.00 | 1.162 / 0,0               | +0/−0 |
| client-members-accountant-mobile        | FAIL    |    98 (11/46/41) |  109 |    0 |    23 | 0.25 | 1.065×1.469 / −3.2,−40.6  | +0/−0 |

Matching — what the matcher PAIRED (pairs, not findings). A `matched` column that fell while
`d-only`/`i-only` rose is a REGRESSION, not a precision win: both move that way.

| pair                                    | design | impl | matched | text | slot | geom | d-only | i-only | vetoed | conf |
|-----------------------------------------|--------|------|---------|------|------|------|--------|--------|--------|------|
| docs-accountant-desktop                 |    160 |   57 |      30 |   16 |    1 |   13 |    130 |     27 |      0 | 0.00 |
| docs-accountant-mobile                  |    114 |   48 |      31 |   13 |    2 |   16 |     83 |     17 |      0 | 0.10 |
| today-owner-desktop                     |     42 |   36 |      11 |    4 |    1 |    6 |     31 |     25 |      0 | 0.50 |
| portfolio-accountant-desktop            |    114 |  102 |      66 |   37 |    0 |   29 |     48 |     36 |      1 | 0.29 |
| portfolio-accountant-mobile             |     76 |   73 |      44 |   15 |    0 |   29 |     32 |     29 |      0 | 0.10 |
| client-detail-chrome-accountant-desktop |     48 |   57 |      26 |   11 |    2 |   13 |     22 |     31 |      0 | 0.00 |
| client-detail-chrome-accountant-mobile  |     31 |   48 |      22 |   10 |    0 |   12 |      9 |     26 |      0 | 0.38 |
| client-overview-accountant-desktop      |    194 |   90 |      57 |   23 |    1 |   33 |    137 |     33 |      0 | 0.08 |
| client-overview-accountant-mobile       |    103 |   82 |      45 |   12 |    2 |   31 |     58 |     37 |      0 | 0.13 |
| client-pending-accountant-desktop       |    124 |   44 |      19 |   12 |    1 |    6 |    105 |     25 |      0 | 0.38 |
| client-pending-accountant-mobile        |    103 |   36 |      26 |    9 |    1 |   16 |     77 |     10 |      1 | 0.38 |
| settings-owner-desktop                  |     46 |   31 |      20 |    9 |    1 |   10 |     26 |     11 |      1 | 0.13 |
| settings-owner-mobile                   |     42 |   28 |      21 |    9 |    0 |   12 |     21 |      7 |      0 | 0.25 |
| settings-accountant-desktop             |     36 |   23 |      18 |    5 |    2 |   11 |     18 |      5 |      0 | 0.38 |
| settings-accountant-mobile              |     45 |   28 |      21 |    7 |    0 |   14 |     24 |      7 |      0 | 0.38 |
| settings-members-owner-desktop          |     46 |   46 |      17 |    8 |    1 |    8 |     29 |     29 |      0 | 0.13 |
| settings-team-accountant-desktop        |     36 |   44 |      20 |    5 |    1 |   14 |     16 |     24 |      0 | 0.38 |
| invite-org-desktop                      |     25 |    8 |       4 |    4 |    0 |    0 |     21 |      4 |      0 | 0.00 |
| invite-org-mobile                       |     23 |    8 |       4 |    3 |    0 |    1 |     19 |      4 |      0 | 0.00 |
| invite-firm-desktop                     |     25 |    8 |       4 |    4 |    0 |    0 |     21 |      4 |      0 | 0.13 |
| invite-firm-mobile                      |     23 |    8 |       4 |    3 |    0 |    1 |     19 |      4 |      0 | 0.00 |
| client-settings-accountant-desktop      |     47 |   54 |      36 |   18 |    0 |   18 |     11 |     18 |      0 | 0.50 |
| client-settings-accountant-mobile       |     27 |   46 |      18 |   10 |    1 |    7 |      9 |     28 |      0 | 0.33 |
| messages-owner-desktop                  |     65 |   77 |      44 |   21 |    0 |   23 |     21 |     33 |      0 | 0.07 |
| messages-owner-mobile                   |     43 |   61 |      24 |   17 |    0 |    7 |     19 |     37 |      0 | 0.00 |
| messages-accountant-desktop             |     80 |  106 |      42 |   19 |    1 |   22 |     38 |     64 |      0 | 0.07 |
| messages-accountant-mobile              |     45 |   68 |      26 |   11 |    0 |   15 |     19 |     42 |      0 | 0.00 |
| client-members-accountant-desktop       |     51 |   55 |      29 |   12 |    0 |   17 |     22 |     26 |      0 | 0.00 |
| client-members-accountant-mobile        |     29 |   47 |      18 |    4 |    1 |   13 |     11 |     29 |      0 | 0.25 |
| TOTAL (29)                              |   1843 | 1419 |     747 |  331 |   19 |  397 |   1096 |    672 |      3 |      |

Findings by type:

| pair                                    | miss | extra | text | pos | size | space | color | typo | bord | rad | pixel | align |  all |
|-----------------------------------------|------|-------|------|-----|------|-------|-------|------|------|-----|-------|-------|------|
| docs-accountant-desktop                 |  129 |    27 |    8 |  26 |    5 |     3 |     4 |    7 |    3 |   8 |     1 |     0 |  221 |
| docs-accountant-mobile                  |   82 |    17 |    8 |  21 |    9 |     4 |     9 |   14 |    5 |   4 |     1 |     0 |  174 |
| today-owner-desktop                     |   29 |    25 |    4 |   5 |    1 |     0 |     4 |    4 |    1 |   3 |     2 |     0 |   78 |
| portfolio-accountant-desktop            |   48 |    36 |    8 |  38 |   12 |    10 |    17 |   11 |    4 |   7 |     1 |     0 |  192 |
| portfolio-accountant-mobile             |   32 |    29 |   11 |  34 |    8 |    15 |    15 |   11 |    2 |   2 |     1 |     0 |  160 |
| client-detail-chrome-accountant-desktop |   22 |    31 |   10 |  20 |    3 |     2 |     4 |    7 |    2 |   9 |     1 |     0 |  111 |
| client-detail-chrome-accountant-mobile  |    9 |    26 |    3 |  19 |   10 |     4 |     3 |    8 |    1 |   3 |     1 |     0 |   87 |
| client-overview-accountant-desktop      |  135 |    33 |   20 |  49 |   15 |    10 |    19 |   18 |    6 |  11 |     1 |     1 |  318 |
| client-overview-accountant-mobile       |   58 |    37 |   20 |  34 |   13 |     3 |    15 |   24 |    6 |   5 |     1 |     0 |  216 |
| client-pending-accountant-desktop       |   93 |    25 |    4 |   9 |   11 |     3 |     5 |    3 |    0 |   4 |     1 |     1 |  159 |
| client-pending-accountant-mobile        |   76 |    10 |    6 |  20 |   10 |     5 |     5 |   10 |    3 |   4 |     1 |     1 |  151 |
| settings-owner-desktop                  |   25 |    10 |   10 |  17 |    6 |     4 |    13 |   14 |    1 |   8 |     1 |     0 |  109 |
| settings-owner-mobile                   |   21 |     7 |    3 |  16 |    5 |     3 |     2 |    3 |    0 |   0 |     1 |     0 |   61 |
| settings-accountant-desktop             |   18 |     5 |   11 |  14 |    3 |     4 |     8 |   11 |    0 |   4 |     1 |     0 |   79 |
| settings-accountant-mobile              |   24 |     7 |    3 |  17 |    6 |     8 |     4 |    6 |    0 |   0 |     1 |     0 |   76 |
| settings-members-owner-desktop          |   28 |    28 |   10 |  17 |    4 |     1 |    13 |   15 |    0 |   6 |     1 |     0 |  123 |
| settings-team-accountant-desktop        |   16 |    24 |   13 |  17 |    3 |     3 |     8 |   10 |    0 |   3 |     1 |     0 |   98 |
| invite-org-desktop                      |   21 |     4 |    0 |   4 |    4 |     1 |     2 |    0 |    0 |   0 |     1 |     0 |   37 |
| invite-org-mobile                       |   19 |     4 |    0 |   1 |    2 |     0 |     1 |    2 |    0 |   0 |     1 |     0 |   30 |
| invite-firm-desktop                     |   21 |     4 |    0 |   4 |    4 |     1 |     2 |    0 |    0 |   0 |     1 |     0 |   37 |
| invite-firm-mobile                      |   19 |     4 |    0 |   1 |    2 |     0 |     1 |    2 |    0 |   0 |     1 |     0 |   30 |
| client-settings-accountant-desktop      |   11 |    18 |   10 |  27 |   10 |     6 |    11 |    9 |    2 |   8 |     1 |     0 |  113 |
| client-settings-accountant-mobile       |    9 |    28 |    5 |  13 |   10 |     2 |     7 |    9 |    2 |   3 |     1 |     0 |   89 |
| messages-owner-desktop                  |   20 |    33 |   17 |  42 |   12 |     9 |    16 |   18 |    7 |  14 |     1 |     0 |  189 |
| messages-owner-mobile                   |   18 |    36 |    3 |  20 |   10 |     2 |    10 |    8 |    2 |   7 |     1 |     0 |  117 |
| messages-accountant-desktop             |   37 |    64 |   16 |  34 |   10 |     6 |    18 |   16 |    8 |  15 |     1 |     0 |  225 |
| messages-accountant-mobile              |   17 |    41 |    9 |  26 |   10 |     2 |    15 |   12 |    5 |   7 |     1 |     0 |  145 |
| client-members-accountant-desktop       |   21 |    26 |   13 |  28 |    6 |     4 |    10 |   10 |    1 |   9 |     1 |     0 |  129 |
| client-members-accountant-mobile        |   11 |    29 |   15 |  13 |    3 |     1 |    10 |   10 |    1 |   4 |     1 |     0 |   98 |
| TOTAL (29)                              | 1069 |   668 |  240 | 586 |  207 |   116 |   251 |  272 |   62 | 148 |    30 |     3 | 3652 |

Across pairs (one row = one cause; `pairs` = how many cells show it):

| severity | type | role | pairs | findings | values | sample |
|----------|------|------|-------|----------|--------|--------|
| critical | missing-element | text | 29/29 | 806 |  | design "2" (7×13) has no counterpart in the implementation |
| critical | missing-element | surface | 29/29 | 161 |  | design surface at (-14, 1) (272×1086) has no counterpart in the implementation |
| critical | missing-element | box | 22/29 | 96 |  | design box at (1162, 238) (56×14) has no counterpart in the implementation |
| critical | pixel-region | icon | 1/29 | 1 | shape diffRatio 0→0.8 | 80.4% of pixels differ in icon at (979, 22): shape differs (edges do not line up — a different glyph or drawing), and the fill around it is recolored (1 region, 16×16px; design 20×19 resampled onto 16×16) |
| major | position | text | 29/29 | 530 (×603) | x -30.5..1243.9→13.7..1225, y -5.4..1421.9→17.5..1045 | "&" is offset by (-59.7, 1.3)px from the design position |
| major | extra-element | text | 29/29 | 315 |  | implementation renders "4" (9×14) that the design does not have |
| major | size | text | 29/29 | 164 (×279) | w 3..512→5..517, h 8.7..88.7→12..108 | "Požiadať o doklad" renders 102×14, design says 120×16 |
| major | extra-element | surface | 27/29 | 193 |  | implementation renders surface at (0, 0) (240×900) that the design does not have |
| major | spacing | text | 24/29 | 74 (×145) | vertical gap 0..55.5→4..65 | vertical gap between "Správy" and "Požiadavky" is 33px, design says 23.2px ×3 |
| major | color | text | 18/29 | 21 (×32) | color=rgb(44, 36, 25) → color=rgb(138, 125, 108) | "Portfólio" text color is rgb(138, 125, 108), design says rgb(44, 36, 25) (ΔE2000 31.2) |
| major | size | surface | 15/29 | 29 (×41) | w 10.2..399.9→16..402, h 18.5..1040.4→14..1080 | surface at (85, 360) renders 79×14, design says 87×18 |
| major | spacing | text | 15/29 | 28 (×31) | horizontal gap 2.9..54.9→8..135.8 | horizontal gap between "Exportovať" and "Požiadať o doklad" is 40px, design says 43.4px |
| major | border-radius | text | 15/29 | 19 (×28) | borderRadius=9 → borderRadius=0 | "Portfólio" border-radius is 0px, design says 9px |
| major | position | box | 13/29 | 23 (×29) | x 17.6..1062.6→16..1031, y 18.1..748→19..759 | box at (293, 99) is offset by (-23.1, 49.8)px from the design position |
| major | position | surface | 13/29 | 23 (×36) | x -28.8..962→0..1014, y 1..963.4→0..1012.5 | surface at (85, 360) is offset by (41.9, 32.5)px from the design position |
| major | extra-element | box | 13/29 | 18 |  | implementation renders box at (16, 294) (278×36) that the design does not have |
| major | color | text | 13/29 | 13 (×70) | color=rgb(95, 85, 70) → color=rgb(138, 125, 108) | "Prehľad" text color is rgb(138, 125, 108), design says rgb(95, 85, 70) (ΔE2000 15.6) ×9 |
| major | size | box | 11/29 | 13 | w 1.1..331→8..351, h 0.9..105.2→1..40 | box at (293, 99) renders 230×32, design says 246×37 |
| major | border-radius | text | 11/29 | 13 (×19) | borderRadius=0 → borderRadius=12 | "Správy" border-radius is 12px, design says 0px |
| major | color | text | 11/29 | 11 (×17) | color=rgb(255, 253, 249) → color=rgb(138, 125, 108) | "2" text color is rgb(138, 125, 108), design says rgb(255, 253, 249) (ΔE2000 34.1) |
| major | position | icon | 10/29 | 10 | x 282..1211.5→303.5..1221.5, y 19.5..38.3→21.5..39.5 | icon at (1208, 38) is offset by (13.6, 1.2)px from the design position |
| major | border | text | 9/29 | 14 | borderWidth=0 → borderWidth=1 borderColor=rgb(224, 213, 196) | "Filter" border differs: border the design does not have |
| major | color | text | 9/29 | 13 | color=rgb(138, 125, 108) → color=rgb(44, 36, 25) | "nevyriešených" text color is rgb(44, 36, 25), design says rgb(138, 125, 108) (ΔE2000 31.2) |
| major | color | text | 7/29 | 9 (×11) | color=rgb(95, 85, 70) → color=rgb(44, 36, 25) | "Exportovať" text color is rgb(44, 36, 25), design says rgb(95, 85, 70) (ΔE2000 16.2) |
| major | border | icon | 7/29 | 7 | borderWidth=0 → borderWidth=1 borderColor=rgb(232, 223, 210) | icon at (1208, 38) border differs: border the design does not have |
| major | border-radius | text | 6/29 | 10 | borderRadius=8 → borderRadius=0 | "6" border-radius is 0px, design says 8px |
| major | color | text | 6/29 | 7 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(244, 237, 226) | "MH" background is rgb(244, 237, 226), design says rgb(184, 92, 36) (ΔE2000 40.7) |
| major | border-radius | text | 6/29 | 6 | borderRadius=0 → borderRadius=18 | "Filter" border-radius is 18px, design says 0px |
| major | missing-element | icon | 5/29 | 6 |  | design icon at (1087, 37) (22×21) has no counterpart in the implementation |
| major | border-radius | icon | 5/29 | 5 | borderRadius=0 → borderRadius=19 | icon at (1208, 38) border-radius is 19px, design says 0px |
| major | border | text | 5/29 | 5 (×7) | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=0 | "⛭" border differs: no border, design has one |
| major | color | text | 4/29 | 7 (×9) | color=rgb(184, 92, 36) → color=rgb(44, 36, 25) | "Žiadosť o doklad" text color is rgb(44, 36, 25), design says rgb(184, 92, 36) (ΔE2000 34.7) ×3 |
| major | color | text | 4/29 | 6 | color=rgb(185, 171, 151) → color=rgb(44, 36, 25) | "ÚČTOVNÉ PARAMETRE" text color is rgb(44, 36, 25), design says rgb(185, 171, 151) (ΔE2000 51.2) |
| major | spacing | surface | 4/29 | 5 | vertical gap 19.9..41.8→23..51.7 | vertical gap between surface at (346, 17) and "Viac" is 23px, design says 20.5px |
| major | color | text | 4/29 | 5 (×14) | color=rgb(185, 171, 151) → color=rgb(138, 125, 108) | "VYŽADUJE AKCIU" text color is rgb(138, 125, 108), design says rgb(185, 171, 151) (ΔE2000 15) ×6 |
| major | color | text | 4/29 | 4 | color=rgb(138, 125, 108) → color=rgb(184, 92, 36) | "Exportovať" text color is rgb(184, 92, 36), design says rgb(138, 125, 108) (ΔE2000 20.6) |
| major | border | surface | 4/29 | 4 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=0 | surface at (346, 17) border differs: no border, design has one |
| major | border-radius | icon | 4/29 | 4 (×7) | borderRadius=0 → borderRadius=18 | icon at (356, 28) border-radius is 18px, design says 0px ×4 |
| major | color | text | 4/29 | 4 | color=rgb(95, 85, 70) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "Jazyk a región" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(95, 85, 70) (ΔE2000 30.7) |
| major | color | text | 4/29 | 4 | color=rgb(168, 154, 133) → color=rgb(138, 125, 108) | "Prepnúť organizáciu" text color is rgb(138, 125, 108), design says rgb(168, 154, 133) (ΔE2000 10.1) |
| major | typography | text | 4/29 | 4 | fontSize=9.5 → fontSize=12 | "Prepnúť organizáciu" typography differs: size 12px vs 9.5px |
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
| major | border | text | 2/29 | 3 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=0 | "Dobrý deň, poslali sme zálohu 1 200 € na…" border differs: no border, design has one |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(255, 253, 249) | "2" background is rgb(255, 253, 249), design says rgb(178, 60, 46) (ΔE2000 50.4) |
| major | border-radius | text | 2/29 | 2 | borderRadius=0 → borderRadius=10 | "Exportovať" border-radius is 10px, design says 0px |
| major | color | text | 2/29 | 2 | color=rgb(95, 85, 70) → color=rgb(255, 253, 249) | "ZK" text color is rgb(255, 253, 249), design says rgb(95, 85, 70) (ΔE2000 50.1) |
| major | pixel-region | frame | 2/29 | 2 | unexplainedDiffRatio 0→0..0.1 | 8.25% of the frame differs OUTSIDE every matched element — nothing in the element model covers it, so no per-element finding can. 325 region(s); largest: 1031×475 at (0, 265); 207×57 at (966, 14); 290×5 at (617, 146). A container's background, border, radius or width is the usual cause: containers are not leaf elements, so they are never matched and never diffed. |
| major | color | text | 2/29 | 2 | color=rgb(95, 85, 70) → color=lab(33.7174 55.8993 41.0293) | "25. 7. · o 11 dní" text color is lab(33.7174 55.8993 41.0293), design says rgb(95, 85, 70) (ΔE2000 26.3) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(184, 92, 36) → backgroundColor=rgb(44, 74, 110) | "KP" background is rgb(44, 74, 110), design says rgb(184, 92, 36) (ΔE2000 42.7) |
| major | color | box | 2/29 | 2 | backgroundColor=rgb(160, 111, 20) → backgroundColor=rgb(178, 60, 46) | box at (516, 315) background is rgb(178, 60, 46), design says rgb(160, 111, 20) (ΔE2000 26.9) |
| major | color | box | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(78, 122, 90) | box at (516, 381) background is rgb(78, 122, 90), design says rgb(178, 60, 46) (ΔE2000 48.2) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(78, 122, 90) → backgroundColor=rgb(185, 132, 25) | "ŠL" background is rgb(185, 132, 25), design says rgb(78, 122, 90) (ΔE2000 32.7) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(138, 125, 108) → backgroundColor=rgb(184, 92, 36) | "PD" background is rgb(184, 92, 36), design says rgb(138, 125, 108) (ΔE2000 20.6) |
| major | color | text | 2/29 | 2 | backgroundColor=rgb(178, 60, 46) → backgroundColor=rgb(244, 237, 226) | "2" background is rgb(244, 237, 226), design says rgb(178, 60, 46) (ΔE2000 47.6) |
| major | typography | text | 2/29 | 2 | fontSize=9.5 lineHeight=16 fontWeight=600 → fontSize=14 lineHeight=20 fontWeight=400 | "2" typography differs: size 14px vs 9.5px, line-height 20px vs 16px, weight 400 vs 600 |
| major | typography | text | 2/29 | 2 | fontFamily=Public Sans fontSize=12 fontWeight=600 → fontFamily=Newsreader fontSize=26 fontWeight=500 | "Doklady · Kaviareň Prameň" typography differs: family "Newsreader" vs "Public Sans", size 26px vs 12px, weight 500 vs 600 |
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
| major | border-radius | text | 2/29 | 2 (×4) | borderRadius=17 → borderRadius=0 | "Preposlať e-mailom" border-radius is 0px, design says 17px |
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
| major | border-radius | text | 1/29 | 1 | borderRadius=14 → borderRadius=0 | "⛭" border-radius is 0px, design says 14px |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=13 fontWeight=600 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "Júl 2026" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 13px, weight 400 vs 600 |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(244, 237, 226) → backgroundColor=rgb(184, 92, 36) | "ZK" background is rgb(184, 92, 36), design says rgb(244, 237, 226) (ΔE2000 40.7) |
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
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=20 fontWeight=500 → fontFamily=Public Sans fontSize=12 fontWeight=400 | "7" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 20px, weight 400 vs 500 |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=20 fontWeight=500 → fontFamily=Public Sans fontSize=14 fontWeight=400 | "218" typography differs: family "Public Sans" vs "Newsreader", size 14px vs 20px, weight 400 vs 500 |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=12 → fontFamily=Newsreader fontSize=14 | "Správy" typography differs: family "Newsreader" vs "Public Sans", size 14px vs 12px |
| major | color | text | 1/29 | 1 | color=rgb(248, 243, 236) → color=rgb(138, 125, 108) | "Všetko" text color is rgb(138, 125, 108), design says rgb(248, 243, 236) (ΔE2000 32) |
| major | typography | text | 1/29 | 1 | fontFamily=Public Sans fontSize=11 fontWeight=400 → fontFamily=Newsreader fontSize=26 fontWeight=500 | "Blokuje uzávierku Júl · najstaršia čaká …" typography differs: family "Newsreader" vs "Public Sans", size 26px vs 11px, weight 500 vs 400 |
| major | color | text | 1/29 | 1 | color=rgb(44, 36, 25) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "Organizácia" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(44, 36, 25) (ΔE2000 47.5) |
| major | typography | text | 1/29 | 1 | fontSize=10 fontWeight=600 → fontSize=16 fontWeight=400 | "KP" typography differs: size 16px vs 10px, weight 400 vs 600 |
| major | typography | text | 1/29 | 1 | fontFamily=Newsreader fontSize=25 fontWeight=500 → fontFamily=Public Sans fontSize=12 fontWeight=600 | "Organizácia" typography differs: family "Public Sans" vs "Newsreader", size 12px vs 25px, weight 600 vs 500 |
| major | border-radius | text | 1/29 | 1 | borderRadius=0 → borderRadius=8 | "IČO" border-radius is 8px, design says 0px |
| major | border-radius | text | 1/29 | 1 | borderRadius=21 → borderRadius=12 | "Uložiť" border-radius is 12px, design says 21px |
| major | color | text | 1/29 | 1 | color=rgb(122, 83, 38) → color=rgb(184, 92, 36) | "Upravujete nastavenia organizácie . Zmen…" text color is rgb(184, 92, 36), design says rgb(122, 83, 38) (ΔE2000 15.4) |
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
| major | color | text | 1/29 | 1 | backgroundColor=rgb(255, 253, 249) → backgroundColor=rgb(184, 92, 36) | "‹" background is rgb(184, 92, 36), design says rgb(255, 253, 249) (ΔE2000 44.2) |
| major | color | text | 1/29 | 1 | color=rgb(255, 253, 249) → color=rgb(95, 85, 70) | "ZK" text color is rgb(95, 85, 70), design says rgb(255, 253, 249) (ΔE2000 50.1) |
| major | color | text | 1/29 | 1 | color=rgb(255, 253, 249) → color=rgb(44, 36, 25) | "ZK" text color is rgb(44, 36, 25), design says rgb(255, 253, 249) (ΔE2000 77.8) |
| major | border-radius | text | 1/29 | 1 | borderRadius=10 → borderRadius=0 | "＋ Pozvať člena" border-radius is 0px, design says 10px |
| major | color | text | 1/29 | 1 | backgroundColor=rgb(44, 36, 25) → backgroundColor=rgb(78, 122, 90) | "PK" background is rgb(78, 122, 90), design says rgb(44, 36, 25) (ΔE2000 33.2) |
| minor | extra-element | icon | 28/29 | 110 |  | implementation renders icon at (972, 202) (14×14) that the design does not have |
| minor | pixel-region |  | 27/29 | 27 | alignmentConfidence 0.5→0..0.4 | pixel channel skipped: alignment confidence 0.00 is below 0.5 — element geometry did not line up well enough to compare pixels |
| minor | text-content | text | 25/29 | 240 |  | text reads "Kaviareň Prameň · s.r.o. · DPH mesačne", design says "3 na vybavenie · DPH termín o 11 dní" |
| minor | extra-element | backdrop | 23/29 | 32 |  | implementation renders backdrop at (0, 0) (1280×900) that the design does not have |
| minor | typography | text | 15/29 | 17 (×26) | fontSize=11 → fontSize=12 | "KP" typography differs: size 12px vs 11px |
| minor | typography | text | 14/29 | 18 | fontSize=10 → fontSize=12 | "klient · Hrubá & Co." typography differs: size 12px vs 10px |
| minor | typography | text | 13/29 | 16 (×27) | fontWeight=600 → fontWeight=500 | "Portfólio" typography differs: weight 500 vs 600 |
| minor | border-radius | text | 13/29 | 14 (×33) | borderRadius=8 → borderRadius=12 | "Prehľad" border-radius is 12px, design says 8px ×4 |
| minor | typography | text | 9/29 | 11 | fontWeight=500 → fontWeight=600 | "−68,40 €" typography differs: weight 600 vs 500 |
| minor | border-radius | text | 9/29 | 10 (×27) | borderRadius=9 → borderRadius=12 | "⋯" border-radius is 12px, design says 9px ×8 |
| minor | typography | text | 8/29 | 10 | fontWeight=600 → fontWeight=400 | "⛭" typography differs: weight 400 vs 600 |
| minor | typography | text | 8/29 | 9 (×20) | fontSize=10.5 → fontSize=12 | "KAVIAREŇ PRAMEŇ" typography differs: size 12px vs 10.5px |
| minor | color | text | 7/29 | 9 | color=rgb(248, 243, 236) → color=rgb(255, 253, 249) | "Všetko" text color is rgb(255, 253, 249), design says rgb(248, 243, 236) (ΔE2000 2.6) |
| minor | color | text | 6/29 | 8 | color=rgb(168, 154, 133) → color=oklab(0.596632 0.00792834 0.0285945 / 0.7) | "ÚČET" text color is oklab(0.596632 0.00792834 0.0285945 / 0.7), design says rgb(168, 154, 133) (ΔE2000 4.8) |
| minor | typography | text | 6/29 | 7 (×14) | fontSize=13 → fontSize=14 | "Požiadať o doklad" typography differs: size 14px vs 13px |
| minor | typography | text | 6/29 | 7 (×17) | fontSize=10 fontWeight=500 → fontSize=12 fontWeight=400 | "Správy" typography differs: size 12px vs 10px, weight 400 vs 500 |
| minor | typography | text | 6/29 | 7 | fontSize=12.5 → fontSize=14 | "Požiadať o doklad" typography differs: size 14px vs 12.5px |
| minor | typography | text | 6/29 | 6 | fontSize=10 fontWeight=600 → fontSize=12 fontWeight=500 | "Portfólio" typography differs: size 12px vs 10px, weight 500 vs 600 |
| minor | border | text | 5/29 | 5 (×14) | borderWidth=1 borderColor=rgb(224, 213, 196) → borderWidth=1 borderColor=rgb(232, 223, 210) | "Exportovať" border differs: color rgb(232, 223, 210) vs rgb(224, 213, 196) (ΔE2000 2.8) |
| minor | typography | text | 5/29 | 5 (×12) | fontSize=13 fontWeight=600 → fontSize=14 fontWeight=500 | "Kaviareň Prameň" typography differs: size 14px vs 13px, weight 500 vs 600 ×4 |
| minor | border-radius | text | 4/29 | 7 | borderRadius=8 → borderRadius=10 | "Žiadosť o doklad" border-radius is 10px, design says 8px |
| minor | color | text | 4/29 | 6 (×10) | color=rgb(95, 85, 70) → color=oklab(0.265965 0.00576137 0.0220057 / 0.75) | "Profil a účet" text color is oklab(0.265965 0.00576137 0.0220057 / 0.75), design says rgb(95, 85, 70) (ΔE2000 3.9) |
| minor | typography | text | 4/29 | 4 (×12) | fontWeight=500 → fontWeight=400 | "9 dokladov" typography differs: weight 400 vs 500 |
| minor | typography | text | 4/29 | 4 (×22) | fontSize=12 → fontSize=13 | "Prehľad" typography differs: size 13px vs 12px ×7 |
| minor | typography | text | 4/29 | 4 | fontSize=16 → fontSize=14 | "Kaviareň Prameň" typography differs: size 14px vs 16px |
| minor | border-radius | text | 4/29 | 4 | borderRadius=17 → borderRadius=12 | "MH" border-radius is 12px, design says 17px |
| minor | typography | text | 4/29 | 4 | fontSize=13 fontWeight=500 → fontSize=12 fontWeight=600 | "Jazyk a región" typography differs: size 12px vs 13px, weight 600 vs 500 |
| minor | color | text | 4/29 | 4 | color=rgb(95, 85, 70) → color=rgba(44, 36, 25, 0.7) | "Vybavené" text color is rgba(44, 36, 25, 0.7), design says rgb(95, 85, 70) (ΔE2000 7) |
| minor | border | text | 4/29 | 4 | borderWidth=1 borderColor=rgb(232, 223, 210) → borderWidth=1 borderColor=rgba(232, 223, 210, 0.7) | "Vybavené" border differs: color rgba(232, 223, 210, 0.7) vs rgb(232, 223, 210) (ΔE2000 2.7) |
| minor | typography | text | 4/29 | 4 | fontSize=12 → fontSize=10.5 | "Vybavené" typography differs: size 10.5px vs 12px |
| minor | typography | text | 3/29 | 4 | fontSize=12.5 fontWeight=600 → fontSize=14 fontWeight=500 | "Štvrťročné" typography differs: size 14px vs 12.5px, weight 500 vs 600 |
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
| minor | typography | text | 2/29 | 2 | fontSize=11.5 → fontSize=14 | "ZK" typography differs: size 14px vs 11.5px |
| minor | border-radius | text | 2/29 | 2 | borderRadius=19 → borderRadius=12 | "ZK" border-radius is 12px, design says 19px |
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
| minor | border-radius | text | 1/29 | 1 | borderRadius=7 → borderRadius=0 | "KP" border-radius is 0px, design says 7px |
| minor | typography | text | 1/29 | 1 | fontSize=12 fontWeight=500 → fontSize=14 fontWeight=600 | "Názov organizácie" typography differs: size 14px vs 12px, weight 600 vs 500 |
| minor | typography | text | 1/29 | 1 | fontSize=13 → fontSize=12 | "Automatické priradenie nových klientov" typography differs: size 12px vs 13px |
| minor | typography | text | 1/29 | 1 | fontWeight=400 → fontWeight=600 | "Upravujete nastavenia organizácie . Zmen…" typography differs: weight 600 vs 400 |
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
| minor | typography | text | 1/29 | 1 | fontSize=12 fontWeight=600 → fontSize=12.8 fontWeight=500 | "＋ Pozvať člena" typography differs: size 12.8px vs 12px, weight 500 vs 600 |
| minor | border | text | 1/29 | 1 | borderWidth=1 borderColor=rgb(213, 200, 180) → borderWidth=1 borderColor=rgb(232, 223, 210) | "✉" border differs: color rgb(232, 223, 210) vs rgb(213, 200, 180) (ΔE2000 6) |
| minor | typography | text | 1/29 | 1 | fontSize=11 fontWeight=400 → fontSize=13 fontWeight=600 | "peter@pramen.sk" typography differs: size 13px vs 11px, weight 600 vs 400 |
| minor | border-radius | text | 1/29 | 1 | borderRadius=18 → borderRadius=21.6 | "✉" border-radius is 21.6px, design says 18px |


