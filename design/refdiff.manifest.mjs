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
// mobile pairs reuse the desktop comps at 390×844. `RefDiff Mobile.dc.html` is
// only the designer's phone-frame showcase (a toggle + <dc-import> of the two
// pages) and is deliberately not a pair. The phone's MINIMAL layout has its
// own comp, `RefDiff Mobile Minimal.dc.html` (2026-08-29) — a fixed 390×844
// phone frame inside a showcase canvas — and its own pair below, scoped to
// the phone node.
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
    {
      type: "text-content",
      text: "Major 2",
      expected: { text: "Major 2" },
      actual: { text: "Major 3" },
      reason: "gap 23: the Library comp's card counts the opened pair's f1–f6 only; refdiff also counts the Tool comp's aggregates g1 (major) and g2 (minor)",
    },
    {
      type: "text-content",
      text: "Minor 2",
      expected: { text: "Minor 2" },
      actual: { text: "Minor 3" },
      reason: "gap 23: see Major 2 — g2 is the minor aggregate",
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

// The minimal layout's comp abbreviates the pair title in its 44px header ("Onboarding — Document");
// the app shows the pair's name — data, not copy.
const MINIMAL_IGNORE = {
  textPatterns: COMPARE_IGNORE.textPatterns,
  // The artboard rule is the shared Comparison-tool policy's; carry it explicitly, because this
  // object is built by hand and a missing key here reads as "the minimal pair reports more", not as
  // a policy gap.
  contentsOf: COMPARE_IGNORE.contentsOf,
  accepted: COMPARE_IGNORE.accepted.concat([
    {
      type: "text-content",
      expected: { text: "Onboarding — Document" },
      actual: { text: "Onboarding — Document step" },
      reason: "the Minimal comp's header shows a shortened demo title; the app shows the pair's name as the Library card does",
    },
    // The Minimal comp draws no delta strip; Mato (2026-08-29): it renders as in the default
    // layout. Its copy is excused by the patterns above; its two glyphs are excused here by
    // content. The canvas below it sits ~66px lower than the comp's, which no rule may hide
    // (positions lapse) — the ask is the strip in the comp (plan gap 36).
    {
      type: "extra-element",
      role: "text",
      text: "warning",
      reason: "gap 36: the delta strip's icon — the Minimal comp omits the strip; Mato 2026-08-29: render it as in the default layout",
    },
    {
      type: "extra-element",
      role: "text",
      text: "close",
      reason: "gap 36: the delta strip's × — the Minimal comp omits the strip; Mato 2026-08-29: render it as in the default layout",
    },
  ]),
}

// The TOOLBAR layout starts from the shared Comparison-tool policy (the comp's artboard
// vocabulary, the two screenshots, the delta strip's copy) and deliberately NOT from
// MINIMAL_IGNORE: that set's extra acceptances are claims about the MINIMAL comp — its
// shortened demo title, and its omission of the delta strip — which say nothing about this
// one. Whatever this comp needs gets its own rule with its own reason, once measured.
const TOOLBAR_IGNORE = {
  textPatterns: COMPARE_IGNORE.textPatterns,
  contentsOf: COMPARE_IGNORE.contentsOf,
  accepted: COMPARE_IGNORE.accepted,
}

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
    // The phone's MINIMAL layout (2026-08-29): its own comp, a 390×844 phone frame drawn inside a
    // dark 460×950 showcase canvas — `scope` picks the phone (the one `.cc-theme-dark` node) so
    // the showcase padding and its caption are never compared. The app renders that layout when
    // the settings popover says so; `?layout=minimal` presets it for this capture without
    // touching the saved preference.
    id: "refdiff-compare-mobile-minimal",
    title: "RefDiff · Comparison tool (mobile, minimal layout)",
    design: { file: "RefDiff Mobile Minimal.dc.html", frame: "RefDiff mobile minimal", scope: ".cc-theme-dark" },
    app: { source: "live", route: "/?layout=minimal" + COMPARE_ROUTE.slice(1), viewport: mobile, waitFor: "#panes" },
    ignore: MINIMAL_IGNORE,
  },
  {
    // The phone's TOOLBAR layout (2026-09-02): the minimal layout plus a header toolbar and a
    // top floating toolbar, in its own comp — again a 390x844 phone inside a dark showcase
    // canvas, so `scope` picks the phone node. The comp drops BOTH the tune and the settings
    // glyphs and carries the dark/light theme toggle in the header instead, so this layout has
    // no phone-layout switch at all: `?layout=toolbar` is the only way into it.
    id: "refdiff-compare-mobile-toolbar",
    title: "RefDiff \u00b7 Comparison tool (mobile, toolbar layout)",
    design: { file: "RefDiff Mobile Toolbar.dc.html", frame: "RefDiff mobile toolbar", scope: ".cc-theme-dark" },
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
      file: "RefDiff Mobile Toolbar.dc.html",
      frame: "RefDiff mobile toolbar",
      scope: ".cc-theme-dark",
      steps: [{ clickText: "list_alt" }, { wait: 400 }, { click: "[data-vc-step=o1]" }, { wait: 500 }],
    },
    app: {
      source: "live",
      route: "/?layout=toolbar" + COMPARE_ROUTE.slice(1),
      viewport: mobile,
      waitFor: "#panes",
      // The app has real hooks, so the impl side uses selectors rather than copy.
      steps: [{ click: "#rail-btn" }, { wait: 300 }, { click: ".frow:has(.fside)" }, { wait: 400 }],
    },
    ignore: TOOLBAR_IGNORE,
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
