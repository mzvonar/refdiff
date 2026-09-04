// refdiff manifest for DOGFOODING: the RefDiff redesign of the annotator
// (Claude Design project 5a1a95c3-beee-457a-815b-ef6f6bf3e06a, fetched into
// design/refdiff/) against the annotator app itself, serving the COMMITTED
// demo root: `refdiff-annotator fixtures/demo-root --serve` (port 7378, or
// whatever `svc` allocated — see refdiff.bindings.md). The demo root mirrors
// the comps' fixture data (regenerate: `node fixtures/make-demo-root.ts`), so
// the alignment has shared text anchors and findings are chrome, not copy.
//
//   refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
//     --app-url http://127.0.0.1:7378 --out out/refdiff [--pair refdiff-library-desktop]
//
// Both comps are responsive: the same file renders its mobile layout when the
// capture viewport is narrow (Library < 640px, Comparison Tool < 760px), so the
// mobile pairs reuse the desktop comps at 390×844.
//
// THE PHONE COMPS WERE CONSOLIDATED IN THE DESIGN PROJECT ON 2026-09-04, and the
// names moved under us — read this before trusting an older comment:
//   - `RefDiff Mobile Toolbar.dc.html` was RENAMED to `RefDiff Mobile.dc.html`
//     and is now "the default mobile layout" (Mato). Byte-identical to the file
//     it replaced apart from a caption linking to two now-deleted siblings, and
//     that caption sits outside the `.cc-theme-dark` phone node this pair scopes
//     to — so the rename moved no measurement. Its frame is still
//     `RefDiff mobile toolbar`.
//   - `RefDiff Mobile.dc.html` USED to be the designer's phone-frame showcase
//     (a toggle + <dc-import> of the two pages), deliberately unpaired. That
//     file is gone and the NAME now means the layout above, so the waiver it
//     held in packages/annotator/test/pair-coverage.test.ts went with it.
//   - `RefDiff Mobile Minimal.dc.html` was DELETED (deliberate, confirmed).
//     Its pair `refdiff-compare-mobile-minimal` is retired here, and
//     MINIMAL_IGNORE with it.
//   - Four comps arrived that have no pair yet: `RefDiff Library Groups.dc.html`
//     + `… Mobile` (frames `Library — grouped` / `Library — grouped (mobile)`)
//     and `RefDiff Gallery.dc.html` + `… Mobile` (frames
//     `Gallery — Button variant sheet` / `RefDiff gallery mobile`). The Gallery
//     pair waits on chunk 3 — there is no impl surface to capture yet, and a
//     route that does not exist compares "fine" against the wrong comp. The
//     Library Groups comps are a REBUILD of the Library, not a delta against
//     what chunk 1 shipped: see docs/handoff-gallery-groups.md.
//   - The MOBILE comps are separate FILES with their own phone frames, not the
//     responsive-at-a-narrow-viewport shape the Library pairs use, so each needs
//     `scope: ".cc-theme-dark"` like the pair below.
//
// The impl route for the comparison page is a hash route into one run dir of
// the served demo root — the pair the comps open (`fixtures/make-demo-root.ts`
// OPENED_PAIR). A missing dir renders the index instead and compares "fine"
// against the wrong comp.

