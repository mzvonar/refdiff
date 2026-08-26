/**
 * Pure renderer: ComparisonReport → self-contained report.html.
 *
 * The page shows the FULL design and the FULL implementation side by side
 * (split screen) with one shared pan/zoom, the design pane projected through
 * the run's `Alignment` so the same UI lands at the same place on both
 * sides. Findings are listed and drawn as numbered marks on both panes;
 * suppressed findings and the delta stay visible. The crops and the
 * set-of-marks overlay remain the model's view — a person compares whole
 * frames, which is why every adapter stores the full PNGs.
 *
 * The HTML references the run directory's artifacts by relative path
 * (design.png, impl.png, crops/…), so it must be written INTO the run dir
 * (or served from it). No network, no dependencies: the view math is the
 * compiled `view-math.js` embedded verbatim into an inline module script.
 */

import type { ComparisonReport } from "@visual-compare/core";

export interface RenderOptions {
  /** Compiled source of view-math.js (an ESM module with no imports). */
  viewMathSource: string;
  /** Page title; default "<pair> — visual-compare". */
  title?: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** JSON safe to embed in a <script> block: `<` never appears literally. */
export const embedJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderReport(report: ComparisonReport, options: RenderOptions): string {
  const title = options.title ?? `${report.pair} — visual-compare`;
  if (options.viewMathSource.includes("</script")) {
    throw new Error("viewMathSource must not contain a closing script tag");
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header id="hdr"></header>
<main>
  <aside id="side">
    <div class="filters">
      <input id="q" type="search" placeholder="filter findings…" aria-label="filter findings">
      <div class="chips" id="sev-chips"></div>
    </div>
    <div id="count" class="count"></div>
    <ol id="list" class="list"></ol>
    <details id="suppressed-box"><summary id="suppressed-summary"></summary><ol id="suppressed" class="list"></ol></details>
  </aside>
  <section id="viewer">
    <div class="toolbar">
      <button id="zoom-out" title="zoom out (−)">−</button>
      <span id="zoom-pct" class="pct">100%</span>
      <button id="zoom-in" title="zoom in (+)">+</button>
      <button id="fit" title="fit both (0)">Fit</button>
      <label><input type="checkbox" id="aligned" checked> align design through Alignment</label>
      <label><input type="checkbox" id="marks" checked> marks</label>
      <label><input type="checkbox" id="members" checked> all instances</label>
      <span class="hint">wheel = zoom · drag = pan · j/k = next/prev · Esc = deselect</span>
    </div>
    <div class="panes" id="panes">
      <div class="pane" id="pane-design" data-side="design">
        <div class="pane-label" id="label-design"></div>
        <div class="stage"><img class="shot" id="img-design" alt="design"><svg class="marks" id="marks-design"></svg></div>
      </div>
      <div class="pane" id="pane-impl" data-side="impl">
        <div class="pane-label" id="label-impl"></div>
        <div class="stage"><img class="shot" id="img-impl" alt="implementation"><svg class="marks" id="marks-impl"></svg></div>
      </div>
    </div>
    <div id="detail" class="detail"></div>
  </section>
</main>
<script type="application/json" id="report-data">${embedJson(report)}</script>
<script type="module">
${options.viewMathSource}
${CLIENT}
</script>
</body>
</html>
`;
}

const CSS = `
:root { --bg:#0b1020; --panel:#111a2e; --line:#243047; --ink:#e6ecf5; --muted:#8b98ad; --accent:#60a5fa;
  --critical:#e11d48; --major:#f59e0b; --minor:#3b82f6; --ok:#22c55e; }
* { box-sizing:border-box; }
html,body { margin:0; height:100%; background:var(--bg); color:var(--ink);
  font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
body { display:flex; flex-direction:column; }
header { display:flex; flex-wrap:wrap; gap:6px 18px; align-items:center; padding:8px 14px;
  border-bottom:1px solid var(--line); background:var(--panel); }
header h1 { font-size:15px; margin:0; }
header .kv { color:var(--muted); }
header .kv b { color:var(--ink); font-weight:500; }
header a { color:var(--accent); text-decoration:none; }
.pill { display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; }
.pill.pass { background:var(--ok); color:#052e16; } .pill.fail { background:var(--critical); color:#fff; }
main { flex:1; display:grid; grid-template-columns:340px 1fr; min-height:0; }
aside { border-right:1px solid var(--line); display:flex; flex-direction:column; min-height:0; background:var(--panel); }
.filters { padding:8px; display:flex; flex-direction:column; gap:6px; border-bottom:1px solid var(--line); }
.filters input { width:100%; padding:6px 8px; border-radius:6px; border:1px solid var(--line); background:var(--bg); color:var(--ink); }
.chips { display:flex; gap:6px; }
.chip { cursor:pointer; padding:2px 8px; border-radius:999px; border:1px solid var(--line); color:var(--muted); user-select:none; }
.chip.on { color:var(--ink); border-color:currentColor; }
.chip.critical.on { color:var(--critical); } .chip.major.on { color:var(--major); } .chip.minor.on { color:var(--minor); }
.count { padding:4px 10px; color:var(--muted); font-size:12px; }
.list { list-style:none; margin:0; padding:0; overflow:auto; flex:1; min-height:0; }
.row { display:grid; grid-template-columns:34px 1fr; gap:6px; padding:6px 10px; border-bottom:1px solid var(--line); cursor:pointer; }
.row:hover { background:rgba(255,255,255,.04); } .row.sel { background:rgba(96,165,250,.16); }
.row .num { font-weight:700; text-align:center; border-radius:6px; color:#fff; padding:1px 0; align-self:start; font-size:12px; }
.num.critical,.sev.critical { background:var(--critical); } .num.major,.sev.major { background:var(--major); color:#111; } .num.minor,.sev.minor { background:var(--minor); }
.row .msg { color:var(--ink); }
.row .meta { color:var(--muted); font-size:11px; }
.row .tag { display:inline-block; padding:0 5px; border:1px solid var(--line); border-radius:4px; margin-right:4px; }
details { border-top:1px solid var(--line); max-height:40%; display:flex; flex-direction:column; }
details summary { padding:6px 10px; color:var(--muted); cursor:pointer; }
details[open] .list { max-height:30vh; }
#viewer { display:flex; flex-direction:column; min-height:0; min-width:0; }
.toolbar { display:flex; gap:10px; align-items:center; padding:6px 10px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.toolbar button { background:var(--panel); color:var(--ink); border:1px solid var(--line); border-radius:6px; padding:3px 10px; cursor:pointer; }
.toolbar label { color:var(--muted); display:flex; gap:4px; align-items:center; }
.toolbar .pct { min-width:48px; text-align:center; }
.toolbar .hint { margin-left:auto; color:var(--muted); font-size:11px; }
.panes { flex:1; display:flex; min-height:0; }
.pane { flex:1; position:relative; overflow:hidden; min-width:0; touch-action:none; cursor:grab;
  background-color:#1a2338;
  background-image:linear-gradient(45deg,#1f2a42 25%,transparent 25%,transparent 75%,#1f2a42 75%),linear-gradient(45deg,#1f2a42 25%,transparent 25%,transparent 75%,#1f2a42 75%);
  background-size:16px 16px; background-position:0 0,8px 8px; }
.pane + .pane { border-left:1px solid var(--line); }
.pane.dragging { cursor:grabbing; }
.pane-label { position:absolute; z-index:2; top:6px; left:8px; padding:2px 8px; border-radius:6px; background:rgba(11,16,32,.85);
  color:var(--ink); font-size:12px; pointer-events:none; }
.pane-label span { color:var(--muted); }
.stage { position:absolute; inset:0; }
.shot { position:absolute; left:0; top:0; transform-origin:0 0; image-rendering:auto; user-select:none; -webkit-user-drag:none; pointer-events:none; }
.marks { position:absolute; left:0; top:0; width:1px; height:1px; overflow:visible; transform-origin:0 0; pointer-events:none; }
.marks rect { fill:none; stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:all; cursor:pointer; }
.marks rect.critical { stroke:var(--critical); } .marks rect.major { stroke:var(--major); } .marks rect.minor { stroke:var(--minor); }
.marks rect.member { stroke-dasharray:3 3; opacity:.7; }
.marks rect.sel { stroke-width:3; fill:rgba(96,165,250,.14); }
.marks rect.suppressed { stroke:var(--muted); stroke-dasharray:2 3; }
.marks g.lbl rect { fill:currentColor; stroke:none; } .marks g.lbl text { fill:#fff; font:700 11px system-ui,sans-serif; }
.marks g.lbl.critical { color:var(--critical); } .marks g.lbl.major { color:var(--major); } .marks g.lbl.major text { fill:#111; } .marks g.lbl.minor { color:var(--minor); }
.detail { border-top:1px solid var(--line); padding:8px 12px; max-height:34%; overflow:auto; background:var(--panel); }
.detail:empty { display:none; }
.detail h2 { margin:0 0 4px; font-size:13px; }
.detail table { border-collapse:collapse; margin:6px 0; }
.detail td,.detail th { border:1px solid var(--line); padding:2px 8px; text-align:left; font-weight:500; }
.detail th { color:var(--muted); }
.detail .crops { display:flex; gap:12px; flex-wrap:wrap; }
.detail .crops figure { margin:0; } .detail .crops img { max-height:160px; max-width:45vw; border:1px solid var(--line); background:#fff; }
.detail figcaption { color:var(--muted); font-size:11px; }
@media (max-width: 900px) { main { grid-template-columns:1fr; grid-template-rows:38vh 1fr; } aside { border-right:0; border-bottom:1px solid var(--line); }
  .panes { flex-direction:column; } .pane + .pane { border-left:0; border-top:1px solid var(--line); } }
`;

// The client. Plain JS, kept free of template literals so it can live inside
// this TypeScript template string. It shares the module scope with the
// embedded view-math.js (fitView, zoomAt, designImageTransform, …).
const CLIENT = String.raw`
const report = JSON.parse(document.getElementById('report-data').textContent);
const $ = (id) => document.getElementById(id);
const SEV = ['critical', 'major', 'minor'];
const state = {
  view: { z: 1, tx: 0, ty: 0 }, aligned: true, showMarks: true, showMembers: true,
  selected: null, sev: { critical: true, major: true, minor: true }, q: '',
  dprD: 1, dprI: 1, userMoved: false,
};
const panes = { design: $('pane-design'), impl: $('pane-impl') };
const imgs = { design: $('img-design'), impl: $('img-impl') };
const layers = { design: $('marks-design'), impl: $('marks-impl') };
const all = report.findings.concat(report.suppressed.map((s) => Object.assign({ isSuppressed: true }, s)));
const byId = new Map(all.map((f) => [f.id, f]));

function alignment() { return state.aligned ? report.alignment : IDENTITY_ALIGNMENT; }
function worldBox() {
  return unionBoxes([
    { x: 0, y: 0, w: report.impl.width, h: report.impl.height },
    designWorldBox({ w: report.design.width, h: report.design.height }, alignment()),
  ]);
}
function paneSize() { const r = panes.impl.getBoundingClientRect(); return { w: r.width, h: r.height }; }

function applyView() {
  const v = state.view;
  imgs.design.style.transform = designImageTransform(v, alignment(), state.dprD);
  imgs.impl.style.transform = implImageTransform(v, state.dprI);
  layers.design.style.transform = layers.impl.style.transform = worldLayerTransform(v);
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
    '<h1>' + esc(report.pair) + '</h1>' +
    '<span class="pill ' + (report.verdict.pass ? 'pass' : 'fail') + '">' + (report.verdict.pass ? 'PASS' : 'FAIL') + ' · threshold ' + esc(report.verdict.failThreshold) + '</span>' +
    '<span class="kv">' + report.findings.length + ' findings (<b class="c">' + counts[0] + ' critical</b>, <b>' + counts[1] + ' major</b>, <b>' + counts[2] + ' minor</b>) covering ' + inst + ' instances · ' + report.suppressed.length + ' suppressed</span>' +
    (d ? '<span class="kv">delta vs ' + esc(d.previousRun) + ': <b>+' + d.introduced.length + '</b> introduced / <b>−' + d.resolved.length + '</b> resolved</span>' : '') +
    '<span class="kv">design <b>' + esc(report.design.source) + '</b> ' + esc(report.design.ref) + ' ' + Math.round(report.design.width) + '×' + Math.round(report.design.height) + (report.design.scope ? ' · scope ' + esc(report.design.scope.mode) : '') + (q ? ' · quality ' + q.score.toFixed(2) : '') + '</span>' +
    '<span class="kv">impl <b>' + esc(report.impl.source) + '</b> ' + esc(report.impl.ref) + ' ' + report.impl.width + '×' + report.impl.height + '</span>' +
    '<span class="kv">alignment ×' + a.scale.toFixed(3) + (a.scaleY && Math.abs(a.scaleY - a.scale) > 1e-6 ? '/' + a.scaleY.toFixed(3) : '') + ' @(' + a.offsetX.toFixed(1) + ', ' + a.offsetY.toFixed(1) + ') confidence ' + a.confidence.toFixed(2) + '</span>' +
    '<span class="kv"><a href="findings.json">findings.json</a> · <a href="' + esc(art.overlay) + '">overlay</a>' + (art.diffMask ? ' · <a href="' + esc(art.diffMask) + '">diff mask</a>' : '') + ' · ' + esc(report.createdAt) + '</span>';
  $('label-design').innerHTML = 'Design <span>' + esc(report.design.ref) + '</span>';
  $('label-impl').innerHTML = 'Implementation <span>' + esc(report.impl.ref) + '</span>';
}

// ---- list ---------------------------------------------------------------
function visible(f) {
  if (!state.sev[f.severity]) return false;
  if (state.q && !(f.message + ' ' + f.type + ' ' + (f.role || '')).toLowerCase().includes(state.q)) return false;
  return true;
}
function rowHtml(f) {
  const n = f.instances && f.instances > 1 ? '×' + f.instances : '';
  return '<li class="row' + (state.selected === f.id ? ' sel' : '') + '" data-id="' + f.id + '">' +
    '<span class="num ' + f.severity + '">' + f.mark + '</span>' +
    '<span><div class="msg">' + esc(f.message) + '</div><div class="meta"><span class="tag">' + esc(f.type) + '</span>' +
    (f.role ? '<span class="tag">' + esc(f.role) + '</span>' : '') + (n ? '<span class="tag">' + n + '</span>' : '') +
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
  $('sev-chips').innerHTML = SEV.map((s) => '<span class="chip ' + s + (state.sev[s] ? ' on' : '') + '" data-sev="' + s + '">' + s + '</span>').join('');
}

// ---- marks --------------------------------------------------------------
const SVG = 'http://www.w3.org/2000/svg';
function rect(box, cls, id) {
  const r = document.createElementNS(SVG, 'rect');
  r.setAttribute('x', box.x); r.setAttribute('y', box.y); r.setAttribute('width', Math.max(box.w, 0.5)); r.setAttribute('height', Math.max(box.h, 0.5));
  r.setAttribute('class', cls); r.dataset.id = id;
  return r;
}
function label(box, f) {
  const g = document.createElementNS(SVG, 'g');
  g.setAttribute('class', 'lbl ' + f.severity); g.dataset.x = box.x; g.dataset.y = box.y; g.dataset.id = f.id;
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
      const primary = f[key];
      if (primary) {
        layer.append(rect(primary, f.severity + (sel ? ' sel' : '') + (suppressed ? ' suppressed' : ''), f.id));
        layer.append(label(primary, f));
      }
      if (state.showMembers && f.members) {
        f.members.slice(1).forEach((m) => { if (m[key]) layer.append(rect(m[key], f.severity + ' member' + (sel ? ' sel' : ''), f.id)); });
      }
    };
    report.findings.forEach((f) => draw(f, false));
    report.suppressed.forEach((s) => { if (state.selected === s.id) draw(byId.get(s.id), true); });
  }
  applyView();
}

// ---- detail -------------------------------------------------------------
function kv(obj) { return obj ? Object.entries(obj).map(([k, v]) => k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ') : '—'; }
function renderDetail() {
  const f = state.selected ? byId.get(state.selected) : null;
  if (!f) { $('detail').innerHTML = ''; return; }
  const keys = Array.from(new Set(Object.keys(f.expected || {}).concat(Object.keys(f.actual || {}))));
  const table = keys.length ? '<table><tr><th></th><th>design (expected)</th><th>impl (actual)</th></tr>' +
    keys.map((k) => '<tr><th>' + esc(k) + '</th><td>' + esc(kv({ [k]: (f.expected || {})[k] }).replace(k + ': ', '')) + '</td><td>' + esc(kv({ [k]: (f.actual || {})[k] }).replace(k + ': ', '')) + '</td></tr>').join('') + '</table>' : '';
  const box = (b) => b ? Math.round(b.x) + ',' + Math.round(b.y) + ' ' + Math.round(b.w) + '×' + Math.round(b.h) : '—';
  $('detail').innerHTML =
    '<h2><span class="num ' + f.severity + '" style="padding:0 6px;border-radius:5px">' + f.mark + '</span> ' + esc(f.message) + '</h2>' +
    '<div class="meta"><span class="tag">' + esc(f.type) + '</span> <span class="tag">' + esc(f.severity) + '</span>' + (f.role ? ' <span class="tag">' + esc(f.role) + '</span>' : '') +
    (f.instances ? ' <span class="tag">×' + f.instances + ' instances</span>' : '') + (f.isSuppressed ? ' <span class="tag">suppressed by ' + esc(f.suppressedBy) + ': ' + esc(f.rule) + '</span>' : '') +
    ' · design box ' + box(f.designBox) + ' · impl box ' + box(f.implBox) + ' (impl CSS px)</div>' + table +
    (f.crops ? '<div class="crops"><figure><img src="' + esc(f.crops.design) + '" alt=""><figcaption>design crop</figcaption></figure><figure><img src="' + esc(f.crops.impl) + '" alt=""><figcaption>impl crop</figcaption></figure></div>' : '');
}

function select(id, focus) {
  state.selected = id;
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
      if (e.target.closest && e.target.closest('rect[data-id]')) return;
      pane.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pane.classList.add('dragging'); last = null;
    });
    pane.addEventListener('pointermove', (e) => {
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
    const up = (e) => { pointers.delete(e.pointerId); if (!pointers.size) pane.classList.remove('dragging'); last = null; };
    pane.addEventListener('pointerup', up); pane.addEventListener('pointercancel', up);
    pane.addEventListener('dblclick', fit);
    pane.addEventListener('click', (e) => { const r = e.target.closest && e.target.closest('rect[data-id]'); if (r) select(r.dataset.id, false); });
  }
  $('list').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) select(row.dataset.id === state.selected ? null : row.dataset.id, true); });
  $('suppressed').addEventListener('click', (e) => { const row = e.target.closest('.row'); if (row) select(row.dataset.id === state.selected ? null : row.dataset.id, true); });
  $('sev-chips').addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (!c) return; state.sev[c.dataset.sev] = !state.sev[c.dataset.sev]; renderList(); renderMarks(); });
  $('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderList(); renderMarks(); });
  $('zoom-in').addEventListener('click', () => { const p = paneSize(); state.view = zoomAt(state.view, 1.25, p.w / 2, p.h / 2); state.userMoved = true; applyView(); });
  $('zoom-out').addEventListener('click', () => { const p = paneSize(); state.view = zoomAt(state.view, 0.8, p.w / 2, p.h / 2); state.userMoved = true; applyView(); });
  $('fit').addEventListener('click', fit);
  $('aligned').addEventListener('change', (e) => { state.aligned = e.target.checked; if (state.userMoved) applyView(); else fit(); });
  $('marks').addEventListener('change', (e) => { state.showMarks = e.target.checked; renderMarks(); });
  $('members').addEventListener('change', (e) => { state.showMembers = e.target.checked; renderMarks(); });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const p = paneSize();
    if (e.key === '+' || e.key === '=') { state.view = zoomAt(state.view, 1.25, p.w / 2, p.h / 2); state.userMoved = true; applyView(); }
    else if (e.key === '-') { state.view = zoomAt(state.view, 0.8, p.w / 2, p.h / 2); state.userMoved = true; applyView(); }
    else if (e.key === '0') fit();
    else if (e.key === 'Escape') select(null, false);
    else if (e.key === 'j' || e.key === 'k') {
      const kept = report.findings.filter(visible); if (!kept.length) return;
      const i = kept.findIndex((f) => f.id === state.selected);
      const next = kept[(i + (e.key === 'j' ? 1 : -1) + kept.length) % kept.length];
      select(next.id, true);
    }
  });
  new ResizeObserver(() => { if (!state.userMoved) fit(); else applyView(); }).observe(panes.impl);
}

// ---- boot ---------------------------------------------------------------
function loadImage(img, src) {
  return new Promise((resolve) => { img.addEventListener('load', () => resolve(true), { once: true }); img.addEventListener('error', () => resolve(false), { once: true }); img.src = src; });
}
renderHeader(); renderList(); renderDetail(); wire();
Promise.all([loadImage(imgs.design, report.artifacts.designPng), loadImage(imgs.impl, report.artifacts.implPng)]).then(([okD, okI]) => {
  // DPR = PNG native px / CSS px the capture reported; a missing image keeps 1.
  if (okD) state.dprD = imgs.design.naturalWidth / report.design.width;
  if (okI) state.dprI = imgs.impl.naturalWidth / report.impl.width;
  if (!okD) $('label-design').textContent += ' — image missing';
  if (!okI) $('label-impl').textContent += ' — image missing';
  renderMarks(); fit();
});
`;
