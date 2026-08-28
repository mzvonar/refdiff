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
 * On a phone (≤900px) the split screen would leave each pane ~50px tall, so
 * the layout switches: the page scrolls, the header's metadata collapses
 * behind a "details" toggle, the viewer sticks to the top showing ONE side at
 * a time (a Design/Impl switch over the shared pan/zoom, so flipping compares
 * the same spot), and the finding list flows underneath.
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

/** Four-arrow "move" glyph: the canvas is in pan/zoom mode. */
const MOVE_ICON = `<svg class="i i-move" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 10.4 4 8.9 4 8.9 7.1 12 7.1 12 5.6 15 8 12 10.4 12 8.9 8.9 8.9 8.9 12 10.4 12 8 15 5.6 12 7.1 12 7.1 8.9 4 8.9 4 10.4 1 8 4 5.6 4 7.1 7.1 7.1 7.1 4 5.6 4Z"/></svg>`

/** Two frames snapped onto each other: the design projected through the run's Alignment. */
const ALIGN_ICON = `<svg class="i i-align" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 1h9v1.6H2.6V10H1Z"/><path d="M6 6h9v9H6Zm1.6 1.6v5.8h5.8V7.6Z"/></svg>`

/** Crop-marks glyph: drag a region and the list narrows to what is inside it. */
const FOCUS_ICON = `<svg class="i i-focus" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 4.6V1h3.6v1.5H2.5v2.1ZM11.4 1H15v3.6h-1.5V2.5h-2.1ZM1 11.4h1.5v2.1h2.1V15H1ZM13.5 11.4H15V15h-3.6v-1.5h2.1ZM5.4 5.4h5.2v5.2H5.4Z"/></svg>`