// What the Library pairs excuse, and why (docs/plan-annotator-redesign.md,
// phase 2). Suppressions stay in findings.json under `suppressed`.
const LIBRARY_IGNORE = {
  textPatterns: [
    // gap 24: refdiff has no run-in-progress state — a run dir exists once
    // `compare` wrote it — so the comp's Pending verdict / Processing and
    // Queued pills / "running" and "waiting" times are designer data.
    "^(Pending|Processing|Queued|running|waiting)$",
    // gap 27: the relative "when" is rendered against the wall clock; the
    // fixture's clock is fixed (regenerate with --now before a measure and
    // the strings agree, but the minutes still tick during the run).
    "^(just now|\\d+ (min|h|d) ago|yesterday)$",
    // The degraded card quotes the real parser message; the comp a sample.
    "^findings\\.json · ",
    // The topbar's computer/smartphone button is the comp's DESIGN-PREVIEW
    // switch (Mato flips the artboard between layouts with it), not a product
    // control: the app picks the layout by width alone (removed 2026-08-28).
    "^(smartphone|computer)$",
  ],
  accepted: [
    {
      type: "extra-element",
      role: "image",
      // contents: the plate's three grey bars are drawn INSIDE the region our
      // <img> occupies — the same decision, excused as "(inside)" (harness item 14).
      contents: true,
      reason: "decision D6: the card thumbnail is the run's own impl.png; the comp's grey plate is the designer's stand-in for that screenshot",
    },
    {
      // D6 on the mobile layout: the plate box is MATCHED to our tile (34×26 vs
      // 44×56), so it is a size finding on the pair rather than an extra image;
      // its position / colour findings and the bars inside are its contents.
      type: "size",
      role: "box",
      expected: { w: 34, h: 26 },
      actual: { w: 44, h: 56 },
      contents: true,
      reason: "decision D6 (mobile): the comp's 34×26 grey plate is matched to the card's 44×56 impl.png tile",
    },
  ],

  // COUNTS. Every number on this page is a function of what the root HOLDS, and
  // the root now holds 53 pairs where the comp's demo holds 12 (chunk 3 gave the
  // fixture a 41-cell variant set — `ds-button` — because the Gallery comp's
  // subject IS a variant sheet and a sheet cannot be measured against a root
  // with no set). Masking the numbers and comparing the rest is what keeps the
  // COPY honest: "53 of 53 comparisons" stops being reported, and a reworded
  // label still is.
  //
  // This replaces two `accepted` rules that LAPSED here, exactly as designed —
  // they pinned `Major 2` -> `Major 3` and `Minor 2` -> `Minor 3`, and the set
  // moved the same card to `Major 5` / `Minor 4`, so both rules stopped hitting
  // and their findings resurfaced. Their reason is kept because it is still
  // true and is not the same fact as this one: gap 23 — the Library comp's card
  // counts the opened pair's f1-f6 only, while refdiff also counts the Tool
  // comp's aggregates g1 (major) and g2 (minor).
  dataSlots: {
    patterns: ["\\d+ of \\d+ comparisons", "(Critical|Major|Minor) \\d+", "^\\d+$"],
  },

  // THE GROUP ROW, and it is one diagnosed cause rather than eight acceptances.
  //
  // `RefDiff Library.dc.html` predates grouping entirely: it draws twelve cards
  // and no group, so the `ds-button` row — its name, its chevron, its
  // "41 comparisons", its severity roll-up and its regression pill — has no
  // counterpart anywhere in the comp. Chunk 5 rebuilds this surface against
  // `RefDiff Library Groups.dc.html`, which draws groups as a six-column table;
  // the fix is that rebuild, not anything on this pair. So the findings stay
  // REPORTED with their severity, grouped under the cause, and out of the
  // verdict — the state the skill's `explain` exists for.
  //
  // Measured across this change, and the middle number is the reason the fixture
  // sorts the set OLDEST (see SET_AGE): with the set's cells timestamped 35 min
  // ago the group sorted FOURTH and shifted nine cards past their counterparts —
  // desktop 197 findings at confidence 0.28. Sorted last: 23 findings at 0.89,
  // mobile 21 at 1.00, and what remains is the row itself.
  //
  // `types` is the safety. This cause can add or drop an ELEMENT and move the
  // pixels under it; it cannot change a colour, a typeface, a border or a
  // radius, so every `color`, `typography`, `border` and `border-radius`
  // finding on these pairs stays unexplained and still fails the run.
  explain: [
    {
      types: ["extra-element", "missing-element", "pixel-region"],
      region: { x: 0, y: 0, w: 4000, h: 4000 },
      cause: "Library comp predates groups",
      reason:
        "the demo root carries a 41-cell `ds-button` variant set since chunk 3, so the Library draws a thirteenth row the comp has no counterpart for; chunk 5 rebuilds this surface against RefDiff Library Groups.dc.html. Measured: 8 named extra elements (ds-button, expand_more, 41 comparisons, trending_up, Critical 21, Major 46, Minor 48, 1 regressed), the row surface, and three 8x8 severity dots",
    },
    {
      types: ["position", "size"],
      region: { x: 0, y: 0, w: 4000, h: 4000 },
      cause: "root holds 53 pairs, the comp's demo 12",
      reason:
        "the head's count string is longer than the comp's ('53 of 53 comparisons' against '12 of 12 comparisons'), so the filter row's contents sit further right — measured as one offset of +78px on three elements, which is the string's own width and not a layout change",
    },
  ],
}

