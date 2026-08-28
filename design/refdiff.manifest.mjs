// refdiff manifest for DOGFOODING: the RefDiff redesign of the annotator
// (Claude Design project 5a1a95c3-beee-457a-815b-ef6f6bf3e06a, fetched into
// design/refdiff/) against the annotator app itself, served by
// `refdiff-annotator out --serve` on :7378.
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
// the served out root; keep it pointing at a dir that exists in `out/`.

const desktop = { width: 1360, height: 820 }
const mobile = { width: 390, height: 844 }
const COMPARE_ROUTE = "/#/live-docs-owner-desktop"

export const manifest = [
  {
    id: "refdiff-library-desktop",
    title: "RefDiff · Library (desktop)",
    design: { file: "RefDiff Library.dc.html", frame: "Library" },
    app: { source: "live", route: "/", viewport: { width: 1180, height: 800 }, waitFor: "#cards .card" },
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
  },
  {
    id: "refdiff-compare-mobile",
    title: "RefDiff · Comparison tool (mobile)",
    design: { file: "RefDiff Comparison Tool.dc.html", frame: "RefDiff comparison tool" },
    app: { source: "live", route: COMPARE_ROUTE, viewport: mobile, waitFor: "#panes" },
  },
]
