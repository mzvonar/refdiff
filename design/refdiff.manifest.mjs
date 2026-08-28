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
// pages) and is deliberately not a pair.
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
  ],
  accepted: [
    {
      type: "extra-element",
      role: "image",
      reason: "decision D6: the card thumbnail is the run's own impl.png; the comp's grey plate is the designer's stand-in for that screenshot",
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
const COMPARE_IGNORE = {
  textPatterns: [
    "^(Veriflow|Need help\\?|Document|Selfie|Review|Verify your identity|Choose a document type and upload a clear photo of it\\.|Passport|Driver’s licence|ID card|Photo page with MRZ visible|Front and back sides|Drag your document here|PNG, JPG or PDF · up to 10 MB|Browse files|Continue|Save for later|Your documents are encrypted in transit and processed in line with GDPR\\. Verification usually takes under a minute\\.|directions_car|badge|public|upload_file)$",
  ],
  accepted: [
    {
      type: "extra-element",
      role: "image",
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
  {
    type: "text-content",
    expected: { text: "8 findings · 3 comments · 1 unsaved" },
    actual: { text: "8 findings · 3 comments" },
    reason: "gap 34: the comp's demo comment c2 carries a saveErr, so its phone sheet summary says '· 1 unsaved'; a failed save is runtime state the fixture cannot carry — the app shows the same words when a PUT really fails",
  },
)
// gap 29 (RESOLVED 2026-08-28: `showDeltaStrip` defaults to true in the comp,
// flipped at Mato's request): both sides draw the delta strip. Its COPY is
// still designer data — the Tool comp says "Run 47 vs 46 · −6 resolved", the
// Library card "−1 resolved" (gap 23), the app the fixture's real delta — so
// the strip's vocabulary is excused; the layout underneath is measured. The
// minus is written both ways because the extractor folds U+2212 to "-".
COMPARE_IGNORE.textPatterns.push(
  "^(\\+\\d+ introduced|[−-]\\d+ resolved|\\d+ regressions?|vs run \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}|fixed earlier, back again — fix plan halted)$",
)

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
    id: "refdiff-compare-mobile",
    title: "RefDiff · Comparison tool (mobile)",
    design: { file: "RefDiff Comparison Tool.dc.html", frame: "RefDiff comparison tool" },
    app: { source: "live", route: COMPARE_ROUTE, viewport: mobile, waitFor: "#panes" },
    ignore: COMPARE_IGNORE,
  },
]
