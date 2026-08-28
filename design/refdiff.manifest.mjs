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
  },
]
