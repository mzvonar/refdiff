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
 * (design.png, impl.png), so it must be written INTO the run dir (or served
 * from it). No network, no dependencies: the pure modules (view-math,
 * annotations, triage, focus, rail) are embedded verbatim into an inline
 * module script.
 *
 * The chrome follows the RefDiff comps (docs/plan-annotator-redesign.md,
 * phase 3): a 46px topbar (back, brand, pair title; the Split / Full,
 * Off / Wipe / Onion / Blink / Diff and Findings / Comments / All / Clean
 * segments; the theme toggle), the delta strip under it when the run changed
 * something, a 44px tool strip beside the canvas (pan, focus, comment,
 * highlight, dim, strobe), and floating pills over the canvas (zoom, the
 * Design / Impl switch in Full mode, overlay opacity, the align pill with its
 * lock, dropdown and confidence warning, the focus chip), and the 320px
 * review rail on the right (phase 4): Findings / Comments tabs, severity
 * chips, one row per finding with its `prop expected → actual` line, the
 * suppressed disclosure, the comments with the model's replies. Selecting a
 * row focuses the canvas on the element — the canvas is the crop; the crop
 * PNGs stay in the run dir for the model. On a phone (< 760px) one side
 * shows at a time, the tools float over the canvas and the rail is the
 * comps' bottom sheet; the header's settings popover picks the theme and
 * the phone LAYOUT — default (as above) or minimal (the RefDiff Mobile
 * Minimal comp: the segments fold behind a tune button, the tool strip +
 * Fit, the Design/Impl swap and the rail button share the bottom row, the
 * align control is icon-only, no zoom pill / layer strip).
 */

import type { ComparisonReport } from "@refdiff/core"

import { emptySet, type AnnotationSet } from "./annotations.js"
import { FONT_FACE_CSS, ICON_CSS } from "./fonts.js"

export interface RenderOptions {
  /** Compiled source of view-math.js (an ESM module with no imports). */
  viewMathSource: string
  /** Compiled source of annotations.js (an ESM module with no imports). */
  annotationsSource: string
  /** Compiled source of triage.js (an ESM module with no imports). */
  triageSource: string
  /** Compiled source of focus.js (an ESM module with no imports). */
  focusSource: string
  /** Compiled source of rail.js (an ESM module with no imports). */
  railSource: string
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
  for (const source of [
    options.viewMathSource,
    options.annotationsSource,
    options.triageSource,
    options.focusSource,
    options.railSource,
  ]) {
    if (source.includes("</script")) {
      throw new Error("embedded module sources must not contain a closing script tag")
    }
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
${options.triageSource}
${options.focusSource}
${options.railSource}
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
  <div class="tb-right" id="hdr-right">
    <button type="button" class="theme-toggle" id="theme-toggle" title="Toggle chrome theme"><span class="msi" aria-hidden="true">light_mode</span></button>
    <button type="button" class="hdr-btn view-toggle" id="view-toggle" aria-pressed="false" aria-controls="view-panel" title="View options"><span class="msi" aria-hidden="true">tune</span></button>
    <div class="settings-wrap" id="settings-wrap">
      <button type="button" class="hdr-btn settings-btn" id="settings-toggle" aria-expanded="false" aria-controls="settings-menu" title="Settings"><span class="msi" aria-hidden="true">settings</span></button>
      <div class="settings-menu" id="settings-menu" hidden>
        <span class="sm-label">Layout</span>
        <div class="seg seg-full" id="seg-mlayout" role="group" aria-label="phone layout">
          <button type="button" data-mlayout="minimal" title="Toolbars behind the header's tune button; more room for the canvas">Minimal</button>
          <button type="button" data-mlayout="default" title="The toolbars over and under the canvas">Default</button>
        </div>
        <span class="sm-label gap">Theme</span>
        <div class="seg seg-full" id="seg-theme" role="group" aria-label="chrome theme">
          <button type="button" data-theme="dark">Dark</button>
          <button type="button" data-theme="light">Light</button>
        </div>
      </div>
    </div>
  </div>
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
  <section id="viewer">
    <div class="work">
      <div class="tools" id="tools">
        <button type="button" id="move-toggle" class="tool on" aria-pressed="true" title="Pan / move (Esc)"><span class="msi" aria-hidden="true">pan_tool</span></button>
        <button type="button" id="ann-draw" class="tool" aria-pressed="false" title="Comment — tap a point or drag a region (n)"><span class="msi" aria-hidden="true">add_comment</span></button>
        <button type="button" id="focus-toggle" class="tool" aria-pressed="false" title="Focus region — drag to limit findings (press again to clear)"><span class="msi" aria-hidden="true">center_focus_strong</span></button>
        <button type="button" id="diff-toggle" class="tool" aria-pressed="false" title="Highlight changed parts (d) — [ and ] step through them"><span class="msi" aria-hidden="true">difference</span></button>
        <button type="button" id="dim-toggle" class="tool" aria-pressed="false" title="Dim unchanged parts (g)"><span class="msi" aria-hidden="true">tonality</span></button>
        <button type="button" id="strobe-toggle" class="tool" aria-pressed="false" title="Strobe — pulse the differences in colour (s)"><span class="msi" aria-hidden="true">flare</span></button>
        <span class="tool-sep" aria-hidden="true"></span>
        <button type="button" id="fit-m" class="tool fit-m" title="Fit to view (0)"><span class="msi" aria-hidden="true">fit_screen</span></button>
      </div>
      <div class="panes" id="panes">
        <div class="view-panel" id="view-panel" hidden>
          <div class="vp-row"><span class="vp-label">Compare</span>
            <div class="seg seg-p" id="seg-variant-m" role="group" aria-label="comparison overlay">
              <button type="button" data-lab="none" title="No comparison overlay">Off</button>
              <button type="button" data-lab="swipe" title="Wipe slider between refs">Wipe</button>
              <button type="button" data-lab="onion" title="Onion-skin: the design over the impl">Onion</button>
              <button type="button" data-lab="blink" title="Alternate refs">Blink</button>
              <button type="button" data-lab="difference" title="Pixel difference blend">Diff</button>
            </div>
          </div>
          <div class="vp-row"><span class="vp-label">Show</span>
            <div class="seg seg-p" id="seg-layer-p" role="group" aria-label="canvas layer">
              <button type="button" data-layer="findings">Findings</button>
              <button type="button" data-layer="items">Comments</button>
              <button type="button" data-layer="all">All</button>
              <button type="button" data-layer="none">Clean</button>
            </div>
          </div>
        </div>
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
        <button type="button" class="pane-swap" id="pane-swap" title="Switch design / implementation"><span class="msi" aria-hidden="true">swap_horiz</span><span id="pane-swap-label">Design</span></button>
        <button type="button" class="rail-btn" id="rail-btn" title="Review panel"><span class="msi" aria-hidden="true">list_alt</span><span class="rail-count" id="rail-count">0</span></button>
        <div class="op-pill" id="op-pill" hidden><span class="msi" aria-hidden="true">opacity</span><span id="op-label" class="op-label">Onion</span><input type="range" id="lab-amount" min="0" max="100" step="1" value="55" aria-label="overlay opacity"><span id="op-pct" class="op-pct">55%</span></div>
        <div class="align-wrap" id="align-wrap">
          <div class="align-pill" id="align-pill">
            <button type="button" class="lock on" id="align-lock" aria-pressed="true" title="Lockstep on — panes move together. Click to unlink."><span class="msi" aria-hidden="true">link</span></button>
            <button type="button" class="align-cur" id="align-mode" aria-expanded="false" aria-controls="align-menu"><span class="msi" id="align-icon" aria-hidden="true">hub</span><span id="align-label">Anchors</span><span class="msi chev" id="align-chev" aria-hidden="true">expand_less</span></button>
            <span class="conf-warn" id="conf-warn" hidden><span class="msi" aria-hidden="true">warning</span></span>
            <span class="conf-bang" id="conf-bang" hidden>!</span>
          </div>
          <div class="align-menu" id="align-menu" hidden></div>
        </div>
        <div class="focus-chip" id="focus-chip" hidden><span class="msi" aria-hidden="true">center_focus_strong</span><span id="focus-msg"></span><button type="button" id="focus-edit"><span class="msi" aria-hidden="true">edit</span><span class="lbl" id="focus-edit-label">Edit</span></button><button type="button" id="focus-clear" title="Clear the region"><span class="msi" aria-hidden="true">close</span><span class="lbl">Clear</span></button></div>
        <div class="lab-note" id="lab-note" hidden></div>
        <button type="button" class="rail-fab" id="rail-expand" title="Open review panel"><span class="msi" aria-hidden="true">right_panel_open</span><span id="rail-fab-summary"></span></button>
      </div>
    </div>
  </section>
  <aside id="side" class="rail">
    <button type="button" class="rail-handle" id="rail-toggle" aria-expanded="false" aria-controls="rail-panels"><span class="grip" aria-hidden="true"></span><span id="rail-summary"></span><span class="msi chev" aria-hidden="true">expand_less</span></button>
    <div class="rail-head"><span class="rail-title">Review</span><button type="button" class="rail-icon" id="rail-collapse" title="Collapse panel"><span class="msi" aria-hidden="true">right_panel_close</span></button></div>
    <div class="rail-tabs" role="tablist"><button type="button" class="rtab" data-tab="findings" role="tab">Findings · <span id="tab-f-count"></span></button><button type="button" class="rtab" data-tab="items" role="tab">Comments · <span id="tab-i-count"></span></button></div>
    <div class="rail-panels" id="rail-panels">
      <div class="rail-panel" id="panel-findings">
        <div class="rail-filters">
          <div class="fsearch" id="fsearch" hidden><span class="msi" aria-hidden="true">search</span><input id="q" type="search" placeholder="Filter findings…" aria-label="filter findings" autocomplete="off"></div>
          <div class="sevchips" id="sev-chips"></div>
          <div class="instrow" id="inst-row" hidden></div>
        </div>
        <div class="rail-scroll" id="flist"></div>
      </div>
      <div class="rail-panel" id="panel-items" hidden>
        <div class="rail-scroll" id="ilist"></div>
      </div>
      <div class="rail-status" id="rail-status" hidden></div>
    </div>
  </aside>
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
/* The comps set no box-sizing reset (support.js only offers a .bbox utility), so every inline-styled
   box there is CONTENT-box: a div with height:46px and a 1px border is 47px tall. Where a rule below
   copies a fixed size the comp puts on a bordered box, it is written as the comp's number PLUS its
   border/padding so the rendered box matches (phase 5: the phone sheet sat 1px low, the rail 1px
   narrow, the canvas 2px wide, and the align menu 10px narrow before this). */
html,body { margin:0; height:100%; background:var(--bg0); color:var(--txt); font:13px/1.4 var(--font-sans); }
/* Form controls do not inherit the page font: without this every <button> and <select> measured as Arial 13.33px. */
button, input, select, textarea { font:inherit; }
/* The canvas owns zooming; the chrome must not double-tap-zoom or rubber-band
   under it (the panes keep touch-action:none for their own pan/pinch). */
html { touch-action:manipulation; -webkit-text-size-adjust:100%; overscroll-behavior:none; }
body { display:flex; flex-direction:column; }
/* ---- topbar: the comps' 46px bar — back arrow, brand, pair title; the three
   segmented groups (layout / overlay / layer) centred; the theme toggle right.
   Left and right are equal flex shares (the comp's hdrLeftStyle / hdrRightStyle,
   flex 1 1 0), so the groups centre on the SCREEN, not in what the title leaves. */
.topbar { display:flex; align-items:center; gap:8px; padding:0 10px; height:calc(46px + 1px); flex-shrink:0; border-bottom:1px solid var(--line); background:var(--bg1); }
.tb-left { display:flex; align-items:center; gap:8px; flex:1 1 0; min-width:4px; }
.tb-right { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex:1 1 0; min-width:4px; }
.tb-left .back { width:32px; height:32px; border-radius:7px; display:flex; align-items:center; justify-content:center; color:var(--txt2); text-decoration:none; flex-shrink:0; }
.tb-left .back:hover { background:var(--bg3); color:var(--txt); }
.tb-left .back .msi { font-size:19px; }
.tb-left .brand { width:18px; height:18px; border-radius:5px; background:var(--acc); flex-shrink:0; }
.tb-left .brand-name { font-size:13px; font-weight:700; letter-spacing:.02em; }
.tb-left .pair-title { font-size:12px; color:var(--txt2); white-space:nowrap; }
.seg { display:flex; background:var(--bg2); border:1px solid var(--line); border-radius:8px; padding:2px; gap:2px; flex-shrink:0; }
.seg button { padding:5px 10px; border:0; border-radius:6px; font-size:12px; font-weight:500; line-height:16px; cursor:pointer; color:var(--txt2); background:transparent; white-space:nowrap; }
.seg button.on { color:var(--txt); font-weight:600; background:var(--bg3); }
.seg.seg-sm { border-radius:7px; }
.seg.seg-sm button { padding:3px 8px; font-size:11px; line-height:14px; }
/* The phone's layer strip under the topbar ("Show · Findings Comments All Clean"). */
.layer-strip { display:none; align-items:center; justify-content:center; gap:7px; padding:4px 10px; background:var(--bg1); border-bottom:1px solid var(--line); flex-shrink:0; }
.layer-strip-label { font-size:10.5px; color:var(--txt2); flex-shrink:0; }
/* The topbar icon buttons (theme, and on the phone the tune + settings buttons): the comps' 32px /
   radius 7 square; a pressed one is filled with the accent (the comps' hdrBtn). */
.theme-toggle, .hdr-btn { flex:none; width:32px; height:32px; padding:0; border:0; border-radius:7px; display:inline-flex; align-items:center; justify-content:center;
  background:transparent; color:var(--txt2); cursor:pointer; }
.theme-toggle:hover, .hdr-btn:hover { background:var(--bg3); }
.theme-toggle .msi, .hdr-btn .msi { font-size:19px; }
.hdr-btn.on { color:#fff; background:var(--acc); }
/* The phone's settings popover (the comp's mobile header, 2026-08-29): the light/dark toggle
   becomes a settings button opening Layout (Minimal / Default) over Theme (Dark / Light). Desktop
   keeps the plain theme toggle and never shows this; the view-options button is the minimal
   layout's alone. Widths are the comp's content-box numbers plus padding and border. */
.settings-wrap, .view-toggle { display:none; position:relative; flex-shrink:0; }
.settings-menu { position:absolute; top:calc(100% + 6px); right:0; z-index:40; width:calc(198px + 22px); background:var(--bg1); border:1px solid var(--line); border-radius:11px;
  padding:10px 10px 12px; box-shadow:0 10px 30px rgba(0,0,0,.35); display:flex; flex-direction:column; gap:6px; }
.settings-menu[hidden] { display:none; }
.sm-label { font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--txt2); }
.sm-label.gap { margin-top:6px; }
.seg.seg-full { width:100%; }
.seg.seg-full button, .seg.seg-p button { flex:1; text-align:center; padding:3px 9px; font-size:11px; line-height:15px; }
.seg.seg-p button { flex:none; }
/* The minimal layout's view panel: the Compare (overlay) and Show (layer) segments folded behind
   the header's tune button, dropped over the top of the canvas. */
.view-panel { position:absolute; top:0; left:0; right:0; z-index:25; background:var(--bg1); border-bottom:1px solid var(--line); box-shadow:0 8px 24px rgba(0,0,0,.3);
  padding:10px 12px; display:flex; flex-direction:column; gap:9px; }
.view-panel[hidden] { display:none; }
.vp-row { display:flex; align-items:center; gap:8px; }
.vp-label { width:52px; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--txt2); flex-shrink:0; }
/* ---- delta strip (gap 15): under the topbar, only when the run changed something;
   red-tinted with a 3px edge when a regression is in it — the loop's stop signal. */
.delta-strip { display:flex; align-items:center; gap:12px; padding:0 12px; min-height:calc(38px + 1px); flex-shrink:0; background:var(--bg2);
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
.delta-strip .review + .dismiss { margin-left:0; }
.delta-strip .dismiss .msi { font-size:16px; }
/* ---- layout: the tool strip, the canvas, and the comps' 320px review rail on the RIGHT */
main { flex:1; display:flex; min-height:0; position:relative; }
#viewer { flex:1; display:flex; flex-direction:column; min-height:0; min-width:0; }
.work { flex:1; display:flex; min-height:0; position:relative; }
/* The comp sets no line-height on the rail (browser normal); the report's 1.4 made every chip,
   tag and prop line a pixel or two taller, compounding down the list. */
.rail { width:calc(320px + 1px); flex-shrink:0; display:flex; flex-direction:column; min-height:0; background:var(--bg1); border-left:1px solid var(--line); line-height:normal; }
/* Collapsed on desktop: the rail goes, the canvas takes the width, and the floating chip at the
   top-right of the canvas says what it is hiding. The phone has its own rules (the sheet). */
@media (min-width: 760px) {
  body:not(.rail-open) .rail { display:none; }
  body:not(.rail-open) .rail-fab { display:flex; }
}
.rail-fab { display:none; position:absolute; top:12px; right:12px; z-index:16; align-items:center; gap:7px; padding:6px 10px; border:1px solid var(--line); border-radius:9px;
  background:var(--bg1); color:var(--txt); font-size:12px; font-weight:600; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.25); }
.rail-fab .msi { font-size:17px; color:var(--txt2); }
/* The phone sheet's handle: grip, summary, chevron. Desktop never shows it. */
.rail-handle { display:none; position:relative; align-items:center; justify-content:center; gap:8px; padding:12px 12px 8px; border:0; background:transparent;
  color:var(--txt); font-size:12px; font-weight:600; cursor:pointer; flex-shrink:0; width:100%; }
.rail-handle .grip { position:absolute; top:5px; left:50%; transform:translateX(-50%); width:36px; height:4px; border-radius:2px; background:var(--bg3); }
.rail-handle .chev { font-size:18px; color:var(--txt2); }
.rail-head { display:flex; align-items:center; justify-content:space-between; padding:8px 8px 8px 12px; border-bottom:1px solid var(--line); flex-shrink:0; }
.rail-title { font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--txt2); }
.rail-icon { width:26px; height:26px; padding:0; border:0; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:transparent; }
.rail-icon:hover { background:var(--bg3); }
.rail-icon .msi { font-size:17px; }
.rail-tabs { display:flex; border-bottom:1px solid var(--line); flex-shrink:0; }
.rtab { flex:1; padding:9px 0; border:0; border-bottom:2px solid transparent; background:transparent; text-align:center; font-size:12.5px; font-weight:600; color:var(--txt2); cursor:pointer; }
.rtab.on { color:var(--txt); border-bottom-color:var(--acc); }
.rail-panels { flex:1; display:flex; flex-direction:column; min-height:0; }
.rail-panel { flex:1; display:flex; flex-direction:column; min-height:0; }
.rail-panel[hidden] { display:none; }
.rail-filters { display:flex; flex-direction:column; gap:8px; padding:10px 12px; border-bottom:1px solid var(--line); flex-shrink:0; }
/* The text filter has no place in the comp (gap 31): it opens on / and closes on Esc. */
.fsearch { display:flex; align-items:center; gap:6px; padding:0 8px; height:30px; border-radius:7px; border:1px solid var(--line); background:var(--bg0); }
.fsearch[hidden] { display:none; }
.fsearch .msi { font-size:15px; color:var(--txt2); }
.fsearch input { flex:1; min-width:0; border:0; background:transparent; color:var(--txt); font-size:12px; outline:none; appearance:none; -webkit-appearance:none; }
.sevchips { display:flex; gap:6px; flex-wrap:wrap; }
.sevchip { display:flex; align-items:center; gap:6px; padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:600; cursor:pointer; user-select:none;
  border:1px solid var(--line); color:var(--txt2); background:transparent; opacity:.6; }
