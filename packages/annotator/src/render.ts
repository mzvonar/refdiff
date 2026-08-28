/**
 * Pure renderer: ComparisonReport → self-contained report.html.
 *
 * The page shows the FULL design and the FULL implementation side by side
 * (split screen) with one shared pan/zoom, the design pane projected through
 * the run's `Alignment` so the same UI lands at the same place on both
 * sides. Findings are listed and drawn as numbered marks on both panes;
 * suppressed findings and the delta stay visible. The crops remain the
 * model's view — a person compares whole frames, which is why every adapter
 * stores the full PNGs.
 *
 * On top of that sits the diff lab: highlight the reported diff regions, mute
 * everything else, strobe them, step through them, and superimpose the design
 * on the impl pane (blink / onion skin / swipe / difference blend). The
 * superimposed ghost uses the run's FULL alignment, stretch included — the
 * design pane deliberately does not — so the lab states the distortion it
 * introduces instead of letting the eye read it as drift.
 *
 * The HTML references the run directory's artifacts by relative path
 * (design.png, impl.png, crops/…), so it must be written INTO the run dir
 * (or served from it). No network, no dependencies: the view math is the
 * compiled `view-math.js` embedded verbatim into an inline module script.
 *
 * The chrome follows the RefDiff comps (docs/plan-annotator-redesign.md,
 * phase 3): a 46px topbar (back, brand, pair title; the Split / Full,
 * Off / Wipe / Onion / Blink / Diff and Findings / Comments / All / Clean
 * segments; the theme toggle), the delta strip under it when the run changed
 * something, a 44px tool strip beside the canvas (pan, focus, comment,
 * highlight, dim, strobe), and floating pills over the canvas (zoom, the
 * Design / Impl switch in Full mode, overlay opacity, the align pill with its
 * lock, dropdown and confidence warning, the focus chip). On a phone
 * (< 760px, the comps' breakpoint) the page scrolls, the viewer sticks to
 * the top showing ONE side at a time, the tools float over the canvas and
 * the finding list flows underneath (phase 4 turns it into the bottom sheet).
 */

import type { ComparisonReport } from "@refdiff/core"

import { emptySet, type AnnotationSet } from "./annotations.js"
import { FONT_FACE_CSS, ICON_CSS } from "./fonts.js"

export interface RenderOptions {
  /** Compiled source of view-math.js (an ESM module with no imports). */
  viewMathSource: string
  /** Compiled source of annotations.js (an ESM module with no imports). */
  annotationsSource: string
  /** Annotations to embed (the page prefers the live API when served). */
  annotations?: AnnotationSet
  /**
   * Relative link back to the run root's index (`../index.html`) when this
   * report is one pair of a set; omitted for a lone run dir, which has no
   * index to go back to.
   */
  indexHref?: string | undefined
  /** Page title; default "<pair> — refdiff". */
  title?: string
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )

/** JSON safe to embed in a <script> block: `<` never appears literally. */
export const embedJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")