// What the Comparison Tool pairs excuse, and why (phase 3). The comp renders the
// pair under review as LIVE DOM (`dc-import` of parts/Artboard Design|Impl), the
// app renders the run's own design.png / impl.png — so the artboard's texts can
// never be matched and the two screenshots are always "extra". Content-shaped:
// the pattern names the artboard's vocabulary and expires with the artboard
// (regenerate: `grep -oh '>[^<{]*<' design/refdiff/parts/*.dc.html`).
const PLACEHOLDER_TEXT =
  "^(Veriflow|Need help\\?|Document|Selfie|Review|Verify your identity|Choose a document type and upload a clear photo of it\\.|Passport|Driver’s licence|ID card|Photo page with MRZ visible|Front and back sides|Drag your document here|PNG, JPG or PDF · up to 10 MB|Browse files|Continue|Save for later|Your documents are encrypted in transit and processed in line with GDPR\\. Verification usually takes under a minute\\.|directions_car|badge|public|upload_file)$"

const COMPARE_IGNORE = {
  // Scoped by finding TYPE, not just by string. These words are the comp's ARTBOARD
  // vocabulary: the comp imports the artboards as live DOM where the app draws the run's
  // PNGs, so those strings genuinely have no counterpart (24 `missing-element` findings on
  // one pair). Unscoped, the same rule ALSO excused geometry — 3 `position` and 1 `spacing`
  // finding about the delta strip's Review BUTTON, which merely shares the word "Review"
  // with an artboard label. Role scoping cannot separate them: both are role "text".
  textPatterns: [
    {
      types: ["missing-element", "extra-element", "text-content", "typography", "color"],
      pattern: PLACEHOLDER_TEXT,
    },
  ],

  // The artboard is the app's SCREENSHOT against the comp's live DOM, so nothing drawn inside it can
  // ever pair: inside that image, a `missing-element` IS the comp's artboard, and that is provable
  // rather than probable — which is what lets this rule excuse TEXT (the artboard's step numerals)
  // where `contents: true` never could.
  //
  // It replaces `accepted: [{ …, contents: true }]` for the INSIDES (2026-09-03). That rule took its
  // region from a finding ABOUT the image, so it only fired when the image itself was reported as an
  // extra-element — which needs the image to fail to PAIR. Measured across the six compare pairs:
  // the design side has no image element at all, the app has one or two, and they still paired on
  // five pairs because a comp artboard container sat within the γ cutoff. It fired on
  // `refdiff-compare-mobile-toolbar-ghost` alone, whose panned canvas puts the image at 780×849
  // (−301, −416) — and among the 12 findings it excused there was the GHOST FOOTPRINT, so the one
  // pair that draws the ghost was the one pair that hid it. `contentsOf` names the ELEMENT: it fires
  // every run and its region follows the canvas when the reader pans it, which a literal `regions`
  // box cannot do.
  // KNOWN CAUSES, named on the findings they produce (ignore.explain). These stay REPORTED with
  // their severity — they are labelled, counted under their cause and left out of the verdict,
  // because a verdict about a cause already diagnosed and not ours to fix trains a reader to
  // ignore the number. Measured 2026-09-04: of 340 findings across the eight pairs, 189 are the
  // first rule and 109 the second — 88% of the set, and neither is the implementation's drift.
  //
  // `types` is the safety argument, not a convenience: each rule names only what its cause can
  // PHYSICALLY produce. Reordering rows moves things and breaks pairings; a different canvas zoom
  // moves and scales them. NEITHER can change a colour, a font, a border or a string — so every
  // `color`, `typography`, `border`, `border-radius` and `text-content` finding in these very
  // regions stays unexplained and still fails the run.
  explain: [
    {
      // The RAIL, and it goes first: on a ghost pair the panned artboard image below "contains" the
      // rail too, so the more specific region has to win. The box is chrome, which does not move
      // with the canvas, and it runs past the frame's height on purpose — the rail scrolls, and its
      // rows below y=820 are the ones that read as off-frame.
      types: ["position", "spacing", "missing-element", "extra-element"],
      region: { x: 1039, y: 86, w: 321, h: 2000 },
      cause: "comp rail row order",
      reason:
        "the comp's demo lists its rail rows 1,2,3,7,8,9,10,11,4,5,6,12..15 while refdiff lists by severity, so the two columns shift past each other and re-pair; design ask 1 (sort the demo array high → medium → low). Measured: 189 findings across three pairs, and it is why compare-mobile-toolbar-ghost sits at 0.49 alignment confidence",
    },
    {
      // NUMERALS with no counterpart, anywhere on the canvas. The two sides number from different
      // sources — the comp's badges follow its demo array order and its artboard draws its own step
      // numbers as live DOM, the app numbers by severity and draws a screenshot — so a bare numeral
      // present on one side and not the other is never the implementation drifting. The text scope
      // is what keeps it honest: a missing BUTTON, LABEL or icon inside the same region does not
      // match `^\d+$` and still fails the run, and a numeral's colour or typography is not a
      // presence type, so it stays compared too. Asks 1 and 3 both end here.
      types: ["missing-element", "extra-element"],
      within: { role: "image" },
      text: "^\\d+$",
      cause: "comp mark numbering",
      reason:
        "the comp numbers its marks by demo array order and draws its artboard's step numbers as live DOM; the app numbers by severity and draws the run's screenshot, so a bare numeral on one side only is a numbering difference, not drift — design asks 1 (row order) and 3 (the demo comments' side)",
    },
    {
      // The CANVAS. Its region has to be the image's LIVE box, not a literal one: the artboard moves
      // and scales with every pan and zoom (450×489 at (69,208) flat, 995×1083 at (−338,−440) on a
      // ghost pair), which is exactly the case a fixed rectangle cannot express.
      types: ["position", "size", "spacing"],
      within: { role: "image" },
      cause: "canvas zoom divergence",
      reason:
        "the app's fit and focus solve for the canvas its floating panels leave visible; the comps size from the full pane, so the two canvases end at different zoom and everything drawn on them differs by one transform (measured: the ghost pill's four parts as one offset of (7.5, -190.7), the footprint unpaired at γ 217). Decided app-side 2026-08-28 and widened 2026-09-03; design ask 6 asks whether the comps should adopt it",
    },
  ],

  contentsOf: [
    {
      role: "image",
      types: ["missing-element"],
      reason: "the app draws the run's design.png / impl.png where the comp imports the artboards as live DOM",
    },
  ],

  accepted: [
    {
      type: "extra-element",
      role: "image",
      // The image ITSELF, not its insides: the comp has no <img> anywhere, so the app's two
      // screenshots are structurally extra whenever they fail to pair with an artboard container.
      reason: "the app draws the run's design.png / impl.png where the comp imports the artboards as live DOM",
    },
  ],
}
// Phase 4 — the review rail. What the comp draws that refdiff's data cannot say,
// each named by its CONTENT so the rule expires when the comp changes:
//  - gap 26: the comp's aggregates carry a second "cause" line; `Finding` has
//    no such field (the message IS the title), so the two sentences are
//    designer data.
//  - gap 33: the comp's `×15` / `×6` count `1 + inst.length` where `inst[0]`
//    repeats the primary rect — an off-by-one in the demo data; refdiff's
//    `instances` counts every distinct place (×14 / ×5).
//  - the suppressed disclosure says "by preset rules" in the comp; refdiff has
//    no presets — the rules are the manifest's ignore policy (section C).
COMPARE_IGNORE.textPatterns.push(
  "^(Muted label token resolves to the wrong grey|Section padding change pushes the whole row down)$",
  "^×(15|6)$",
  "^\\d+ suppressed by preset rules$",
)
COMPARE_IGNORE.accepted.push(
  // gap 33, the app's side of the same off-by-one: the comp's ×15 / ×6 are excused above, so the
  // app's ×14 / ×5 (the true count of distinct places) would otherwise read as extra elements.
  {
    type: "extra-element",
    text: "×14",
    reason: "gap 33: the comp's g1 says ×15 (1 + inst.length with inst[0] repeating the primary); refdiff counts 14 distinct places — the comp's ×15 is excused by the pattern above, this is its counterpart",
  },
  {
    type: "extra-element",
    text: "×5",
    reason: "gap 33: the comp's g2 says ×6 for five distinct places — see ×14",
  },
  {
    type: "text-content",
    expected: { text: "8 findings · 3 comments · 1 unsaved" },
    actual: { text: "8 findings · 3 comments" },
    reason: "gap 34: the comp's demo comment c2 carries a saveErr, so its phone sheet summary says '· 1 unsaved'; a failed save is runtime state the fixture cannot carry — the app shows the same words when a PUT really fails",
  },
)
// gap 29 (RESOLVED 2026-08-28: `showDeltaStrip` defaults to true in the comp,
// flipped at Mato's request; in the REMOTE project too since the 2026-08-29
// refetch, which also draws the × in the regression state — the app's
// decision of 2026-08-28, so the former `close` rule went): both sides draw
// the delta strip. Its COPY is
// still designer data — the Tool comp says "Run 47 vs 46 · −6 resolved", the
// Library card "−1 resolved" (gap 23), the app the fixture's real delta — so
// the strip's vocabulary is excused. The minus is written both ways because the
// extractor folds U+2212 to "-".
//
// SCOPED BY TYPE (2026-09-02). This rule used to be a bare string, and the
// comment here claimed "the layout underneath is measured" — it was not. An
// unscoped textPattern removes EVERY finding type about a matching string, so it
// was also hiding the strip's LAYOUT: "2 regressions" offset by (-285, 28.2)px,
// "+3 introduced" by (77, -1.4)px, and a 66x15 box the design draws 1x16. Those
// were real (the app's run label was 77px wider than the comp's, which wrapped
// the strip) and nobody could see them. `types` keeps the copy excused and the
// geometry compared, which is what the comment always said.
//
// `vs run <date>` is GONE from the alternation: core numbers runs since
// 2026-09-02, so the app renders "Run 47 vs 46" in the comp's own shape. The
// numbers are data, so they belong in dataSlots (below), where the surrounding
// copy stays compared — a wording change in that label must still be reported.
COMPARE_IGNORE.textPatterns.push({
  types: ["missing-element", "extra-element", "text-content", "typography", "color"],
  pattern:
    "^(\\+\\d+ introduced|[−-]\\d+ resolved|\\d+ regressions?|fixed earlier, back again — fix plan halted)$",
})
// The run label now has the same SHAPE on both sides ("Run 47 vs 46"), so mask the
// ordinals and compare the rest rather than excusing the whole string.
COMPARE_IGNORE.dataSlots = { patterns: ["Run \\d+ vs \\d+"] }