.sevchip .dot { width:7px; height:7px; border-radius:50%; background:var(--bg3); }
.sevchip.on { opacity:1; }
.sevchip.critical.on { color:var(--critical); border-color:var(--critical); } .sevchip.critical.on .dot { background:var(--critical); }
.sevchip.major.on { color:var(--major); border-color:var(--major); } .sevchip.major.on .dot { background:var(--major); }
.sevchip.minor.on { color:var(--minor); border-color:var(--minor); } .sevchip.minor.on .dot { background:var(--minor); }
.sevchip.tri.ignore.on { color:var(--txt); border-color:var(--ignore); } .sevchip.tri.ignore.on .dot { background:var(--ignore); }
.sevchip.tri.snooze.on { color:var(--snooze); border-color:var(--snooze); } .sevchip.tri.snooze.on .dot { background:var(--snooze); }
.instrow { display:flex; }
.instrow[hidden] { display:none; }
.instchip { display:flex; align-items:center; gap:5px; padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;
  border:1px solid var(--line); color:var(--txt2); background:transparent; }
.instchip .msi { font-size:14px; }
.instchip.on { border-color:var(--acc); color:#fff; background:var(--acc); }
.rail-scroll { flex:1; overflow-y:auto; min-height:0; }
.rail-empty { padding:24px 16px; font-size:12.5px; color:var(--txt2); text-align:center; line-height:1.5; }
/* ---- a finding row: badge · title · ×N · Regression · triage tag; the mono prop line under it;
   the instance box, the verdict buttons and the note only while selected (the canvas is the crop) */
/* The comp's finding rows have NO left edge (rowBase); only its comment rows carry the 3px transparent
   one (.irow). A failed triage save still gets the red 3px edge, drawn inset so the row does not shift. */
.frow { padding:10px 12px; border-bottom:1px solid var(--line); cursor:pointer; background:transparent; }
.frow:hover { background:rgba(127,127,127,.06); }
.frow.sel { background:var(--bg2); }
.frow.sup { opacity:.66; background:var(--bg0); }
.frow.sup.sel { background:var(--bg2); }
.frow.unsaved { background:rgba(229,72,77,.09); box-shadow:inset 3px 0 0 var(--critical); }
.fhead { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.fbadge { width:20px; height:20px; border-radius:50%; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-sizing:border-box; }
.fbadge.critical { background:var(--critical); } .fbadge.major { background:var(--major); } .fbadge.minor { background:var(--minor); }
.fbadge.sup { background:transparent; border:1.5px dashed currentColor; }
.fbadge.sup.critical { color:var(--critical); } .fbadge.sup.major { color:var(--major); } .fbadge.sup.minor { color:var(--minor); }
.ftitle { font-size:12.5px; font-weight:600; line-height:1.3; }
.frow.triaged-ignore .ftitle, .frow.triaged-snooze .ftitle { color:var(--txt2); }
.fgroup { font-size:10.5px; font-weight:700; font-family:var(--font-mono); padding:1px 6px; border-radius:5px; background:var(--bg3); color:var(--txt); flex-shrink:0; }
.freg { display:flex; align-items:center; gap:3px; font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:2px 7px; border-radius:999px; background:var(--critical); color:#fff; flex-shrink:0; }
.freg .msi { font-size:12px; }
.fsuptag { font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; padding:1px 7px; border-radius:999px; border:1px dashed var(--line); color:var(--txt2); flex-shrink:0; }
.ftag { font-size:10.5px; font-weight:600; padding:1px 7px; border-radius:999px; color:var(--txt2); background:var(--bg3); margin-left:auto; flex-shrink:0; white-space:nowrap; }
.ftag.fix { color:#fff; background:var(--acc); }
.frule { display:flex; align-items:center; gap:5px; margin:5px 0 0 28px; font-size:11px; color:var(--txt2); min-width:0; }
.frule .msi { font-size:13px; flex-shrink:0; }
.frule span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fprop { display:flex; align-items:center; gap:6px; margin:6px 0 0 28px; font-family:var(--font-mono); font-size:11px; min-width:0; }
.fprop .p { color:var(--txt2); } .fprop .e { color:var(--txt); } .fprop .msi { font-size:12px; color:var(--txt2); } .fprop .a { color:var(--critical); }
.fprop .e, .fprop .a { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.frow.sup .fprop .a { color:var(--txt2); }
.finst { display:flex; align-items:center; gap:8px; margin:8px 0 0 28px; padding:7px 9px; border-radius:8px; background:var(--bg0); border:1px solid var(--line); }
.finst > .msi { font-size:15px; color:var(--txt2); }
.finst span { flex:1; font-size:11.5px; line-height:1.35; color:var(--txt2); }
.finst button { padding:3px 9px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid var(--line); color:var(--txt); background:transparent; white-space:nowrap; }
.factions { margin:10px 0 2px 28px; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.fact { padding:3px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid var(--line); color:var(--txt2); background:transparent; }
.fact.on.fix { border-color:var(--fix); background:var(--fix); color:#fff; }
.fact.on.ignore { border-color:var(--ignore); background:var(--ignore); color:#fff; }
.fact.on.snooze { border-color:var(--snooze); background:var(--snooze); color:#fff; }
.factions .until { font-size:11px; color:var(--txt2); }
.fnote, .inote { display:block; margin:8px 0 2px 28px; width:calc(100% - 28px); box-sizing:border-box; background:var(--bg2); border:1px solid var(--line); border-radius:7px; padding:7px 10px; font-size:12px; color:var(--txt); }
.fhint { margin:8px 0 2px 28px; font-size:11px; line-height:1.45; color:var(--txt2); }
.fhint code { background:var(--bg0); border:1px solid var(--line); border-radius:4px; padding:0 4px; }
/* The suppressed disclosure (gap 10): a row at the end of the list, the rows under it on demand.
   Which rule hit and its reason come from findings.json; changing one means editing the manifest. */
.sup-toggle { display:flex; align-items:center; gap:8px; padding:9px 12px; width:100%; border:0; border-bottom:1px solid var(--line); text-align:left; background:var(--bg0); cursor:pointer; flex-shrink:0; }
.sup-toggle > .msi { font-size:16px; color:var(--txt2); }
.sup-toggle .lbl { flex:1; font-size:11.5px; color:var(--txt2); }
.sup-toggle .act { font-size:11.5px; font-weight:600; color:var(--acc); }
/* ---- a comment row: badge · status; the text; the model's reply; the failed-save block;
   and while selected the next instruction + Send / Mark done (+ our Reopen / implement / Delete) */
.irow { padding:10px 12px; border-bottom:1px solid var(--line); border-left:3px solid transparent; cursor:pointer; }
.irow:hover { background:rgba(127,127,127,.06); }
.irow.sel { background:var(--bg2); }
.irow.unsaved { background:rgba(229,72,77,.09); border-left-color:var(--critical); }
.ihead { display:flex; align-items:center; gap:8px; }
.ibadge { width:20px; height:20px; border-radius:6px; color:#fff; font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.ibadge.open { background:var(--open); } .ibadge.implemented { background:var(--implemented); } .ibadge.done { background:var(--done); }
.istatus { font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; margin-left:auto; flex-shrink:0; }
.istatus.open { color:var(--open); } .istatus.implemented { color:var(--implemented); } .istatus.done { color:var(--done); }
.itext { font-size:12.5px; line-height:1.45; margin:6px 0 0 28px; white-space:pre-wrap; }
.irow.done .itext { color:var(--txt2); }
.ireply { margin:8px 0 0 28px; padding:8px 10px; border-left:2px solid var(--acc); background:var(--bg2); border-radius:0 7px 7px 0; font-size:12px; color:var(--txt2); line-height:1.45; white-space:pre-wrap; }
.imeta { margin:6px 0 0 28px; font-size:11px; color:var(--txt2); line-height:1.4; }
.iactions { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 2px 28px; }
.iactions button { padding:4px 12px; border-radius:7px; font-size:11.5px; font-weight:600; cursor:pointer; border:1px solid var(--line); color:var(--txt2); background:transparent; }
.iactions .primary { border-color:var(--acc); background:var(--acc); color:#fff; }
.iactions .danger { color:var(--critical); }
/* A failed save (section C): cloud_off + Not saved + the real endpoint and status + Retry, on the
   row it concerns; the row tints red; the canvas badge gets a halo; the sheet summary says "unsaved". */
.saveerr { display:flex; align-items:center; gap:7px; margin:8px 0 0 28px; }
.saveerr > .msi { font-size:15px; color:var(--critical); flex-shrink:0; }
.saveerr .txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.saveerr .t { font-size:11.5px; font-weight:700; color:var(--critical); }
.saveerr .d { font-size:10.5px; font-family:var(--font-mono); color:var(--txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.saveerr button { padding:3px 10px; border:0; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; background:var(--critical); color:#fff; flex-shrink:0; }
.vmark.ann.unsaved { box-shadow:0 0 0 3px rgba(229,72,77,.6), 0 1px 4px rgba(0,0,0,.4); }
/* The draft composer at the top of Comments, while a shape waits for its instruction. */
.draft { padding:12px; border-bottom:1px solid var(--line); background:var(--bg2); }
.draft .kind { font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--open); margin-bottom:8px; }
.dnote { display:block; width:100%; box-sizing:border-box; background:var(--bg0); border:1px solid var(--line); border-radius:7px; padding:8px 10px; font-size:12.5px; color:var(--txt); }
.draft .imeta { margin:6px 0 0; }
.dactions { display:flex; gap:8px; margin-top:8px; justify-content:flex-end; }
.dactions button { padding:5px 12px; border:0; border-radius:7px; font-size:12px; font-weight:600; cursor:pointer; color:var(--txt2); background:transparent; }
.dactions .primary { padding:5px 14px; background:var(--acc); color:#fff; }
/* One line at the foot of the rail, only when there is something to say: a save that failed
   (with its endpoint), or a page that is not served and keeps its changes in this browser. */
.rail-status { padding:6px 12px; border-top:1px solid var(--line); font-size:11px; line-height:1.4; color:var(--txt2); flex-shrink:0; }
.rail-status[hidden] { display:none; }
.rail-status.err { color:var(--critical); }
/* ---- the viewer: the tool strip beside the canvas */
.tools { width:calc(44px + 1px); flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:2px; padding:8px 0; background:var(--bg1); border-right:1px solid var(--line); }
.tool { width:32px; height:32px; padding:0; border:0; border-radius:7px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--txt2); background:transparent; flex-shrink:0; }
.tool .msi { font-size:18px; }
.tool:hover { background:var(--bg3); }
.tool.on { color:#fff; background:var(--acc); }
/* The minimal layout's strip carries the fit button after a divider; the other layouts keep the zoom pill. */
.tool-sep, .tool.fit-m { display:none; }
/* touch-action on the WHOLE canvas area, not just the panes: the floating pills sit over it as
   siblings, and a pinch finger landing on one must not hand the gesture to the browser. */
.panes { flex:1; display:flex; min-height:0; min-width:0; position:relative; background:var(--canvas); touch-action:none; }
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
.side-fab button { padding:7px 14px; border:0; border-radius:999px; font-size:12px; font-weight:600; line-height:normal; cursor:pointer; color:var(--txt2); background:transparent; white-space:nowrap; }
.side-fab button.on { color:#fff; background:var(--acc); }
/* The minimal layout's bottom row, right-hand side: the Design / Impl SWAP (one value + swap_horiz,
   where the default layout shows both as a pill) and the rail button with its count badge. Both
   float at the comp's 36px content height plus the 1px border. */
.pane-swap, .rail-btn { display:none; position:absolute; bottom:8px; z-index:15; align-items:center; justify-content:center; height:calc(36px + 2px); padding:0; border:1px solid var(--line); border-radius:10px;
  background:var(--bg1); color:var(--txt2); cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.3); flex-shrink:0; }
.pane-swap { right:calc(8px + 38px + 6px); gap:6px; padding:0 10px; }
.pane-swap > .msi { font-size:16px; color:var(--txt2); }
.pane-swap span:last-child { font-size:12px; font-weight:600; color:var(--txt); }
.rail-btn { right:8px; width:calc(36px + 2px); }
.rail-btn:hover { color:var(--txt); }
.rail-btn > .msi { font-size:18px; }
.rail-count { position:absolute; top:-5px; right:-5px; min-width:16px; height:16px; padding:0 4px; border-radius:999px; background:var(--acc); color:#fff; font-size:9.5px; font-weight:700;
  display:flex; align-items:center; justify-content:center; box-sizing:border-box; line-height:1; }
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
/* The minimal layout's icon-only align button has no lock ON it, so its menu carries the lockstep
   row (the Mobile Minimal comp's lockRow): icon, label + description, a 30×18 toggle knob — and the
   button itself goes accent while the lock is on, so the state is readable without opening the
   menu. The lock stays in every view: with one pane and an overlay on (wipe / onion / blink) the
   registration still decides what the ghost lands on, so it is exactly then that unlocking or
   changing the anchor mode helps (Mato, 2026-08-29). */
.align-lockrow { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:8px; cursor:pointer; margin:0 0 2px; border-bottom:1px solid var(--line); }
.align-lockrow > .msi { font-size:17px; color:var(--txt2); flex-shrink:0; margin-top:1px; }
.align-lockrow .knob { width:30px; height:18px; border-radius:999px; background:var(--bg3); position:relative; flex-shrink:0; transition:background .15s; }
.align-lockrow .knob .dot { position:absolute; top:2px; left:2px; width:14px; height:14px; border-radius:50%; background:#fff; transition:left .15s; }
.align-lockrow.on .knob { background:var(--acc); }
.align-lockrow.on .knob .dot { left:14px; }
/* The minimal layout's confidence warning: a "!" badge on the icon-only align button. */
.conf-bang { display:none; position:absolute; top:-4px; right:-4px; width:calc(14px + 3px); height:calc(14px + 3px); border-radius:999px; background:var(--major); color:#1c1c1e;
  font-size:9.5px; font-weight:800; align-items:center; justify-content:center; line-height:1; border:1.5px solid var(--bg1); }
.align-menu { position:absolute; bottom:calc(100% + 8px); right:0; width:calc(264px + 10px); background:var(--bg1); border:1px solid var(--line); border-radius:11px; padding:4px; box-shadow:0 10px 30px rgba(0,0,0,.35); z-index:17; }
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
.focus-chip button { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border:0; border-radius:999px; background:var(--bg3); color:var(--txt); cursor:pointer; font-weight:600; font-size:11.5px; }
.focus-chip button .msi { font-size:14px; }
/* Adjusting is the loud state: Done is the way out of it, Edit the quiet way back in. */
.focus-chip button#focus-edit.on { background:var(--acc); color:#fff; }
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
/* annotations */
.pane.annotating .marks rect, .pane.annotating .vmarks .vmark, .pane.annotating .marks .ann { pointer-events:none; }
.marks.anns { pointer-events:none; }
.marks.anns .ann { pointer-events:all; cursor:pointer; }
.marks.anns circle.ann { stroke-width:2; vector-effect:non-scaling-stroke; fill-opacity:.35; }
.marks.anns rect.ann { fill-opacity:.12; stroke-width:2; vector-effect:non-scaling-stroke; }
.marks.anns .open { stroke:var(--open); fill:var(--open); } .marks.anns .implemented { stroke:var(--implemented); fill:var(--implemented); } .marks.anns .done { stroke:var(--done); fill:var(--done); }
.marks.anns .stale { stroke-dasharray:4 3; }
/* The other pane's copy of a note: same place through the alignment, drawn lighter. */
.marks.anns .mirror { fill-opacity:.06; stroke-opacity:.7; }
.marks.anns .sel { stroke-width:4; }
.marks.anns rect.band { fill:rgba(143,126,231,.15); stroke:var(--open); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:4 3; }
/* Inverted: nothing is drawn INSIDE the region (that is what you asked to look at) — the surround
   is dimmed instead, and the outline is the crop's edge. */
.marks.anns rect.focus-rect { fill:none; stroke:var(--acc); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:6 4; }
.marks.anns rect.focus-rect.editing { stroke-dasharray:none; stroke-width:2; }
.marks.anns rect.focus-scrim { fill:rgba(11,12,15,.55); stroke:none; pointer-events:none; }
/* Handles are interactive; the region's BODY is not, so a drag inside it still pans. */
.marks.anns circle.focus-handle { fill:var(--acc); stroke:var(--bg0); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:all; cursor:nwse-resize; }
.marks.anns circle.focus-handle.move { cursor:move; fill:var(--bg0); stroke:var(--acc); stroke-width:2; }
.marks.anns circle.focus-handle.ne, .marks.anns circle.focus-handle.sw { cursor:nesw-resize; }
/* Adjusting a region draws what it excludes, muted — enough to see, never enough to read as
   in scope. Applies to the finding badges, the comment pins and their boxes alike. */
.vmarks .vmark.outside { opacity:.3; }
.marks .outside { opacity:.3; }
/* The layer segment: Comments off hides the comment shapes and badges, never the focus region. */
body.layer-no-anns .marks.anns .ann, body.layer-no-anns .vmarks .vmark.ann, body.layer-no-anns .marks.anns rect.band { display:none; }
/* Between the phone and the comps' 1120px "narrow" width the pair title goes; the layer labels shorten (JS). */
@media (max-width: 1119px) { .tb-left .pair-title { display:none; } }
/* phone (the comps' < 760px): the page scrolls, the viewer sticks, one side at a time, the tools float */
@media (max-width: 759px) {
  .tb-left .brand-name, #seg-layout, #seg-layer { display:none; }
  /* The comp's mobile header: left and right hug their content (flex 0 0 auto), the overlay
     segment centres in what is left (margin auto); the theme toggle gives way to the settings button. */
  .tb-left, .tb-right { flex:0 0 auto; }
  #seg-variant { margin:0 auto; }
  .topbar .theme-toggle { display:none; }
  .settings-wrap { display:block; }
  /* The comp's × keeps its auto margin on the phone (only Review loses it), so it ends the row it wraps to. */
  .delta-strip .review + .dismiss { margin-left:auto; }
  .layer-strip { display:flex; }
  .delta-strip { flex-wrap:wrap; gap:8px; padding:7px 10px; min-height:0; }
  .delta-strip .regsub { display:none; }
  .delta-strip .review { margin-left:0; }
  .tools { position:absolute; left:8px; bottom:56px; z-index:15; width:auto; flex-direction:row; padding:4px; border:1px solid var(--line); border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.3); }
  .zoom-pill { left:12px; top:12px; bottom:auto; }
  .side-fab { bottom:56px; }
  .side-fab button { padding:10px 16px; font-size:13px; }
  .op-pill, body.single .op-pill { bottom:107px; gap:8px; padding:5px 10px 5px 8px; }
  .op-pill input { width:92px; }
  .align-wrap, body.single .align-wrap { top:10px; right:8px; bottom:auto; }
  .align-menu { bottom:auto; top:calc(100% + 8px); width:calc(248px + 10px); }
  .pane-label { display:none; }
  .pane + .pane { border-left:0; }
  /* The highlight count sits between the zoom and align pills on a phone and is covered by
     them — dropped; the stretch WARNING (a wrong superimposition) stays. */
  .lab-note:not(.warn) { display:none; }
  /* The rail is the comps' bottom sheet: 44px of grip + summary over the canvas, 52% of the
     height when open with the tabs and lists inside it. The canvas keeps the whole screen;
     Fit centres in the part above the sheet (paneInsets). */
  .rail { position:absolute; left:0; right:0; bottom:0; width:auto; height:calc(44px + 1px); border-left:0; border-top:1px solid var(--line);
    border-radius:12px 12px 0 0; box-shadow:0 -6px 24px rgba(0,0,0,.25); overflow:hidden; z-index:20; transition:height .25s ease; }
  body.rail-open .rail { height:52%; }
  .rail-handle { display:flex; }
  .rail-head { display:none; }
  body:not(.rail-open) .rail-tabs, body:not(.rail-open) .rail-panels { display:none; }
  /* iOS Safari zooms the page when a focused field is under 16px. */
  .fnote, .inote, .dnote, .fsearch input { font-size:16px; }
  /* ---- the MINIMAL phone layout (the RefDiff Mobile Minimal comp, 2026-08-29; chosen in the
     settings popover, body.layout-minimal): the canvas gets the room. A 44px header — back,
     16px brand, the pair title, the tune button (the Compare / Show segments fold into a panel
     over the canvas) and settings; no layer strip, no zoom pill; the delta strip stays (the comp omits
     it — Mato, 2026-08-29: it renders as in the default layout). The bottom row is
     the tool strip (28px tools + a divider + Fit) left, the Design / Impl swap and the rail button
     right; the align control is icon-only with a "!" badge for the confidence warning (its lockstep
     row moves into the menu); the rail
     is a 58% sheet that is not on screen at all while closed. */
  body.layout-minimal .topbar { height:calc(44px + 1px); padding:0 8px; gap:7px; }
  body.layout-minimal .tb-left { flex:1 1 0; min-width:4px; gap:7px; }
  body.layout-minimal .tb-right { gap:7px; }
  body.layout-minimal .tb-left .brand { width:16px; height:16px; }
  body.layout-minimal .tb-left .pair-title { display:inline; overflow:hidden; text-overflow:ellipsis; }
  body.layout-minimal .view-toggle { display:inline-flex; }
  body.layout-minimal #seg-variant, body.layout-minimal .layer-strip, body.layout-minimal .zoom-pill, body.layout-minimal .side-fab { display:none; }
  /* The bottom row is 38px tall (the comp's 36 + border); the 36px strip centres in it, so it sits 1px up. */
  body.layout-minimal .tools { left:8px; bottom:9px; padding:3px; gap:1px; }
  body.layout-minimal .tool { width:28px; height:28px; }
  body.layout-minimal .tool .msi { font-size:16px; }
  body.layout-minimal .tool-sep { display:block; width:1px; height:18px; background:var(--line); margin:0 2px; flex-shrink:0; }
  body.layout-minimal .tool.fit-m { display:flex; }
  body.layout-minimal .pane-swap, body.layout-minimal .rail-btn { display:flex; }
  body.layout-minimal .op-pill { bottom:54px; }
  body.layout-minimal .align-wrap { top:8px; right:8px; }
  body.layout-minimal .align-pill { position:relative; width:calc(34px + 2px); height:calc(34px + 2px); padding:0; border-radius:9px; justify-content:center; box-shadow:0 4px 16px rgba(0,0,0,.25); }
  /* One button here, so the BUTTON carries the lockstep: accent while the panes are linked, the
     plain surface when they are not (2026-08-29). The state was invisible in this layout — the
     lock lives in the menu — on the one layout where an overlay makes the registration the live
     question. Declared before .is-warn so a low-confidence border still wins. */
  body.layout-minimal .align-pill.locked { background:var(--acc); border-color:var(--acc); }
  body.layout-minimal .align-pill.locked .align-cur #align-icon { color:#fff; }
  body.layout-minimal .align-pill.is-warn { border-color:var(--major); box-shadow:0 4px 16px rgba(0,0,0,.25); }
  body.layout-minimal .align-pill .lock, body.layout-minimal .align-cur #align-label, body.layout-minimal .align-cur .chev, body.layout-minimal .conf-warn { display:none; }
  body.layout-minimal .align-cur { padding:0; }
  body.layout-minimal .align-cur #align-icon { font-size:18px; }
  body.layout-minimal .align-pill.is-warn .conf-bang { display:flex; }
  body.layout-minimal .align-menu { width:calc(250px + 10px); }
  /* The chip shares this row with the align pill on EVERY phone layout, not just the minimal one:
     centred, its two buttons ran under the pill and could not be tapped. Left-aligned, short
     wording (JS) and icon-only buttons keep the whole chip reachable. */
  .focus-chip { left:8px; transform:none; gap:8px; padding:4px 6px 4px 12px; font-size:11.5px; max-width:calc(100% - 150px); }
  .focus-chip > .msi { font-size:14px; }
  .focus-chip button { padding:4px 8px; font-size:11px; }
  .focus-chip button .lbl { display:none; }
  body.layout-minimal .rail { display:none; height:58%; transition:none; }
  body.layout-minimal.rail-open .rail { display:flex; }
}
`

// The client. Plain JS, kept free of template literals so it can live inside
// this TypeScript template string — no backtick ANYWHERE in it, comments and
// the CSS block above included: one in a comment closes the template and
// surfaces as unrelated TS errors hundreds of lines away. It shares the module scope with the
// embedded view-math.js (fitView, zoomAt, designImageTransform, …).
//
// It is delivered two ways and knows about neither: an emitted report.html
// embeds the data and calls openReport() once, the served app fetches a pair
// and calls openReport() again on every route change. Hence `let`, and hence
// `page.base` in front of every artifact URL — under the app shell the run
// dir is one path segment down.
export const CLIENT = String.raw`
let report = null;
let page = { indexHref: null, base: '', annotationsUrl: 'api/annotations', readOnly: false };
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
      align: state.align, lock: state.lock, layer: state.layer, showMembers: state.showMembers, showSup: state.showSup,
      single: state.single, side: state.side, move: state.move, showTriaged: state.showTriaged,
      rail: document.body.classList.contains('rail-open'),
      diff: state.diff, dim: state.dim, strobe: state.strobe, lab: state.lab, labAmount: state.labAmount,
      theme: currentTheme(), layout: state.mlayout,
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
  // The rail: which tab, and whether the suppressed rows are unfolded (persisted).
  tab: 'findings', showSup: false,
  selected: null, sev: { critical: true, major: true, minor: true }, q: '',
  dprD: 1, dprI: 1, userMoved: false, side: 'design', move: true, single: false,
  // A region of the canvas to work inside (world px). While set, findings whose boxes fall outside
  // it are hidden from the list AND the marks — the way to read one column of a screen without the
  // chrome's findings burying it.
  focus: null, focusLabel: '', focusing: false, focusEdit: false,
  showTriaged: { ignore: false, snooze: false },
  // The diff lab: Highlight boxes every listed difference (diff), Dim masks
  // everything else (dim), Strobe pulses the boxes, and one superimposition
  // mode over the impl pane (lab: blink | onion | swipe | difference).
  // labAmount is the opacity of the two blends that have one; wipeX is the
  // wipe's curtain in world px (per pair — it starts at the frame's middle).
  diff: false, dim: false, strobe: false, lab: 'none', labAmount: { onion: 55, difference: 100 }, wipeX: 0, diffIndex: -1,
  // The delta strip (gap 15): its Review button narrows the list to the regressions.
  regOnly: false, deltaDismissed: false, alignOpen: false,
  // The phone's layout — 'default' (the toolbars over and under the canvas) or 'minimal' (folded
  // behind the header's tune button, the canvas gets the room) — chosen in the settings popover,
  // persisted like the theme, preset by ?layout= on the URL. Desktop ignores it.
  mlayout: 'default', settingsOpen: false, viewOpen: false,
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
  for (const b of document.querySelectorAll('[data-theme]')) b.classList.toggle('on', b.dataset.theme === (light ? 'light' : 'dark'));
}
// One key of the controls record, written alone (the theme, the phone layout).
function savePref(key, value) {
  try {
    const saved = readControls();
    saved[key] = value;
    localStorage.setItem(CONTROLS_KEY, JSON.stringify(saved));
  } catch (e) { /* private mode */ }
}
function saveTheme() { savePref('theme', currentTheme()); }
function toggleTheme() { applyTheme(currentTheme() === 'light' ? 'dark' : 'light'); saveTheme(); }
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('.theme-toggle');
  if (t) toggleTheme();
});
applyTheme(readControls().theme);
// ---- the phone's layout ----------------------------------------------------
// ?layout=minimal|default on the page URL presets it for this load without touching the saved
// preference — a link that opens in one layout, and how the harness captures the minimal comp.
function urlLayout() {
  try { const v = new URLSearchParams(location.search).get('layout'); return v === 'minimal' || v === 'default' ? v : null; } catch (e) { return null; }
}
function minimalOn() { return narrow.matches && state.mlayout === 'minimal'; }
function setPhoneLayout(layout) {
  state.mlayout = layout === 'minimal' ? 'minimal' : 'default';
  savePref('layout', state.mlayout);
  setSettingsOpen(false);
  applyLayout(); applyAlignMode(); renderRailSummary(); renderFocusChip();
  if (state.userMoved) applyView(); else fit();
}
function setSettingsOpen(open) {
  state.settingsOpen = open;
  $('settings-toggle').classList.toggle('on', open);
  $('settings-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('settings-menu').hidden = !open;
  for (const b of document.querySelectorAll('[data-mlayout]')) b.classList.toggle('on', b.dataset.mlayout === state.mlayout);
  if (open) setViewOpen(false);
}
// The minimal layout's view panel (Compare / Show) behind the header's tune button.
function setViewOpen(open) {
  state.viewOpen = open;
  $('view-toggle').classList.toggle('on', open);
  $('view-toggle').setAttribute('aria-pressed', open ? 'true' : 'false');
  $('view-panel').hidden = !open;
  if (open) { setSettingsOpen(false); toggleAlignMenu(false); }
}
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
  storage: location.protocol.startsWith('http') ? 'api' : 'local', saveTimer: null,
  // ids changed since the last save that succeeded, and why the last one did not (section C);
  // the text typed into the composer / a row's next-instruction field, so a re-render keeps it.
  unsaved: new Set(), saveError: null, noteDrafts: {}, draftText: '',
};
let byId = new Map();

// ---- triage --------------------------------------------------------------
// A verdict on a FINDING (fix / ignore / snooze + note), filed against Finding.key — the
// run-stable identity — so it survives the renumbering every capture does to ids and marks. Reports
// written before that field existed carry no key; those findings cannot be triaged (the panel says
// so) rather than being filed against an id that will mean something else tomorrow.
const TRIAGE_LABELS = { fix: 'to fix', ignore: 'ignored', snooze: 'snoozed' };
const triage = { set: { version: 1, pair: '', entries: [] }, saveTimer: null, unsaved: new Set(), saveError: null, noteDrafts: {} };
const nowIso = () => new Date().toISOString();
function triageStateOf(f) { return effectiveState(findTriage(triage.set, f.key), nowIso()); }
// A verdict that did not reach triage.json gets the same surfaces as a comment that did not reach
// annotations.json (section C left it to this phase): the row tints, names the endpoint, offers Retry.
function persistTriage() {
  clearTimeout(triage.saveTimer);
  triage.saveTimer = setTimeout(async () => {
    const body = JSON.stringify(triage.set);
    if (page.triageUrl) {
      try {
        const res = await fetch(page.triageUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
        triage.saveError = null; triage.unsaved.clear();
      } catch (e) { triage.saveError = saveErrorText(!!page.readOnly, page.triageUrl, e.message); }
    } else {
      try { localStorage.setItem('vc-triage:' + report.pair, body); triage.saveError = null; triage.unsaved.clear(); }
      catch (e) { triage.saveError = 'localStorage · ' + e.message; }
    }
    renderRail();
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
  delete triage.noteDrafts[f.key];
  triage.unsaved.add(f.key);
  persistTriage();
  renderRail(); renderMarks();
}

// ---- focus region --------------------------------------------------------
// Drag a box; the list and the marks narrow to the findings inside it. Not a filter over a property
// of a finding but over WHERE it is, which is how a person actually reads a busy screen: "the
// content column — never mind the sidebar and the header".
let focusBand = null;
let focusDrag = null;   // { handle, pointerId } while a handle is being dragged
function setFocusing(on) {
  state.focusing = on;
  if (on) state.focusEdit = false;
  $('focus-toggle').setAttribute('aria-pressed', on ? 'true' : 'false');
  for (const pane of Object.values(panes)) pane.classList.toggle('focusing', on);
  if (on) setAnnMode(null);
  applyTools();
}
function setFocus(rect, persist) {
  state.focus = rect;
  if (!rect) state.focusEdit = false;
  // renderAnnMarks too (it ends in renderFocusBand): the comment pins are scoped by the region as
  // the finding marks are, so a region drawn AFTER load left the out-of-region pins on the canvas.
  renderFocusChip(); renderRail(); renderMarks(); renderAnnMarks();
  if (persist !== false) persistFocus();
}
// Adjusting is a STATE of the region, not a tool: settled, the region is a dashed outline and a
// dimmed surround with nothing over the content; adjusting, it grows the five handles. Drawing a
// region leaves you in it (nobody lands a rectangle first try with a thumb), the chip's Done
// leaves it — the handles and the tint used to be permanent and sat on exactly the pixels the
// region was drawn around.
function setFocusEdit(on) {
  state.focusEdit = on && !!state.focus;
  if (state.focusEdit) { setFocusing(false); setAnnMode(null); }
  // The marks are redrawn because entering and leaving the mode changes WHAT is drawn, not just
  // the handles: adjusting reveals the excluded findings and comments, muted (renderAnnMarks ends
  // in renderFocusBand, so the region comes with them).
  renderFocusChip(); renderMarks(); renderAnnMarks();
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
      focusSaveError = null;
    } catch (e) { focusSaveError = saveErrorText(!!page.readOnly, page.focusUrl, e.message); }
    renderRailStatus();
  }, 250);
}
let focusSaveTimer = null;
// A region that did not reach focus.json: the rail's status line says so (the region has no row).
let focusSaveError = null;
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
  const kept = report.findings.filter(visible).length;
  // The phone's chip shares its row with the align pill: two buttons only fit next to the short
  // form (the words are dropped by CSS, the count never is — it is the whole point of the chip).
  $('focus-msg').textContent = narrow.matches
    ? 'Focus · ' + kept + ' of ' + report.findings.length
    : 'Region focus · ' + kept + ' of ' + report.findings.length + ' findings';
  // Edit (pencil) → Done (tick). The tick only earns its place because adjusting is something you
  // CHOSE: it finishes the adjustment you started. While a drawn region still landed in adjusting,
  // the same tick read as "I am done with the focused work", which is not what it does.
  const edit = $('focus-edit');
  edit.classList.toggle('on', state.focusEdit);
  edit.setAttribute('aria-pressed', state.focusEdit ? 'true' : 'false');
  edit.title = state.focusEdit ? 'Done adjusting — put the handles away' : 'Adjust the region';
  edit.setAttribute('aria-label', edit.title);
  edit.querySelector('.msi').textContent = state.focusEdit ? 'check' : 'edit';
  $('focus-edit-label').textContent = state.focusEdit ? 'Done' : 'Edit';
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
  // A drawn region is FINISHED — the chrome settles the moment the finger lifts and the region
  // shows what it scopes. Adjusting is opt-in (the chip's Edit), for the drag that missed.
  setFocus(rect.w * state.view.z >= 12 && rect.h * state.view.z >= 12 ? rect : null);
}
// ---- editing a drawn region ---------------------------------------------
// Drawing a rectangle precisely with a thumb is not realistic, so the region is adjustable
// afterwards: four corner handles resize, the grip above the top edge moves it. They exist only
// while ADJUSTING (the chip's Edit/Done), and every one of them is drawn and hit-tested outside
// the rectangle — chrome that covers the region defeats the region. The BODY stays inert either
// way, so a drag inside it still pans the canvas.
const FOCUS_HANDLE_PX = 13;
// The dots sit this far OUTSIDE their corner (screen px), so nothing inside the region is covered.
const FOCUS_HANDLE_OUT = 9;
function focusHandleOffset() { return FOCUS_HANDLE_OUT / state.view.z; }
function focusHandleAt(pane, e) {
  if (!state.focus || !state.focusEdit || state.focusing) return null;
  return handleAt(state.focus, paneWorld(pane, e), FOCUS_HANDLE_PX / state.view.z, focusHandleOffset());
}
// The grab point is remembered as a DELTA from the corner: a handle drawn outside its corner (or
// grabbed near its edge) would otherwise snap the corner onto the finger the moment you touch it.
function focusEditDown(pane, e, handle) {
  const w = paneWorld(pane, e);
  const c = cornerOf(handle);
  focusDrag = { handle: handle, pointerId: e.pointerId, grab: { x: c.x - w.x, y: c.y - w.y } };
  pane.setPointerCapture(e.pointerId);
  ann.suppressClick = true;
}
// Where the handle's corner (or the centre, for the grip) actually IS — the offset the dot is drawn
// with is cosmetic and must not travel into the geometry.
function cornerOf(handle) {
  return handlePoints(state.focus, 0).find((h) => h.handle === handle);
}
function focusEditMove(pane, e) {
  const w = paneWorld(pane, e);
  const at = { x: w.x + focusDrag.grab.x, y: w.y + focusDrag.grab.y };
  state.focus = resizeRect(state.focus, focusDrag.handle, at, FOCUS_HANDLE_PX / state.view.z);
  renderFocusChip(); renderRail(); renderMarks(); renderAnnMarks();
}
function focusEditUp() { focusDrag = null; persistFocus(); }
// World-space, so it lives in the same layers as the marks and appears on both sides at once.
// The region is drawn INVERTED: the surround is dimmed and the region itself is left alone. A tint
// over the region darkened the one thing you asked to look at, and the crop it now reads as is the
// same gesture every photo app uses.
const FOCUS_SCRIM_REACH = 4000;
function focusScrimParts(r) {
  const far = FOCUS_SCRIM_REACH;
  const [l, t, w, h] = [r.x, r.y, Math.max(r.w, 0), Math.max(r.h, 0)];
  return [
    { x: l - far, y: t - far, w: w + 2 * far, h: far },       // above
    { x: l - far, y: t + h, w: w + 2 * far, h: far },         // below
    { x: l - far, y: t, w: far, h: h },                       // left
    { x: l + w, y: t, w: far, h: h },                         // right
  ];
}
function renderFocusBand() {
  for (const side of ['design', 'impl']) {
    const layer = annLayers[side];
    for (const old of layer.querySelectorAll('.focus-rect, .focus-handle, .focus-scrim')) old.remove();
    const live = focusBand ? rectFromCorners(focusBand.start, focusBand.end) : state.focus;
    if (!live) continue;
    // First, so the comments, the marks and the handles all paint over it.
    for (const part of focusScrimParts(live)) layer.prepend(rect(part, 'focus-scrim', ''));
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', live.x); r.setAttribute('y', live.y);
    r.setAttribute('width', Math.max(live.w, 0.5)); r.setAttribute('height', Math.max(live.h, 0.5));
    r.setAttribute('class', 'focus-rect' + (state.focusEdit ? ' editing' : ''));
    layer.append(r);
    // Handles while ADJUSTING only: settled, the region is an outline and nothing sits on the
    // content. Never during the draw itself — the band has no corners to grab yet.
    if (focusBand || !state.focusEdit) continue;
    for (const h of handlePoints(live, focusHandleOffset())) {
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
//
// UNLESS the lockstep is off. The lock used to move the design PANE only, so wipe / onion / blink /
// difference kept registering the overlay onto the impl however the panes had been moved — you
// unlinked them and the overlay carried on aligning itself. Unlocked, the overlay is literally what
// the design pane is showing, at the design pane's own view, stacked over the impl at its own: move
// or zoom either side and the modes lay them over each other as they now sit.
function ghostRegistered() { return state.lock && state.align === 'anchors'; }
function ghostAlignment() { return ghostRegistered() ? report.alignment : projection(); }
function ghostView() { return state.lock ? state.view : viewOf('design'); }
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
// The pane's edges under the panels drawn over it: on the phone the rail is a
// bottom sheet on the canvas, so Fit centres the frame in what the sheet leaves.
// The desktop rail and tool strip are siblings (no overlap) and the floating
// pills cover a corner only — paneInsets counts neither.
function paneInsetsNow() {
  const box = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const pane = box(visiblePane().getBoundingClientRect());
  // The view panel counts too now that it stays open across canvas gestures: it is anchored across
  // the top of the pane, so a fit that ignored it would centre the frame half under it. Hidden it
  // measures 0x0 and paneInsets skips it.
  return paneInsets(pane, [$('side'), $('tools'), $('view-panel')].map((el) => box(el.getBoundingClientRect())));
}
function applyLayout() {
  document.body.classList.toggle('single', single());
  document.body.classList.toggle('layout-minimal', minimalOn());
  // The popover and the panel are phone chrome; leaving the breakpoint closes them.
  if (!narrow.matches && state.settingsOpen) setSettingsOpen(false);
  if (!minimalOn() && state.viewOpen) setViewOpen(false);
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
  // The minimal layout's swap shows the CURRENT side only (the comp's paneLabel).
  $('pane-swap-label').textContent = state.side === 'design' ? 'Design' : 'Impl';
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
  renderFocusChip();   // the chip's wording is per layout
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
  state.showSup = saved.showSup === true;
  state.mlayout = urlLayout() || (saved.layout === 'minimal' ? 'minimal' : 'default');
  applyAlignMode(); applyLock(); applyLayer();
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
  // The minimal layout's align button has no lock on it, so the row lives in the menu (the comp's lockRow).
  const lockRow = minimalOn()
    ? '<div class="align-lockrow' + (state.lock ? ' on' : '') + '" data-lockrow><span class="msi" aria-hidden="true">' + (state.lock ? 'link' : 'link_off') + '</span>' +
      '<div class="txt"><span class="name">' + (state.lock ? 'Lockstep on' : 'Lockstep off') + '</span><span class="desc">' + (state.lock ? 'Panes move together — tap to unlink.' : 'Panes move independently — tap to link.') + '</span></div>' +
      '<span class="knob" aria-hidden="true"><span class="dot"></span></span></div>'
    : '';
  $('align-menu').innerHTML = '<h3>Align lock mode</h3>' + lockRow + ALIGN_MODES.map((m) => {
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
  // The minimal layout shows one button and hides this one, so the PILL carries the state there.
  $('align-pill').classList.toggle('locked', state.lock);
}
function setLock(on) {
  state.lock = on;
  if (on) state.viewD = state.view;
  // The note too: the overlay stops being registered when the lock goes, and a stretch note left
  // standing would describe a distortion that is no longer on screen.
  applyLock(); applyAlignMode(); saveControls(); applyView(); renderLabNote();
}
// Which view a pane is drawn with, and how a pane's gesture writes back.
function viewOf(side) { return side === 'design' && !state.lock ? state.viewD : state.view; }
function setViewOf(side, v) { if (side === 'design' && !state.lock) state.viewD = v; else state.view = v; }
function setView(v) { state.view = v; state.viewD = v; }

function applyView() {
  const v = state.view, vd = viewOf('design');
  imgs.design.style.transform = designImageTransform(vd, projection(), state.dprD);
  imgs.impl.style.transform = implImageTransform(v, state.dprI);
  // The ghost is the design drawn with the FULL alignment — per-axis stretch
  // included. The design PANE refuses that distortion on purpose (you cannot
  // judge type against a stretched reference); superimposing needs the opposite
  // trade, because a blink or a difference blend against a frame that does not
  // land on the impl compares nothing. #lab-note states the stretch.
  imgs.ghost.style.transform = designImageTransform(ghostView(), ghostAlignment(), state.dprD);
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
    // The handles' outward offset is screen px too, so a zoom re-places them (the radius above is
    // not enough: dots left at the old offset drift onto the content the region was drawn around).
    if (state.focus && state.focusEdit) {
      const at = handlePoints(state.focus, FOCUS_HANDLE_OUT / z);
      for (const c of panes[side].querySelectorAll('.marks.anns circle.focus-handle')) {
        const h = at.find((p) => p.handle === c.dataset.handle);
        if (h) { c.setAttribute('cx', h.x); c.setAttribute('cy', h.y); }
      }
    }
  }
  $('zoom-pct').textContent = Math.round(v.z * 100) + '%';
  applyWipe();
}
// The comps' fit margins: 24px (the Tool comp's r.width − 48), 16px in the minimal layout (the Minimal comp's r.width − 32).
function fit() { setView(fitView(worldBox(), paneSize(), minimalOn() ? 16 : 24, 1.6, paneInsetsNow())); state.userMoved = false; applyView(); }

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
// The × is remembered per pair (localStorage, like the focus fallback): it used to mean "for this
// run" and lived in memory, so a reload put the banner straight back and it was dismissed again,
// and again. What expires the record is CONTENT, not a clock — it names the regressions that were
// on screen, and one the reader has never seen brings the whole strip back (gap 15). See
// deltaStripDismissed in rail.ts.
const DELTA_DISMISS_KEY = 'vc-delta-dismissed:';
// Ids are renumbered every run; Finding.key is the run-stable identity. A report old enough to
// have no key falls back to the id, which re-shows the strip more often, never less.
function regressionKeys() {
  return Array.from(regressionIds()).map((id) => { const f = byId.get(id); return (f && f.key) || id; }).sort();
}
function readDeltaDismissal() {
  try { return parseDeltaDismissal(JSON.parse(localStorage.getItem(DELTA_DISMISS_KEY + report.pair))); } catch (e) { return null; }
}
function dismissDelta() {
  state.deltaDismissed = true;
  const rec = { version: 1, run: report.createdAt, regKeys: regressionKeys(), at: nowIso() };
  try { localStorage.setItem(DELTA_DISMISS_KEY + report.pair, JSON.stringify(rec)); } catch (e) { /* private mode: this session only */ }
  renderDeltaStrip();
}
function renderDeltaStrip() {
  const d = report.delta, el = $('delta-strip');
  const regs = regressionIds().size;
  const dismissed = state.deltaDismissed || deltaStripDismissed(readDeltaDismissal(), regressionKeys());
  const show = !!d && !dismissed && (d.introduced.length > 0 || d.resolved.length > 0 || regs > 0);
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
      : '') +
    // Closable in BOTH states (the comp hides the × while a regression is in it;
    // decided otherwise 2026-08-28 — the reader has seen it, the rail keeps the tag).
    '<button type="button" class="dismiss" id="delta-dismiss" title="Dismiss — stays closed until a new regression"><span class="msi" aria-hidden="true">close</span></button>';
}
function setRegOnly(on) {
  state.regOnly = on; state.selected = null;
  setTab('findings'); openRail(true);
  renderDeltaStrip(); renderRail(); renderMarks();
}

// ---- the review rail ----------------------------------------------------
// The comps' right-hand panel: Findings · N / Comments · N tabs, the severity chips, one row per
// finding with its prop expected → actual line, the suppressed disclosure, the comments with the
// model's replies. Selecting a row focuses the canvas on the element (gap 13) — the canvas is the
// crop — and the row grows its actions in place. Every string here comes from the data.
// Focus is per BOX, not per finding. An aggregated finding ("×26 rows") can have instances in the
// content AND in the header, so admitting the whole finding drew its header marks straight back
// onto the canvas — you focused the content and the chrome still lit up.
// The test itself is focus.js's boxInFocus (mostly-inside, not any-touch), the SAME one focus.md is
// written with: the list, the canvas and the handover cannot disagree about what is in the region.
function inRegion(box) { return boxInFocus(box, state.focus); }
// A finding is LISTED when at least one of its boxes is inside; the canvas then draws only the
// boxes that actually are (renderMarks).
function inFocus(f) {
  if (!state.focus) return true;
  const boxes = [];
  for (const side of ['designBox', 'implBox']) if (f[side]) boxes.push(f[side]);
  if (f.members) for (const m of f.members) for (const side of ['designBox', 'implBox']) if (m[side]) boxes.push(m[side]);
  // Passed as a LAMBDA: boxes.some(boxInFocus) handed .some's index in as the region, which the
  // shared predicate reads as "no region" on box 0 and admitted every finding.
  return boxes.some((b) => inRegion(b));
}
function visible(f) { return visibleExceptFocus(f) && inFocus(f); }
// Split out because adjusting the region draws the findings it EXCLUDES, muted: dragging a corner
// with nothing outside it to see is dragging blind — you cannot tell what the edge is about to
// drop. Everything but the region is still applied to them (severity, search, triage).
function visibleExceptFocus(f) {
  if (!state.sev[f.severity]) return false;
  if (state.q && !(f.message + ' ' + f.type + ' ' + (f.role || '')).toLowerCase().includes(state.q)) return false;
  if (state.regOnly && !regressionIds().has(f.id)) return false;
  const verdict = triageStateOf(f);
  if (verdict === 'ignore' && !state.showTriaged.ignore) return false;
  if (verdict === 'snooze' && !state.showTriaged.snooze) return false;
  return true;
}
// Comments follow the focus region too (the comps' visItems): a point is a 0×0 box.
function visibleItems() { return ann.set.annotations.filter((a) => inRegion(shapeBox(a.shape))); }
const SEV_CHIP_LABELS = { critical: 'Critical', major: 'Major', minor: 'Minor' };
const TRIAGE_TAGS = { fix: 'To fix', ignore: 'Ignored', snooze: 'Snoozed' };
const STATUS_LABELS = { open: 'Open', implemented: 'Implemented', done: 'Done' };
function saveErrHtml(detail, act) {
  return '<div class="saveerr"><span class="msi" aria-hidden="true">cloud_off</span><div class="txt"><span class="t">Not saved</span><span class="d" title="' + esc(detail) + '">' + esc(detail) + '</span></div><button type="button" data-act="' + act + '">Retry</button></div>';
}
// The verdict row (gap 11): To fix / Ignore / Snooze, the active one again clears it; the note
// under it is stored with the verdict and read by the fix loop. Filed against f.key, so a report
// captured before that field existed can only say so.
function triageActionsHtml(f) {
  if (!f.key) return '<div class="fhint">no stable key on this finding — re-run the compare to triage it</div>';
  const entry = findTriage(triage.set, f.key);
  const verdict = triageStateOf(f);
  const btn = (v, label) => '<button type="button" data-triage="' + v + '" class="fact ' + v + (verdict === v ? ' on' : '') + '">' + label + '</button>';
  const until = entry && entry.snoozeUntil && verdict === 'snooze' ? '<span class="until">until ' + esc(entry.snoozeUntil.slice(0, 10)) + '</span>' : '';
  const noteVal = Object.prototype.hasOwnProperty.call(triage.noteDrafts, f.key) ? triage.noteDrafts[f.key] : (entry ? entry.note : '');
  // An "ignore" only hides the finding from THIS view; the next run reports it again. Saying so
  // here is the difference between a decision that sticks and one that is re-taken every run —
  // and the note is what becomes its reason, so an empty one is refused at harvest time.
  const stick = verdict === 'ignore'
    ? '<div class="fhint">hidden here only — <code>refdiff accept ' + esc(report.pair) + '</code> turns this into a policy rule that suppresses it in every run (and lapses if the measurement changes). Needs the note.</div>'
    : '';
  return '<div class="factions">' + btn('fix', 'To fix') + btn('ignore', 'Ignore') + btn('snooze', 'Snooze') + until + '</div>' +
    '<input class="fnote" data-key="' + esc(f.key) + '" placeholder="Note for the model…" value="' + esc(noteVal) + '" title="why — stored with the verdict, read by the fix loop">' + stick;
}
function findingRowHtml(f, suppressed) {
  const sel = state.selected === f.id;
  const verdict = suppressed ? undefined : triageStateOf(f);
  const isReg = regressionIds().has(f.id);
  const agg = (f.instances || 1) > 1;
  const unsaved = !suppressed && !!triage.saveError && !!f.key && triage.unsaved.has(f.key);
  let h = '<div class="frow' + (sel ? ' sel' : '') + (suppressed ? ' sup' : '') + (verdict ? ' triaged-' + verdict : '') + (unsaved ? ' unsaved' : '') + '" data-id="' + f.id + '">';
  h += '<div class="fhead"><span class="fbadge ' + f.severity + (suppressed ? ' sup' : '') + '">' + f.mark + '</span>' +
    '<span class="ftitle" title="' + esc(f.type + (f.role ? ' · ' + f.role : '') + ' · ' + f.severity) + '">' + esc(f.message) + '</span>';
  if (agg) h += '<span class="fgroup" title="one cause in ' + f.instances + ' places — every one is in members[]">×' + f.instances + '</span>';
  if (isReg) h += '<span class="freg" title="fixed in an earlier run, back in this one"><span class="msi" aria-hidden="true">undo</span><span>Regression</span></span>';
  if (suppressed) h += '<span class="fsuptag"><span>Suppressed</span></span>';
  if (verdict) h += '<span class="ftag ' + verdict + '"><span>' + TRIAGE_TAGS[verdict] + '</span></span>';
  h += '</div>';
  if (suppressed) h += '<div class="frule" title="' + esc(f.suppressedBy + ': ' + f.rule) + '"><span class="msi" aria-hidden="true">filter_alt_off</span><span>' + esc(f.suppressedBy + ' · ' + f.rule) + '</span></div>';
  for (const r of propRows(f.expected, f.actual, f.type)) {
    h += '<div class="fprop"><span class="p">' + esc(r.prop) + '</span><span class="e" title="design">' + esc(r.expected) + '</span><span class="msi" aria-hidden="true">arrow_right_alt</span><span class="a" title="implementation">' + esc(r.actual) + '</span></div>';
  }
  if (sel && suppressed) h += '<div class="fhint">Suppression rules live in the project manifest — edit it to change what gets hidden.</div>';
  if (sel && !suppressed) {
    if (agg) {
      h += '<div class="finst"><span class="msi" aria-hidden="true">select_all</span><span>' + (state.showMembers ? 'All ' + f.instances + ' instances marked on canvas' : 'Only the primary instance is marked') + '</span>' +
        '<button type="button" data-act="inst">' + (state.showMembers ? 'Show primary only' : 'Show all instances') + '</button></div>';
    }
    if (unsaved) h += saveErrHtml(triage.saveError, 'retry-triage');
    h += triageActionsHtml(f);
  }
  return h + '</div>';
}
function itemRowHtml(a, i) {
  const sel = ann.selected === a.id;
  const unsaved = !!ann.saveError && ann.unsaved.has(a.id);
  let h = '<div class="irow ' + a.status + (sel ? ' sel' : '') + (unsaved ? ' unsaved' : '') + '" data-ann="' + a.id + '">';
  h += '<div class="ihead"><span class="ibadge ' + a.status + '">' + (i + 1) + '</span><span class="istatus ' + a.status + '">' + STATUS_LABELS[a.status] + '</span></div>';
  h += '<div class="itext">' + (a.note.trim() ? esc(a.note.trim()) : '<i>(no text)</i>') + '</div>';
  if (unsaved) h += saveErrHtml(ann.saveError, 'retry');
  if (a.reply) h += '<div class="ireply" title="the model’s reply">' + esc(a.reply) + '</div>';
  if (sel) {
    h += '<div class="imeta">' + a.side + ' · ' + esc(describeAnchor(a.anchor)) + (a.stale ? ' · <b>stale</b>: its element is not in the current capture' : '') +
      ' · created ' + esc(a.createdAt.slice(0, 16).replace('T', ' ')) + ' · ' + esc(a.id) + '</div>';
    h += '<input class="inote" data-ann="' + a.id + '" placeholder="Add another instruction…" value="' + esc(ann.noteDrafts[a.id] || '') + '">';
    h += '<div class="iactions"><button type="button" class="primary" data-act="send" data-ann="' + a.id + '" title="appends to the note and reopens it for the model">Send</button>' +
      (a.status !== 'done' ? '<button type="button" data-act="done" data-ann="' + a.id + '">Mark done</button>' : '') +
      (a.status !== 'open' ? '<button type="button" data-act="reopen" data-ann="' + a.id + '">Reopen</button>' : '') +
      (a.status === 'open' ? '<button type="button" data-act="implement" data-ann="' + a.id + '" title="normally the agent does this: refdiff-annotator <run-dir> --mark-implemented ' + esc(a.id) + ' --reply …">Mark implemented</button>' : '') +
      '<button type="button" class="danger" data-act="delete" data-ann="' + a.id + '">Delete</button></div>';
  }
  return h + '</div>';
}
function draftHtml(d) {
  return '<div class="draft"><div class="kind">' + (d.shape.kind === 'rect' ? 'Region comment' : 'Point comment') + '</div>' +
    '<input class="dnote" id="draft-note" placeholder="Instruction for the model…" value="' + esc(ann.draftText) + '">' +
    '<div class="imeta">on the ' + d.side + ' side · anchored to ' + esc(describeAnchor(d.anchor)) + (ann.elementsLoaded ? '' : ' (elements.json not loaded — no snapping)') + '</div>' +
    '<div class="dactions"><button type="button" data-act="cancel-draft">Cancel</button><button type="button" class="primary" data-act="save-draft">Send to model</button></div></div>';
}
function renderSevChips() {
  const triaged = triageCounts(triage.set, nowIso());
  // The label is its own span, as the comps' runtime renders an interpolated label: the extractor's
  // leaf is then the text (no border of its own) on both sides, instead of our bordered <button>.
  const chip = (cls, on, key, val, label) => '<button type="button" class="sevchip ' + cls + (on ? ' on' : '') + '" data-' + key + '="' + val + '"><span class="dot" aria-hidden="true"></span><span>' + label + '</span></button>';
  // Triage chips sit with the severity chips because they do the same job — decide what the list
  // shows. A verdict HIDES its finding, so without these there would be no way back to it.
  $('sev-chips').innerHTML = SEV.map((s) => chip(s, state.sev[s], 'sev', s, SEV_CHIP_LABELS[s] + ' ' + report.findings.filter((f) => f.severity === s).length)).join('') +
    (triaged.ignore ? chip('tri ignore', state.showTriaged.ignore, 'triaged', 'ignore', 'Ignored ' + triaged.ignore) : '') +
    (triaged.snooze ? chip('tri snooze', state.showTriaged.snooze, 'triaged', 'snooze', 'Snoozed ' + triaged.snooze) : '');
}
function applyTab() {
  for (const b of document.querySelectorAll('.rtab')) b.classList.toggle('on', b.dataset.tab === state.tab);
  $('panel-findings').hidden = state.tab !== 'findings';
  $('panel-items').hidden = state.tab !== 'items';
}
function setTab(tab) { state.tab = tab; applyTab(); }
// Open on desktop = the 320px column; on the phone = the sheet raised to 52% (58% in the minimal
// layout, where the closed sheet is off screen and there is no height transition to re-fit after).
function openRail(open) {
  document.body.classList.toggle('rail-open', open); renderRailSummary(); saveControls();
  if (minimalOn() && !state.userMoved) fit();
}
// The collapsed rail has to say what it is hiding — and a failed save shows through it (section C).
function renderRailSummary() {
  const kept = report.findings.filter(visible).length, items = visibleItems().length;
  const text = railSummary(kept, items, ann.saveError ? ann.unsaved.size : 0);
  $('rail-summary').textContent = text;
  $('rail-fab-summary').textContent = text;
  $('rail-count').textContent = kept + items;
  const open = document.body.classList.contains('rail-open');
  $('rail-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('rail-toggle').querySelector('.chev').textContent = open ? 'expand_more' : 'expand_less';
}
// A failed PUT shows its endpoint and status on the rows it lost (section C); on a --read-only
// server it shows the refusal in the app's words — on the first save attempted, never up front,
// so the measured DOM stays identical to the writable app.
function renderRailStatus() {
  const errors = [];
  if (ann.saveError) errors.push('comments not saved · ' + ann.saveError);
  if (triage.saveError) errors.push('triage not saved · ' + triage.saveError);
  if (focusSaveError) errors.push('focus not saved · ' + focusSaveError);
  const err = errors.length > 0;
  const text = railStatusLine(errors, ann.storage);
  const el = $('rail-status');
  el.hidden = text.length === 0;
  el.className = 'rail-status' + (err ? ' err' : '');
  el.textContent = text;
}
function renderRail() {
  const kept = report.findings.filter(visible);
  const items = visibleItems();
  $('tab-f-count').textContent = kept.length;
  $('tab-i-count').textContent = items.length;
  applyTab();
  renderSevChips();
  // The instance chip (gap 12) exists only while an aggregate is listed.
  const aggs = aggregateCount(kept);
  $('inst-row').hidden = aggs === 0;
  $('inst-row').innerHTML = aggs
    ? '<button type="button" class="instchip' + (state.showMembers ? ' on' : '') + '" data-act="inst" title="Repeated differences share one row and one number. Toggle whether every instance is marked on the canvas or only the primary one."><span class="msi" aria-hidden="true">' + (state.showMembers ? 'select_all' : 'crop_free') + '</span><span>' + instanceChipLabel(state.showMembers, kept) + '</span></button>'
    : '';
  const sup = report.suppressed.filter(visible);
  let h = kept.length ? kept.map((f) => findingRowHtml(f, false)).join('') : '<div class="rail-empty">No findings match the current filters.</div>';
  if (sup.length) {
    h += '<button type="button" class="sup-toggle" id="sup-toggle" title="Findings a policy rule excused — still reported in findings.json, not part of the verdict"><span class="msi" aria-hidden="true">' + (state.showSup ? 'visibility_off' : 'visibility') + '</span><span class="lbl">' + SUPPRESSED_LABEL(sup.length) + '</span><span class="act">' + (state.showSup ? 'Hide' : 'Show') + '</span></button>';
    if (state.showSup) h += sup.map((s) => findingRowHtml(byId.get(s.id), true)).join('');
  }
  $('flist').innerHTML = h;
  let ih = ann.draft ? draftHtml(ann.draft) : '';
  if (items.length === 0 && !ann.draft) ih += '<div class="rail-empty">No comments yet. Pick the comment tool, then tap a point or drag a region on either pane.</div>';
  else ih += ann.set.annotations.map((a, i) => (items.includes(a) ? itemRowHtml(a, i) : '')).join('');
  $('ilist').innerHTML = ih;
  renderRailSummary();
  renderRailStatus();
}
function openSearch() { $('fsearch').hidden = false; $('q').focus(); }
function closeSearch() { state.q = ''; $('q').value = ''; $('fsearch').hidden = true; renderRail(); renderMarks(); }
function railAction(act, id) {
  const now = nowIso();
  if (act === 'inst') { state.showMembers = !state.showMembers; saveControls(); renderRail(); renderMarks(); return; }
  if (act === 'retry') { persist(); return; }
  if (act === 'retry-triage') { persistTriage(); return; }
  if (act === 'save-draft') {
    if (!ann.draft) return;
    const a = createAnnotation({ id: uid(), side: ann.draft.side, shape: ann.draft.shape, note: ann.draftText, now }, ann.elements[ann.draft.side]);
    ann.set = Object.assign({}, ann.set, { annotations: ann.set.annotations.concat([a]) });
    ann.draft = null; ann.draftText = ''; ann.unsaved.add(a.id);
    persist(); selectAnn(a.id, false); return;
  }
  if (act === 'cancel-draft') { ann.draft = null; ann.draftText = ''; renderAnnMarks(); renderRail(); return; }
  const i = annIndex(id); if (i < 0) return;
  const a = ann.set.annotations[i];
  if (act === 'delete') {
    ann.set = Object.assign({}, ann.set, { annotations: ann.set.annotations.filter((x) => x.id !== id) });
    ann.unsaved.delete(id); persist(); selectAnn(null, false); return;
  }
  if (act === 'send') {
    // The comps' Send: the instruction is appended and the note goes back to open — the model has
    // to act again. The reply it gave before stays as history.
    const text = (ann.noteDrafts[id] || '').trim();
    if (!text) { const el = $('side').querySelector('.inote'); if (el) el.focus(); return; }
    let next = editNote(a, a.note + ' — ' + text, now);
    if (next.status !== 'open') next = transition(next, 'reopen', now);
    delete ann.noteDrafts[id];
    replaceAnn(next);
  } else if (act === 'done' || act === 'reopen' || act === 'implement') {
    replaceAnn(transition(a, act, now));
  } else return;
  ann.unsaved.add(id); persist(); renderRail(); renderAnnMarks();
}
function select(id, focus) {
  state.selected = id;
  if (id) { ann.selected = null; ann.draft = null; ann.draftText = ''; setTab('findings'); if (narrow.matches) openRail(true); renderAnnMarks(); }
  renderRail(); renderMarks();
  const f = id ? byId.get(id) : null;
  const box = f && (f.implBox || f.designBox);
  if (focus && box) { setView(focusView(box, paneSize(), state.view, 1, paneInsetsNow())); state.userMoved = true; applyView(); }
  const row = $('side').querySelector('.frow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
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
    // While the region is being ADJUSTED the canvas shows what it leaves out, muted ('outside'):
    // the edge you are dragging is a decision about those marks, and it cannot be made blind.
    const adjusting = state.focusEdit && !!state.focus;
    const draw = (f, suppressed) => {
      const shown = adjusting ? visibleExceptFocus(f) : visible(f);
      if (!shown && state.selected !== f.id) return;
      const sel = state.selected === f.id;
      const verdict = triageStateOf(f);
      const cls = f.severity + (sel ? ' sel' : '') + (suppressed ? ' suppressed' : '') + (verdict === 'ignore' || verdict === 'snooze' ? ' triaged' : '');
      const box = (b) => (inRegion(b) ? b : adjusting ? b : undefined);
      const out = (b) => (inRegion(b) ? '' : ' outside');
      // Per-box, so an aggregate listed for its content instance does not redraw the header ones.
      const primary = box(f[key]);
      if (primary) {
        // The box itself only while selected (the comps' 4px-padded outline); Highlight draws the rest.
        if (sel) layer.append(rect(pad(primary, 4), f.severity + ' sel' + (suppressed ? ' suppressed' : '') + out(primary), f.id, 6));
        blayer.append(badge(primary, f, cls + out(primary), false));
      }
      if (state.showMembers && f.members) {
        f.members.slice(1).forEach((m) => {
          if (!m[key] || !box(m[key])) return;
          layer.append(rect(m[key], f.severity + ' member' + out(m[key]), f.id, 3));
          blayer.append(badge(m[key], f, cls + ' member' + out(m[key]), true));
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
        if (!inRegion(b)) continue;
        const box = side === 'impl' ? b : toDesignRegion(f, b);
        if (box && !tooBig(box, world)) out.push({ box: box, id: f.id });
      }
      continue;
    }
    // A presence finding has a box on one side only; it is drawn on both, since the OTHER side is
    // where the eye goes looking for the missing thing.
    const b = f[key] || (side === 'design' ? f.implBox : f.designBox);
    if (b && inRegion(b) && !tooBig(b, world)) out.push({ box: b, id: f.id });
    if (state.showMembers && f.members) {
      for (const m of f.members.slice(1)) if (m[key] && inRegion(m[key]) && !tooBig(m[key], world)) out.push({ box: m[key], id: f.id });
    }
  }
  return out;
}
function renderDiffs() {
  const world = worldBox();
  // The dim sheet must outlast a panned view, not just the frame. NOT named
  // pad: that is the box helper the holes below are cut with, and a local of
  // the same name made every Dim click throw before the sheet was drawn.
  const reach = 4000;
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
      mask.setAttribute('x', world.x - reach);
      mask.setAttribute('y', world.y - reach);
      mask.setAttribute('width', world.w + 2 * reach);
      mask.setAttribute('height', world.h + 2 * reach);
      // Inline style, not a fill ATTRIBUTE: the stylesheet's .marks rect
      // fill:none outranks a presentation attribute, which silently makes the
      // whole mask black — i.e. dims nothing at all.
      const keep = rect({ x: world.x - reach, y: world.y - reach, w: world.w + 2 * reach, h: world.h + 2 * reach }, 'dim-keep', '');
      keep.style.fill = '#fff';
      mask.append(keep);
      // The comps' holes: 6px round the box, 8px radius.
      for (const r of regions) {
        const hole = rect(pad(r.box, 6), 'dim-hole', r.id, 8);
        hole.style.fill = '#000';
        mask.append(hole);
      }
      defs.append(mask);
      const sheet = rect({ x: world.x - reach, y: world.y - reach, w: world.w + 2 * reach, h: world.h + 2 * reach }, 'dim', '');
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
  // The superimposed design is drawn with the run's FULL fit, stretch included:
  // blink and difference are meaningless unless the two frames land on each
  // other. That distortion is exactly what the design PANE refuses to show, so
  // it has to be stated here rather than left for the eye to misread. Only when
  // the overlay actually IS registered, though — under a manual mode or with the
  // lockstep off it is drawn like the pane, and the note would name a stretch
  // that is not on screen.
  const off = Math.abs(stretch - 1) >= 0.02 && ghostRegistered();
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
  for (const b of document.querySelectorAll('[data-lab]')) b.classList.toggle('on', b.dataset.lab === mode);
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

// ---- interaction --------------------------------------------------------
// Pan and pinch are tracked ONCE for the whole canvas, not once per pane, because a pinch is two
// fingers ANYWHERE over it and the second one habitually lands on something that is not bare
// canvas. Wired per pane, such a finger was dropped: a finding badge returned early so that a tap
// could still select it, and the floating chrome (the zoom and align pills, the FABs, the focus
// chip) are SIBLINGS of the pane, so a finger there never reached its listener at all. Either way
// only one pointer was ever tracked and the pinch silently degraded into a one-finger pan — which
// is what 'the pinch is unreliable on mobile' was.
//
// So: every finger over the canvas counts toward a pinch, and only a finger on bare canvas may PAN
// on its own — a tap on a badge still selects it, a tap on a pill still presses it.
const gest = {
  pts: new Map(),     // pointerId -> { x, y, side } for every pointer down over the canvas
  pinch: null,        // { side, at } while two or more are down
  pan: null,          // { id, side, pane } while one finger drags the canvas
  swallowClick: false, // the click that ends a gesture that MOVED is not a tap on what it lands on
};
// How far from where it started a pointer may stray and still count as a tap (screen px, Manhattan
// from the start point rather than path length, so a wobbly hold is still a tap).
const PAN_TAP_PX = 8;
function gestPaneOfEvent(e) { return (e.target.closest && e.target.closest('.pane')) || null; }
// The pane a pointer belongs to survives the pointer leaving it (captured drags, a pinch whose
// fingers wander over the chrome).
function gestPaneOf(e) {
  const p = gest.pts.get(e.pointerId);
  return p && p.side ? panes[p.side] : gestPaneOfEvent(e);
}
// Which pane a pinch drives: the first finger that landed on one, else the pane on screen (two
// fingers can both be on the pills).
function gestSide() {
  for (const p of gest.pts.values()) if (p.side) return p.side;
  return visiblePane().dataset.side;
}
function gestPinchAt(side) {
  const r = panes[side].getBoundingClientRect();
  return pinchOf(Array.from(gest.pts.values()), { x: r.left, y: r.top });
}
// Two fingers mean 'navigate', whatever the first one had begun: a half-drawn region, a half-moved
// handle or a half-dragged wipe would otherwise commit at the instant the pinch started.
function gestCancelDrafts() {
  if (gest.pan) { gest.pan.pane.classList.remove('dragging'); gest.pan = null; }
  if (focusDrag) { focusDrag = null; persistFocus(); }
  if (focusBand) { focusBand = null; renderFocusBand(); }
  if (ann.band) { ann.band = null; renderAnnMarks(); }
  wiping = null;
}
// A gesture that moved must not also select the badge it happened to start on — but a pinch often
// ends in no click at all, so the flag cannot be left to a click to clear: the next pointerdown
// clears it too, and a stale one can never reach a later tap.
function gestTookTheClick() {
  if (!gest.swallowClick) return false;
  gest.swallowClick = false;
  return true;
}
function wireCanvasGestures() {
  const host = $('panes');
  // Capture phase: the wipe handle stops pointerdown from propagating, and that finger still counts.
  host.addEventListener('pointerdown', (e) => {
    const pane = gestPaneOfEvent(e);
    if (!gest.pts.size) gest.swallowClick = false;   // a fresh gesture: nothing owed from the last one
    gest.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, side: pane ? pane.dataset.side : null });
    if (gest.pts.size >= 2) {
      gestCancelDrafts();
      const side = gestSide();
      gest.pinch = { side: side, at: gestPinchAt(side) };
      return;
    }
    if (!pane) return;   // a finger on the chrome over the canvas: it may join a pinch, nothing else
    // Focus and annotate modes both own the drag; they beat finding marks, because a backdrop
    // finding can cover the whole pane and would swallow the gesture.
    const grabbed = focusHandleAt(pane, e);
    if (grabbed) { focusEditDown(pane, e, grabbed); return; }
    if (state.focusing) { focusPointerDown(pane, e); return; }
    if (ann.mode) { annPointerDown(pane, e); return; }
    if (e.target.closest && e.target.closest('.wipe')) return;   // the wipe handle owns its drag
    // A finger landing on a finding badge or a comment still DRAGS the canvas: a mark can sit
    // exactly where you meant to grab, and 'the canvas will not move today' is not something a
    // person attributes to the badge under their thumb. What the mark keeps is the TAP — the click
    // below selects it only while the gesture stayed put (gest.swallowClick).
    const onMark = !!(e.target.closest && (e.target.closest('.vmark[data-id]') || e.target.closest('[data-ann]')));
    // Capturing the pointer would move the click off the mark and lose the tap, so a mark-started
    // drag captures LATE, once it is unambiguously a drag (touch has its own implicit capture and
    // needs none of this; a mouse leaving the canvas mid-drag does).
    if (!onMark) pane.setPointerCapture(e.pointerId);
    gest.pan = { id: e.pointerId, side: pane.dataset.side, pane: pane, sx: e.clientX, sy: e.clientY, moved: 0, captured: !onMark };
    pane.classList.add('dragging');
  }, true);
  host.addEventListener('pointermove', (e) => {
    const p = gest.pts.get(e.pointerId);
    const dx = p ? e.clientX - p.x : 0, dy = p ? e.clientY - p.y : 0;
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (gest.pinch) {
      const at = gestPinchAt(gest.pinch.side);
      if (!at) return;
      setViewOf(gest.pinch.side, pinchView(viewOf(gest.pinch.side), gest.pinch.at, at));
      gest.pinch.at = at;
      state.userMoved = true; applyView();
      return;
    }
    const pane = gestPaneOf(e);
    if (focusDrag && focusDrag.pointerId === e.pointerId) { focusEditMove(pane, e); return; }
    if (focusBand && focusBand.pointerId === e.pointerId) { focusPointerMove(pane, e); return; }
    if (ann.band && ann.band.pointerId === e.pointerId) { annPointerMove(pane, e); return; }
    if (!gest.pan || gest.pan.id !== e.pointerId) return;
    gest.pan.moved = Math.max(gest.pan.moved, Math.abs(e.clientX - gest.pan.sx) + Math.abs(e.clientY - gest.pan.sy));
    if (!gest.pan.captured && gest.pan.moved > PAN_TAP_PX) { gest.pan.pane.setPointerCapture(e.pointerId); gest.pan.captured = true; }
    setViewOf(gest.pan.side, panBy(viewOf(gest.pan.side), dx, dy));
    state.userMoved = true; applyView();
  }, true);
  const up = (e) => {
    const pane = gestPaneOf(e);
    const pinching = !!gest.pinch;
    gest.pts.delete(e.pointerId);
    if (gest.pan && gest.pan.id === e.pointerId) {
      gest.pan.pane.classList.remove('dragging');
      // A drag that ended over a mark is not a tap on it.
      if (gest.pan.moved > PAN_TAP_PX) gest.swallowClick = true;
      gest.pan = null;
    }
    if (pinching) {
      // The finger left over does not silently become a pan: the frame would jump under it.
      if (gest.pts.size >= 2) gest.pinch = { side: gest.pinch.side, at: gestPinchAt(gest.pinch.side) };
      else gest.pinch = null;
      gest.swallowClick = true;
      return;
    }
    if (focusDrag && focusDrag.pointerId === e.pointerId) { focusEditUp(); return; }
    if (focusBand && focusBand.pointerId === e.pointerId) { focusPointerUp(pane, e); return; }
    if (ann.band && ann.band.pointerId === e.pointerId) { annPointerUp(pane, e); return; }
  };
  host.addEventListener('pointerup', up, true);
  host.addEventListener('pointercancel', up, true);
}
// The wipe handle owns its drag; the pane under it must not pan. Module scope so a pinch that
// starts on the handle can drop it (gestCancelDrafts).
let wiping = null;
function wire() {
  for (const pane of Object.values(panes)) {
    const side = pane.dataset.side;
    pane.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = pane.getBoundingClientRect();
      setViewOf(side, zoomAt(viewOf(side), Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top));
      state.userMoved = true; applyView();
    }, { passive: false });
    pane.addEventListener('dblclick', (e) => { if (!ann.mode) fit(); });
    pane.addEventListener('click', (e) => {
      if (gestTookTheClick()) return;                               // the click that ended a pan or a pinch
      if (ann.suppressClick) { ann.suppressClick = false; return; } // the click that ended a draft gesture
      const a = e.target.closest && e.target.closest('[data-ann]'); if (a) { selectAnn(a.dataset.ann, false); return; }
      const r = e.target.closest && e.target.closest('.vmark[data-id]'); if (r) select(r.dataset.id, false);
    });
  }
  wireCanvasGestures();
  const wipe = $('wipe');
  wipe.addEventListener('pointerdown', (e) => { e.stopPropagation(); wipe.setPointerCapture(e.pointerId); wiping = e.pointerId; });
  wipe.addEventListener('pointermove', (e) => {
    if (wiping !== e.pointerId) return;
    const r = panes.impl.getBoundingClientRect();
    const x = (e.clientX - r.left - state.view.tx) / state.view.z;
    // Clamped to the WORLD box (both frames), not the impl's width: a design whose world box is
    // wider than the implementation left the curtain stopping short of the right-hand end of what
    // was drawn — the last stretch of the overlay could never be wiped away. The ends are included,
    // so "all design" and "all implementation" are both reachable; the handle sits on the frame's
    // edge there and stays grabbable (it is 28px wide, drawn centred on the curtain).
    const w = worldBox();
    state.wipeX = Math.min(w.x + w.w, Math.max(w.x, x));
    applyWipe();
  });
  const wipeUp = (e) => { if (wiping === e.pointerId) wiping = null; };
  wipe.addEventListener('pointerup', wipeUp); wipe.addEventListener('pointercancel', wipeUp);
  wipe.addEventListener('click', (e) => e.stopPropagation());
  $('side-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (b) setSide(b.dataset.side); });
  $('seg-layout').addEventListener('click', (e) => { const b = e.target.closest('[data-layout]'); if (b) setLayout(b.dataset.layout === 'full'); });
  for (const id of ['seg-variant', 'seg-variant-m']) $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-lab]'); if (b) setLab(b.dataset.lab); });
  for (const id of ['seg-layer', 'seg-layer-m', 'seg-layer-p']) $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-layer]'); if (b) setLayer(b.dataset.layer); });
  // The phone's settings popover closes on a tap anywhere else; the minimal layout's view panel
  // does NOT — see the pointerdown handler below.
  $('settings-toggle').addEventListener('click', () => setSettingsOpen(!state.settingsOpen));
  $('seg-mlayout').addEventListener('click', (e) => { const b = e.target.closest('[data-mlayout]'); if (b) setPhoneLayout(b.dataset.mlayout); });
  $('seg-theme').addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) { applyTheme(b.dataset.theme); saveTheme(); } });
  $('view-toggle').addEventListener('click', () => setViewOpen(!state.viewOpen));
  document.addEventListener('pointerdown', (e) => {
    const inside = (sel) => e.target.closest && e.target.closest(sel);
    // The settings popover is a MENU: you pick one thing and it is done, so a tap elsewhere closes
    // it. The view panel is a set of switches you work the canvas THROUGH (Compare, Show) — closing
    // it on the first pan or pinch meant re-opening it for every single change, so it stays until
    // the tune button (or Escape, or leaving the minimal layout) puts it away.
    if (state.settingsOpen && !inside('.settings-wrap')) setSettingsOpen(false);
  });
  $('fit-m').addEventListener('click', fit);
  $('pane-swap').addEventListener('click', () => setSide(state.side === 'design' ? 'impl' : 'design'));
  $('rail-btn').addEventListener('click', () => openRail(!document.body.classList.contains('rail-open')));
  $('move-toggle').addEventListener('click', setPan);
  $('focus-toggle').addEventListener('click', () => {
    if (state.focus) { setFocus(null); setFocusing(false); return; }  // second press clears
    setFocusing(!state.focusing);
  });
  $('focus-edit').addEventListener('click', () => setFocusEdit(!state.focusEdit));
  $('focus-clear').addEventListener('click', () => { setFocus(null); setFocusing(false); });
  $('delta-strip').addEventListener('click', (e) => {
    if (e.target.closest('#reg-review')) setRegOnly(!state.regOnly);
    else if (e.target.closest('#delta-dismiss')) dismissDelta();
  });
  $('align-mode').addEventListener('click', () => toggleAlignMenu());
  $('align-lock').addEventListener('click', () => setLock(!state.lock));
  $('align-menu').addEventListener('click', (e) => {
    // The lockstep row (minimal layout) toggles in place; a mode closes the menu.
    if (e.target.closest('[data-lockrow]')) { setLock(!state.lock); return; }
    const o = e.target.closest('[data-align]'); if (o) setAlign(o.dataset.align);
  });
  document.addEventListener('pointerdown', (e) => { if (state.alignOpen && !(e.target.closest && e.target.closest('.align-wrap'))) toggleAlignMenu(false); });
  // The rail: one delegated listener per event kind, since its rows are re-rendered as HTML.
  $('rail-toggle').addEventListener('click', () => openRail(!document.body.classList.contains('rail-open')));
  // The phone sheet animates its height; the untouched view re-fits into what
  // is left once the sheet has settled (the rect mid-transition is neither).
  $('side').addEventListener('transitionend', (e) => { if (e.propertyName === 'height' && !state.userMoved) fit(); });
  $('rail-collapse').addEventListener('click', () => openRail(false));
  $('rail-expand').addEventListener('click', () => openRail(true));
  $('side').addEventListener('click', (e) => {
    const t = e.target;
    const tab = t.closest('.rtab'); if (tab) { setTab(tab.dataset.tab); return; }
    const chip = t.closest('.sevchip');
    if (chip) {
      if (chip.dataset.triaged) { state.showTriaged[chip.dataset.triaged] = !state.showTriaged[chip.dataset.triaged]; saveControls(); }
      else state.sev[chip.dataset.sev] = !state.sev[chip.dataset.sev];
      renderRail(); renderMarks(); renderFocusChip(); return;
    }
    if (t.closest('#sup-toggle')) { state.showSup = !state.showSup; saveControls(); renderRail(); return; }
    const tri = t.closest('button[data-triage]');
    if (tri) {
      // The active verdict pressed again clears it (the comps' toggle).
      const cur = state.selected ? triageStateOf(byId.get(state.selected)) : null;
      const note = $('side').querySelector('.fnote');
      applyTriage(tri.dataset.triage === cur ? null : tri.dataset.triage, note ? note.value : undefined);
      return;
    }
    const act = t.closest('[data-act]'); if (act) { railAction(act.dataset.act, act.dataset.ann); return; }
    if (t.closest('input, textarea, button, a')) return;
    const frow = t.closest('.frow'); if (frow) { select(frow.dataset.id === state.selected ? null : frow.dataset.id, true); return; }
    const irow = t.closest('.irow'); if (irow) selectAnn(irow.dataset.ann === ann.selected ? null : irow.dataset.ann, true);
  });
  $('side').addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { state.q = t.value.trim().toLowerCase(); renderRail(); renderMarks(); }
    else if (t.id === 'draft-note') ann.draftText = t.value;
    else if (t.classList.contains('inote')) ann.noteDrafts[t.dataset.ann] = t.value;
    else if (t.classList.contains('fnote')) triage.noteDrafts[t.dataset.key] = t.value;
  });
  $('side').addEventListener('change', (e) => {
    const t = e.target;
    if (!t.classList.contains('fnote')) return;
    const f = state.selected ? byId.get(state.selected) : null;
    if (!f || !f.key) return;
    delete triage.noteDrafts[f.key];
    triage.set = setTriageNote(triage.set, f.key, t.value, nowIso());
    triage.unsaved.add(f.key); persistTriage(); renderRail();
  });
  $('side').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'draft-note') railAction('save-draft');
    else if (e.key === 'Enter' && e.target.classList.contains('inote')) railAction('send', e.target.dataset.ann);
    else if (e.key === 'Escape' && e.target.id === 'q') closeSearch();
  });
  narrow.addEventListener('change', () => { applyLayout(); applySide(); applyNarrow(); applyAlignMode(); if (state.userMoved) applyView(); else fit(); });
  narrowish.addEventListener('change', applyNarrow);
  // On a phone the comment tool stays on until switched off (a thumb cannot re-pick it per note);
  // on desktop it is one-shot, like the comps' tool that snaps back to pan after a gesture.
  $('ann-draw').addEventListener('click', () => { setAnnMode(ann.mode ? null : 'draw', narrow.matches); saveControls(); });
  $('zoom-in').addEventListener('click', () => { const p = paneSize(); setView(zoomAt(state.view, 1.25, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); });
  $('zoom-out').addEventListener('click', () => { const p = paneSize(); setView(zoomAt(state.view, 0.8, p.w / 2, p.h / 2)); state.userMoved = true; applyView(); });
  $('fit').addEventListener('click', fit);
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
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape' && e.target.id !== 'q') { e.target.blur(); } return; }
    const p = paneSize();
    // The text filter has no drawn home (gap 31): / opens it, Esc in it clears and closes it.
    if (e.key === '/') { e.preventDefault(); setTab('findings'); openSearch(); return; }
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
      if (state.settingsOpen) setSettingsOpen(false);
      else if (state.viewOpen) setViewOpen(false);
      else if (state.alignOpen) toggleAlignMenu(false);
      else if (state.focusing) setFocusing(false);
      else if (state.focusEdit) setFocusEdit(false);
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

// One annotate mode, not two: the gesture already said which shape was meant — a click is a note on
// the element under it, a drag is a region — so a second button only made you declare it twice.
function setAnnMode(mode, sticky) {
  if (mode) state.focusEdit = false;
  ann.mode = mode;
  // A sticky mode survives drawing a shape: the corner toggle stays in
  // annotate until it is switched back, the desktop button is one-shot.
  ann.sticky = !!mode && !!sticky;
  state.move = !mode;
  for (const pane of Object.values(panes)) pane.classList.toggle('annotating', !!mode);
  document.body.classList.toggle('ann-mode', !!mode);
  applyTools();
}
// The whole set is one PUT. A failure is shown on the rows changed since the last one that
// succeeded (ann.unsaved), with the REAL endpoint and status, and a Retry — never a silent
// "saved" over a file that did not change (section C).
function persist() {
  clearTimeout(ann.saveTimer);
  ann.saveTimer = setTimeout(async () => {
    const body = JSON.stringify(ann.set);
    if (ann.storage === 'api') {
      try {
        const res = await fetch(page.annotationsUrl, { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
        if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
        ann.saveError = null; ann.unsaved.clear();
      } catch (e) { ann.saveError = saveErrorText(!!page.readOnly, page.annotationsUrl, e.message); }
    } else {
      try { localStorage.setItem('vc-annotations:' + report.pair, body); ann.saveError = null; ann.unsaved.clear(); }
      catch (e) { ann.saveError = 'localStorage · ' + e.message; }
    }
    renderRail(); renderAnnMarks();
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
  if (ann.draft && ann.draftText.trim()) { setTab('items'); if (narrow.matches) openRail(true); const el = $('draft-note'); if (el) el.focus(); return; }
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
  ann.draftText = '';
  ann.selected = null; state.selected = null;
  if (!ann.sticky) setAnnMode(null);
  // The comps' flow: the composer opens in Comments (the sheet rises on the phone) and waits for
  // the instruction.
  setTab('items'); if (narrow.matches) openRail(true);
  renderRail(); renderMarks(); renderAnnMarks();
  const el = $('draft-note'); if (el) el.focus();
}
function selectAnn(id, focus) {
  ann.selected = id; ann.draft = null; ann.draftText = '';
  if (id) { state.selected = null; setTab('items'); if (narrow.matches) openRail(true); }
  const picked = id ? ann.set.annotations[annIndex(id)] : null;
  if (picked && narrow.matches && picked.side !== state.side) setSide(picked.side);
  renderRail(); renderMarks(); renderAnnMarks();
  if (focus && picked) { setView(focusView(shapeBox(picked.shape).w ? shapeBox(picked.shape) : { x: picked.shape.x - 20, y: picked.shape.y - 20, w: 40, h: 40 }, paneSize(), state.view, 1, paneInsetsNow())); state.userMoved = true; applyView(); }
  const row = $('side').querySelector('.irow.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
}

// The comps' comment badge: a 22px rounded square in the status colour, centred on the shape's
// top-left corner (a point's badge sits on the point). HTML, like the finding badges. A comment
// whose save failed wears the red halo (section C, surface 3). Drawn on BOTH panes, as the comps
// do: the shape lives in shared world space, and on a phone only one side is on screen — a note
// placed on the impl was invisible while the design showed.
function annLabel(x, y, n, a, outside) {
  const d = document.createElement('div');
  d.className = 'vmark ann ' + a.status + (ann.saveError && ann.unsaved.has(a.id) ? ' unsaved' : '') + (outside ? ' outside' : ''); d.dataset.ann = a.id; d.title = a.note;
  d.style.left = (x - 11) + 'px'; d.style.top = (y - 11) + 'px';
  d.textContent = n;
  return d;
}
function renderAnnMarks() {
  const adjusting = state.focusEdit && !!state.focus;
  for (const side of ['design', 'impl']) {
    const layer = annLayers[side], blayer = markLayers[side];
    layer.replaceChildren();
    for (const b of blayer.querySelectorAll('.vmark.ann')) b.remove();
    ann.set.annotations.forEach((a, i) => {
      // The region scopes comments exactly as it scopes findings — the rail counted them that way
      // (visibleItems) while the canvas drew every pin, so a focused view said "Comments · 0" over
      // a canvas full of them. The selected one is drawn wherever it is, as a selected finding is,
      // and while the region is being adjusted the excluded pins come back muted with the marks.
      const inside = inRegion(shapeBox(a.shape));
      if (!inside && ann.selected !== a.id && !adjusting) return;
      const cls = 'ann ' + a.status + (a.stale ? ' stale' : '') + (ann.selected === a.id ? ' sel' : '') + (a.side === side ? '' : ' mirror') + (inside ? '' : ' outside');
      if (a.shape.kind === 'rect') {
        const r = document.createElementNS(SVG, 'rect');
        r.setAttribute('x', a.shape.x); r.setAttribute('y', a.shape.y); r.setAttribute('width', Math.max(a.shape.w, 0.5)); r.setAttribute('height', Math.max(a.shape.h, 0.5));
        r.setAttribute('class', cls); r.dataset.ann = a.id; layer.append(r);
      } else {
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', a.shape.x); c.setAttribute('cy', a.shape.y); c.setAttribute('r', 7 / state.view.z);
        c.setAttribute('class', cls); c.dataset.ann = a.id; layer.append(c);
      }
      blayer.append(annLabel(a.shape.x, a.shape.y, i + 1, a, !inside));
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
  // This layer was just replaceChildren'd and the region lives in it: without this, drawing a
  // comment wiped the focus region off the canvas until something else redrew it.
  renderFocusBand();
}
async function loadAnnotations() {
  if (ann.storage === 'api') {
    try {
      const res = await fetch(page.annotationsUrl);
      if (res.ok) { const p = parseAnnotationSet(await res.json(), report.pair); if (p.ok) { ann.set = p.value; return; } }
      else if (res.status === 404) { ann.storage = 'local'; }
      else throw new Error('HTTP ' + res.status);
    } catch (e) { ann.storage = 'local'; }
  }
  try {
    const raw = localStorage.getItem('vc-annotations:' + report.pair);
    if (raw) { const p = parseAnnotationSet(JSON.parse(raw), report.pair); if (p.ok && p.value.annotations.length >= ann.set.annotations.length) ann.set = p.value; }
  } catch (e) { /* embedded copy stays */ }
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
  page = Object.assign({ indexHref: null, base: '', annotationsUrl: 'api/annotations', triageUrl: null, readOnly: false }, pageData || {});
  byId = new Map(report.findings.concat(report.suppressed.map((s) => Object.assign({ isSuppressed: true }, s))).map((f) => [f.id, f]));
  ann.set = annotationSet || { version: 1, pair: report.pair, annotations: [] };
  ann.mode = null; ann.draft = null; ann.draftText = ''; ann.selected = null; ann.band = null; ann.sticky = false;
  ann.elements = { design: [], impl: [] }; ann.elementsLoaded = false;
  ann.unsaved = new Set(); ann.saveError = null; ann.noteDrafts = {};
  triage.unsaved = new Set(); triage.saveError = null; triage.noteDrafts = {}; focusSaveError = null;
  state.view = { z: 1, tx: 0, ty: 0 }; state.userMoved = false; state.selected = null; state.q = ''; state.tab = 'findings';
  state.sev = { critical: true, major: true, minor: true };
  state.focus = null; state.focusLabel = ''; state.focusing = false; state.focusEdit = false; focusBand = null; focusDrag = null;
  state.diffIndex = -1; state.regOnly = false; state.deltaDismissed = false; state.alignOpen = false;
  state.wipeX = report.impl.width / 2;
  document.body.classList.remove('ann-mode');
  $('q').value = ''; $('fsearch').hidden = true;
  applyControls(readControls());
  document.title = report.pair + ' — refdiff';
  renderTopbar(); renderDeltaStrip(); renderRail();
  if (!wired) { wire(); wired = true; }
  applyLayout(); applySide(); applyNarrow(); applyAspect(); setFocusing(false); renderFocusChip(); renderFocusBand();
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
    renderRail(); renderMarks(); renderAnnMarks(); renderFocusChip(); fit();
  });
}
`