/** Pencil glyph: the canvas is in annotate mode (tap = note, drag = region). */
const NOTE_ICON = `<svg class="i i-note" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 14.4 5.2 13.3 12.7 5.8 10.2 3.3 2.7 10.8Z"/><path d="M11.2 2.3 12.2 1.3 14.7 3.8 13.7 4.8Z"/></svg>`

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
export const REPORT_BODY = `<header id="hdr"></header>
<main>
  <aside id="side">
    <button type="button" class="rail-toggle" id="rail-toggle" aria-expanded="false" aria-controls="rail-body"></button>
    <div class="rail-body" id="rail-body">
      <div class="filters">
        <input id="q" type="search" placeholder="filter findings…" aria-label="filter findings">
        <div class="chips" id="sev-chips"></div>
      </div>
      <div id="count" class="count"></div>
      <ol id="list" class="list"></ol>
      <details id="suppressed-box"><summary id="suppressed-summary"></summary><ol id="suppressed" class="list"></ol></details>
      <details id="ann-box" open><summary id="ann-summary"></summary><ol id="ann-list" class="list"></ol></details>
    </div>
  </aside>
  <section id="viewer">
    <div class="toolbar">
      <button id="zoom-out" title="zoom out (−)">−</button>
      <span id="zoom-pct" class="pct">100%</span>
      <button id="zoom-in" title="zoom in (+)">+</button>
      <button id="fit" title="fit both (0)">Fit</button>
      <button type="button" id="layout-toggle" aria-pressed="false" title="split screen — switch to one side at a time"><span id="layout-label">Split</span></button>
      <button type="button" id="align-mode" class="icon-toggle align-mode" title="how the design is registered onto the impl (a)">${ALIGN_ICON}<span id="align-label">anchors</span></button>
      <label><input type="checkbox" id="marks" checked> marks</label>
      <label><input type="checkbox" id="members" checked> all instances</label>
      <span class="sep"></span>
      <button type="button" id="diff-toggle" class="tog lab" aria-pressed="false" title="highlight where the pixels differ (d) — [ and ] step through the regions">Diff</button>
      <button type="button" id="dim-toggle" class="tog lab" aria-pressed="false" title="dim everything except the diff regions (g)">Focus</button>
      <button type="button" id="strobe-toggle" class="tog lab" aria-pressed="false" title="pulse and wiggle the diff regions (s)">Strobe</button>
      <label class="labsel">over impl
        <select id="lab-mode" title="superimpose the design on the implementation pane">
          <option value="none">—</option>
          <option value="blink">blink (b)</option>
          <option value="onion">onion (o)</option>
          <option value="swipe">swipe (w)</option>
          <option value="difference">difference (x)</option>
        </select>
      </label>
      <input type="range" id="lab-amount" class="labrange" min="0" max="100" value="50" aria-label="lab amount" hidden>
      <span id="lab-note" class="labnote"></span>
      <span class="sep"></span>
      <button id="ann-draw" class="tog" title="annotate: click = note on an element, drag = region (n)">+ note</button>
      <button type="button" id="focus-chip" class="chip focus-chip" hidden></button>
      <span id="ann-status" class="annstatus"></span>
      <span class="hint">wheel = zoom · drag = pan · j/k = next/prev · [ ] = next/prev diff · a = align mode · d/g/s = diff/focus/strobe · b/o/w/x = blink/onion/swipe/difference · n = annotate (click = note, drag = region) · Esc = deselect</span>
    </div>
    <div class="panes" id="panes">
      <div class="pane" id="pane-design" data-side="design">
        <div class="pane-label" id="label-design"></div>
        <div class="stage"><img class="shot" id="img-design" alt="design"><svg class="marks diffs" id="diffs-design"></svg><svg class="marks" id="marks-design"></svg><svg class="marks anns" id="anns-design"></svg></div>
      </div>
      <div class="pane" id="pane-impl" data-side="impl">
        <div class="pane-label" id="label-impl"></div>
        <div class="stage"><img class="shot" id="img-impl" alt="implementation"><div class="ghost-wrap" id="ghost-wrap"><img class="shot ghost" id="img-ghost" alt="design superimposed on the implementation"></div><img class="shot mask" id="img-mask" alt=""><svg class="marks diffs" id="diffs-impl"></svg><svg class="marks" id="marks-impl"></svg><svg class="marks anns" id="anns-impl"></svg></div>
      </div>
      <div class="canvas-controls" id="canvas-controls">
        <button type="button" class="cbtn" id="side-switch" title="switch side"><span aria-hidden="true">⇄</span><span id="side-label">Design</span></button>
        <button type="button" class="cbtn" id="move-toggle" aria-pressed="true" title="move: pan and zoom (off = tap to note, drag to mark a region)">${MOVE_ICON}${NOTE_ICON}</button>
        <button type="button" class="cbtn" id="focus-toggle" aria-pressed="false" title="focus a region: drag a box, and only findings inside it are listed">${FOCUS_ICON}</button>
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
header { display:flex; flex-wrap:wrap; gap:6px 18px; align-items:center; padding:8px 14px;
  border-bottom:1px solid var(--line); background:var(--bg1); }
header h1 { font-size:15px; margin:0; }
header #hdr-meta { display:contents; }
header .back { flex:none; padding:3px 10px; border:1px solid var(--line); border-radius:999px; color:var(--txt); text-decoration:none; }
header .back:hover { border-color:var(--acc); color:var(--acc); }
header .kv { color:var(--txt2); }
header .kv b { color:var(--txt); font-weight:500; }
header a { color:var(--acc); text-decoration:none; }
.pill { display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; }
.pill.pass { background:var(--ok); color:#fff; } .pill.fail { background:var(--critical); color:#fff; }
main { flex:1; display:grid; grid-template-columns:340px 1fr; min-height:0; }
aside { border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0; background:var(--bg1); }
.filters { padding:8px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid var(--line); }
.filters input { width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--bg0); color:var(--txt); }
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
#viewer { display:flex; flex-direction:column; min-height:0; min-width:0; }
.toolbar { display:flex; gap:10px; align-items:center; padding:6px 10px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.toolbar button { background:var(--bg1); color:var(--txt); border:1px solid var(--line); border-radius:6px; padding:3px 10px; cursor:pointer; }
.toolbar label { color:var(--txt2); display:flex; gap:4px; align-items:center; }
.toolbar .pct { min-width:48px; text-align:center; }
.toolbar .hint { margin-left:auto; color:var(--txt2); font-size:11px; }
.theme-toggle { flex:none; width:32px; height:32px; padding:0; border:0; border-radius:7px; display:inline-flex; align-items:center; justify-content:center;
  background:transparent; color:var(--txt2); cursor:pointer; }
.theme-toggle:hover { background:var(--bg3); }
.theme-toggle .msi { font-size:19px; }
header .theme-toggle { margin-left:auto; }
.hdr-more { display:none; background:var(--bg0); color:var(--txt2); border:1px solid var(--line); border-radius:999px; padding:2px 10px; cursor:pointer; }
/* One side at a time — always on a phone, on demand on desktop (#layout-toggle).
   The corner controls replace the pane label: they name the side being shown. */
body.single .pane { display:none; }
body.single .pane.active { display:block; }
body.single .pane-label { display:none; }
/* Move and focus are useful in every layout; only the side SWITCH is meaningless when both panes
   are on screen, so the controls show always and that one button hides itself. */
.canvas-controls { display:flex; }
#side-switch { display:none; }
body.single #side-switch { display:inline-flex; }
/* corner controls over the canvas: which side, and move vs annotate. Bottom-right, where a thumb
   reaches them and they cover no content — the top-right is where page headers live. */
.canvas-controls { position:absolute; z-index:3; bottom:8px; right:8px; gap:6px; }
.cbtn { display:inline-flex; align-items:center; gap:6px; padding:7px 10px; border:1px solid var(--line); border-radius:8px;
  background:var(--bg1); color:var(--txt); font:inherit; line-height:1; cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,.25); }
.cbtn .i { width:15px; height:15px; fill:currentColor; display:block; }
.cbtn .i-note, body.ann-mode .cbtn .i-move { display:none; }
body.ann-mode .cbtn .i-note { display:block; }
#move-toggle { color:var(--acc); border-color:var(--acc); }
body.ann-mode #move-toggle { color:var(--open); border-color:var(--open); }
/* findings rail disclosure (phone only): the rail is collapsed until asked for */
.rail-toggle { display:flex; width:100%; justify-content:space-between; align-items:center; gap:8px; padding:9px 12px;
  background:var(--bg1); color:var(--txt); border:0; border-bottom:1px solid var(--line); font:inherit; text-align:left; cursor:pointer; }
.rail-toggle .chev { color:var(--txt2); }
.rail-toggle .num { display:inline-block; padding:0 6px; border-radius:5px; font-weight:700; font-size:11px; color:#fff; }
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
.focus-chip { border-color:var(--acc); color:var(--acc); background:transparent; font:inherit; }
.focus-chip b { text-decoration:underline; margin-left:4px; }
.pane.focusing { cursor:crosshair; }
.marks.anns rect.focus-rect { fill:rgba(91,141,239,.10); stroke:var(--acc); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:6 4; }
/* Handles are interactive; the region's BODY is not, so a drag inside it still pans. */
.marks.anns circle.focus-handle { fill:var(--acc); stroke:var(--bg0); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:all; cursor:nwse-resize; }
.marks.anns circle.focus-handle.move { cursor:move; fill:var(--bg0); stroke:var(--acc); stroke-width:2; }
.marks.anns circle.focus-handle.ne, .marks.anns circle.focus-handle.sw { cursor:nesw-resize; }
#focus-toggle.on { color:var(--acc); border-color:var(--acc); }
/* Icon toggle in the toolbar: "align design through Alignment" as words ate a third of the phone's
   toolbar row, and that row is horizontally scrollable — the long label pushed the rest off. */
.icon-toggle { display:inline-flex; align-items:center; justify-content:center; padding:5px 9px; color:var(--txt2); }
.icon-toggle .i { width:15px; height:15px; fill:currentColor; display:block; }
.icon-toggle.on { color:var(--acc); border-color:var(--acc); }
/* The align control cycles registrations rather than switching one on and off, so it carries the
   current mode's NAME: "aligned / not aligned" never said what it aligned on. */
.icon-toggle.align-mode { gap:5px; }
.icon-toggle.align-mode.measured { color:var(--acc); border-color:var(--acc); }
.icon-toggle.align-mode.manual { color:var(--major); border-color:var(--major); }
body.rail-open .rail-toggle .chev { transform:rotate(180deg); }
.panes { flex:1; display:flex; min-height:0; position:relative; }
aside .rail-body { display:contents; }
/* Collapsed on DESKTOP: the rail becomes a strip and the canvas takes the width. Phone keeps its
   own rules (the rail is a section of a scrolling page there, not a column). */
body:not(.rail-open) main { grid-template-columns:38px 1fr; }
body:not(.rail-open) aside .rail-body { display:none; }
body:not(.rail-open) .rail-toggle { writing-mode:vertical-rl; height:100%; width:38px; padding:12px 0; justify-content:flex-start; gap:12px; }
body:not(.rail-open) .rail-toggle .num { writing-mode:horizontal-tb; }
.pane { flex:1; position:relative; overflow:hidden; min-width:0; touch-action:none; cursor:grab; background:var(--canvas); }
.pane + .pane { border-left:1px solid var(--line); }
.pane.dragging { cursor:grabbing; }
.pane-label { position:absolute; z-index:2; top:6px; left:8px; padding:2px 8px; border-radius:6px; background:var(--bg1);
  color:var(--txt); font-size:12px; pointer-events:none; }
.pane-label span { color:var(--txt2); }
.stage { position:absolute; inset:0; }
.shot { position:absolute; left:0; top:0; transform-origin:0 0; image-rendering:auto; user-select:none; -webkit-user-drag:none; pointer-events:none; }
.marks { position:absolute; left:0; top:0; width:1px; height:1px; overflow:visible; transform-origin:0 0; pointer-events:none; }
.marks rect { fill:none; stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:all; cursor:pointer; }
.marks rect.critical { stroke:var(--critical); } .marks rect.major { stroke:var(--major); } .marks rect.minor { stroke:var(--minor); }
.marks rect.member { stroke-dasharray:3 3; opacity:.7; }
.marks rect.sel { stroke-width:3; fill:rgba(91,141,239,.14); }
.marks rect.suppressed { stroke:var(--txt2); stroke-dasharray:2 3; }
.marks g.lbl rect { fill:currentColor; stroke:none; } .marks g.lbl text { fill:#fff; font:700 11px var(--font-sans); }
/* Findings cluster: three marks can share a box, and the neighbour drawn last used to sit on top
   of the one you just selected — you clicked 1 and read 95. While something is selected its mark
   is drawn LAST and everything else steps back. */
.marks.has-sel g.lbl:not(.sel) { opacity:.25; }
.marks.has-sel rect:not(.sel) { opacity:.35; }
.marks g.lbl.sel rect { stroke:#fff; stroke-width:1.5; }
.marks g.lbl.critical { color:var(--critical); } .marks g.lbl.major { color:var(--major); } .marks g.lbl.major text { fill:#111; } .marks g.lbl.minor { color:var(--minor); }
/* ---- diff lab -----------------------------------------------------------
   Chromatic-style reading aids over OUR signal. The regions are the reported
   pixel diffs (Finding.regions) plus the presence findings the pixel channel
   structurally cannot see, so nothing here lights up residue: boxes say WHERE,
   the raster mask (coloured by changeKind) says WHAT. */
.toolbar button.tog.lab.on { border-color:var(--diff); color:var(--diff); box-shadow:0 0 0 1px var(--diff) inset; }
.toolbar .labsel { color:var(--txt2); gap:6px; }
.toolbar .labsel select { background:var(--bg1); color:var(--txt); border:1px solid var(--line); border-radius:6px; padding:3px 6px; font:inherit; }
.toolbar .labrange { width:120px; accent-color:var(--diff); }
.toolbar .labnote { color:var(--txt2); font-size:11px; white-space:nowrap; }
.toolbar .labnote.warn { color:var(--major); }
.marks.diffs { z-index:1; }
.marks.diffs rect.region { fill:rgba(255,92,208,.16); stroke:var(--diff); stroke-width:2; vector-effect:non-scaling-stroke; pointer-events:none; }
.marks.diffs rect.region.cur { fill:rgba(255,92,208,.32); stroke-width:3; }
.marks.diffs rect.dim { fill:rgba(0,0,0,.6); stroke:none; pointer-events:none; }
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
.toolbar .sep { width:1px; height:18px; background:var(--line); }
.toolbar button.tog.on { border-color:var(--open); color:var(--open); box-shadow:0 0 0 1px var(--open) inset; }
.toolbar .annstatus { color:var(--txt2); font-size:11px; }
.toolbar .annstatus.err { color:var(--critical); }
.pane.annotating { cursor:crosshair; }
.pane.annotating .marks rect, .pane.annotating .marks .ann { pointer-events:none; }
.marks.anns { pointer-events:none; }
.marks.anns .ann { pointer-events:all; cursor:pointer; }
.marks.anns circle.ann { stroke-width:2; vector-effect:non-scaling-stroke; fill-opacity:.35; }
.marks.anns rect.ann { fill-opacity:.12; stroke-width:2; vector-effect:non-scaling-stroke; }
.marks.anns .open { stroke:var(--open); fill:var(--open); } .marks.anns .implemented { stroke:var(--implemented); fill:var(--implemented); } .marks.anns .done { stroke:var(--done); fill:var(--done); }
.marks.anns .stale { stroke-dasharray:4 3; }
.marks.anns .sel { stroke-width:4; }
.marks.anns g.lbl.open { color:var(--open); } .marks.anns g.lbl.implemented { color:var(--implemented); } .marks.anns g.lbl.implemented text { fill:#111; } .marks.anns g.lbl.done { color:var(--done); }
.marks.anns rect.band { fill:rgba(143,126,231,.15); stroke:var(--open); stroke-width:1.5; vector-effect:non-scaling-stroke; stroke-dasharray:4 3; }
.num.open { background:var(--open); } .num.implemented { background:var(--implemented); color:#111; } .num.done { background:var(--done); }
.row.ann .msg { white-space:pre-wrap; }
.row.ann.done .msg { color:var(--txt2); text-decoration:line-through; }
.detail textarea { width:100%; min-height:64px; margin:6px 0; padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--bg0); color:var(--txt); font:inherit; resize:vertical; }
.detail .actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.detail .actions button { background:var(--bg1); color:var(--txt); border:1px solid var(--line); border-radius:6px; padding:3px 10px; cursor:pointer; }
.detail .actions button.primary { border-color:var(--acc); color:var(--acc); }
.detail .actions button.danger { border-color:var(--critical); color:var(--critical); }
.detail .status { display:inline-block; padding:0 8px; border-radius:999px; font-weight:600; font-size:11px; color:#fff; }
.detail .status.open { background:var(--open); } .detail .status.implemented { background:var(--implemented); color:#111; } .detail .status.done { background:var(--done); }
/* phone: the page scrolls, the viewer sticks, one side at a time */
@media (max-width: 900px) {
  html, body { height:auto; }
  body { min-height:100vh; min-height:100svh; }
  header { gap:4px 10px; padding:8px 12px; }
  header h1 { font-size:14px; }
  .hdr-more { display:inline-block; }
  header #hdr-meta { display:none; }
  body.hdr-open header #hdr-meta { display:flex; flex-direction:column; gap:4px; width:100%; }
  main { display:flex; flex-direction:column; min-height:0; }
  #viewer { order:-1; display:flex; flex-direction:column; position:sticky; top:0; z-index:6; background:var(--bg1); border-bottom:1px solid var(--line); }
  /* canvas first, its controls directly under it, then the detail panel */
  .panes { order:1; } .toolbar { order:2; } .detail { order:3; }
  .toolbar { gap:8px; padding:6px 8px; flex-wrap:nowrap; overflow-x:auto; }
  .toolbar .hint, .toolbar .sep, .toolbar .tog, #layout-toggle { display:none; }
  .toolbar label, .toolbar button, .toolbar .pct, .toolbar .annstatus { flex:none; white-space:nowrap; }
  /* A collapsed rail is not a reason to keep the canvas small: it grows into
     the room the rail gave back (chrome = header + toolbar + summary bar). */
  .panes { flex:none; height:calc(100vh - 150px); height:calc(100svh - 150px); }
  body.rail-open .panes { height:52vh; height:52svh; }
  body.has-detail .panes { height:38vh; height:38svh; }
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
      align: state.align, showMarks: state.showMarks, showMembers: state.showMembers,
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
  view: { z: 1, tx: 0, ty: 0 }, align: 'anchors', showMarks: true, showMembers: true,
  selected: null, sev: { critical: true, major: true, minor: true }, q: '',
  dprD: 1, dprI: 1, userMoved: false, side: 'design', move: true, single: false,
  // A region of the canvas to work inside (world px). While set, findings whose boxes fall outside
  // it are hidden from the list AND the marks — the way to read one column of a screen without the
  // chrome's findings burying it.
  focus: null, focusLabel: '', focusing: false,
  showTriaged: { ignore: false, snooze: false },
  // The diff lab: where the pixels differ (diff), everything else dimmed (dim),
  // the regions pulsing (strobe), and one superimposition mode over the impl
  // pane (lab: blink | onion | swipe | difference). labAmount drives the two
  // modes that have a degree: onion opacity and the swipe's curtain.
  diff: false, dim: false, strobe: false, lab: 'none', labAmount: 50, diffIndex: -1,
};
// Narrow screens show one side at a time (both panes are laid out side by side
// above the breakpoint, so state.side only matters below it).
const narrow = window.matchMedia('(max-width: 900px)');

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
  $('focus-toggle').classList.toggle('on', on || !!state.focus);
  for (const pane of Object.values(panes)) pane.classList.toggle('focusing', on);
  if (on) setAnnMode(null);
}
function setFocus(rect, persist) {
  state.focus = rect;
  $('focus-toggle').classList.toggle('on', !!rect);
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
function renderFocusChip() {
  const chip = $('focus-chip');
  if (!state.focus) { chip.hidden = true; chip.textContent = ''; return; }
  const r = state.focus;
  chip.hidden = false;
  chip.title = 'region x ' + Math.round(r.x) + ', y ' + Math.round(r.y) + ', ' + Math.round(r.w) + '×' + Math.round(r.h) + ' (impl CSS px) — saved to focus.json / focus.md';
  chip.innerHTML = 'focused · ' + report.findings.filter(visible).length + ' of ' + report.findings.length + ' <b>clear</b>';
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
  $('layout-label').textContent = state.single ? 'Single' : 'Split';
  $('layout-toggle').setAttribute('aria-pressed', state.single ? 'true' : 'false');
  $('layout-toggle').title = state.single ? 'one side at a time — switch to the split screen' : 'split screen — switch to one side at a time';
}
function setLayout(isSingle) {
  state.single = isSingle; applyLayout(); applySide(); saveControls();
  if (state.userMoved) applyView(); else fit();
}
function applySide() {
  for (const side of ['design', 'impl']) panes[side].classList.toggle('active', side === state.side);
  $('side-label').textContent = state.side === 'design' ? 'Design' : 'Impl';
  $('side-switch').title = 'showing the ' + state.side + ' side — switch to the ' + (state.side === 'design' ? 'implementation' : 'design');
}
function setSide(side) {
  if (state.side === side) return;
  state.side = side; applySide(); saveControls();
  if (state.userMoved) applyView(); else fit();
}
// The corner toggle is the phone's whole annotation UI: move ON = pan/zoom,
// move OFF = a tap drops a note and a drag marks a region — the same one
// annotate mode the toolbar button turns on.
function setMove(on) { setAnnMode(on ? null : 'draw', true); saveControls(); }
// Restore the saved controls onto both the state and the DOM that shows them.
function applyControls(saved) {
  // A saved "aligned: false" is the pre-modes preference: it meant "draw the design raw" = top-left 1:1.
  state.align = ALIGN_MODES.includes(saved.align) ? saved.align : (saved.aligned === false ? 'left' : 'anchors');
  state.showMarks = saved.showMarks !== false;
  state.showMembers = saved.showMembers !== false;
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
  state.labAmount = typeof saved.labAmount === 'number' ? saved.labAmount : 50;
  applyAlignMode();
  $('marks').checked = state.showMarks;
  $('members').checked = state.showMembers;
  $('lab-amount').value = state.labAmount;
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
  $('label-design').innerHTML = 'Design <span>' + esc(report.design.ref) + note + '</span>';
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
function applyAlignMode() {
  const a = projection();
  const btn = $('align-mode');
  $('align-label').textContent = ALIGN_LABELS[state.align];
  btn.classList.toggle('measured', state.align === 'anchors');
  btn.classList.toggle('manual', state.align !== 'anchors');
  const run = report.alignment;
  btn.title = 'align: ' + ALIGN_LABELS[state.align] + ' — ' + ALIGN_HINTS[state.align] +
    ' · drawn x' + a.scale.toFixed(3) + ' @(' + Math.round(a.offsetX) + ', ' + Math.round(a.offsetY) + ')' +
    ' · run fit x' + run.scale.toFixed(3) + ' @(' + Math.round(run.offsetX) + ', ' + Math.round(run.offsetY) + ')' +
    ' confidence ' + run.confidence.toFixed(2) + (run.basis ? ' (' + run.basis + ')' : '') +
    ' · press a to cycle';
}
function cycleAlign(step) {
  const i = ALIGN_MODES.indexOf(state.align);
  state.align = ALIGN_MODES[(i + (step || 1) + ALIGN_MODES.length) % ALIGN_MODES.length];
  applyAlignMode(); saveControls(); applyLab();
  if (state.userMoved) applyView(); else fit();
}
function updateRailToggle() {
  $('rail-toggle').setAttribute('aria-expanded', document.body.classList.contains('rail-open') ? 'true' : 'false');
}

function applyView() {
  const v = state.view;
  imgs.design.style.transform = designImageTransform(v, projection(), state.dprD);
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
  const designLayer = designLayerTransform(v, report.alignment, projection());
  layers.design.style.transform = designLayer;
  annLayers.design.style.transform = designLayer;
  diffLayers.design.style.transform = designLayer;
  layers.impl.style.transform = annLayers.impl.style.transform = worldLayerTransform(v);
  diffLayers.impl.style.transform = worldLayerTransform(v);
  for (const c of document.querySelectorAll('.marks.anns circle.ann')) c.setAttribute('r', 7 / v.z);
  for (const g of document.querySelectorAll('.marks g.lbl')) {
    g.setAttribute('transform', 'translate(' + g.dataset.x + ' ' + g.dataset.y + ') scale(' + (1 / v.z) + ')');
  }
  $('zoom-pct').textContent = Math.round(v.z * 100) + '%';
}
function fit() { state.view = fitView(worldBox(), paneSize()); state.userMoved = false; applyView(); }

// ---- header -------------------------------------------------------------
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function renderHeader() {
  const counts = SEV.map((s) => report.findings.filter((f) => f.severity === s).length);
  const inst = report.findings.reduce((n, f) => n + (f.instances || 1), 0);
  const a = report.alignment;
  const d = report.delta;
  const q = report.design.quality;
  const art = report.artifacts;
  $('hdr').innerHTML =
    (page.indexHref ? '<a class="back" href="' + esc(page.indexHref) + '" title="all pairs">‹ All pairs</a>' : '') +
    '<h1>' + esc(report.pair) + '</h1>' +
    '<span class="pill ' + (report.verdict.pass ? 'pass' : 'fail') + '">' + (report.verdict.pass ? 'PASS' : 'FAIL') + ' · threshold ' + esc(report.verdict.failThreshold) + '</span>' +
    '<button type="button" class="hdr-more" id="hdr-more" aria-expanded="false" aria-controls="hdr-meta">details</button>' +
    '<div id="hdr-meta">' +
    '<span class="kv">' + report.findings.length + ' findings (<b class="c">' + counts[0] + ' critical</b>, <b>' + counts[1] + ' major</b>, <b>' + counts[2] + ' minor</b>) covering ' + inst + ' instances · ' + report.suppressed.length + ' suppressed</span>' +
    (d ? '<span class="kv">delta vs ' + esc(d.previousRun) + ': <b>+' + d.introduced.length + '</b> introduced / <b>−' + d.resolved.length + '</b> resolved</span>' : '') +
    '<span class="kv">design <b>' + esc(report.design.source) + '</b> ' + esc(report.design.ref) + ' ' + Math.round(report.design.width) + '×' + Math.round(report.design.height) + (report.design.scope ? ' · scope ' + esc(report.design.scope.mode) : '') + (q ? ' · quality ' + q.score.toFixed(2) : '') + '</span>' +
    '<span class="kv">impl <b>' + esc(report.impl.source) + '</b> ' + esc(report.impl.ref) + ' ' + report.impl.width + '×' + report.impl.height + '</span>' +
    '<span class="kv">alignment ×' + a.scale.toFixed(3) + (a.scaleY && Math.abs(a.scaleY - a.scale) > 1e-6 ? '/' + a.scaleY.toFixed(3) : '') + ' @(' + a.offsetX.toFixed(1) + ', ' + a.offsetY.toFixed(1) + ') confidence ' + a.confidence.toFixed(2) + (a.basis ? ' · fitted on ' + esc(a.basis) : '') + '</span>' +
    '<span class="kv"><a href="' + esc(page.base) + 'findings.json">findings.json</a>' + (art.diffMask ? ' · <a href="' + esc(page.base + art.diffMask) + '">diff mask</a>' : '') + ' · ' + esc(report.createdAt) + '</span>' +
    '</div>' +
    '<button type="button" class="theme-toggle" id="theme-toggle" title="Toggle chrome theme"><span class="msi" aria-hidden="true">light_mode</span></button>';
  applyTheme(currentTheme());
  $('label-design').innerHTML = 'Design <span>' + esc(report.design.ref) + '</span>';
  $('label-impl').innerHTML = 'Implementation <span>' + esc(report.impl.ref) + '</span>';
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
function rect(box, cls, id) {
  const r = document.createElementNS(SVG, 'rect');
  r.setAttribute('x', box.x); r.setAttribute('y', box.y); r.setAttribute('width', Math.max(box.w, 0.5)); r.setAttribute('height', Math.max(box.h, 0.5));
  r.setAttribute('class', cls); r.dataset.id = id;
  return r;
}
function label(box, f, sel) {
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', 'lbl ' + f.severity + (sel ? ' sel' : '')); g.dataset.x = box.x; g.dataset.y = box.y; g.dataset.id = f.id;
  const w = 10 + 7 * String(f.mark).length;
  const bg = document.createElementNS(SVG, 'rect'); bg.setAttribute('x', 0); bg.setAttribute('y', -16); bg.setAttribute('width', w); bg.setAttribute('height', 16); bg.setAttribute('rx', 3);
  const t = document.createElementNS(SVG, 'text'); t.setAttribute('x', w / 2); t.setAttribute('y', -4); t.setAttribute('text-anchor', 'middle'); t.textContent = f.mark;
  g.append(bg, t);
  return g;
}
function renderMarks() {
  for (const side of ['design', 'impl']) {
    const layer = layers[side];
    layer.replaceChildren();
    if (!state.showMarks) continue;
    const key = side === 'design' ? 'designBox' : 'implBox';
    const draw = (f, suppressed) => {
      if (!visible(f) && state.selected !== f.id) return;
      const sel = state.selected === f.id;
      // Per-box, so an aggregate listed for its content instance does not redraw the header ones.
      const primary = boxInFocus(f[key]) ? f[key] : undefined;
      if (primary) {
        layer.append(rect(primary, f.severity + (sel ? ' sel' : '') + (suppressed ? ' suppressed' : ''), f.id));
        layer.append(label(primary, f, sel));
      }
      if (state.showMembers && f.members) {
        f.members.slice(1).forEach((m) => { if (m[key] && boxInFocus(m[key])) layer.append(rect(m[key], f.severity + ' member' + (sel ? ' sel' : ''), f.id)); });
      }
    };
    // Selected LAST: SVG paints in document order, so anything drawn after would cover it.
    report.findings.forEach((f) => { if (state.selected !== f.id) draw(f, false); });
    report.suppressed.forEach((s) => { if (state.selected === s.id) draw(byId.get(s.id), true); });
    const selected = state.selected ? byId.get(state.selected) : null;
    if (selected && !selected.isSuppressed) draw(selected, false);
    layer.classList.toggle('has-sel', !!state.selected);
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
// are the REPORTED ones: Finding.regions from the pixel channel, plus the
// presence findings, which the box-scoped pixel diff structurally cannot see —
// a whole missing illustration is never inside a matched box.
const PRESENCE = new Set(['missing-element', 'extra-element']);
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
    } else if (PRESENCE.has(f.type)) {
      const b = side === 'design' ? (f.designBox || f.implBox) : (f.implBox || f.designBox);
      if (b && boxInFocus(b) && !tooBig(b, world)) out.push({ box: b, id: f.id });
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
      for (const r of regions) {
        const hole = rect(r.box, 'dim-hole', r.id);
        hole.style.fill = '#000';
        mask.append(hole);
      }
      defs.append(mask);
      const sheet = rect({ x: world.x - pad, y: world.y - pad, w: world.w + 2 * pad, h: world.h + 2 * pad }, 'dim', '');
      sheet.setAttribute('mask', 'url(#' + maskId + ')');
      layer.append(defs, sheet);
    }
    regions.forEach((r, i) => {
      layer.append(rect(r.box, 'region' + (i === state.diffIndex ? ' cur' : ''), r.id));
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
    note.className = 'labnote warn';
    note.textContent = 'design stretched ' + (stretch > 1 ? '+' : '') + Math.round((stretch - 1) * 100) + '% vertically to superimpose';
    return;
  }
  note.className = 'labnote';
  if (!state.diff) { note.textContent = ''; return; }
  const n = diffRegions('impl').length;
  note.textContent = state.diffIndex >= 0 && n
    ? 'diff region ' + (state.diffIndex + 1) + ' of ' + n
    : n + (n === 1 ? ' diff region' : ' diff regions');
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
  state.view = focusView(box, paneSize(), state.view, 1);
  state.userMoved = true;
  renderDiffs(); applyView();
}
// ---- superimposition modes ----------------------------------------------
let blinkTimer = null;
function setLab(mode) {
  state.lab = mode;
  $('lab-mode').value = mode;
  $('lab-amount').hidden = !(mode === 'onion' || mode === 'swipe');
  // Only the impl pane carries the ghost, so a phone (or a chosen single view)
  // showing the design side would put the controls on a pane that cannot react.
  if (mode !== 'none' && single() && state.side !== 'impl') setSide('impl');
  saveControls(); applyLab();
}
function applyLab() {
  clearInterval(blinkTimer); blinkTimer = null;
  const ghost = imgs.ghost;
  const wrap = $('ghost-wrap');
  ghost.classList.toggle('difference', state.lab === 'difference');
  wrap.style.width = '100%';
  if (state.lab === 'none') { ghost.style.opacity = 0; }
  else if (state.lab === 'onion') { ghost.style.opacity = state.labAmount / 100; }
  else if (state.lab === 'difference') { ghost.style.opacity = 1; }
  else if (state.lab === 'swipe') { ghost.style.opacity = 1; wrap.style.width = state.labAmount + '%'; }
  else if (state.lab === 'blink') {
    // The blink comparator: the eye is far better at spotting a thing that
    // MOVES between two frames than a thing that is slightly wrong in one.
    let on = true;
    ghost.style.opacity = 1;
    blinkTimer = setInterval(() => { on = !on; ghost.style.opacity = on ? 1 : 0; }, 620);
  }
  renderLabNote();
  applyView();
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
  if (focus && box) { state.view = focusView(box, paneSize(), state.view); state.userMoved = true; applyView(); }
  const row = document.querySelector('.row.sel'); if (row) row.scrollIntoView({ block: 'nearest' });
}

// ---- interaction --------------------------------------------------------
function wire() {
  for (const pane of Object.values(panes)) {
    pane.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = pane.getBoundingClientRect();
      state.view = zoomAt(state.view, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
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
      if (e.target.closest && (e.target.closest('rect[data-id]') || e.target.closest('.ann[data-ann]'))) return;
      pane.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pane.classList.add('dragging'); last = null;
    });
    pane.addEventListener('pointermove', (e) => {
      if (focusDrag && focusDrag.pointerId === e.pointerId) { focusEditMove(pane, e); return; }
      if (focusBand && focusBand.pointerId === e.pointerId) { focusPointerMove(pane, e); return; }
      if (ann.band && ann.band.pointerId === e.pointerId) { annPointerMove(pane, e); return; }
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { state.view = panBy(state.view, e.clientX - prev.x, e.clientY - prev.y); }
      else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y); const r = pane.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
        if (last) { state.view = zoomAt(state.view, dist / last.dist, mid.x, mid.y); state.view = panBy(state.view, mid.x - last.mid.x, mid.y - last.mid.y); }
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
      const a = e.target.closest && e.target.closest('.ann[data-ann]'); if (a) { selectAnn(a.dataset.ann, false); return; }
      const r = e.target.closest && e.target.closest('rect[data-id]'); if (r) select(r.dataset.id, false);
    });
  }
  $('side-switch').addEventListener('click', () => setSide(state.side === 'design' ? 'impl' : 'design'));
  $('layout-toggle').addEventListener('click', () => setLayout(!state.single));
  $('move-toggle').addEventListener('click', () => setMove(!state.move));
  $('focus-toggle').addEventListener('click', () => {
    if (state.focus) { setFocus(null); setFocusing(false); return; }  // second press clears
    setFocusing(!state.focusing);
  });
  $('focus-chip').addEventListener('click', () => { setFocus(null); setFocusing(false); });
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
  $('hdr').addEventListener('click', (e) => {
    const b = e.target.closest('#hdr-more'); if (!b) return;
    b.setAttribute('aria-expanded', document.body.classList.toggle('hdr-open') ? 'true' : 'false');
  });
  narrow.addEventListener('change', () => { applyLayout(); applySide(); if (state.userMoved) applyView(); else fit(); });
  $('ann-draw').addEventListener('click', () => setAnnMode(ann.mode ? null : 'draw'));
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
  $('zoom-in').addEventListener('click', () => { const p = paneSize(); state.view = zoomAt(state.view, 1.25, p.w / 2, p.h / 2); state.userMoved = true; applyView(); });
  $('zoom-out').addEventListener('click', () => { const p = paneSize(); state.view = zoomAt(state.view, 0.8, p.w / 2, p.h / 2); state.userMoved = true; applyView(); });
  $('fit').addEventListener('click', fit);
  $('align-mode').addEventListener('click', (e) => cycleAlign(e.shiftKey ? -1 : 1));
  $('marks').addEventListener('change', (e) => { state.showMarks = e.target.checked; saveControls(); renderMarks(); });
  $('members').addEventListener('change', (e) => { state.showMembers = e.target.checked; saveControls(); renderMarks(); });
  $('diff-toggle').addEventListener('click', () => setDiff(!state.diff));
  $('dim-toggle').addEventListener('click', () => setDim(!state.dim));
  $('strobe-toggle').addEventListener('click', () => setStrobe(!state.strobe));
  $('lab-mode').addEventListener('change', (e) => setLab(e.target.value));
  $('lab-amount').addEventListener('input', (e) => { state.labAmount = Number(e.target.value); saveControls(); applyLab(); });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Escape') { e.target.blur(); } return; }
    const p = paneSize();
    if (e.key === '+' || e.key === '=') { state.view = zoomAt(state.view, 1.25, p.w / 2, p.h / 2); state.userMoved = true; applyView(); }
    else if (e.key === '-') { state.view = zoomAt(state.view, 0.8, p.w / 2, p.h / 2); state.userMoved = true; applyView(); }
    else if (e.key === '0') fit();
    else if (e.key === 'n' || e.key === 'r') setAnnMode(ann.mode ? null : 'draw');
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
      if (state.lab !== 'none') setLab('none');
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
  $('ann-draw').classList.toggle('on', !!mode);
  for (const pane of Object.values(panes)) pane.classList.toggle('annotating', !!mode);
  document.body.classList.toggle('ann-mode', !!mode);
  $('move-toggle').setAttribute('aria-pressed', mode ? 'false' : 'true');
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
  const p = screenToWorld(state.view, e.clientX - r.left, e.clientY - r.top);
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
  if (focus && a) { state.view = focusView(shapeBox(a.shape).w ? shapeBox(a.shape) : { x: a.shape.x - 20, y: a.shape.y - 20, w: 40, h: 40 }, paneSize(), state.view); state.userMoved = true; applyView(); }
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
function annLabel(x, y, n, status, id) {
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', 'lbl ann ' + status); g.dataset.x = x; g.dataset.y = y; g.dataset.ann = id;
  const w = 10 + 7 * String(n).length;
  const bg = document.createElementNS(SVG, 'rect'); bg.setAttribute('x', 0); bg.setAttribute('y', -16); bg.setAttribute('width', w); bg.setAttribute('height', 16); bg.setAttribute('rx', 3);
  const t = document.createElementNS(SVG, 'text'); t.setAttribute('x', w / 2); t.setAttribute('y', -4); t.setAttribute('text-anchor', 'middle'); t.textContent = n;
  g.append(bg, t);
  return g;
}
function renderAnnMarks() {
  for (const side of ['design', 'impl']) {
    const layer = annLayers[side];
    layer.replaceChildren();
    ann.set.annotations.forEach((a, i) => {
      if (a.side !== side) return;
      const cls = 'ann ' + a.status + (a.stale ? ' stale' : '') + (ann.selected === a.id ? ' sel' : '');
      if (a.shape.kind === 'rect') {
        const r = document.createElementNS(SVG, 'rect');
        r.setAttribute('x', a.shape.x); r.setAttribute('y', a.shape.y); r.setAttribute('width', Math.max(a.shape.w, 0.5)); r.setAttribute('height', Math.max(a.shape.h, 0.5));
        r.setAttribute('class', cls); r.dataset.ann = a.id; layer.append(r);
        layer.append(annLabel(a.shape.x, a.shape.y, i + 1, a.status, a.id));
      } else {
        const c = document.createElementNS(SVG, 'circle');
        c.setAttribute('cx', a.shape.x); c.setAttribute('cy', a.shape.y); c.setAttribute('r', 7 / state.view.z);
        c.setAttribute('class', cls); c.dataset.ann = a.id; layer.append(c);
        layer.append(annLabel(a.shape.x + 9 / state.view.z, a.shape.y - 9 / state.view.z, i + 1, a.status, a.id));
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
  state.diffIndex = -1;
  document.body.classList.remove('has-detail', 'ann-mode', 'hdr-open');
  $('q').value = '';
  applyControls(readControls());
  document.title = report.pair + ' — refdiff';
  renderHeader(); renderList(); renderDetail(); renderAnnList();
  if (!wired) { wire(); wired = true; }
  applyLayout(); applySide(); updateRailToggle(); applyAspect(); setFocusing(false); renderFocusChip(); renderFocusBand();
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