// The TOOLBAR layout starts from the shared Comparison-tool policy (the comp's artboard
// vocabulary, the two screenshots, the delta strip's copy). It deliberately did NOT start from
// the retired MINIMAL_IGNORE (removed 2026-09-04 with its pair): that set's extra acceptances
// were claims about the MINIMAL comp — its shortened demo title, and its omission of the delta
// strip — which said nothing about this one. The rule that outlives it: whatever this comp needs
// gets its own entry with its own reason, once measured.
// This pair's steps OPEN the rail, and on a phone the rail is a bottom SHEET — a region the shared
// desktop rail box cannot cover. Same cause and the same types, at the sheet's measured box; it is
// scoped to the one pair that opens it, because on a pair whose sheet is closed the same rectangle
// would sit over live canvas and mislabel it.
const PHONE_SHEET_EXPLAIN = {
  types: ["position", "spacing", "missing-element", "extra-element"],
  region: { x: 0, y: 418, w: 390, h: 1600 },
  cause: "comp rail row order",
  reason:
    "the phone's rail, opened by this pair's steps: the comp's demo row order shifts the sheet's rows against the app's exactly as it does the desktop rail — design ask 1",
}

const TOOLBAR_IGNORE = {
  textPatterns: COMPARE_IGNORE.textPatterns,
  contentsOf: COMPARE_IGNORE.contentsOf,
  explain: COMPARE_IGNORE.explain,
  accepted: COMPARE_IGNORE.accepted,
}