export function renderReport(report: ComparisonReport, options: RenderOptions): string {
  const title = options.title ?? `${report.pair} — refdiff`
  if (
    options.viewMathSource.includes("</script") ||
    options.annotationsSource.includes("</script")
  ) {
    throw new Error("embedded module sources must not contain a closing script tag")
  }
  const annotations = options.annotations ?? emptySet(report.pair)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${VIEWPORT_META}
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
${REPORT_BODY}
<script type="application/json" id="report-data">${embedJson(report)}</script>
<script type="application/json" id="annotations-data">${embedJson(annotations)}</script>
<script type="application/json" id="page-data">${embedJson({ indexHref: options.indexHref ?? null })}</script>
<script type="module">
${options.viewMathSource}
${options.annotationsSource}
${CLIENT}
${EMBEDDED_BOOT}
</script>
</body>
</html>
`
}

/**
 * Viewport for both deliveries. `user-scalable=no` stops the page zooming on
 * every engine but iOS Safari, which ignores it — hence the `gesturestart`
 * handler in the client. Pinching must reach the canvas, not the document.
 */
export const VIEWPORT_META =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'

/**
 * The report markup, shared by the emitted report.html and the served app
 * shell — one DOM, so the client never branches on how it was delivered.
 */
export const REPORT_BODY = `<header id="hdr" class="topbar">
  <div class="tb-left" id="hdr-left"></div>
  <span class="tb-spacer"></span>
  <div class="seg" id="seg-layout" role="group" aria-label="layout">
    <button type="button" data-layout="split" title="both sides side by side">Split</button>
    <button type="button" data-layout="full" title="one side at a time">Full</button>
  </div>
  <div class="seg" id="seg-variant" role="group" aria-label="comparison overlay">
    <button type="button" data-lab="none" title="No comparison overlay">Off</button>
    <button type="button" data-lab="swipe" title="Wipe slider between refs (w)">Wipe</button>
    <button type="button" data-lab="onion" title="Onion-skin: the design over the impl (o)">Onion</button>
    <button type="button" data-lab="blink" title="Alternate refs (b)">Blink</button>
    <button type="button" data-lab="difference" title="Pixel difference blend (x)">Diff</button>
  </div>
  <div class="seg" id="seg-layer" role="group" aria-label="canvas layer">
    <button type="button" data-layer="findings">Findings</button>
    <button type="button" data-layer="items">Comments</button>
    <button type="button" data-layer="all">All</button>
    <button type="button" data-layer="none">Clean</button>
  </div>
  <span class="tb-spacer"></span>
  <button type="button" class="theme-toggle" id="theme-toggle" title="Toggle chrome theme"><span class="msi" aria-hidden="true">light_mode</span></button>
</header>
<div id="delta-strip" class="delta-strip" hidden></div>
<div class="layer-strip" id="layer-strip"><span class="layer-strip-label">Show</span>
  <div class="seg seg-sm" id="seg-layer-m" role="group" aria-label="canvas layer">
    <button type="button" data-layer="findings">Findings</button>
    <button type="button" data-layer="items">Comments</button>
    <button type="button" data-layer="all">All</button>
    <button type="button" data-layer="none">Clean</button>
  </div>
</div>
<main>
  <aside id="side">
    <button type="button" class="rail-toggle" id="rail-toggle" aria-expanded="false" aria-controls="rail-body"></button>
    <div class="rail-body" id="rail-body">
      <div class="filters">
        <input id="q" type="search" placeholder="filter findings…" aria-label="filter findings">
        <div class="chips" id="sev-chips"></div>
        <label class="members"><input type="checkbox" id="members"> all instances</label>
        <span id="ann-status" class="annstatus"></span>
      </div>
      <div id="count" class="count"></div>
      <ol id="list" class="list"></ol>
      <details id="suppressed-box"><summary id="suppressed-summary"></summary><ol id="suppressed" class="list"></ol></details>
      <details id="ann-box" open><summary id="ann-summary"></summary><ol id="ann-list" class="list"></ol></details>
    </div>
  </aside>
  <section id="viewer">
    <div class="work">
      <div class="tools" id="tools">
        <button type="button" id="move-toggle" class="tool on" aria-pressed="true" title="Pan / move (Esc)"><span class="msi" aria-hidden="true">pan_tool</span></button>
        <button type="button" id="focus-toggle" class="tool" aria-pressed="false" title="Focus region — drag to limit findings (press again to clear)"><span class="msi" aria-hidden="true">center_focus_strong</span></button>
        <button type="button" id="ann-draw" class="tool" aria-pressed="false" title="Comment — tap a point or drag a region (n)"><span class="msi" aria-hidden="true">add_comment</span></button>
        <button type="button" id="diff-toggle" class="tool" aria-pressed="false" title="Highlight changed parts (d) — [ and ] step through them"><span class="msi" aria-hidden="true">difference</span></button>
        <button type="button" id="dim-toggle" class="tool" aria-pressed="false" title="Dim unchanged parts (g)"><span class="msi" aria-hidden="true">tonality</span></button>
        <button type="button" id="strobe-toggle" class="tool" aria-pressed="false" title="Strobe — pulse the differences in colour (s)"><span class="msi" aria-hidden="true">flare</span></button>
      </div>
      <div class="panes" id="panes">
        <div class="pane" id="pane-design" data-side="design">
          <div class="stage"><img class="shot" id="img-design" alt="design"><svg class="marks diffs" id="diffs-design"></svg><svg class="marks" id="marks-design"></svg><svg class="marks anns" id="anns-design"></svg><div class="vmarks" id="vmarks-design"></div></div>
          <div class="pane-label" id="label-design">DESIGN</div>
        </div>
        <div class="pane" id="pane-impl" data-side="impl">
          <div class="stage"><img class="shot" id="img-impl" alt="implementation"><div class="ghost-wrap" id="ghost-wrap"><img class="shot ghost" id="img-ghost" alt="design superimposed on the implementation"></div><img class="shot mask" id="img-mask" alt=""><svg class="marks diffs" id="diffs-impl"></svg><svg class="marks" id="marks-impl"></svg><svg class="marks anns" id="anns-impl"></svg><div class="vmarks" id="vmarks-impl"></div><div class="wipe" id="wipe" hidden title="drag to wipe between the design and the implementation"><div class="wipe-line"></div><div class="wipe-knob"><span class="msi" aria-hidden="true">sync_alt</span></div></div></div>
          <div class="pane-label right" id="label-impl">IMPLEMENTATION</div>
        </div>
        <div class="zoom-pill" id="zoom-pill">
          <button type="button" id="zoom-out" title="Zoom out (−)"><span class="msi" aria-hidden="true">remove</span></button>
          <span id="zoom-pct" class="pct">100%</span>
          <button type="button" id="zoom-in" title="Zoom in (+)"><span class="msi" aria-hidden="true">add</span></button>
          <button type="button" id="fit" title="Fit to view (0)"><span class="msi" aria-hidden="true">fit_screen</span></button>
        </div>
        <div class="side-fab" id="side-switch" role="group" aria-label="which side"><button type="button" data-side="design">Design</button><button type="button" data-side="impl">Impl</button></div>
        <div class="op-pill" id="op-pill" hidden><span class="msi" aria-hidden="true">opacity</span><span id="op-label" class="op-label">Onion</span><input type="range" id="lab-amount" min="0" max="100" step="1" value="55" aria-label="overlay opacity"><span id="op-pct" class="op-pct">55%</span></div>
        <div class="align-wrap" id="align-wrap">
          <div class="align-pill" id="align-pill">
            <button type="button" class="lock on" id="align-lock" aria-pressed="true" title="Lockstep on — panes move together. Click to unlink."><span class="msi" aria-hidden="true">link</span></button>
            <button type="button" class="align-cur" id="align-mode" aria-expanded="false" aria-controls="align-menu"><span class="msi" id="align-icon" aria-hidden="true">hub</span><span id="align-label">Anchors</span><span class="msi chev" id="align-chev" aria-hidden="true">expand_less</span></button>
            <span class="conf-warn" id="conf-warn" hidden><span class="msi" aria-hidden="true">warning</span></span>
          </div>
          <div class="align-menu" id="align-menu" hidden></div>
        </div>
        <div class="focus-chip" id="focus-chip" hidden><span class="msi" aria-hidden="true">center_focus_strong</span><span id="focus-msg"></span><button type="button" id="focus-clear">Clear</button></div>
        <div class="lab-note" id="lab-note" hidden></div>
      </div>
    </div>
    <div id="detail" class="detail"></div>
  </section>
</main>`

/** Boot for an emitted file: the data is already in the page. */
export const EMBEDDED_BOOT = String.raw`
openReport(
  JSON.parse(document.getElementById('report-data').textContent),
  JSON.parse(document.getElementById('annotations-data').textContent),
  JSON.parse(document.getElementById('page-data').textContent),
);
`

export const CSS = `
/* ---- tokens: the comps' set, same names, so a rule here reads like the comp.
   Dark is the default (the comps' cc-theme-dark), light is an override on
   <body> — a manual switch (#theme-toggle), never measured by refdiff. */
:root { --bg0:#2a2b2e; --bg1:#333438; --bg2:#3c3d42; --bg3:#46474d; --line:#4c4d54; --txt:#e7e9ec; --txt2:#a6abb3; --acc:#5b8def; --canvas:#232427;
  --critical:#e5484d; --major:#f5a623; --minor:#4c9aff; --ok:#46a758; --pending:#8f8f96;
  /* annotation statuses (the comps' comment statuses) and triage verdicts (gap 11) */
  --open:#8f7ee7; --implemented:#f5a623; --done:#46a758;
  --fix:var(--acc); --ignore:#6b7280; --snooze:#8f7ee7;
  /* the diff lab's region colour = the comps' Highlight */
  --diff:#ff5cd0;
  --font-sans:'IBM Plex Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace; }
body.cc-theme-light { --bg0:#dfe1e4; --bg1:#f2f3f5; --bg2:#ffffff; --bg3:#e3e5e9; --line:#cfd3d8; --txt:#22262b; --txt2:#697079; --acc:#2f6fed; --canvas:#c6c9ce; }
${FONT_FACE_CSS}
${ICON_CSS}
* { box-sizing:border-box; }
html,body { margin:0; height:100%; background:var(--bg0); color:var(--txt); font:13px/1.4 var(--font-sans); }
/* Form controls do not inherit the page font: without this every <button> and <select> measured as Arial 13.33px. */
button, input, select, textarea { font:inherit; }
/* The canvas owns zooming; the chrome must not double-tap-zoom or rubber-band
   under it (the panes keep touch-action:none for their own pan/pinch). */
html { touch-action:manipulation; -webkit-text-size-adjust:100%; overscroll-behavior:none; }
body { display:flex; flex-direction:column; }
/* ---- topbar: the comps' 46px bar — back arrow, brand, pair title; the three
   segmented groups (layout / overlay / layer) centred; the theme toggle right. */
.topbar { display:flex; align-items:center; gap:8px; padding:0 10px; height:46px; flex-shrink:0; border-bottom:1px solid var(--line); background:var(--bg1); }
.tb-left { display:flex; align-items:center; gap:8px; flex-shrink:0; min-width:0; }
.tb-left .back { width:32px; height:32px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:var(--txt2); text-decoration:none; flex-shrink:0; }
.tb-left .back:hover { background:var(--bg3); color:var(--txt); }
.tb-left .back .msi { font-size:19px; }
.tb-left .brand { width:18px; height:18px; border-radius:5px; background:var(--acc); flex-shrink:0; }
.tb-left .brand-name { font-size:13px; font-weight:700; letter-spacing:.02em; }
.tb-left .pair-title { font-size:12px; color:var(--txt2); white-space:nowrap; }
.tb-spacer { flex:1; min-width:4px; }
.seg { display:flex; background:var(--bg2); border:1px solid var(--line); border-radius:8px; padding:2px; gap:2px; flex-shrink:0; }
.seg button { padding:5px 10px; border:0; border-radius:6px; font-size:12px; font-weight:500; line-height:16px; cursor:pointer; color:var(--txt2); background:transparent; white-space:nowrap; }
.seg button.on { color:var(--txt); font-weight:600; background:var(--bg3); }
.seg.seg-sm { border-radius:7px; }
.seg.seg-sm button { padding:3px 8px; font-size:11px; line-height:14px; }
/* The phone's layer strip under the topbar ("Show · Findings Comments All Clean"). */
.layer-strip { display:none; align-items:center; justify-content:center; gap:7px; padding:4px 10px; background:var(--bg1); border-bottom:1px solid var(--line); flex-shrink:0; }
.layer-strip-label { font-size:10.5px; color:var(--txt2); flex-shrink:0; }
/* The topbar icon buttons (theme, and on the Library the layout toggle): the comps' 32px / radius 7 square. */
.theme-toggle, .layout-toggle { flex:none; width:32px; height:32px; padding:0; border:0; border-radius:7px; display:inline-flex; align-items:center; justify-content:center;
  background:transparent; color:var(--txt2); cursor:pointer; }
.theme-toggle:hover, .layout-toggle:hover { background:var(--bg3); }
.theme-toggle .msi, .layout-toggle .msi { font-size:19px; }
/* ---- delta strip (gap 15): under the topbar, only when the run changed something;
   red-tinted with a 3px edge when a regression is in it — the loop's stop signal. */
.delta-strip { display:flex; align-items:center; gap:12px; padding:0 12px; min-height:38px; flex-shrink:0; background:var(--bg2);
  border-bottom:1px solid var(--line); border-left:3px solid transparent; font-size:12px; }
.delta-strip[hidden] { display:none; }
.delta-strip.reg { background:rgba(229,72,77,.13); border-left-color:var(--critical); }
.delta-strip > .msi { font-size:17px; color:var(--txt2); flex-shrink:0; }
.delta-strip.reg > .msi { color:var(--critical); }
.delta-strip .run { font-size:11.5px; font-family:var(--font-mono); color:var(--txt2); white-space:nowrap; }
.delta-strip .add { font-weight:600; color:var(--critical); white-space:nowrap; }
.delta-strip .res { font-weight:600; color:var(--ok); white-space:nowrap; }
.delta-strip .dsep { width:1px; height:16px; background:var(--line); flex-shrink:0; }
.delta-strip .regmsg { font-weight:700; color:var(--critical); white-space:nowrap; }
.delta-strip .regsub { font-size:11.5px; color:var(--txt2); white-space:nowrap; }
.delta-strip .review { margin-left:auto; padding:4px 12px; border-radius:7px; font-size:11.5px; font-weight:600; cursor:pointer;
  background:var(--critical); border:1px solid var(--critical); color:#fff; white-space:nowrap; flex-shrink:0; }
.delta-strip .review.on { background:transparent; border-color:var(--line); color:var(--txt2); }
.delta-strip .dismiss { margin-left:auto; width:24px; height:24px; padding:0; border:0; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:transparent; flex-shrink:0; }
.delta-strip .dismiss:hover { background:var(--bg3); }
.delta-strip .dismiss .msi { font-size:16px; }
/* ---- the rail (phase 4 moves it to the comps' right-hand review panel) */
main { flex:1; display:grid; grid-template-columns:340px 1fr; min-height:0; }
aside { border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0; background:var(--bg1); }
.filters { padding:8px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid var(--line); }
.filters input[type=search] { width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--bg0); color:var(--txt); }
.filters .members { color:var(--txt2); display:flex; gap:4px; align-items:center; font-size:12px; }
.annstatus { color:var(--txt2); font-size:11px; }
.annstatus.err { color:var(--critical); }
.chips { display:flex; gap:6px; }
.chip { cursor:pointer; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--txt2); user-select:none; }
.chip.on { color:var(--txt); border-color:currentColor; }
.chip.triage-chip.on.ignore { color:var(--txt); border-color:var(--ignore); }
.chip.triage-chip.on.snooze { color:var(--snooze); border-color:var(--snooze); }
.chip.critical.on { color:var(--critical); } .chip.major.on { color:var(--major); } .chip.minor.on { color:var(--minor); }
.count { padding:4px 10px; color:var(--txt2); font-size:12px; }
.list { list-style:none; margin:0; padding:0; overflow:auto; flex:1; min-height:0; }
.row { display:grid; grid-template-columns:34px 1fr; gap:6px; padding:6px 10px; border-bottom:1px solid var(--line); cursor:pointer; }
.row:hover { background:rgba(127,127,127,.08); } .row.sel { background:var(--bg2); }
.row .num { font-weight:700; text-align:center; border-radius:6px; color:#fff; padding:1px 0; align-self:start; font-size:12px; }
.num.critical,.sev.critical { background:var(--critical); } .num.major,.sev.major { background:var(--major); color:#111; } .num.minor,.sev.minor { background:var(--minor); }
.row .msg { color:var(--txt); }
.row .meta { color:var(--txt2); font-size:11px; }
.row .tag { display:inline-block; padding:0 5px; border:1px solid var(--line); border-radius:4px; margin-right:4px; }
details { border-top:1px solid var(--line); max-height:40%; display:flex; flex-direction:column; }
details summary { padding:6px 10px; color:var(--txt2); cursor:pointer; }
details[open] .list { max-height:30vh; }
/* triage — a verdict on a finding, and the region filter */
.verdict { display:inline-block; padding:0 6px; border-radius:4px; font-size:11px; font-weight:600; color:#fff; }
.verdict.fix { background:var(--fix); } .verdict.ignore { background:var(--ignore); color:#fff; } .verdict.snooze { background:var(--snooze); }
.row.triaged-ignore .msg, .row.triaged-snooze .msg { color:var(--txt2); }
.triage { margin-top:8px; border-top:1px solid var(--line); padding-top:8px; }
.triage .actions { gap:6px; align-items:center; }
.verdict-btn.on.fix { border-color:var(--fix); color:var(--fix); }
.verdict-btn.on.ignore { border-color:var(--ignore); color:var(--txt); }
.verdict-btn.on.snooze { border-color:var(--snooze); color:var(--snooze); }
.triage-none { color:var(--txt2); font-style:italic; }
.triage .meta code { background:var(--bg0); border:1px solid var(--line); border-radius:4px; padding:0 4px; }
/* findings rail disclosure (phone only): the rail is collapsed until asked for */
.rail-toggle { display:flex; width:100%; justify-content:space-between; align-items:center; gap:8px; padding:9px 12px;
  background:var(--bg1); color:var(--txt); border:0; border-bottom:1px solid var(--line); font:inherit; text-align:left; cursor:pointer; }
.rail-toggle .chev { color:var(--txt2); }
.rail-toggle .num { display:inline-block; padding:0 6px; border-radius:5px; font-weight:700; font-size:11px; color:#fff; }
body.rail-open .rail-toggle .chev { transform:rotate(180deg); }
aside .rail-body { display:contents; }
/* Collapsed on DESKTOP: the rail becomes a strip and the canvas takes the width. Phone keeps its
   own rules (the rail is a section of a scrolling page there, not a column). */
body:not(.rail-open) main { grid-template-columns:38px 1fr; }
body:not(.rail-open) aside .rail-body { display:none; }
body:not(.rail-open) .rail-toggle { writing-mode:vertical-rl; height:100%; width:38px; padding:12px 0; justify-content:flex-start; gap:12px; }
body:not(.rail-open) .rail-toggle .num { writing-mode:horizontal-tb; }
/* ---- the viewer: the tool strip beside the canvas, the detail panel under both */
#viewer { display:flex; flex-direction:column; min-height:0; min-width:0; }
.work { flex:1; display:flex; min-height:0; position:relative; }
.tools { width:44px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 0; background:var(--bg1); border-right:1px solid var(--line); }
.tool { width:32px; height:32px; padding:0; border:0; border-radius:7px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:transparent; flex-shrink:0; }
.tool .msi { font-size:18px; }
.tool:hover { background:var(--bg3); }
.tool.on { color:#fff; background:var(--acc); }
.panes { flex:1; display:flex; min-height:0; min-width:0; position:relative; background:var(--canvas); }
.pane { flex:1; position:relative; overflow:hidden; min-width:0; touch-action:none; cursor:grab; background:var(--canvas); }
.pane + .pane { border-left:1px solid var(--line); }
.pane.dragging { cursor:grabbing; }
.pane.focusing, .pane.annotating { cursor:crosshair; }
/* One side at a time — always on a phone, on demand on desktop (the Split / Full segment). */
body.single .pane { display:none; }
body.single .pane.active { display:block; }
body.single .pane + .pane { border-left:0; }
/* Pane labels: the comps' mono caps pills, top corners; gone while an overlay is on (the panes no
   longer show one side each) and on the phone. The refs and the fit live in their title. */
.pane-label { position:absolute; z-index:8; top:10px; left:10px; padding:3px 9px; border-radius:6px; background:var(--bg1); border:1px solid var(--line);
  color:var(--txt2); font-size:10px; font-weight:700; letter-spacing:.1em; font-family:var(--font-mono); pointer-events:none; }
.pane-label.right { left:auto; right:10px; }
body.lab-on .pane-label { display:none; }
.stage { position:absolute; inset:0; }
.shot { position:absolute; left:0; top:0; transform-origin:0 0; image-rendering:auto; user-select:none; -webkit-user-drag:none; pointer-events:none; }
/* ---- floating pills over the canvas */
.zoom-pill { position:absolute; left:12px; bottom:12px; z-index:14; display:flex; align-items:center; gap:2px; background:var(--bg1); border:1px solid var(--line); border-radius:9px; padding:3px; }
.zoom-pill button { width:28px; height:28px; padding:0; border:0; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:transparent; }
.zoom-pill button:hover { background:var(--bg3); }
.zoom-pill .msi { font-size:17px; }
.zoom-pill .pct { min-width:44px; text-align:center; font-size:11.5px; font-family:var(--font-mono); color:var(--txt2); }
.side-fab { display:none; position:absolute; right:8px; bottom:12px; z-index:15; gap:2px; background:var(--bg1); border:1px solid var(--line); border-radius:999px; padding:3px; box-shadow:0 4px 16px rgba(0,0,0,.3); }
body.single .side-fab { display:flex; }
.side-fab button { padding:7px 14px; border:0; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; color:var(--txt2); background:transparent; white-space:nowrap; }
.side-fab button.on { color:#fff; background:var(--acc); }
.op-pill { position:absolute; bottom:61px; left:50%; transform:translateX(-50%); z-index:16; display:flex; align-items:center; gap:10px; background:var(--bg1); border:1px solid var(--line); border-radius:999px; padding:6px 14px 6px 11px; box-shadow:0 4px 16px rgba(0,0,0,.25); }
.op-pill[hidden] { display:none; }
body.single .op-pill { bottom:107px; }
.op-pill > .msi { font-size:16px; color:var(--txt2); }
.op-label { font-size:11.5px; font-weight:600; white-space:nowrap; }
.op-pill input { width:132px; height:4px; accent-color:var(--acc); cursor:pointer; margin:0; }
.op-pct { font-size:11.5px; font-family:var(--font-mono); color:var(--txt2); min-width:34px; text-align:right; }
/* The align pill + its dropdown (gaps 2 and 22): the lock, the mode, the confidence warning. */
.align-wrap { position:absolute; bottom:12px; right:12px; z-index:16; }
body.single .align-wrap { bottom:58px; }
.align-wrap[hidden] { display:none; }
.align-pill { display:flex; align-items:center; gap:6px; background:var(--bg1); border:1px solid var(--line); border-radius:999px; padding:4px 8px 4px 4px; box-shadow:0 4px 16px rgba(0,0,0,.25); }
.align-pill.is-warn { border-color:var(--major); box-shadow:0 4px 16px rgba(0,0,0,.25),0 0 0 3px rgba(245,166,35,.16); }
.align-pill .lock { width:26px; height:26px; padding:0; border:0; border-radius:999px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:var(--bg3); flex-shrink:0; }
.align-pill .lock.on { color:#fff; background:var(--acc); }
.align-pill .lock .msi { font-size:15px; }
.align-cur { display:flex; align-items:center; gap:5px; cursor:pointer; padding:0 2px; border:0; background:transparent; color:var(--txt); }
.align-cur #align-icon { font-size:16px; color:var(--txt2); }
.align-cur #align-label { font-size:11.5px; font-weight:600; }
.align-cur .chev { font-size:15px; color:var(--txt2); }
.conf-warn { display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:999px; background:rgba(245,166,35,.16); color:var(--major); cursor:help; flex-shrink:0; }
.conf-warn[hidden] { display:none; }
.conf-warn .msi { font-size:14px; }
.align-menu { position:absolute; bottom:calc(100% + 8px); right:0; width:264px; background:var(--bg1); border:1px solid var(--line); border-radius:11px; padding:4px; box-shadow:0 10px 30px rgba(0,0,0,.35); z-index:17; }
.align-menu[hidden] { display:none; }
.align-menu h3 { margin:0; padding:8px 10px 4px; font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--txt2); }
.align-opt { display:flex; align-items:flex-start; gap:9px; padding:8px 10px; border-radius:8px; cursor:pointer; background:transparent; }
.align-opt.on { background:var(--bg2); }
.align-opt > .msi { font-size:17px; color:var(--txt2); flex-shrink:0; margin-top:1px; }
.align-opt.on > .msi { color:var(--acc); }
.align-opt.is-warn > .msi { color:var(--major); }
.align-opt .txt { flex:1; display:flex; flex-direction:column; gap:2px; }
.align-opt .name { font-size:12px; font-weight:600; }
.align-opt .desc { font-size:11px; line-height:1.4; color:var(--txt2); }
.align-opt .warnline { display:flex; align-items:flex-start; gap:5px; margin-top:2px; font-size:11px; line-height:1.35; color:var(--major); }
.align-opt .warnline .msi { font-size:13px; margin-top:1px; }
.align-opt .check { font-size:16px; color:var(--acc); }
/* The focus chip (top centre) and the lab note under it — both only while they have something to say. */
.focus-chip { position:absolute; top:12px; left:50%; transform:translateX(-50%); display:flex; align-items:center; gap:10px; background:var(--bg1); border:1px solid var(--line); border-radius:999px; padding:5px 7px 5px 14px; z-index:14; font-size:12px; color:var(--txt); white-space:nowrap; }
.focus-chip[hidden] { display:none; }
.focus-chip > .msi { font-size:15px; color:var(--acc); }
.focus-chip button { padding:3px 10px; border:0; border-radius:999px; background:var(--bg3); color:var(--txt); cursor:pointer; font-weight:600; font-size:11.5px; }
.lab-note { position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:13; padding:5px 12px; border-radius:999px; background:var(--bg1); border:1px solid var(--line); font-size:11.5px; color:var(--txt2); white-space:nowrap; pointer-events:none; }
.lab-note[hidden] { display:none; }
.lab-note.warn { color:var(--major); border-color:var(--major); }
.focus-chip:not([hidden]) ~ .lab-note { top:52px; }
/* ---- marks. The numbered badges are HTML, as the comps draw them (a div per finding, so its
   number is text the extractor sees); the boxes stay SVG. A badge keeps a constant screen size
   (the comps' scale(min(2.4, 1/z)), via --cs on its layer) and sits at its box's top-left corner. */
.marks { position:absolute; left:0; top:0; width:1px; height:1px; overflow:visible; transform-origin:0 0; pointer-events:none; }
.marks rect { fill:none; stroke-width:1.5; vector-effect:non-scaling-stroke; }
.marks rect.critical { stroke:var(--critical); } .marks rect.major { stroke:var(--major); } .marks rect.minor { stroke:var(--minor); }
.marks rect.member { stroke-dasharray:3 3; stroke-width:1.2; }
.marks rect.sel { stroke-width:2; }
.marks rect.suppressed { stroke:var(--txt2); stroke-dasharray:2 3; }
.vmarks { position:absolute; left:0; top:0; width:0; height:0; overflow:visible; transform-origin:0 0; pointer-events:none; z-index:6; --cs:1; }
.vmark { position:absolute; box-sizing:content-box; width:24px; height:24px; border-radius:50%; color:#fff; font-size:12px; font-weight:700; line-height:1;
  display:flex; align-items:center; justify-content:center; cursor:pointer; pointer-events:all; user-select:none;
  box-shadow:0 1px 4px rgba(0,0,0,.4); border:2px solid rgba(255,255,255,.9); transform:scale(var(--cs)); transform-origin:center; }
.vmark.critical { background:var(--critical); } .vmark.major { background:var(--major); } .vmark.minor { background:var(--minor); }
.vmark.suppressed { opacity:.5; filter:grayscale(.7); border-style:dashed; }
.vmark.triaged { opacity:.45; }
/* A repeat instance of an aggregate: the comps' small hollow badge with the same number; its element gets a dashed box. */
.vmark.member { width:18px; height:18px; background:#fff; border-width:1.5px; font-size:10px; box-shadow:0 1px 3px rgba(0,0,0,.35); }
.vmark.member.critical { color:var(--critical); border-color:var(--critical); } .vmark.member.major { color:var(--major); border-color:var(--major); } .vmark.member.minor { color:var(--minor); border-color:var(--minor); }
/* Comment badges: the comps' 22px rounded square in the status colour. */
.vmark.ann { width:22px; height:22px; border-radius:6px; font-size:11px; }
.vmark.ann.open { background:var(--open); } .vmark.ann.implemented { background:var(--implemented); } .vmark.ann.done { background:var(--done); }
/* Findings cluster: three marks can share a box, and the neighbour drawn last used to sit on top
   of the one you just selected — you clicked 1 and read 95. While something is selected its badge
   is drawn LAST and everything else steps back. */
.vmarks.has-sel .vmark:not(.sel):not(.ann) { opacity:.35; }
/* ---- diff lab -----------------------------------------------------------
   Chromatic-style reading aids over OUR signal: Highlight boxes every listed
   difference (the reported finding boxes + the pixel channel's regions), Dim
   masks everything else, Strobe pulses the boxes, and the overlay segment
   superimposes the design on the impl pane. The raster mask (coloured by
   changeKind) says WHAT differs where the pixel channel ran. */
.marks.diffs { z-index:1; }
.marks.diffs rect.region { fill:rgba(255,92,208,.08); stroke:var(--diff); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:none; }
.marks.diffs rect.region.cur { fill:rgba(255,92,208,.32); stroke-width:3; }
.marks.diffs rect.dim { fill:rgba(15,17,20,.5); stroke:none; pointer-events:none; }
/* The wiggle is 1 world px on the CSS translate property, which composes with
   the layer's own transform instead of fighting it — a hard-to-see 1px
   difference announces itself by moving, the way a blink comparator makes a
   moving star pop. The stroke WIDTH swings too, because translate is in world
   px: zoomed out to fit a page, 1 world px is half a screen pixel and the
   wiggle alone is invisible (non-scaling-stroke makes the width screen px).
   Hard stops at 50%, never steps(1) + alternate: a reversed iteration flips
   the step position too, so Chrome sampled the SAME keyframe in both
   directions and nothing on the page ever moved. */
@keyframes vc-strobe {
  0%,49.99% { stroke:var(--diff); stroke-width:2; translate:0 0; }
  50%,100% { stroke:#00ff9c; stroke-width:4; translate:1px 1px; }
}
.marks.diffs.strobing rect.region { animation:vc-strobe .84s linear infinite; }
.mask { mix-blend-mode:screen; image-rendering:pixelated; opacity:.95; }
@keyframes vc-mask-strobe { 0%,49.99% { opacity:.95; } 50%,100% { opacity:.15; } }
.strobing-mask .mask { animation:vc-mask-strobe .84s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .marks.diffs.strobing rect.region, .strobing-mask .mask { animation-duration:1.6s; }
}
.ghost-wrap { position:absolute; left:0; top:0; width:100%; height:100%; overflow:hidden; pointer-events:none; }
.ghost { opacity:0; transition:opacity .08s linear; }
.ghost.difference { mix-blend-mode:difference; }
/* The wipe handle: a 28px grab strip with the comps' 2px accent line and sync_alt knob. */
.wipe { position:absolute; top:0; bottom:0; width:28px; cursor:ew-resize; z-index:7; display:flex; align-items:center; justify-content:center; touch-action:none; }
.wipe[hidden] { display:none; }
.wipe-line { position:absolute; top:0; bottom:0; left:13px; width:2px; background:var(--acc); }
.wipe-knob { position:relative; z-index:1; width:24px; height:24px; border-radius:50%; background:var(--acc); color:#fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,.35); }
.wipe-knob .msi { font-size:14px; }
/* ---- the detail panel (phase 4 folds it into the rail) */
.detail { border-top:1px solid var(--line); padding:8px 12px; max-height:34%; overflow:auto; background:var(--bg1); }
.detail:empty { display:none; }
.detail h2 { margin:0 0 4px; font-size:13px; }
.detail table { border-collapse:collapse; margin:6px 0; }
.detail td,.detail th { border:1px solid var(--line); padding:2px 8px; text-align:left; font-weight:500; }
.detail th { color:var(--txt2); }
.detail .crops { display:flex; gap:12px; flex-wrap:wrap; }
.detail .crops figure { margin:0; } .detail .crops img { max-height:160px; max-width:45vw; border:1px solid var(--line); background:#fff; }
.detail figcaption { color:var(--txt2); font-size:11px; }
/* annotations */
.pane.annotating .marks rect, .pane.annotating .vmarks .vmark, .pane.annotating .marks .ann { pointer-events:none; }
.marks.anns { pointer-events:none; }
.marks.anns .ann { pointer-events:all; cursor:pointer; }
.marks.anns circle.ann { stroke-width:2; vector-effect:non-scaling-stroke; fill-opacity:.35; }
.marks.anns rect.ann { fill-opacity:.12; stroke-width:2; vector-effect:non-scaling-stroke; }
.marks.anns .open { stroke:var(--open); fill:var(--open); } .marks.anns .implemented { stroke:var(--implemented); fill:var(--implemented); } .marks.anns .done { stroke:var(--done); fill:var(--done); }
.marks.anns .stale { stroke-dasharray:4 3; }
.marks.anns .sel { stroke-width:4; }
.marks.anns rect.band { fill:rgba(143,126,231,.15); stroke:var(--open); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:4 3; }
.marks.anns rect.focus-rect { fill:rgba(91,141,239,.10); stroke:var(--acc); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:6 4; }
/* Handles are interactive; the region's BODY is not, so a drag inside it still pans. */
.marks.anns circle.focus-handle { fill:var(--acc); stroke:var(--bg0); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:all; cursor:nwse-resize; }
.marks.anns circle.focus-handle.move { cursor:move; fill:var(--bg0); stroke:var(--acc); stroke-width:2; }
.marks.anns circle.focus-handle.ne, .marks.anns circle.focus-handle.sw { cursor:nesw-resize; }
/* The layer segment: Comments off hides the comment shapes and badges, never the focus region. */
body.layer-no-anns .marks.anns .ann, body.layer-no-anns .vmarks .vmark.ann, body.layer-no-anns .marks.anns rect.band { display:none; }
.num.open { background:var(--open); } .num.implemented { background:var(--implemented); color:#111; } .num.done { background:var(--done); }
.row.ann .msg { white-space:pre-wrap; }
.row.ann.done .msg { color:var(--txt2); text-decoration:line-through; }
.detail textarea { width:100%; min-height:64px; margin:6px 0; padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--bg0); color:var(--txt); font:inherit; resize:vertical; }
.detail .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.detail .actions button { background:var(--bg1); color:var(--txt); border:1px solid var(--line); border-radius:6px; padding:3px 10px; cursor:pointer; }
.detail .actions button.primary { border-color:var(--acc); color:var(--acc); }
.detail .actions button.danger { border-color:var(--critical); color:var(--critical); }
.detail .actions .hint { color:var(--txt2); font-size:11px; }
.detail .status { display:inline-block; padding:0 8px; border-radius:999px; font-weight:600; font-size:11px; color:#fff; }
.detail .status.open { background:var(--open); } .detail .status.implemented { background:var(--implemented); color:#111; } .detail .status.done { background:var(--done); }
/* Between the phone and the comps' 1120px "narrow" width the pair title goes; the layer labels shorten (JS). */
@media (max-width: 1119px) { .tb-left .pair-title { display:none; } }
/* phone (the comps' < 760px): the page scrolls, the viewer sticks, one side at a time, the tools float */
@media (max-width: 759px) {
  html, body { height:auto; }
  body { min-height:100vh; min-height:100svh; }
  .tb-left .brand-name, #seg-layout, #seg-layer { display:none; }
  .layer-strip { display:flex; }
  .delta-strip { flex-wrap:wrap; gap:8px; padding:7px 10px; min-height:0; }
  .delta-strip .regsub { display:none; }
  .delta-strip .review { margin-left:0; }
  main { display:flex; flex-direction:column; min-height:0; }
  #viewer { order:-1; display:flex; flex-direction:column; position:sticky; top:0; z-index:6; background:var(--bg1); border-bottom:1px solid var(--line); }
  /* A collapsed rail is not a reason to keep the canvas small: it grows into
     the room the rail gave back (chrome = topbar + layer strip + summary bar). */
  .work { flex:none; height:calc(100vh - 150px); height:calc(100svh - 150px); }
  body.rail-open .work { height:52vh; height:52svh; }
  body.has-detail .work { height:38vh; height:38svh; }
  .tools { position:absolute; left:8px; bottom:56px; z-index:15; width:auto; flex-direction:row; padding:4px; border:1px solid var(--line); border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.3); }
  .zoom-pill { left:12px; top:12px; bottom:auto; }
  .side-fab { bottom:56px; }
  .side-fab button { padding:10px 16px; font-size:13px; }
  .op-pill, body.single .op-pill { bottom:107px; gap:8px; padding:5px 10px 5px 8px; }
  .op-pill input { width:92px; }
  .align-wrap, body.single .align-wrap { top:10px; right:8px; bottom:auto; }
  .align-menu { bottom:auto; top:calc(100% + 8px); width:248px; }
  .pane-label { display:none; }
  .pane + .pane { border-left:0; }
  /* iOS Safari zooms the page when a focused field is under 16px. The note
     textarea needs naming: .detail textarea { font:inherit } outranks a bare
     element selector, and it is the field the phone actually focuses. */
  input, textarea, select, .detail textarea, .filters input { font-size:16px; }
  .detail { max-height:30vh; max-height:30svh; }
  aside { border-right:0; border-top:1px solid var(--line); flex:1; }
  body:not(.rail-open) main { grid-template-columns:1fr; }
  /* Pinned to the BOTTOM while the rail is open: selecting a finding scrolls the list, and the
     summary bar used to end up UNDER the sticky canvas — visible by coordinates, untappable, so
     the rail could not be closed again. At the bottom it is always reachable. */
  .rail-toggle { position:sticky; bottom:0; z-index:5; border-top:1px solid var(--line); writing-mode:horizontal-tb; height:auto; width:100%; padding:9px 12px; }
  /* scrollIntoView knows nothing about the sticky canvas above; this keeps a focused row clear of it. */
  .row { scroll-margin-top:calc(52vh + 96px); scroll-margin-top:calc(52svh + 96px); scroll-margin-bottom:56px; }
  body.has-detail .row { scroll-margin-top:calc(38vh + 96px); scroll-margin-top:calc(38svh + 96px); }
  aside .rail-body { display:none; }
  body.rail-open aside .rail-body { display:block; }
  .list { overflow:visible; flex:none; }
  details { max-height:none; }
  details[open] .list { max-height:none; }
}
`

// The client. Plain JS, kept free of template literals so it can live inside
// this TypeScript template string. It shares the module scope with the
// embedded view-math.js (fitView, zoomAt, designImageTransform, …).
//
// It is delivered two ways and knows about neither: an emitted report.html
// embeds the data and calls openReport() once, the served app fetches a pair
// and calls openReport() again on every route change. Hence `let`, and hence
// `page.base` in front of every artifact URL — under the app shell the run
// dir is one path segment down.
export const CLIENT = String.raw`
let report = null;
let page = { indexHref: null, base: '', annotationsUrl: 'api/annotations' };
const $ = (id) => document.getElementById(id);

// iOS Safari ignores user-scalable=no, so page pinch-zoom has to be refused
// here. The panes run their own pinch through pointer events, which these
// gesture events do not carry.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// View controls are a preference, not per-pair state: they survive a reload
// and follow you from pair to pair.
const CONTROLS_KEY = 'vc-controls';
function readControls() {
  try { return JSON.parse(localStorage.getItem(CONTROLS_KEY)) || {}; } catch (e) { return {}; }
}
function saveControls() {
  try {
    localStorage.setItem(CONTROLS_KEY, JSON.stringify({
      align: state.align, lock: state.lock, layer: state.layer, showMembers: state.showMembers,
      single: state.single, side: state.side, move: state.move, showTriaged: state.showTriaged,
      rail: document.body.classList.contains('rail-open'),
      diff: state.diff, dim: state.dim, strobe: state.strobe, lab: state.lab, labAmount: state.labAmount,
      theme: currentTheme(),
    }));
  } catch (e) { /* private mode: the controls just do not persist */ }
}
const SEV = ['critical', 'major', 'minor'];
const state = {
  // align: how the design frame is registered onto the impl for display —
  // 'anchors' (the run's measured fit) | 'width' | 'left' | 'right'.
  // view: the shared pan/zoom. viewD: the design pane's own, used only while the lock is off
  // (gap 22) — locking again snaps it back onto view.
  view: { z: 1, tx: 0, ty: 0 }, viewD: { z: 1, tx: 0, ty: 0 }, lock: true, align: 'anchors',
  // layer: what the canvas draws — 'findings' | 'items' (comments) | 'all' | 'none' (clean).
  // showMembers: every instance of an aggregate marked, or the primary only (the comps' default —
  // a ×15 aggregate carpets the artboard otherwise, gap 12).
  layer: 'all', showMarks: true, showMembers: false,
  selected: null, sev: { critical: true, major: true, minor: true }, q: '',
  dprD: 1, dprI: 1, userMoved: false, side: 'design', move: true, single: false,
  // A region of the canvas to work inside (world px). While set, findings whose boxes fall outside
  // it are hidden from the list AND the marks — the way to read one column of a screen without the
  // chrome's findings burying it.
  focus: null, focusLabel: '', focusing: false,
  showTriaged: { ignore: false, snooze: false },
  // The diff lab: Highlight boxes every listed difference (diff), Dim masks
  // everything else (dim), Strobe pulses the boxes, and one superimposition
  // mode over the impl pane (lab: blink | onion | swipe | difference).
  // labAmount is the opacity of the two blends that have one; wipeX is the
  // wipe's curtain in world px (per pair — it starts at the frame's middle).
  diff: false, dim: false, strobe: false, lab: 'none', labAmount: { onion: 55, difference: 100 }, wipeX: 0, diffIndex: -1,
  // The delta strip (gap 15): its Review button narrows the list to the regressions.
  regOnly: false, deltaDismissed: false, alignOpen: false,
};
// The comps' breakpoints: under 760px the phone layout (one side at a time,
// the tools float over the canvas), under 1120px the topbar shortens.
const narrow = window.matchMedia('(max-width: 759px)');
const narrowish = window.matchMedia('(max-width: 1119px)');

// ---- theme ----------------------------------------------------------------
// A chrome preference, not per-pair state: dark is the default (the tokens on
// :root), light is the cc-theme-light override on <body>. It rides in the same
// localStorage record as the other controls, but is written on its own —
// on the index route no report is open, and saveControls() would persist the
// unloaded defaults of everything else.
function currentTheme() { return document.body.classList.contains('cc-theme-light') ? 'light' : 'dark'; }
function applyTheme(theme) {
  const light = theme === 'light';
  document.body.classList.toggle('cc-theme-light', light);
  for (const el of document.querySelectorAll('.theme-toggle .msi')) el.textContent = light ? 'dark_mode' : 'light_mode';
}
function saveTheme() {
  try {
    const saved = readControls();
    saved.theme = currentTheme();
    localStorage.setItem(CONTROLS_KEY, JSON.stringify(saved));
  } catch (e) { /* private mode */ }
}
function toggleTheme() { applyTheme(currentTheme() === 'light' ? 'dark' : 'light'); saveTheme(); }
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.theme-toggle');
  if (t) toggleTheme();
});
applyTheme(readControls().theme);
const panes = { design: $('pane-design'), impl: $('pane-impl') };
const imgs = { design: $('img-design'), impl: $('img-impl'), ghost: $('img-ghost'), mask: $('img-mask') };
const layers = { design: $('marks-design'), impl: $('marks-impl') };
const diffLayers = { design: $('diffs-design'), impl: $('diffs-impl') };
const annLayers = { design: $('anns-design'), impl: $('anns-impl') };
const markLayers = { design: $('vmarks-design'), impl: $('vmarks-impl') };
// Human annotations: the set (loaded from the API when served, else this
// browser, else the embedded copy), the draw mode, the pending draft and the
// element trees used for snapping (elements.json, both sides in world space).
const ann = {
  set: { version: 1, pair: '', annotations: [] },
  mode: null, draft: null, selected: null, band: null,
  elements: { design: [], impl: [] }, elementsLoaded: false,
  storage: location.protocol.startsWith('http') ? 'api' : 'local', saveTimer: null, status: '',
};
let byId = new Map();

// ---- triage --------------------------------------------------------------
// A verdict on a FINDING (fix / ignore / snooze + note), filed against Finding.key — the
// run-stable identity — so it survives the renumbering every capture does to ids and marks. Reports
// written before that field existed carry no key; those findings cannot be triaged (the panel says
// so) rather than being filed against an id that will mean something else tomorrow.
const TRIAGE_LABELS = { fix: 'to fix', ignore: 'ignored', snooze: 'snoozed' };
const triage = { set: { version: 1, pair: '', entries: [] }, saveTimer: null };
const nowIso = () => new Date().toISOString();
function triageStateOf(f) { return effectiveState(findTriage(triage.set, f.key), nowIso()); }
function persistTriage() {
  clearTimeout(triage.saveTimer);
  triage.saveTimer = setTimeout(async () => {
    const body = JSON.stringify(triage.set);
    if (page.triageUrl) {
      try {
        const res = await fetch(page.triageUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
        setAnnStatus('triage saved · triage.json', false);
      } catch (e) { setAnnStatus('triage save failed: ' + e.message, true); }
    } else {
      try { localStorage.setItem('vc-triage:' + report.pair, body); setAnnStatus('triage saved in this browser only', false); }
      catch (e) { setAnnStatus('cannot save triage: ' + e.message, true); }
    }
  }, 250);
}
async function loadTriage() {
  triage.set = { version: 1, pair: report.pair, entries: [] };
  if (page.triageUrl) {
    try {
      const res = await fetch(page.triageUrl);
      if (res.ok) { const parsed = parseTriageSet(await res.json(), report.pair); if (parsed.ok) { triage.set = parsed.value; return; } }
    } catch (e) { /* fall through to this browser's copy */ }
  }
  try {
    const raw = localStorage.getItem('vc-triage:' + report.pair);
    if (raw) { const parsed = parseTriageSet(JSON.parse(raw), report.pair); if (parsed.ok) triage.set = parsed.value; }
  } catch (e) { /* the empty set stays */ }
}
function applyTriage(verdict, note) {
  const f = state.selected ? byId.get(state.selected) : null;
  if (!f || !f.key) return;
  triage.set = verdict === null
    ? clearTriage(triage.set, f.key)
    : setTriage(triage.set, f.key, verdict, Object.assign({ now: nowIso() }, note === undefined ? {} : { note }));
  persistTriage();
  renderList(); renderMarks(); renderDetail(); renderRailToggle();
}

// ---- focus region --------------------------------------------------------
// Drag a box; the list and the marks narrow to the findings inside it. Not a filter over a property
// of a finding but over WHERE it is, which is how a person actually reads a busy screen: "the
// content column — never mind the sidebar and the header".
let focusBand = null;
let focusDrag = null;   // { handle, pointerId } while a handle is being dragged
function setFocusing(on) {
  state.focusing = on;
  $('focus-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  for (const pane of Object.values(panes)) pane.classList.toggle('focusing', on);
  if (on) setAnnMode(null);
  applyTools();
}
function setFocus(rect, persist) {
  state.focus = rect;
  renderFocusChip(); renderList(); renderMarks(); renderDetail(); renderRailToggle(); renderFocusBand();
  if (persist !== false) persistFocus();
}
// The region is the handover: it lands in focus.json + focus.md so "work in the focused region"
// means the same rectangle to the agent as it does on the phone.
function persistFocus() {
  clearTimeout(focusSaveTimer);
  focusSaveTimer = setTimeout(async () => {
    const body = JSON.stringify({ version: 1, pair: report.pair, region: state.focus, label: state.focusLabel || '', updatedAt: nowIso() });
    if (!page.focusUrl) { try { localStorage.setItem('vc-focus:' + report.pair, body); } catch (e) { /* private mode */ } return; }
    try {
      const res = await fetch(page.focusUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
      if (!res.ok) throw new Error(res.status);
      setAnnStatus(state.focus ? 'focus saved · focus.md' : 'focus cleared', false);
    } catch (e) { setAnnStatus('focus save failed: ' + e.message, true); }
  }, 250);
}
let focusSaveTimer = null;
async function loadFocus() {
  state.focus = null; state.focusLabel = '';
  let raw = null;
  if (page.focusUrl) {
    try { const res = await fetch(page.focusUrl); if (res.ok) raw = await res.json(); } catch (e) { /* fall through */ }
  }
  if (!raw) {
    try { const stored = localStorage.getItem('vc-focus:' + report.pair); if (stored) raw = JSON.parse(stored); } catch (e) { /* none */ }
  }
  if (!raw) return;
  const parsed = parseFocusSet(raw, report.pair);
  if (parsed.ok) { state.focus = parsed.value.region; state.focusLabel = parsed.value.label; }
}
// The comps' chip at the top of the canvas: "Region focus · N of M findings · Clear".
function renderFocusChip() {
  const chip = $('focus-chip');
  chip.hidden = !state.focus;
  if (!state.focus) return;
  const r = state.focus;
  chip.title = 'region x ' + Math.round(r.x) + ', y ' + Math.round(r.y) + ', ' + Math.round(r.w) + '×' + Math.round(r.h) + ' (impl CSS px) — saved to focus.json / focus.md';
  $('focus-msg').textContent = 'Region focus · ' + report.findings.filter(visible).length + ' of ' + report.findings.length + ' findings';
}
function focusPointerDown(pane, e) {
  focusBand = { pointerId: e.pointerId, start: paneWorld(pane, e), end: paneWorld(pane, e) };
  pane.setPointerCapture(e.pointerId);
  renderFocusBand();
}
function focusPointerMove(pane, e) { focusBand.end = paneWorld(pane, e); renderFocusBand(); }
function focusPointerUp(pane, e) {
  const b = focusBand; focusBand = null; ann.suppressClick = true;
  const rect = rectFromCorners(b.start, b.end);
  setFocusing(false);
  // A tap rather than a drag means "never mind": focusing a 1px region would hide every finding,
  // which reads as the app breaking.
  setFocus(rect.w * state.view.z >= 12 && rect.h * state.view.z >= 12 ? rect : null);
}
// ---- editing a drawn region ---------------------------------------------
// Drawing a rectangle precisely with a thumb is not realistic, so the region is adjustable
// afterwards: four corner handles resize, the centre grip moves. The BODY of the region stays
// inert so a drag inside it still pans the canvas.
const FOCUS_HANDLE_PX = 13;
function focusHandleAt(pane, e) {
  if (!state.focus || state.focusing) return null;
  return handleAt(state.focus, paneWorld(pane, e), FOCUS_HANDLE_PX / state.view.z);
}
function focusEditDown(pane, e, handle) {
  focusDrag = { handle: handle, pointerId: e.pointerId };
  pane.setPointerCapture(e.pointerId);
  ann.suppressClick = true;
}
function focusEditMove(pane, e) {
  state.focus = resizeRect(state.focus, focusDrag.handle, paneWorld(pane, e), FOCUS_HANDLE_PX / state.view.z);
  renderFocusChip(); renderList(); renderMarks(); renderFocusBand();
}
function focusEditUp() { focusDrag = null; persistFocus(); }
// World-space, so it lives in the same layers as the marks and appears on both sides at once.
function renderFocusBand() {
  for (const side of ['design', 'impl']) {
    const layer = annLayers[side];
    for (const old of layer.querySelectorAll('.focus-rect, .focus-handle')) old.remove();
    const live = focusBand ? rectFromCorners(focusBand.start, focusBand.end) : state.focus;
    if (!live) continue;
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', live.x); r.setAttribute('y', live.y);
    r.setAttribute('width', Math.max(live.w, 0.5)); r.setAttribute('height', Math.max(live.h, 0.5));
    r.setAttribute('class', 'focus-rect');
    layer.append(r);
    if (focusBand) continue;   // handles only once the drag has settled
    for (const h of handlePoints(live)) {
      const dot = document.createElementNS(SVG, 'circle');
      dot.setAttribute('cx', h.x); dot.setAttribute('cy', h.y);
      dot.setAttribute('r', FOCUS_HANDLE_PX / 2 / state.view.z);
      dot.setAttribute('class', 'focus-handle ' + h.handle);
      dot.dataset.handle = h.handle;
      layer.append(dot);
    }
  }
  applyView();
}

function rawDesign() { return rawDesignSize(report.design, report.alignment); }
function implSize() { return { w: report.impl.width, h: report.impl.height }; }
// What the design is DRAWN with: the CHOSEN registration, always isotropic.
//
// align() fits x and y independently, so the projection it returns can be anisotropic — on this
// corpus by up to +53 % vertically. That is fine for locating elements (the finding boxes use it)
// and unacceptable for looking at the reference: a person cannot judge proportion or type against a
// distorted image, and would have no way to know it was distorted. The stretch therefore stays in
// the DATA and never reaches the screen; the pane label states the fit so the number is not hidden.
// The corner modes ('width' / 'left' / 'right') are the manual answer to the OTHER half of the same
// problem: when the fit's offset reads wrong, register the frames by an edge and judge from there.
function projection() { return displayAlignment(state.align, report.alignment, rawDesign(), implSize()); }
// The superimposed ghost has to LAND on the impl, which is what the run's full fit (stretch
// included) is for; under a manual registration it follows that registration instead, so blink and
// difference show what the panes show.
function ghostAlignment() { return state.align === 'anchors' ? report.alignment : projection(); }
function worldBox() {
  // The design's world extent is its RAW capture size through the CURRENT
  // alignment — report.design.width already has the run's scale in it.
  return unionBoxes([
    { x: 0, y: 0, w: report.impl.width, h: report.impl.height },
    designWorldBox(rawDesign(), projection()),
  ]);
}
// One pane or two: forced below the breakpoint, a choice above it.
function single() { return narrow.matches || state.single; }
function visiblePane() { return single() ? panes[state.side] : panes.impl; }
function paneSize() { const r = visiblePane().getBoundingClientRect(); return { w: r.width, h: r.height }; }
function applyLayout() {
  document.body.classList.toggle('single', single());
  for (const b of document.querySelectorAll('#seg-layout [data-layout]')) b.classList.toggle('on', (b.dataset.layout === 'full') === state.single);
  // With one side and no overlay nothing is registered onto anything, so the align pill goes (the comp's alignShow).
  $('align-wrap').hidden = single() && !narrow.matches && state.lab === 'none';
}
function setLayout(isSingle) {
  state.single = isSingle; applyLayout(); applySide(); saveControls();
  if (state.userMoved) applyView(); else fit();
}
function applySide() {
  for (const side of ['design', 'impl']) panes[side].classList.toggle('active', side === state.side);
  for (const b of document.querySelectorAll('#side-switch [data-side]')) b.classList.toggle('on', b.dataset.side === state.side);
}
function setSide(side) {
  if (state.side === side) return;
  state.side = side; applySide(); saveControls();
  if (state.userMoved) applyView(); else fit();
}
// The tool strip's three modes are exclusive: pan, focus (drag a region), comment (tap = note,
// drag = region). Pan is the rest state the other two fall back to.
function setPan() { setFocusing(false); setAnnMode(null); saveControls(); }
function applyTools() {
  const pan = !ann.mode && !state.focusing;
  $('move-toggle').classList.toggle('on', pan);
  $('move-toggle').setAttribute('aria-pressed', pan ? 'true' : 'false');
  $('focus-toggle').classList.toggle('on', state.focusing);
  $('ann-draw').classList.toggle('on', !!ann.mode);
  $('ann-draw').setAttribute('aria-pressed', ann.mode ? 'true' : 'false');
}
// The layer segment (Findings / Comments / All / Clean): what the canvas draws. The focus region
// is not a layer and stays.
function applyLayer() {
  for (const b of document.querySelectorAll('[data-layer]')) b.classList.toggle('on', b.dataset.layer === state.layer);
  state.showMarks = state.layer === 'findings' || state.layer === 'all';
  document.body.classList.toggle('layer-no-anns', !(state.layer === 'items' || state.layer === 'all'));
}
function setLayer(layer) { state.layer = layer; applyLayer(); saveControls(); renderMarks(); }
// Between 760 and 1120px the comp shortens the layer labels; the phone strip keeps the full words.
const LAYER_LABELS = { findings: ['Findings', 'Find.'], items: ['Comments', 'Comm.'], all: ['All', 'All'], none: ['Clean', 'Clean'] };
function applyNarrow() {
  const short = narrowish.matches && !narrow.matches;
  for (const b of document.querySelectorAll('#seg-layer [data-layer]')) b.textContent = LAYER_LABELS[b.dataset.layer][short ? 1 : 0];
}
// Restore the saved controls onto both the state and the DOM that shows them.
function applyControls(saved) {
  // A saved "aligned: false" is the pre-modes preference: it meant "draw the design raw" = top-left 1:1.
  state.align = ALIGN_MODES.includes(saved.align) ? saved.align : (saved.aligned === false ? 'left' : 'anchors');
  // A pre-layer "marks off" meant the numbered marks only; the layer segment generalises it.
  state.layer = ['findings', 'items', 'all', 'none'].includes(saved.layer) ? saved.layer : (saved.showMarks === false ? 'items' : 'all');
  state.lock = saved.lock !== false;
  state.showMembers = saved.showMembers === true;
  state.single = saved.single === true;
  state.side = saved.side === 'impl' ? 'impl' : 'design';
  state.showTriaged = {
    ignore: saved.showTriaged ? saved.showTriaged.ignore === true : false,
    snooze: saved.showTriaged ? saved.showTriaged.snooze === true : false,
  };
  state.diff = saved.diff === true;
  state.dim = saved.dim === true;
  state.strobe = saved.strobe === true;
  state.lab = ['blink', 'onion', 'swipe', 'difference'].includes(saved.lab) ? saved.lab : 'none';
  // A pre-pill number was the onion's opacity; the difference blend got its own (the comps' 55% / 100%).
  const amount = saved.labAmount;
  state.labAmount = {
    onion: amount && typeof amount.onion === 'number' ? amount.onion : (typeof amount === 'number' ? amount : 55),
    difference: amount && typeof amount.difference === 'number' ? amount.difference : 100,
  };
  applyAlignMode(); applyLock(); applyLayer();
  $('members').checked = state.showMembers;
  for (const [id, on] of [['diff-toggle', state.diff], ['dim-toggle', state.dim], ['strobe-toggle', state.strobe]]) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // No saved preference: desktop has always shown the rail beside the canvas, a phone has not.
  document.body.classList.toggle('rail-open', saved.rail === undefined ? !narrow.matches : saved.rail === true);
  setAnnMode(saved.move === false ? 'draw' : null, true);
}
// The design is always shown at its true aspect, so the label reports the fit the DATA uses rather
// than describing the picture: the reader should know the alignment is anisotropic without having
// to look at a distorted reference to find out.
function applyAspect() {
  const stretch = aspectStretch(report.alignment);
  const off = Math.abs(stretch - 1) >= 0.02;
  const note = off
    ? ' · true aspect (fit ' + (stretch > 1 ? '+' : '') + Math.round((stretch - 1) * 100) + '% vertical)'
    : '';
  $('label-design').title = 'Design · ' + report.design.ref + ' · ' + Math.round(report.design.width) + '×' + Math.round(report.design.height) + note;
}
// What the current registration DOES, in numbers. "aligned / not aligned" never answered the
// question a reader actually has — what did it align ON — so the control names the mode and its
// title states both the drawn transform and the run's own fit behind it.
const ALIGN_HINTS = {
  anchors: 'the run fit over text matched on both sides, aspect-locked',
  width: 'design scaled to the impl width, top-left corners together',
  left: '1:1, top-left corners together',
  right: '1:1, top-RIGHT corners together — for frames that differ by a left-hand rail',
};
// Confidence is a WARNING STATE, never a number on the chrome (gap 2): under the gate the run's
// fit could not be verified, so the pixel channel refused to run and every position was computed
// in a frame it could not trust. Only the Anchors registration depends on that fit.
const CONF_MIN = 0.5;
function anchorLow() { return report.alignment.confidence < CONF_MIN; }
function confWarn() { return anchorLow() && state.lock && state.align === 'anchors'; }
function confPct() { return Math.round(report.alignment.confidence * 100) + '%'; }
function confWarnTip() { return 'Anchor confidence ' + confPct() + ' — below the ' + Math.round(CONF_MIN * 100) + '% threshold. Overlay positions may be unreliable; try Width or Top left.'; }
function applyAlignMode() {
  const a = projection();
  const btn = $('align-mode');
  $('align-label').textContent = ALIGN_LABELS[state.align];
  $('align-icon').textContent = ALIGN_ICONS[state.align];
  // Desktop: the menu opens UP (chevron up while closed); phone: it opens DOWN.
  $('align-chev').textContent = state.alignOpen !== narrow.matches ? 'expand_more' : 'expand_less';
  btn.setAttribute('aria-expanded', state.alignOpen ? 'true' : 'false');
  $('align-menu').hidden = !state.alignOpen;
  const warn = confWarn();
  $('align-pill').classList.toggle('is-warn', warn);
  $('conf-warn').hidden = !warn;
  $('conf-warn').title = confWarnTip();
  const run = report.alignment;
  btn.title = 'Align mode: ' + ALIGN_LABELS[state.align] + ' — ' + ALIGN_HINTS[state.align] +
    ' · drawn x' + a.scale.toFixed(3) + ' @(' + Math.round(a.offsetX) + ', ' + Math.round(a.offsetY) + ')' +
    ' · run fit x' + run.scale.toFixed(3) + ' @(' + Math.round(run.offsetX) + ', ' + Math.round(run.offsetY) + ')' +
    ' confidence ' + run.confidence.toFixed(2) + (run.basis ? ' (' + run.basis + ')' : '') +
    ' · press a to cycle' + (warn ? ' — anchor confidence ' + confPct() + ', positions unreliable' : '');
  renderAlignMenu();
}
function renderAlignMenu() {
  $('align-menu').innerHTML = '<h3>Align lock mode</h3>' + ALIGN_MODES.map((m) => {
    const act = state.align === m, warn = m === 'anchors' && anchorLow();
    return '<div class="align-opt' + (act ? ' on' : '') + (warn ? ' is-warn' : '') + '" data-align="' + m + '" title="' + esc(ALIGN_DESCRIPTIONS[m] + (warn ? ' Anchor confidence is only ' + confPct() + '.' : '')) + '">' +
      '<span class="msi" aria-hidden="true">' + ALIGN_ICONS[m] + '</span>' +
      '<div class="txt"><span class="name">' + esc(ALIGN_LABELS[m]) + '</span><span class="desc">' + esc(ALIGN_DESCRIPTIONS[m]) + '</span>' +
      (warn ? '<span class="warnline"><span class="msi" aria-hidden="true">warning</span>Only ' + confPct() + ' anchor match — positions unreliable</span>' : '') +
      '</div>' + (act ? '<span class="msi check" aria-hidden="true">check</span>' : '') + '</div>';
  }).join('');
}
function setAlign(mode) {
  state.align = mode; state.alignOpen = false;
  // Choosing a registration re-links the panes: it is a statement about how the frames sit on each other.
  state.lock = true; state.viewD = state.view;
  applyAlignMode(); applyLock(); saveControls(); applyLab();
  if (state.userMoved) applyView(); else fit();
}
function cycleAlign(step) {
  const i = ALIGN_MODES.indexOf(state.align);
  setAlign(ALIGN_MODES[(i + (step || 1) + ALIGN_MODES.length) % ALIGN_MODES.length]);
}
function toggleAlignMenu(open) { state.alignOpen = open === undefined ? !state.alignOpen : open; applyAlignMode(); }
// The lock (gap 22): off, the design pane pans and zooms on its own.
function applyLock() {
  const b = $('align-lock');
  b.classList.toggle('on', state.lock);
  b.setAttribute('aria-pressed', state.lock ? 'true' : 'false');
  b.title = state.lock ? 'Lockstep on — panes move together. Click to unlink.' : 'Lockstep off — panes move independently. Click to link.';
  b.querySelector('.msi').textContent = state.lock ? 'link' : 'link_off';
}
function setLock(on) {
  state.lock = on;
  if (on) state.viewD = state.view;
  applyLock(); applyAlignMode(); saveControls(); applyView();
}
// Which view a pane is drawn with, and how a pane's gesture writes back.
function viewOf(side) { return side === 'design' && !state.lock ? state.viewD : state.view; }
function setViewOf(side, v) { if (side === 'design' && !state.lock) state.viewD = v; else state.view = v; }
function setView(v) { state.view = v; state.viewD = v; }
function updateRailToggle() {
  $('rail-toggle').setAttribute('aria-expanded', document.body.classList.contains('rail-open') ? 'true' : 'false');
}

function applyView() {
  const v = state.view, vd = viewOf('design');
  imgs.design.style.transform = designImageTransform(vd, projection(), state.dprD);
  imgs.impl.style.transform = implImageTransform(v, state.dprI);
  // The ghost is the design drawn with the FULL alignment — per-axis stretch
  // included. The design PANE refuses that distortion on purpose (you cannot
  // judge type against a stretched reference); superimposing needs the opposite
  // trade, because a blink or a difference blend against a frame that does not
  // land on the impl compares nothing. #lab-note states the stretch.
  imgs.ghost.style.transform = designImageTransform(v, ghostAlignment(), state.dprD);
  imgs.mask.style.transform = implImageTransform(v, state.dprI);
  // Finding boxes and annotation shapes are baked into world space through the RUN's alignment, so
  // the design side re-maps them onto whatever registration is being drawn — otherwise every mark
  // but the fit's own floats off the image it annotates.
  const designLayer = designLayerTransform(vd, report.alignment, projection());
  layers.design.style.transform = designLayer;
  annLayers.design.style.transform = designLayer;
  diffLayers.design.style.transform = designLayer;
  markLayers.design.style.transform = designLayer;
  layers.impl.style.transform = annLayers.impl.style.transform = worldLayerTransform(v);
  diffLayers.impl.style.transform = markLayers.impl.style.transform = worldLayerTransform(v);
  // Badges keep a constant screen size (the comps' scale(min(2.4, 1/s))); the point circles too.
  for (const side of ['design', 'impl']) {
    const z = viewOf(side).z, cs = Math.min(2.4, 1 / z);
    markLayers[side].style.setProperty('--cs', cs);
    for (const c of panes[side].querySelectorAll('.marks.anns circle.ann, .marks.anns circle.focus-handle')) c.setAttribute('r', (c.classList.contains('ann') ? 7 : FOCUS_HANDLE_PX / 2) / z);
  }
  $('zoom-pct').textContent = Math.round(v.z * 100) + '%';
  applyWipe();
}
function fit() { setView(fitView(worldBox(), paneSize())); state.userMoved = false; applyView(); }

// ---- topbar + delta strip -------------------------------------------------
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
// The comps' topbar carries the pair title only (gap 14): PASS/FAIL, the counts, the sources and
// the run time live on the Library card you came from. The refs stay on the pane labels' titles.
function renderTopbar() {
  $('hdr-left').innerHTML =
    (page.indexHref ? '<a class="back" href="' + esc(page.indexHref) + '" title="Library"><span class="msi" aria-hidden="true">arrow_back</span></a>' : '') +
    '<span class="brand" aria-hidden="true"></span><span class="brand-name">RefDiff</span>' +
    '<span class="pair-title">' + esc(report.pair) + '</span>';
  applyTheme(currentTheme());
  $('label-impl').title = 'Implementation · ' + report.impl.ref + ' · ' + report.impl.width + '×' + report.impl.height;
}
// A regression is a finding an earlier run had fixed and this one brought back — the loop's stop
// signal, which the fix skill halts on. The strip is the one place it cannot be missed (gap 15).
function regressionIds() { return new Set(report.delta && report.delta.regressions ? report.delta.regressions : []); }
function renderDeltaStrip() {
  const d = report.delta, el = $('delta-strip');
  const regs = regressionIds().size;
  const show = !!d && !state.deltaDismissed && (d.introduced.length > 0 || d.resolved.length > 0 || regs > 0);
  el.hidden = !show;
  if (!show) { el.innerHTML = ''; return; }
  el.classList.toggle('reg', regs > 0);
  el.innerHTML =
    '<span class="msi" aria-hidden="true">' + (regs ? 'warning' : 'compare_arrows') + '</span>' +
    '<span class="run" title="the previous run of this pair">vs run ' + esc(d.previousRun.replace('T', ' ').slice(0, 16)) + '</span>' +
    '<span class="add">+' + d.introduced.length + ' introduced</span>' +
    '<span class="res">−' + d.resolved.length + ' resolved</span>' +
    (regs
      ? '<span class="dsep"></span><span class="regmsg">' + regs + (regs === 1 ? ' regression' : ' regressions') + '</span>' +
        '<span class="regsub">fixed earlier, back again — fix plan halted</span>' +
        '<button type="button" class="review' + (state.regOnly ? ' on' : '') + '" id="reg-review">' + (state.regOnly ? 'Show all findings' : 'Review') + '</button>'
      : '<button type="button" class="dismiss" id="delta-dismiss" title="Dismiss for this run"><span class="msi" aria-hidden="true">close</span></button>');
}
function setRegOnly(on) {
  state.regOnly = on; state.selected = null;
  document.body.classList.add('rail-open'); updateRailToggle();
  renderDeltaStrip(); renderList(); renderMarks(); renderDetail();
}

// ---- list ---------------------------------------------------------------
// Focus is per BOX, not per finding. An aggregated finding ("×26 rows") can have instances in the
// content AND in the header, so admitting the whole finding drew its header marks straight back
// onto the canvas — you focused the content and the chrome still lit up.
function boxInFocus(box) {
  if (!state.focus) return true;
  if (!box) return false;
  const r = state.focus;
  return box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y;
}
// A finding is LISTED when at least one of its boxes is inside; the canvas then draws only the
// boxes that actually are (renderMarks).
function inFocus(f) {
  if (!state.focus) return true;
  const boxes = [];
  for (const side of ['designBox', 'implBox']) if (f[side]) boxes.push(f[side]);
  if (f.members) for (const m of f.members) for (const side of ['designBox', 'implBox']) if (m[side]) boxes.push(m[side]);
  return boxes.some(boxInFocus);
}
function visible(f) {
  if (!state.sev[f.severity]) return false;
  if (state.q && !(f.message + ' ' + f.type + ' ' + (f.role || '')).toLowerCase().includes(state.q)) return false;
  if (!inFocus(f)) return false;
  if (state.regOnly && !regressionIds().has(f.id)) return false;
  const verdict = triageStateOf(f);
  if (verdict === 'ignore' && !state.showTriaged.ignore) return false;
  if (verdict === 'snooze' && !state.showTriaged.snooze) return false;
  return true;
}
function rowHtml(f) {
  const n = f.instances && f.instances > 1 ? '×' + f.instances : '';
  const verdict = triageStateOf(f);
  return '<li class="row' + (state.selected === f.id ? ' sel' : '') + (verdict ? ' triaged-' + verdict : '') + '" data-id="' + f.id + '">' +
    '<span class="num ' + f.severity + '">' + f.mark + '</span>' +
    '<span><div class="msg">' + esc(f.message) + '</div><div class="meta"><span class="tag">' + esc(f.type) + '</span>' +
    (f.role ? '<span class="tag">' + esc(f.role) + '</span>' : '') + (n ? '<span class="tag">' + n + '</span>' : '') +
    (verdict ? '<span class="verdict ' + verdict + '">' + TRIAGE_LABELS[verdict] + '</span>' : '') +
    (f.isSuppressed ? '<span class="tag">suppressed: ' + esc(f.suppressedBy) + ' ' + esc(f.rule) + '</span>' : '') +
    '</div></span></li>';
}
function renderList() {
  const kept = report.findings.filter(visible);
  $('list').innerHTML = kept.map(rowHtml).join('');
  $('count').textContent = kept.length + ' of ' + report.findings.length + ' findings shown';
  const sup = report.suppressed.filter(visible);
  $('suppressed').innerHTML = sup.map((s) => rowHtml(byId.get(s.id))).join('');
  $('suppressed-summary').textContent = report.suppressed.length + ' suppressed (' + sup.length + ' shown) — still reported, not part of the verdict';
  // Triage chips sit with the severity chips because they do the same job — decide what the list
  // shows. A verdict HIDES its finding, so without these there would be no way back to it.
  const triaged = triageCounts(triage.set, nowIso());
  $('sev-chips').innerHTML = SEV.map((s) => '<span class="chip ' + s + (state.sev[s] ? ' on' : '') + '" data-sev="' + s + '">' + s + '</span>').join('') +
    (triaged.ignore ? '<span class="chip triage-chip ignore' + (state.showTriaged.ignore ? ' on' : '') + '" data-triaged="ignore">ignored ' + triaged.ignore + '</span>' : '') +
    (triaged.snooze ? '<span class="chip triage-chip snooze' + (state.showTriaged.snooze ? ' on' : '') + '" data-triaged="snooze">snoozed ' + triaged.snooze + '</span>' : '');
  renderRailToggle();
}
// The collapsed rail has to say what it is hiding, so the summary carries the
// severity counts and the note count the lists would otherwise show.
function renderRailToggle() {
  const counts = SEV.map((s) => report.findings.filter((f) => f.severity === s).length);
  const notes = ann.set.annotations.length;
  const shown = report.findings.filter(visible).length;
  const scope = shown === report.findings.length ? String(report.findings.length) : shown + ' of ' + report.findings.length;
  $('rail-toggle').innerHTML =
    '<span>' + scope + ' findings <span class="num critical">' + counts[0] + '</span> <span class="num major">' + counts[1] + '</span> <span class="num minor">' + counts[2] + '</span>' +
    (notes ? ' · ' + notes + (notes === 1 ? ' note' : ' notes') : '') + '</span><span class="chev">▾</span>';
}

// ---- marks --------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';
function rect(box, cls, id, rx) {
  const r = document.createElementNS(SVG, 'rect');
  r.setAttribute('x', box.x); r.setAttribute('y', box.y); r.setAttribute('width', Math.max(box.w, 0.5)); r.setAttribute('height', Math.max(box.h, 0.5));
  if (rx) r.setAttribute('rx', rx);
  r.setAttribute('class', cls); r.dataset.id = id;
  return r;
}
function pad(b, p) { return { x: b.x - p, y: b.y - p, w: b.w + 2 * p, h: b.h + 2 * p }; }
// The comps' badge: a 24px circle in the severity colour whose centre is the box's top-left
// corner (a repeat instance of an aggregate gets the 18px hollow one). An HTML div, as the comps
// draw it, so the number is text the extractor sees; its layer keeps it a constant screen size.
function badge(box, f, cls, member) {
  const d = document.createElement('div');
  d.className = 'vmark ' + cls; d.dataset.id = f.id; d.title = f.message + (member ? ' — repeat instance' : '');
  const r = member ? 9 : 12;
  d.style.left = (box.x - r) + 'px'; d.style.top = (box.y - r) + 'px';
  d.textContent = f.mark;
  return d;
}
function renderMarks() {
  for (const side of ['design', 'impl']) {
    const layer = layers[side], blayer = markLayers[side];
    layer.replaceChildren();
    for (const b of blayer.querySelectorAll('.vmark:not(.ann)')) b.remove();
    blayer.classList.toggle('has-sel', !!state.selected);
    if (!state.showMarks) continue;
    const key = side === 'design' ? 'designBox' : 'implBox';
    const draw = (f, suppressed) => {
      if (!visible(f) && state.selected !== f.id) return;
      const sel = state.selected === f.id;
      const verdict = triageStateOf(f);
      const cls = f.severity + (sel ? ' sel' : '') + (suppressed ? ' suppressed' : '') + (verdict === 'ignore' || verdict === 'snooze' ? ' triaged' : '');
      // Per-box, so an aggregate listed for its content instance does not redraw the header ones.
      const primary = boxInFocus(f[key]) ? f[key] : undefined;
      if (primary) {
        // The box itself only while selected (the comps' 4px-padded outline); Highlight draws the rest.
        if (sel) layer.append(rect(pad(primary, 4), f.severity + ' sel' + (suppressed ? ' suppressed' : ''), f.id, 6));
        blayer.append(badge(primary, f, cls, false));
      }
      if (state.showMembers && f.members) {
        f.members.slice(1).forEach((m) => {
          if (!m[key] || !boxInFocus(m[key])) return;
          layer.append(rect(m[key], f.severity + ' member', f.id, 3));
          blayer.append(badge(m[key], f, cls + ' member', true));
        });
      }
    };
    // Selected LAST: both layers paint in document order, so anything drawn after would cover it.
    report.findings.forEach((f) => { if (state.selected !== f.id) draw(f, false); });
    report.suppressed.forEach((s) => { if (state.selected === s.id) draw(byId.get(s.id), true); });
    const selected = state.selected ? byId.get(state.selected) : null;
    if (selected && !selected.isSuppressed) draw(selected, false);
  }
  renderDiffs();
  applyView();
}

// ---- diff lab -----------------------------------------------------------
// Chromatic's reading aids (highlight the change, mute everything else, strobe
// it, superimpose the two frames) driven by OUR channel rather than by a raw
// pixel diff. Chromatic compares two renders of the same code, so every
// differing pixel is signal; a comp against an implementation is rasterized at
// a different scale, where most differing pixels are resampling residue (95.6 %
// of one measured page pair's raw mask lay inside text). So the regions here
// are the REPORTED ones: every listed finding's box (the comps' "Highlight
// changed parts"), and for a pixel-region finding its connected components
// (Finding.regions) rather than the whole box.
// A region is measured in impl space; the design pane needs the same relative
// patch of the design element (the inverse of what checks.ts did to make it).
function toDesignRegion(f, box) {
  if (!f.designBox || !f.implBox || !f.implBox.w || !f.implBox.h) return null;
  const sx = f.designBox.w / f.implBox.w;
  const sy = f.designBox.h / f.implBox.h;
  return { x: f.designBox.x + (box.x - f.implBox.x) * sx, y: f.designBox.y + (box.y - f.implBox.y) * sy, w: box.w * sx, h: box.h * sy };
}
// A region that covers most of the frame locates nothing — and one always
// exists: the backdrop element behind a dialog is a legitimate presence
// finding whose box IS the frame. Highlighting it lights the whole pane green
// and dimming around it dims nothing.
const REGION_AREA_LIMIT = 0.5;
function tooBig(box, world) {
  const area = world.w * world.h;
  return area > 0 && (box.w * box.h) / area > REGION_AREA_LIMIT;
}
function diffRegions(side) {
  const out = [];
  const world = worldBox();
  const key = side === 'design' ? 'designBox' : 'implBox';
  for (const f of report.findings) {
    if (!visible(f)) continue;
    if (f.type === 'pixel-region') {
      // Older runs carry no regions: the union box is still where it is.
      const boxes = f.regions && f.regions.length ? f.regions : (f.implBox ? [f.implBox] : []);
      for (const b of boxes) {
        if (!boxInFocus(b)) continue;
        const box = side === 'impl' ? b : toDesignRegion(f, b);
        if (box && !tooBig(box, world)) out.push({ box: box, id: f.id });
      }
      continue;
    }
    // A presence finding has a box on one side only; it is drawn on both, since the OTHER side is
    // where the eye goes looking for the missing thing.
    const b = f[key] || (side === 'design' ? f.implBox : f.designBox);
    if (b && boxInFocus(b) && !tooBig(b, world)) out.push({ box: b, id: f.id });
    if (state.showMembers && f.members) {
      for (const m of f.members.slice(1)) if (m[key] && boxInFocus(m[key]) && !tooBig(m[key], world)) out.push({ box: m[key], id: f.id });
    }
  }
  return out;
}
function renderDiffs() {
  const world = worldBox();
  const pad = 4000;   // the dim sheet must outlast a panned view, not just the frame
  for (const side of ['design', 'impl']) {
    const layer = diffLayers[side];
    layer.replaceChildren();
    layer.classList.toggle('strobing', state.strobe && state.diff);
    if (!state.diff) continue;
    const regions = diffRegions(side);
    if (state.dim) {
      // Punch the regions out of a dark sheet: SVG masks read white as "keep".
      const defs = document.createElementNS(SVG, 'defs');
      const mask = document.createElementNS(SVG, 'mask');
      const maskId = 'vc-dim-' + side;
      mask.setAttribute('id', maskId);
      // The mask REGION must be stated in user space too. Its default is
      // -10%..120% of the SVG viewport, and this layer's viewport is the 1×1px
      // box the mark layers use — so an unstated region masks everything away
      // and the sheet renders as nothing at all.
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      mask.setAttribute('x', world.x - pad);
      mask.setAttribute('y', world.y - pad);
      mask.setAttribute('width', world.w + 2 * pad);
      mask.setAttribute('height', world.h + 2 * pad);
      // Inline style, not a fill ATTRIBUTE: the stylesheet's .marks rect
      // fill:none outranks a presentation attribute, which silently makes the
      // whole mask black — i.e. dims nothing at all.
      const keep = rect({ x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }, 'dim-keep', '');
      keep.style.fill = '#fff';
      mask.append(keep);
      // The comps' holes: 6px round the box, 8px radius.
      for (const r of regions) {
        const hole = rect(pad(r.box, 6), 'dim-hole', r.id, 8);
        hole.style.fill = '#000';
        mask.append(hole);
      }
      defs.append(mask);
      const sheet = rect({ x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }, 'dim', '');
      sheet.setAttribute('mask', 'url(#' + maskId + ')');
      layer.append(defs, sheet);
    }
    regions.forEach((r, i) => {
      layer.append(rect(r.box, 'region' + (i === state.diffIndex ? ' cur' : ''), r.id, 4));
    });
  }
  document.body.classList.toggle('strobing-mask', state.strobe && state.diff);
  imgs.mask.hidden = !(state.diff && report.artifacts.diffMask);
  renderLabNote();
}
function renderLabNote() {
  const note = $('lab-note');
  const stretch = aspectStretch(report.alignment);
  const off = Math.abs(stretch - 1) >= 0.02;
  // The superimposed design is drawn with the run's FULL fit, stretch included:
  // blink and difference are meaningless unless the two frames land on each
  // other. That distortion is exactly what the design PANE refuses to show, so
  // it has to be stated here rather than left for the eye to misread.
  if (state.lab !== 'none' && off) {
    note.className = 'lab-note warn'; note.hidden = false;
    note.textContent = 'design stretched ' + (stretch > 1 ? '+' : '') + Math.round((stretch - 1) * 100) + '% vertically to superimpose';
    return;
  }
  note.className = 'lab-note';
  if (!state.diff) { note.textContent = ''; note.hidden = true; return; }
  const n = diffRegions('impl').length;
  note.hidden = false;
  note.textContent = state.diffIndex >= 0 && n
    ? 'highlight ' + (state.diffIndex + 1) + ' of ' + n
    : n + (n === 1 ? ' highlighted difference' : ' highlighted differences');
}
function setDiff(on) {
  state.diff = on;
  if (!on) { state.diffIndex = -1; setStrobe(false, true); }
  $('diff-toggle').classList.toggle('on', on);
  $('diff-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  saveControls(); renderDiffs(); applyView();
}
function setDim(on) {
  state.dim = on;
  $('dim-toggle').classList.toggle('on', on);
  $('dim-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  // Dimming with nothing highlighted is a black screen, so it turns Diff on.
  if (on && !state.diff) { setDiff(true); return; }
  saveControls(); renderDiffs(); applyView();
}
function setStrobe(on, quiet) {
  state.strobe = on;
  $('strobe-toggle').classList.toggle('on', on);
  $('strobe-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  if (on && !state.diff) { setDiff(true); return; }
  if (!quiet) saveControls();
  renderDiffs();
}
function stepDiff(delta) {
  const regions = diffRegions('impl');
  if (!regions.length) return;
  state.diffIndex = (state.diffIndex + delta + regions.length) % regions.length;
  const r = regions[state.diffIndex];
  if (!state.diff) setDiff(true);
  select(r.id, false);
  const box = { x: r.box.x - 24, y: r.box.y - 24, w: r.box.w + 48, h: r.box.h + 48 };
  setView(focusView(box, paneSize(), state.view, 1));
  state.userMoved = true;
  renderDiffs(); applyView();
}
// ---- superimposition modes ----------------------------------------------
let blinkTimer = null;
function setLab(mode) {
  state.lab = mode;
  for (const b of document.querySelectorAll('#seg-variant [data-lab]')) b.classList.toggle('on', b.dataset.lab === mode);
  // While an overlay is on the panes no longer show one side each, so the pane labels go (the comp's showLabels).
  document.body.classList.toggle('lab-on', mode !== 'none');
  const hasAmount = mode === 'onion' || mode === 'difference';
  $('op-pill').hidden = !hasAmount;
  $('wipe').hidden = mode !== 'swipe';
  if (hasAmount) {
    $('op-label').textContent = mode === 'difference' ? 'Diff' : 'Onion';
    $('op-pill').title = mode === 'difference' ? 'Opacity of the difference blend' : 'Opacity of the overlaid design';
    $('lab-amount').value = state.labAmount[mode];
    $('op-pct').textContent = state.labAmount[mode] + '%';
  }
  // Only the impl pane carries the ghost, so a phone (or a chosen single view)
  // showing the design side would put the controls on a pane that cannot react.
  if (mode !== 'none' && single() && state.side !== 'impl') setSide('impl');
  applyLayout(); saveControls(); applyLab();
}
function applyLab() {
  clearInterval(blinkTimer); blinkTimer = null;
  const ghost = imgs.ghost;
  ghost.classList.toggle('difference', state.lab === 'difference');
  $('ghost-wrap').style.clipPath = '';
  if (state.lab === 'none') { ghost.style.opacity = 0; }
  else if (state.lab === 'onion') { ghost.style.opacity = state.labAmount.onion / 100; }
  else if (state.lab === 'difference') { ghost.style.opacity = state.labAmount.difference / 100; }
  else if (state.lab === 'swipe') { ghost.style.opacity = 1; }
  else if (state.lab === 'blink') {
    // The blink comparator: the eye is far better at spotting a thing that
    // MOVES between two frames than a thing that is slightly wrong in one.
    let on = true;
    ghost.style.opacity = 1;
    blinkTimer = setInterval(() => { on = !on; ghost.style.opacity = on ? 1 : 0; }, 650);
  }
  renderLabNote();
  applyView();
}
// The wipe: the ghost is clipped at a WORLD x, so the curtain stays on the same spot of the frame
// while you zoom; the handle is drawn at that x in screen px. Design to the right of the knob.
function applyWipe() {
  if (state.lab !== 'swipe') return;
  const v = state.view;
  const sx = v.tx + state.wipeX * v.z;
  $('ghost-wrap').style.clipPath = 'inset(0 0 0 ' + Math.max(0, sx) + 'px)';
  $('wipe').style.left = (sx - 14) + 'px';
}

// ---- detail -------------------------------------------------------------
function kv(obj) { return obj ? Object.entries(obj).map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ') : '—'; }
// The panel shares the sticky viewer with the panes on a phone, so its
// presence shrinks them (body.has-detail) instead of pushing them off screen.
function setDetail(html) {
  $('detail').innerHTML = html;
  document.body.classList.toggle('has-detail', html !== '');
}
function renderDetail() {
  if (ann.draft || ann.selected) { renderAnnDetail(); return; }
  const f = state.selected ? byId.get(state.selected) : null;
  if (!f) { setDetail(''); return; }
  const keys = Array.from(new Set(Object.keys(f.expected || {}).concat(Object.keys(f.actual || {}))));
  const table = keys.length ? '<table><tr><th></th><th>design (expected)</th><th>impl (actual)</th></tr>' +
    keys.map((k) => '<tr><th>' + esc(k) + '</th><td>' + esc(kv({ [k]: (f.expected || {})[k] }).replace(k + ': ', '')) + '</td><td>' + esc(kv({ [k]: (f.actual || {})[k] }).replace(k + ': ', '')) + '</td></tr>').join('') + '</table>' : '';
  const box = (b) => b ? Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.w) + '×' + Math.round(b.h) : '—';
  setDetail(
    '<h2><span class="num ' + f.severity + '" style="padding:0 6px;border-radius:5px">' + f.mark + '</span> ' + esc(f.message) + '</h2>' +
    '<div class="meta"><span class="tag">' + esc(f.type) + '</span> <span class="tag">' + esc(f.severity) + '</span>' + (f.role ? ' <span class="tag">' + esc(f.role) + '</span>' : '') +
    (f.instances ? ' <span class="tag">×' + f.instances + ' instances</span>' : '') + (f.isSuppressed ? ' <span class="tag">suppressed by ' + esc(f.suppressedBy) + ': ' + esc(f.rule) + '</span>' : '') +
    ' · design box ' + box(f.designBox) + ' · impl box ' + box(f.implBox) + ' (impl CSS px)</div>' + table +
    triageHtml(f) +
    (f.crops ? '<div class="crops"><figure><img src="' + esc(page.base + f.crops.design) + '" alt=""><figcaption>design crop</figcaption></figure><figure><img src="' + esc(page.base + f.crops.impl) + '" alt=""><figcaption>impl crop</figcaption></figure></div>' : ''),
  );
}
// The verdict row: what to do about this finding, and why. Filed against f.key, so a report
// captured before that field existed can only say so.
function triageHtml(f) {
  if (!f.key) {
    return '<div class="meta triage-none">no stable key on this finding — re-run the compare to triage it</div>';
  }
  const entry = findTriage(triage.set, f.key);
  const verdict = triageStateOf(f);
  const button = (value, label) =>
    '<button data-triage="' + value + '" class="verdict-btn ' + value + (verdict === value ? ' on' : '') + '">' + label + '</button>';
  const until = entry && entry.snoozeUntil && verdict === 'snooze' ? ' <span class="kv">until ' + esc(entry.snoozeUntil.slice(0, 10)) + '</span>' : '';
  // An "ignore" only hides the finding from THIS view; the next run reports it
  // again. Saying so here is the difference between a decision that sticks and
  // one that is re-taken every run — and the note is what becomes its reason,
  // so an empty one is refused at harvest time.
  const stick = verdict === 'ignore'
    ? '<div class="meta">hidden here only — <code>refdiff accept ' + esc(report.pair) + '</code> turns this into a policy rule that suppresses it in every run (and lapses if the measurement changes). Needs the note below.</div>'
    : '';
  return '<div class="triage"><div class="actions">' +
    button('fix', 'To fix') + button('ignore', 'Ignore') + button('snooze', 'Snooze') +
    (verdict ? '<button data-triage="clear">Clear</button>' : '') + until +
    '</div><textarea id="triage-note" placeholder="why — stored with the verdict, read by the fix loop">' + esc(entry ? entry.note : '') + '</textarea>' + stick + '</div>';
}

function select(id, focus) {
  state.selected = id;
  if (id) { ann.selected = null; ann.draft = null; renderAnnList(); renderAnnMarks(); }
  renderList(); renderMarks(); renderDetail();
  const f = id ? byId.get(id) : null;
  const box = f && (f.implBox || f.designBox);
  if (focus && box) { setView(focusView(box, paneSize(), state.view)); state.userMoved = true; applyView(); }
  const row = document.querySelector('.row.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
}

// ---- interaction --------------------------------------------------------
function wire() {
  for (const pane of Object.values(panes)) {
    const side = pane.dataset.side;
    pane.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = pane.getBoundingClientRect();
      setViewOf(side, zoomAt(viewOf(side), Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
      state.userMoved = true; applyView();
    }, { passive: false });
    const pointers = new Map();
    let last = null;
    pane.addEventListener('pointerdown', (e) => {
      // Focus and annotate modes both own the drag; they beat finding marks, because a backdrop
      // finding can cover the whole pane and would swallow the gesture.
      const grabbed = focusHandleAt(pane, e);
      if (grabbed) { focusEditDown(pane, e, grabbed); return; }
      if (state.focusing) { focusPointerDown(pane, e); return; }
      if (ann.mode) { annPointerDown(pane, e); return; }
      if (e.target.closest && (e.target.closest('.vmark[data-id]') || e.target.closest('[data-ann]'))) return;
      pane.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pane.classList.add('dragging'); last = null;
    });
    pane.addEventListener('pointermove', (e) => {
      if (focusDrag && focusDrag.pointerId === e.pointerId) { focusEditMove(pane, e); return; }
      if (focusBand && focusBand.pointerId === e.pointerId) { focusPointerMove(pane, e); return; }
      if (ann.band && ann.band.pointerId === e.pointerId) { annPointerMove(pane, e); return; }
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { setViewOf(side, panBy(viewOf(side), e.clientX - prev.x, e.clientY - prev.y)); }
      else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y); const r = pane.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
        if (last) { setViewOf(side, panBy(zoomAt(viewOf(side), dist / last.dist, mid.x, mid.y), mid.x - last.mid.x, mid.y - last.mid.y)); }
        last = { dist, mid };
      }
      state.userMoved = true; applyView();
    });
    const up = (e) => {
      if (focusDrag && focusDrag.pointerId === e.pointerId) { focusEditUp(); return; }
      if (focusBand && focusBand.pointerId === e.pointerId) { focusPointerUp(pane, e); return; }
      if (ann.band && ann.band.pointerId === e.pointerId) { annPointerUp(pane, e); return; }
      pointers.delete(e.pointerId); if (!pointers.size) pane.classList.remove('dragging'); last = null;
    };
    pane.addEventListener('pointerup', up); pane.addEventListener('pointercancel', up);
    pane.addEventListener('dblclick', (e) => { if (!ann.mode) fit(); });
    pane.addEventListener('click', (e) => {
      if (ann.suppressClick) { ann.suppressClick = false; return; } // the click that ended a draft gesture
      const a = e.target.closest && e.target.closest('[data-ann]'); if (a) { selectAnn(a.dataset.ann, false); return; }
      const r = e.target.closest && e.target.closest('.vmark[data-id]'); if (r) select(r.dataset.id, false);
    });
  }
  // The wipe handle owns its drag; the pane under it must not pan.
  const wipe = $('wipe');
  let wiping = null;
  wipe.addEventListener('pointerdown', (e) => { e.stopPropagation(); wipe.setPointerCapture(e.pointerId); wiping = e.pointerId; });
  wipe.addEventListener('pointermove', (e) => {
    if (wiping !== e.pointerId) return;
    const r = panes.impl.getBoundingClientRect();
    const x = (e.clientX - r.left - state.view.tx) / state.view.z;
    state.wipeX = Math.min(report.impl.width - 20, Math.max(20, x));
    applyWipe();
  });
  const wipeUp = (e) => { if (wiping === e.pointerId) wiping = null; };
  wipe.addEventListener('pointerup', wipeUp); wipe.addEventListener('pointercancel', wipeUp);
  wipe.addEventListener('click', (e) => e.stopPropagation());
  $('side-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b) setSide(b.dataset.side); });
  $('seg-layout').addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) setLayout(b.dataset.layout === 'full'); });
  $('seg-variant').addEventListener('click', (e) => { const b = e.target.closest('[data-lab]'); if (b) setLab(b.dataset.lab); });
  for (const id of ['seg-layer', 'seg-layer-m']) $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-layer]'); if (b) setLayer(b.dataset.layer); });
  $('move-toggle').addEventListener('click', setPan);
  $('focus-toggle').addEventListener('click', () => {
    if (state.focus) { setFocus(null); setFocusing(false); return; }  // second press clears
    setFocusing(!state.focusing);
  });
  $('focus-clear').addEventListener('click', () => { setFocus(null); setFocusing(false); });
  $('delta-strip').addEventListener('click', (e) => {
    if (e.target.closest('#reg-review')) setRegOnly(!state.regOnly);
    else if (e.target.closest('#delta-dismiss')) { state.deltaDismissed = true; renderDeltaStrip(); }
  });
  $('align-mode').addEventListener('click', () => toggleAlignMenu());
  $('align-lock').addEventListener('click', () => setLock(!state.lock));
  $('align-menu').addEventListener('click', (e) => { const o = e.target.closest('[data-align]'); if (o) setAlign(o.dataset.align); });
  document.addEventListener('pointerdown', (e) => { if (state.alignOpen && !(e.target.closest && e.target.closest('.align-wrap'))) toggleAlignMenu(false); });
  $('detail').addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button[data-triage]');
    if (!b) return;
    const note = document.getElementById('triage-note');
    applyTriage(b.dataset.triage === 'clear' ? null : b.dataset.triage, note ? note.value : undefined);
  });
  $('detail').addEventListener('change', (e) => {
    if (e.target.id !== 'triage-note') return;
    const f = state.selected ? byId.get(state.selected) : null;
    if (!f || !f.key) return;
    triage.set = setTriageNote(triage.set, f.key, e.target.value, nowIso());
    persistTriage(); renderList(); renderRailToggle();
  });
  $('rail-toggle').addEventListener('click', () => {
    document.body.classList.toggle('rail-open');
    updateRailToggle(); saveControls();
    if (!state.userMoved) fit();
  });
  narrow.addEventListener('change', () => { applyLayout(); applySide(); applyNarrow(); applyAlignMode(); if (state.userMoved) applyView(); else fit(); });
  narrowish.addEventListener('change', applyNarrow);
  // On a phone the comment tool stays on until switched off (a thumb cannot re-pick it per note);
  // on desktop it is one-shot, like the comps' tool that snaps back to pan after a gesture.
  $('ann-draw').addEventListener('click', () => { setAnnMode(ann.mode ? null : 'draw', narrow.matches); saveControls(); });
  $('ann-list').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) selectAnn(row.dataset.ann === ann.selected ? null : row.dataset.ann, true); });
  $('detail').addEventListener('click', (e) => { const b = e.target.closest('button[data-act]'); if (b) annAction(b.dataset.act, b.dataset.ann); });
  $('list').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) select(row.dataset.id === state.selected ? null : row.dataset.id, true); });
  $('suppressed').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) select(row.dataset.id === state.selected ? null : row.dataset.id, true); });
  $('sev-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    if (c.dataset.triaged) { state.showTriaged[c.dataset.triaged] = !state.showTriaged[c.dataset.triaged]; saveControls(); }
    else state.sev[c.dataset.sev] = !state.sev[c.dataset.sev];
    renderList(); renderMarks(); renderFocusChip();
  });
  $('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderList(); renderMarks(); });
  $('zoom-in').addEventListener('click', () => { const p = paneSize(); setView(zoomAt(state.view, 1.25, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); });
  $('zoom-out').addEventListener('click', () => { const p = paneSize(); setView(zoomAt(state.view, 0.8, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); });
  $('fit').addEventListener('click', fit);
  $('members').addEventListener('change', (e) => { state.showMembers = e.target.checked; saveControls(); renderMarks(); });
  $('diff-toggle').addEventListener('click', () => setDiff(!state.diff));
  $('dim-toggle').addEventListener('click', () => setDim(!state.dim));
  $('strobe-toggle').addEventListener('click', () => setStrobe(!state.strobe));
  $('lab-amount').addEventListener('input', (e) => {
    const k = state.lab === 'difference' ? 'difference' : 'onion';
    state.labAmount[k] = Number(e.target.value);
    $('op-pct').textContent = state.labAmount[k] + '%';
    saveControls(); applyLab();
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') { e.target.blur(); } return; }
    const p = paneSize();
    if (e.key === '+' || e.key === '=') { setView(zoomAt(state.view, 1.25, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); }
    else if (e.key === '-') { setView(zoomAt(state.view, 0.8, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); }
    else if (e.key === '0') fit();
    else if (e.key === 'n' || e.key === 'r') setAnnMode(ann.mode ? null : 'draw');
    else if (e.key === 'l') setLock(!state.lock);
    else if (e.key === 'a' || e.key === 'A') cycleAlign(e.key === 'A' ? -1 : 1);
    else if (e.key === 'd') setDiff(!state.diff);
    else if (e.key === 'g') setDim(!state.dim);
    else if (e.key === 's') setStrobe(!state.strobe);
    else if (e.key === 'b') setLab(state.lab === 'blink' ? 'none' : 'blink');
    else if (e.key === 'o') setLab(state.lab === 'onion' ? 'none' : 'onion');
    else if (e.key === 'w') setLab(state.lab === 'swipe' ? 'none' : 'swipe');
    else if (e.key === 'x') setLab(state.lab === 'difference' ? 'none' : 'difference');
    else if (e.key === ']') stepDiff(1);
    else if (e.key === '[') stepDiff(-1);
    else if (e.key === 'Escape') {
      if (state.alignOpen) toggleAlignMenu(false);
      else if (state.focusing) setFocusing(false);
      else if (state.lab !== 'none') setLab('none');
      else if (ann.mode || ann.draft || ann.selected) { setAnnMode(null); ann.draft = null; selectAnn(null, false); }
      else select(null, false);
    }
    else if (e.key === 'j' || e.key === 'k') {
      const kept = report.findings.filter(visible); if (!kept.length) return;
      const i = kept.findIndex((f) => f.id === state.selected);
      const next = kept[(i + (e.key === 'j' ? 1 : -1) + kept.length) % kept.length];
      select(next.id, true);
    }
  });
  // The panes container is laid out on both breakpoints; the impl pane is not.
  new ResizeObserver(() => { if (!state.userMoved) fit(); else applyView(); }).observe($('panes'));
}

// ---- annotations --------------------------------------------------------
// Shapes live in world space (impl CSS px) like every finding box; the anchor
// is the element of that side under/around the shape (snapToElement over
// elements.json). Status: open → implemented (agent) → done (designer).
const uid = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function setAnnStatus(text, isError) { ann.status = text; const el = $('ann-status'); el.textContent = text; el.className = 'annstatus' + (isError ? ' err' : ''); }
// One annotate mode, not two: the gesture already said which shape was meant — a click is a note on
// the element under it, a drag is a region — so a second button only made you declare it twice.
function setAnnMode(mode, sticky) {
  ann.mode = mode;
  // A sticky mode survives drawing a shape: the corner toggle stays in
  // annotate until it is switched back, the desktop button is one-shot.
  ann.sticky = !!mode && !!sticky;
  state.move = !mode;
  for (const pane of Object.values(panes)) pane.classList.toggle('annotating', !!mode);
  document.body.classList.toggle('ann-mode', !!mode);
  applyTools();
}
function persist() {
  clearTimeout(ann.saveTimer);
  ann.saveTimer = setTimeout(async () => {
    const body = JSON.stringify(ann.set);
    if (ann.storage === 'api') {
      try {
        const res = await fetch(page.annotationsUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
        setAnnStatus('saved · annotations.json', false);
      } catch (e) { setAnnStatus('save failed: ' + e.message, true); }
    } else {
      try { localStorage.setItem('vc-annotations:' + report.pair, body); setAnnStatus('saved in this browser only — serve the run dir (--serve) to persist to annotations.json', false); }
      catch (e) { setAnnStatus('cannot save: ' + e.message, true); }
    }
  }, 250);
}
function replaceAnn(next) { ann.set = Object.assign({}, ann.set, { annotations: ann.set.annotations.map((a) => (a.id === next.id ? next : a)) }); }
function annIndex(id) { return ann.set.annotations.findIndex((a) => a.id === id); }

// A pointer lands on what is DRAWN; shapes are stored in RUN world space (the space the finding
// boxes use), and on the design side those two differ by the registration re-map. Without the
// inverse, a note drawn on a design pane under any non-fit alignment saved itself somewhere else —
// the mark reappeared offset from the thing it was pointing at.
function paneWorld(pane, e) {
  const r = pane.getBoundingClientRect();
  const p = screenToWorld(viewOf(pane.dataset.side), e.clientX - r.left, e.clientY - r.top);
  return pane.dataset.side === 'design' ? worldFromShown(p, report.alignment, projection()) : p;
}
function annPointerDown(pane, e) {
  // A sticky mode keeps drawing after each shape, so an unsaved draft with
  // text in it must not be thrown away by the next tap.
  const ta = document.querySelector('#detail textarea');
  if (ann.draft && ta && ta.value.trim()) { setAnnStatus('save or cancel the open note first', true); return; }
  const p = paneWorld(pane, e);
  ann.band = { pointerId: e.pointerId, side: pane.dataset.side, start: p, end: p };
  pane.setPointerCapture(e.pointerId);
  renderAnnMarks();
}
function annPointerMove(pane, e) { ann.band.end = paneWorld(pane, e); renderAnnMarks(); }
// Click or drag — the one thing that decides which SHAPE the gesture meant, so the preview and the
// saved annotation can never disagree. The threshold is in SCREEN px: at a fit-to-phone zoom a
// 3-world-px wobble is under two real pixels, which turned taps into slivers of a region.
function dragged(b) {
  return Math.abs(b.end.x - b.start.x) * state.view.z >= 10 && Math.abs(b.end.y - b.start.y) * state.view.z >= 10;
}
function annPointerUp(pane, e) {
  const b = ann.band; ann.band = null; ann.suppressClick = true;
  const x = Math.min(b.start.x, b.end.x), y = Math.min(b.start.y, b.end.y), w = Math.abs(b.end.x - b.start.x), h = Math.abs(b.end.y - b.start.y);
  const drawn = dragged(b);
  const shape = drawn ? { kind: 'rect', x, y, w, h } : { kind: 'point', x: b.end.x, y: b.end.y };
  ann.draft = { side: b.side, shape, anchor: anchorFor(shape, ann.elements[b.side]) };
  ann.selected = null; state.selected = null;
  if (!ann.sticky) setAnnMode(null);
  renderList(); renderMarks(); renderAnnMarks(); renderDetail();
  const ta = document.querySelector('#detail textarea'); if (ta) ta.focus();
}
function selectAnn(id, focus) {
  ann.selected = id; ann.draft = null;
  if (id) state.selected = null;
  const picked = id ? ann.set.annotations[annIndex(id)] : null;
  if (picked && narrow.matches && picked.side !== state.side) setSide(picked.side);
  renderList(); renderMarks(); renderAnnList(); renderAnnMarks(); renderDetail();
  const a = id ? ann.set.annotations[annIndex(id)] : null;
  if (focus && a) { setView(focusView(shapeBox(a.shape).w ? shapeBox(a.shape) : { x: a.shape.x - 20, y: a.shape.y - 20, w: 40, h: 40 }, paneSize(), state.view)); state.userMoved = true; applyView(); }
  const row = document.querySelector('#ann-list .row.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
}
function annAction(act, id) {
  const now = nowIso();
  if (act === 'save-draft') {
    const note = document.querySelector('#detail textarea').value;
    const a = createAnnotation({ id: uid(), side: ann.draft.side, shape: ann.draft.shape, note, now }, ann.elements[ann.draft.side]);
    ann.set = Object.assign({}, ann.set, { annotations: ann.set.annotations.concat([a]) });
    ann.draft = null; persist(); selectAnn(a.id, false); return;
  }
  if (act === 'cancel-draft') { ann.draft = null; renderAnnMarks(); renderDetail(); return; }
  const i = annIndex(id); if (i < 0) return;
  const a = ann.set.annotations[i];
  if (act === 'delete') { ann.set = Object.assign({}, ann.set, { annotations: ann.set.annotations.filter((x) => x.id !== id) }); persist(); selectAnn(null, false); return; }
  if (act === 'save-note') { replaceAnn(editNote(a, document.querySelector('#detail textarea').value, now)); }
  else replaceAnn(transition(a, act, now));
  persist(); renderAnnList(); renderAnnMarks(); renderDetail();
}

function annRowHtml(a, i) {
  const n = i + 1;
  return '<li class="row ann ' + a.status + (ann.selected === a.id ? ' sel' : '') + '" data-ann="' + a.id + '">' +
    '<span class="num ' + a.status + '">' + n + '</span>' +
    '<span><div class="msg">' + (a.note.trim() ? esc(a.note.trim()) : '<i>(no text)</i>') + '</div><div class="meta"><span class="tag">' + a.side + '</span><span class="tag">' + a.status + '</span>' +
    (a.stale ? '<span class="tag">stale</span>' : '') + ' ' + esc(describeAnchor(a.anchor)) + '</div></span></li>';
}
function renderAnnList() {
  const c = counts(ann.set);
  $('ann-summary').textContent = ann.set.annotations.length + ' annotations — ' + c.open + ' open · ' + c.implemented + ' implemented · ' + c.done + ' done';
  $('ann-list').innerHTML = ann.set.annotations.map(annRowHtml).join('');
  renderRailToggle();
}
// The comps' comment badge: a 22px rounded square in the status colour, centred on the shape's
// top-left corner (a point's badge sits on the point). HTML, like the finding badges.
function annLabel(x, y, n, status, id, note) {
  const d = document.createElement('div');
  d.className = 'vmark ann ' + status; d.dataset.ann = id; d.title = note;
  d.style.left = (x - 11) + 'px'; d.style.top = (y - 11) + 'px';
  d.textContent = n;
  return d;
}
function renderAnnMarks() {
  for (const side of ['design', 'impl']) {
    const layer = annLayers[side], blayer = markLayers[side];
    layer.replaceChildren();
    for (const b of blayer.querySelectorAll('.vmark.ann')) b.remove();
    ann.set.annotations.forEach((a, i) => {
      if (a.side !== side) return;
      const cls = 'ann ' + a.status + (a.stale ? ' stale' : '') + (ann.selected === a.id ? ' sel' : '');
      if (a.shape.kind === 'rect') {
        const r = document.createElementNS(SVG, 'rect');
        r.setAttribute('x', a.shape.x); r.setAttribute('y', a.shape.y); r.setAttribute('width', Math.max(a.shape.w, 0.5)); r.setAttribute('height', Math.max(a.shape.h, 0.5));
        r.setAttribute('class', cls); r.dataset.ann = a.id; layer.append(r);
        blayer.append(annLabel(a.shape.x, a.shape.y, i + 1, a.status, a.id, a.note));
      } else {
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', a.shape.x); c.setAttribute('cy', a.shape.y); c.setAttribute('r', 7 / state.view.z);
        c.setAttribute('class', cls); c.dataset.ann = a.id; layer.append(c);
        blayer.append(annLabel(a.shape.x, a.shape.y, i + 1, a.status, a.id, a.note));
      }
    });
    const live = ann.band && ann.band.side === side ? ann.band : null;
    const d = ann.draft && ann.draft.side === side ? ann.draft : null;
    // The band appears the moment the gesture becomes a drag — that IS the feedback telling you
    // this one is a region and not a note; a click never flashes a sliver of one.
    if (live && dragged(live)) {
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', Math.min(live.start.x, live.end.x)); r.setAttribute('y', Math.min(live.start.y, live.end.y));
      r.setAttribute('width', Math.abs(live.end.x - live.start.x)); r.setAttribute('height', Math.abs(live.end.y - live.start.y)); r.setAttribute('class', 'band'); layer.append(r);
    }
    if (d) {
      if (d.shape.kind === 'rect') { const r = document.createElementNS(SVG, 'rect'); r.setAttribute('x', d.shape.x); r.setAttribute('y', d.shape.y); r.setAttribute('width', d.shape.w); r.setAttribute('height', d.shape.h); r.setAttribute('class', 'band'); layer.append(r); }
      else { const c = document.createElementNS(SVG, 'circle'); c.setAttribute('cx', d.shape.x); c.setAttribute('cy', d.shape.y); c.setAttribute('r', 7 / state.view.z); c.setAttribute('class', 'ann open'); layer.append(c); }
      if (d.anchor) { const r = document.createElementNS(SVG, 'rect'); r.setAttribute('x', d.anchor.box.x); r.setAttribute('y', d.anchor.box.y); r.setAttribute('width', d.anchor.box.w); r.setAttribute('height', d.anchor.box.h); r.setAttribute('class', 'band'); layer.append(r); }
    }
  }
  applyView();
}
function renderAnnDetail() {
  const d = ann.draft;
  if (d) {
    setDetail('<h2>New ' + (d.shape.kind === 'rect' ? 'region' : 'note') + ' on the <b>' + d.side + '</b> side</h2>' +
      '<div class="meta">anchored to ' + esc(describeAnchor(d.anchor)) + (ann.elementsLoaded ? '' : ' (elements.json not loaded — no snapping)') + ' · world ' + Math.round(d.shape.x) + ',' + Math.round(d.shape.y) + '</div>' +
      '<textarea placeholder="what should change here?"></textarea>' +
      '<div class="actions"><button class="primary" data-act="save-draft">Save note</button><button data-act="cancel-draft">Cancel</button></div>');
    return;
  }
  const i = annIndex(ann.selected); const a = ann.set.annotations[i];
  if (!a) { setDetail(''); return; }
  const when = (k) => (a[k] ? ' · ' + k.replace('At', '') + ' ' + esc(a[k]) : '');
  setDetail('<h2><span class="num ' + a.status + '" style="padding:0 6px;border-radius:5px">' + (i + 1) + '</span> <span class="status ' + a.status + '">' + a.status + '</span> ' +
    (a.shape.kind === 'rect' ? 'region' : 'note') + ' on the <b>' + a.side + '</b> side' + (a.stale ? ' · <b>stale</b>: its element is not in the current capture' : '') + '</h2>' +
    '<div class="meta">anchored to ' + esc(describeAnchor(a.anchor)) + ' · created ' + esc(a.createdAt) + when('implementedAt') + when('doneAt') + ' · id ' + a.id + '</div>' +
    '<textarea>' + esc(a.note) + '</textarea>' +
    '<div class="actions"><button class="primary" data-act="save-note" data-ann="' + a.id + '">Save note</button>' +
    (a.status !== 'done' ? '<button data-act="done" data-ann="' + a.id + '">Mark done</button>' : '') +
    (a.status !== 'open' ? '<button data-act="reopen" data-ann="' + a.id + '">Reopen</button>' : '') +
    (a.status === 'open' ? '<button data-act="implement" data-ann="' + a.id + '" title="normally the agent does this via --mark-implemented">Mark implemented</button>' : '') +
    '<button class="danger" data-act="delete" data-ann="' + a.id + '">Delete</button>' +
    '<span class="hint">editing the text of an implemented note reopens it</span></div>');
}
async function loadAnnotations() {
  if (ann.storage === 'api') {
    try {
      const res = await fetch(page.annotationsUrl);
      if (res.ok) { const p = parseAnnotationSet(await res.json(), report.pair); if (p.ok) { ann.set = p.value; setAnnStatus('annotations.json · ' + ann.set.annotations.length + ' loaded', false); return; } }
      else if (res.status === 404) { ann.storage = 'local'; }
      else throw new Error('HTTP ' + res.status);
    } catch (e) { ann.storage = 'local'; }
  }
  try {
    const raw = localStorage.getItem('vc-annotations:' + report.pair);
    if (raw) { const p = parseAnnotationSet(JSON.parse(raw), report.pair); if (p.ok && p.value.annotations.length >= ann.set.annotations.length) ann.set = p.value; }
  } catch (e) { /* embedded copy stays */ }
  setAnnStatus(ann.set.annotations.length + ' annotations · not served: changes stay in this browser', false);
}
async function loadElements() {
  try {
    const res = await fetch(page.base + 'elements.json'); if (!res.ok) throw new Error(res.status);
    const j = await res.json(); ann.elements = { design: j.design || [], impl: j.impl || [] }; ann.elementsLoaded = true;
  } catch (e) { ann.elementsLoaded = false; }
}

// ---- boot ---------------------------------------------------------------
function loadImage(img, src) {
  return new Promise((resolve) => { img.addEventListener('load', () => resolve(true), { once: true }); img.addEventListener('error', () => resolve(false), { once: true }); img.src = src; });
}
let wired = false;
// Open a pair. Called once by an emitted file and once per route by the app
// shell, so every piece of per-pair state is reset here, not at load.
function openReport(reportData, annotationSet, pageData) {
  report = reportData;
  page = Object.assign({ indexHref: null, base: '', annotationsUrl: 'api/annotations', triageUrl: null }, pageData || {});
  byId = new Map(report.findings.concat(report.suppressed.map((s) => Object.assign({ isSuppressed: true }, s))).map((f) => [f.id, f]));
  ann.set = annotationSet || { version: 1, pair: report.pair, annotations: [] };
  ann.mode = null; ann.draft = null; ann.selected = null; ann.band = null; ann.sticky = false;
  ann.elements = { design: [], impl: [] }; ann.elementsLoaded = false;
  state.view = { z: 1, tx: 0, ty: 0 }; state.userMoved = false; state.selected = null; state.q = '';
  state.sev = { critical: true, major: true, minor: true };
  state.focus = null; state.focusLabel = ''; state.focusing = false; focusBand = null; focusDrag = null;
  state.diffIndex = -1; state.regOnly = false; state.deltaDismissed = false; state.alignOpen = false;
  state.wipeX = report.impl.width / 2;
  document.body.classList.remove('has-detail', 'ann-mode');
  $('q').value = '';
  applyControls(readControls());
  document.title = report.pair + ' — refdiff';
  renderTopbar(); renderDeltaStrip(); renderList(); renderDetail(); renderAnnList();
  if (!wired) { wire(); wired = true; }
  applyLayout(); applySide(); applyNarrow(); updateRailToggle(); applyAspect(); setFocusing(false); renderFocusChip(); renderFocusBand();
  return Promise.all([
    loadImage(imgs.design, page.base + report.artifacts.designPng),
    loadImage(imgs.impl, page.base + report.artifacts.implPng),
    loadAnnotations(),
    loadElements(),
    loadTriage(),
    loadFocus(),
    // The ghost is the same PNG as the design pane's, drawn with a different
    // transform; the mask exists only when the pixel channel reported.
    loadImage(imgs.ghost, page.base + report.artifacts.designPng),
    report.artifacts.diffMask ? loadImage(imgs.mask, page.base + report.artifacts.diffMask) : Promise.resolve(false),
  ]).then(([okD, okI]) => {
    // DPR = PNG native px per CAPTURE CSS px; a missing image keeps 1. The
    // design side cannot infer it from report.design.width — see
    // designCaptureDpr, which this used to get wrong on 40 of 41 pairs.
    state.dprD = okD ? designCaptureDpr(imgs.design.naturalWidth, report.design, report.alignment.scale) : 1;
    state.dprI = okI ? (report.impl.dpr || imgs.impl.naturalWidth / report.impl.width) : 1;
    if (!okD) $('label-design').textContent += ' — image missing';
    if (!okI) $('label-impl').textContent += ' — image missing';
    setLab(state.lab);
    renderList(); renderMarks(); renderAnnList(); renderAnnMarks(); renderRailToggle(); renderDetail(); fit();
  });
}
`