// CHUNK 3 — what the Gallery comps excuse. Deliberately EMPTY at registration:
// the first run's findings ARE this surface's specification (the skill's §0), and
// a policy written before the measurement excuses findings nobody has read. Every
// entry added here from now on carries the measurement that justified it.
const GALLERY_IGNORE = {}

const desktop = { width: 1360, height: 820 }
const mobile = { width: 390, height: 844 }
const COMPARE_ROUTE = "/#/onboarding-document-step"

export const manifest = [
  {
    id: "refdiff-library-desktop",
    title: "RefDiff · Library (desktop)",
    design: { file: "RefDiff Library.dc.html", frame: "Library" },
    app: { source: "live", route: "/", viewport: { width: 1180, height: 800 }, waitFor: "#cards .card" },
    ignore: LIBRARY_IGNORE,
  },
  {
    id: "refdiff-compare-desktop",
    title: "RefDiff · Comparison tool (desktop)",
    design: { file: "RefDiff Comparison Tool.dc.html", frame: "RefDiff comparison tool" },
    app: { source: "live", route: COMPARE_ROUTE, viewport: desktop, waitFor: "#panes" },
    ignore: COMPARE_IGNORE,
  },
  {
    id: "refdiff-library-mobile",
    title: "RefDiff · Library (mobile)",
    design: { file: "RefDiff Library.dc.html", frame: "Library" },
    app: { source: "live", route: "/", viewport: mobile, waitFor: "#cards .card" },
    ignore: LIBRARY_IGNORE,
  },
  {
    // The phone's DEFAULT layout — the toolbars over and under the canvas, which is what this
    // responsive comp draws at 390px. The route pins `?layout=default` since 2026-09-03, when the
    // TOOLBAR layout became the phone's default: without the pin this pair would silently start
    // capturing the toolbar layout and compare it against the comp for a different one. The layout
    // is still reachable, it is simply no longer what a bare URL gives.
    id: "refdiff-compare-mobile",
    title: "RefDiff · Comparison tool (mobile)",
    design: { file: "RefDiff Comparison Tool.dc.html", frame: "RefDiff comparison tool" },
    app: { source: "live", route: "/?layout=default" + COMPARE_ROUTE.slice(1), viewport: mobile, waitFor: "#panes" },
    ignore: COMPARE_IGNORE,
  },
  {
    // The phone's TOOLBAR layout (2026-09-02): the minimal layout plus a header toolbar and a
    // top floating toolbar, in its own comp — again a 390x844 phone inside a dark showcase
    // canvas, so `scope` picks the phone node. The comp drops BOTH the tune and the settings
    // glyphs and carries the dark/light theme toggle in the header instead, so this layout has
    // no phone-layout switch at all: `?layout=toolbar` is the only way into it.
    id: "refdiff-compare-mobile-toolbar",
    title: "RefDiff \u00b7 Comparison tool (mobile, toolbar layout)",
    design: { file: "RefDiff Mobile.dc.html", frame: "RefDiff mobile toolbar", scope: ".cc-theme-dark" },
    app: { source: "live", route: "/?layout=toolbar" + COMPARE_ROUTE.slice(1), viewport: mobile, waitFor: "#panes" },
    ignore: TOOLBAR_IGNORE,
  },
  {
    // The GHOST language (2026-09-02), and the first pair that measures a state
    // which only exists after an interaction. The comps are LIVE pages: tapping a
    // one-sided finding row draws a hatched dashed footprint on the pane that does
    // NOT have the element, a hollow number chip with a direction label, and (on
    // the phone, where one pane is on screen) a View design/impl switch. None of
    // that is in the default capture, so before `steps` existed the whole design
    // was invisible to the harness — see adapters/steps.ts for why a missing step
    // target is a hard stop rather than a quiet fallback to the default state.
    //
    // Steps are set on BOTH sides on purpose. With them on one side only the run
    // reports the difference between "selected" and "not selected" as drift; the
    // CLI warns when a pair does that.
    //
    // Both sides use STABLE hooks, not rendered copy.
    // Design: the comp renders `data-vc-step="{{f.id}}"` on every rail row (added
    // 2026-09-02 at our ask), so `o1` is row 12 — the one-sided ids are o1..o4 and
    // they survive any rewording. The rail-open tap still matches the `list_alt`
    // GLYPH name, which is not user-facing copy, so it is the stable half of a
    // clickText; a `data-vc-step="open-rail"` on that button would remove the last
    // text match on this pair.
    // Impl: `.frow:has(.fside)` is the first ONE-SIDED row, whatever it is called
    // and whatever number it got — the app renumbers findings f1..fn every run, so
    // an id selector here would select "the first finding", not "a one-sided one",
    // and the ghost would not appear at all on a run whose f1 happens to be
    // two-sided.
    id: "refdiff-compare-mobile-toolbar-ghost",
    title: "RefDiff \u00b7 Comparison tool (mobile, toolbar) \u2014 ghost of a one-sided finding",
    design: {
      file: "RefDiff Mobile.dc.html",
      frame: "RefDiff mobile toolbar",
      scope: ".cc-theme-dark",
      // The SWAP COMES FIRST, and the order is the whole trick (2026-09-03). o1 is design-only, so
      // the ghost is drawn on the pane that does NOT have it — the impl pane — while both phones
      // start on 'design' (the app's `state.side`, the comp's `S.pane`). Without the swap the ghost
      // and its pill sit on the off-screen pane and never enter the capture, which is why the whole
      // ghost language was verified by crops rather than measured.
      // It cannot go last: `clickText` marks the INNERMOST match in DOCUMENT order, the comp renders
      // `swap_horiz` inside its ghost pill (the ovA/ovB templates) BEFORE its pane-swap control, and
      // the pill's button switches to the side that HAS the element — the wrong way. With nothing
      // selected yet the pill does not exist, so the only `swap_horiz` in the document is the
      // control we mean. A `data-vc-step` on that control would make the order free again.
      steps: [
        { clickText: "swap_horiz" },
        { wait: 300 },
        { clickText: "list_alt" },
        { wait: 400 },
        { click: "[data-vc-step=o1]" },
        { wait: 500 },
      ],
    },
    app: {
      source: "live",
      route: "/?layout=toolbar" + COMPARE_ROUTE.slice(1),
      viewport: mobile,
      waitFor: "#panes",
      // The app has real hooks, so the impl side uses selectors rather than copy.
      // Same sequence, by selector: the app has hooks, and `#pane-swap` is unambiguous where
      // `clickText: "swap_horiz"` would also match the ghost pill's own switch (render.ts draws that
      // glyph in both places).
      steps: [
        { click: "#pane-swap" },
        { wait: 300 },
        { click: "#rail-btn" },
        { wait: 300 },
        { click: ".frow:has(.fside)" },
        { wait: 400 },
      ],
    },
    // The shared toolbar policy plus the sheet region, first so it wins over the panned canvas.
    ignore: { ...TOOLBAR_IGNORE, explain: [PHONE_SHEET_EXPLAIN, ...TOOLBAR_IGNORE.explain] },
  },
  {
    // CHUNK 3 — the variant sheet. A full-bleed comp, so it MUST carry a viewport:
    // without one the dc-html adapter captures at its 1560px default canvas and
    // every column lands offset (see the skill's "A full-bleed comp is captured at
    // the pair viewport"). 1400x860 is the comp's own $preview.
    //
    // The route is the sheet for the demo root's `ds-button` entry (NOT the flat
    // `button` card — that one is the Library comp's and stays as it is).
    //
    // The sheet opens in the COMPARISON TOOL's own view, so `waitFor` names a
    // CELL SLOT rather than a standalone section: slots exist for every cell of
    // the cross-product, absent ones included, which makes them the reliable
    // "the sheet drew" signal. `.gerror` is the un-layoutable fallback (a root
    // with no set index, or a `gallery` naming a property the set lacks).
    id: "refdiff-gallery-desktop",
    title: "RefDiff \u00b7 Gallery (desktop)",
    design: { file: "RefDiff Gallery.dc.html", frame: "Gallery \u2014 Button variant sheet" },
    app: { source: "live", route: "/#/set/ds-button", viewport: { width: 1400, height: 860 }, waitFor: "#cells-impl .cellslot, #view-gallery .gerror" },
    ignore: GALLERY_IGNORE,
  },
  {
    // The phone half. Its own 390x844 phone frame inside a dark showcase canvas —
    // NOT the responsive-at-a-narrow-viewport shape the Library pairs use — so
    // `scope` picks the phone node, exactly as the mobile toolbar pair does.
    id: "refdiff-gallery-mobile",
    title: "RefDiff \u00b7 Gallery (mobile)",
    design: { file: "RefDiff Gallery Mobile.dc.html", frame: "RefDiff gallery mobile", scope: ".cc-theme-dark" },
    app: { source: "live", route: "/#/set/ds-button", viewport: mobile, waitFor: "#cells-impl .cellslot, #view-gallery .gerror" },
    ignore: GALLERY_IGNORE,
  },
  {
    // The desktop ghost. Split mode shows both panes, so the ghost appears on the
    // COUNTERPART pane without the View design/impl switch (the phone needs it
    // because only one pane is on screen). No rail to open either, so this pair is
    // driven entirely by stable hooks — no rendered copy anywhere in its steps,
    // which makes it the one to trust after a comp refetch.
    id: "refdiff-compare-desktop-ghost",
    title: "RefDiff \u00b7 Comparison tool (desktop) \u2014 ghost of a one-sided finding",
    design: {
      file: "RefDiff Comparison Tool.dc.html",
      frame: "RefDiff comparison tool",
      steps: [{ click: "[data-vc-step=o1]" }, { wait: 500 }],
    },
    app: {
      source: "live",
      route: COMPARE_ROUTE,
      viewport: desktop,
      waitFor: "#panes",
      steps: [{ click: ".frow:has(.fside)" }, { wait: 400 }],
    },
    ignore: COMPARE_IGNORE,
  },
]
