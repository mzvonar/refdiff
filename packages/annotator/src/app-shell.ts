/**
 * The served app: ONE page for the whole out root.
 *
 * The annotator used to be a static-site generator — every start re-rendered a
 * self-contained report.html into each of N run dirs (41 files, 5.1 MB, for
 * uctoinak's set), which meant the app's own code was baked into every artifact
 * and went stale the moment the annotator changed. The shell instead ships the
 * markup once and loads DATA at runtime: `/api/pairs` for the list,
 * `<pair>/findings.json` + `<pair>/api/annotations` for a pair, routed by hash.
 *
 * Emitting the static files is still available (`--emit`) for reading a report
 * off disk with no server; that path keeps using renderReport.
 */

import { CLIENT, CSS, REPORT_BODY, VIEWPORT_META } from "./render.js"

export interface AppShellOptions {
  /** Compiled source of view-math.js (an ESM module with no imports). */
  viewMathSource: string
  /** Compiled source of annotations.js (an ESM module with no imports). */
  annotationsSource: string
  /** Compiled source of index-view.js (an ESM module with no imports). */
  indexViewSource: string
  /** Compiled source of gallery-view.js (an ESM module with no imports). */
  galleryViewSource: string
  /** Compiled source of triage.js (an ESM module with no imports). */
  triageSource: string
  /** Compiled source of focus.js (an ESM module with no imports). */
  focusSource: string
  /** Compiled source of rail.js (an ESM module with no imports). */
  railSource: string
  /**
   * Which out root is being served. Not shown in the chrome (the comp's
   * Library topbar is brand only, gap 8) — it is what the list-load error
   * state names, and what the restart command it offers to copy points at.
   */
  root?: string
  title?: string
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  )

export function renderAppShell(options: AppShellOptions): string {
  for (const source of [
    options.viewMathSource,
    options.annotationsSource,
    options.indexViewSource,
    options.galleryViewSource,
    options.triageSource,
    options.focusSource,
    options.railSource,
  ]) {
    if (source.includes("</script")) {
      throw new Error("embedded module sources must not contain a closing script tag")
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${VIEWPORT_META}
<title>${escapeHtml(options.title ?? "refdiff")}</title>
<style>${CSS}${INDEX_CSS}</style>
</head>
<body class="route-index">
<section id="view-index" data-root="${escapeHtml(options.root ?? "")}">
  <header class="lib-top">
    <span class="brand" aria-hidden="true"></span>
    <span class="brand-name">RefDiff</span>
    <span class="spacer"></span>
    <button type="button" class="theme-toggle" id="index-theme-toggle" title="Toggle chrome theme"><span class="msi" aria-hidden="true">light_mode</span></button>
  </header>
  <div class="lib">
    <div class="lib-head">
      <h1>Library</h1>
      <span class="lib-count" id="lib-count"></span>
    </div>
    <div class="lib-error" id="lib-error" hidden></div>
    <div class="lib-filters" id="lib-filters">
      <label class="search"><span class="msi" aria-hidden="true">search</span><input id="pair-q" type="search" placeholder="Search comparisons…" aria-label="Search comparisons" autocomplete="off"></label>
      <div class="chips-group" id="src-chips"></div>
      <span class="vsep" aria-hidden="true"></span>
      <div class="chips-group" id="state-chips"></div>
    </div>
    <div id="lib-fx"></div>
    <div class="cards" id="cards"></div>
    <p class="lib-empty" id="index-empty" hidden></p>
  </div>
</section>
<section id="view-gallery">
  <header class="lib-top">
    <a class="back" href="#/" title="Back to the Library"><span class="msi" aria-hidden="true">arrow_back</span></a>
    <span class="brand-name" id="gal-name"></span>
    <span class="spacer"></span>
    <span class="gal-count" id="gal-count"></span>
  </header>
  <div class="gal-body" id="gal-body"></div>
</section>
<section id="view-report">
${REPORT_BODY}
</section>
<script type="module">
${options.viewMathSource}
${options.annotationsSource}
${options.indexViewSource}
${options.galleryViewSource}
${options.triageSource}
${options.focusSource}
${options.railSource}
${CLIENT}
${APP_BOOT}
</script>
</body>
</html>
`
}

/**
 * Router + Library view. The report half is CLIENT, shared verbatim with an
 * emitted report.html; all this adds is "which pair, and where is its data",
 * plus the Library's own state: the filter, the layout, and the typed
 * list-load error with its auto-retry.
 */
const APP_BOOT = String.raw`
let pairs = [];
let currentPair = null;
let currentSet = null;
// From /api/pairs: a --read-only server refuses every PUT, and the report's rail says so up front.
let serverReadOnly = false;
const MOBILE_BREAKPOINT = 640;
const RETRY_SECS = 30;
// Library state. The filter survives opening a pair and coming back; the
// layout follows the width alone (the comp's computer/smartphone button is
// its DESIGN-PREVIEW switch, not a product control — the app has none).
// lib.opened / lib.closed are what the reader expanded and collapsed BY HAND;
// openGroups() reads them over the default (all collapsed, everything that
// survives an active filter expanded), so a hand toggle survives a re-render
// and a filter change without either overriding the other. (No backticks in
// here: this whole boot script is a template literal and one would close it.)
const lib = { filter: Object.assign({}, DEFAULT_FILTER), narrow: false, error: null, retries: 0, secs: RETRY_SECS, timer: null, copyTimer: null, opened: new Set(), closed: new Set(), more: new Set(), names: new Map() };
// Which set indexes have been asked for. A group's variant props come from
// <entryId>.set.json (/api/pairs carries none), so the fetch is LAZY: only a
// group the reader has opened needs them, and 14 eager fetches on the DS root
// would pay for 14 sheets to draw one. Recorded on ATTEMPT, not on success —
// a root with no set index must not re-fetch on every re-render.
const setNamesAsked = new Set();

const routePair = () => {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash ? decodeURIComponent(hash) : null;
};

const libMobile = () => lib.narrow;

function renderChips(el, chips, active, onPick) {
  el.innerHTML = '';
  for (const c of chips) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fchip' + (c.id === active ? ' on' : '');
    b.textContent = c.label;
    b.addEventListener('click', () => { onPick(c.id); renderIndexView(); });
    el.appendChild(b);
  }
}

// The comp's Clear button: every filter back to its default, and the hand
// toggles with them — a reader who clears has stopped narrowing, so the
// expansions an active filter caused should not survive it (openGroups would
// otherwise keep them open through lib.opened).
function clearFilters() {
  lib.filter = Object.assign({}, DEFAULT_FILTER);
  lib.opened.clear();
  lib.closed.clear();
  lib.more.clear();
  const q = $('pair-q');
  if (q) q.value = '';
  renderIndexView();
}

// A sub-row names its cell by its VARIANT PROPS (Primary . md . Default), which
// only <entryId>.set.json knows; the join is by run dir. Fetched per OPEN group
// and re-rendered once, so a closed Library makes no requests at all. The prop
// ORDER comes from axes.properties rather than from Object.values(props): both
// are insertion-ordered today, but the axes are the declaration and the props
// object is a by-product of it.
async function loadSetNames(groups, open) {
  const want = groups.filter((g) => g.set && open.has(g.id) && !setNamesAsked.has(g.id));
  if (!want.length) return;
  let added = false;
  for (const g of want) {
    setNamesAsked.add(g.id);
    try {
      const res = await fetch(encodeURIComponent(g.id) + '.set.json');
      if (!res.ok) continue;
      const idx = await res.json();
      const order = Object.keys((idx.axes && idx.axes.properties) || {});
      for (const entry of (idx.pairs || [])) {
        const props = entry.props || {};
        const keys = order.length ? order : Object.keys(props);
        const label = keys.map((k) => props[k]).filter(Boolean).join(' \u00b7 ');
        if (entry.dir && label) { lib.names.set(entry.dir, label); added = true; }
      }
    } catch (err) {
      // No set index in this root, or it is not JSON. The rows keep the pair id
      // (cellName's fallback) and nothing is retried.
    }
  }
  if (added) renderIndexView();
}

function renderIndexView() {
  const mobile = libMobile();
  document.body.classList.toggle('lib-mobile', mobile);
  renderChips($('src-chips'), SOURCE_CHIPS, lib.filter.source, (id) => { lib.filter.source = id; });
  renderChips($('state-chips'), STATE_CHIPS, lib.filter.state, (id) => { lib.filter.state = id; });
  const err = $('lib-error');
  if (lib.error) {
    err.hidden = false;
    err.innerHTML = errorBox(lib.error);
    $('lib-retry').addEventListener('click', () => { void loadPairs(); });
    $('lib-copy').addEventListener('click', copyErrorText);
    $('lib-count').textContent = 'List unavailable';
    $('lib-filters').hidden = true;
    $('cards').innerHTML = '';
    $('lib-fx').innerHTML = '';
    $('index-empty').hidden = true;
    return;
  }
  err.hidden = true;
  err.innerHTML = '';
  $('lib-filters').hidden = false;
  const groups = groupEntries(pairs, lib.filter);
  const shown = cellsShown(groups);
  // Groups BEFORE the filter, for the head-row denominator. Derived the same way
  // groupEntries derives them, so the two can never disagree about what a group is.
  const totalGroups = new Set(pairs.map((p) => entryIdOf(p.dir) || p.dir)).size;
  $('lib-count').textContent = countMessage(shown, pairs.length, groups.length, totalGroups);
  const fx = $('lib-fx');
  fx.innerHTML = filterExplainer(lib.filter);
  const clear = $('lib-clear');
  if (clear) clear.addEventListener('click', clearFilters);
  const cards = $('cards');
  const open = openGroups(groups, lib.filter, { opened: lib.opened, closed: lib.closed });
  cards.innerHTML = libraryTable(groups, (p) => '#/' + encodeURIComponent(p.dir), mobile ? 'mobile' : 'desktop', Date.now(), open, lib.more, lib.names);
  void loadSetNames(groups, open);
  const empty = $('index-empty');
  empty.hidden = !(shown === 0 && pairs.length > 0);
  empty.textContent = empty.hidden ? '' : 'Nothing matches your search or filter.';
}

// ---- the typed list-load failure (plan, section C) -------------------------
function hhmmss() { return new Date().toTimeString().slice(0, 8); }
function restartCommand() {
  const root = $('view-index').dataset.root || '<out-root>';
  const port = location.port || (location.protocol === 'https:' ? '443' : '80');
  return 'refdiff-annotator ' + root + ' --serve --port ' + port;
}
function setListError(e) {
  lib.error = {
    kind: classifyListError(e),
    tech: e.message + ' · /api/pairs · ' + hhmmss(),
    root: $('view-index').dataset.root || '',
    restartCommand: restartCommand(),
    retries: lib.retries, secs: lib.secs, copied: false,
  };
  if (!lib.timer) lib.timer = setInterval(tickRetry, 1000);
}
function clearListError() {
  lib.error = null; lib.retries = 0; lib.secs = RETRY_SECS;
  if (lib.timer) { clearInterval(lib.timer); lib.timer = null; }
}
function tickRetry() {
  if (!lib.error) return;
  if (lib.secs <= 1) { lib.secs = RETRY_SECS; lib.retries++; void loadPairs(); return; }
  lib.secs--;
  lib.error.secs = lib.secs;
  const msg = document.getElementById('lib-retry-msg');
  if (msg) msg.textContent = autoRetryMessage(lib.retries, lib.secs);
}
function copyErrorText() {
  if (!lib.error) return;
  const text = errorCopyText(lib.error);
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  lib.error.copied = true;
  renderIndexView();
  clearTimeout(lib.copyTimer);
  lib.copyTimer = setTimeout(() => { if (lib.error) { lib.error.copied = false; renderIndexView(); } }, 1800);
}

async function loadPairs() {
  try {
    const res = await fetch('api/pairs');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    pairs = sortEntries(body.pairs || []);
    serverReadOnly = body.readOnly === true;
    if (body.root) document.title = 'refdiff — ' + body.root;
    clearListError();
  } catch (e) {
    // A network-layer failure is the server gone; anything with a response
    // is the endpoint. Keep the last good list out of sight — a stale list
    // that looks live is the failure the box exists to prevent.
    pairs = [];
    setListError(e);
  }
  renderIndexView();
}

// A run dir is one path segment under the out root, so it can never contain a
// slash — which is what makes the set/ prefix unambiguous rather than a
// namespace a pair could collide with.
const routeSet = () => {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.startsWith('set/') ? decodeURIComponent(hash.slice(4)) : null;
};

// The sheet needs BOTH halves: the set index says which cells were ever
// supposed to exist, /api/pairs says what a run measured. A deep link arrives
// with neither loaded.
//
// It opens in the COMPARISON TOOL's own view, not a page of its own. That is the
// whole design: the topbar, the overlay modes, the layer toggles, pan/zoom/fit,
// the annotation layer and the rail all work on a sheet because they work in one
// WORLD space, and a sheet is that space with a per-cell offset. A separate page
// would have had to reimplement every one of them, which is exactly what the
// first attempt did and why it read as a different, poorer product.
async function openGallery(entryId) {
  currentSet = entryId;
  if (!pairs.length) await loadPairs();
  let index;
  try {
    const res = await fetch(encodeURIComponent(entryId) + '.set.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    index = await res.json();
  } catch (e) {
    // No set index is not an error state to dress up: the entry either is not a
    // component set, or its root predates the index. Say which command writes it.
    sheetFailure(entryId, 'no ' + entryId + '.set.json in this run root: ' + e.message);
    return;
  }
  const r = resolveGallery(index.axes, index.gallery);
  if (!r.ok) { sheetFailure(entryId, r.error); return; }

  // Prune before laying out: a real Figma set is SPARSE, so the axes'
  // cross-product is not the expectation and the rows it never populates bury
  // the real holes. See pruneToOccupied for the measurement.
  const resolved = pruneToOccupied(index, r.value);
  const cells = galleryCells(index, resolved, pairs);
  const layout = galleryLayout({
    rows: resolved.rowTuples.length,
    columns: resolved.columns.options.length,
    cells: cells.map((c) => ({
      key: c.key, row: c.row, col: c.col, pairDir: c.pairDir,
      size: c.summary && c.summary.frame ? c.summary.frame : undefined,
    })),
  });
  const rectOf = new Map(layout.cells.map((c) => [c.key, c.rect]));

  // Each measured cell's OWN report: its findings, and (step 2) its alignment.
  // /api/pairs cannot carry either. 41 parallel fetches on a local server is
  // nothing, and a cell whose report will not load degrades to its slot rather
  // than failing the sheet — one bad cell never kills a set.
  const rich = cells.map((c) => Object.assign({}, c, { rect: rectOf.get(c.key) || { x: 0, y: 0, w: 0, h: 0 } }));
  await Promise.all(rich.map(async (c) => {
    if (!c.pairDir) return;
    try {
      const res = await fetch(c.pairDir + '/findings.json');
      if (res.ok) { c.report = await res.json(); c.dir = c.pairDir; }
    } catch (e) { /* the slot stands; the cell simply shows nothing */ }
  }));

  openReport(sheetReport(index, resolved, rich, layout), null, {
    indexHref: '#/',
    base: '',
    readOnly: serverReadOnly,
  }, { entryId: entryId, cells: rich, layout: layout, resolved: resolved, index: index });
}

// The sheet AS a report, so every part of the comparison tool that reads
// report.* keeps working without knowing a sheet exists.
//
// The frame is the sheet's world and the alignment is the IDENTITY, which is
// honest rather than convenient: each cell's own alignment is baked into where
// its images sit, so there is no sheet-level registration left to describe.
// confidence is the worst of the cells — a sheet is no better aligned than its
// weakest cell, and averaging would hide exactly the cell you need to look at.
function sheetReport(index, resolved, cells, layout) {
  const measured = cells.filter((c) => c.report);
  const conf = measured.length
    ? Math.min.apply(null, measured.map((c) => (c.report.alignment || {}).confidence || 0))
    : 0;
  const findings = sheetFindings(cells);
  const c = census(cells);
  const span = runSpan(cells);
  const frame = { width: Math.round(layout.world.w), height: Math.round(layout.world.h), dpr: 1 };
  const worst = findings.some((f) => f.severity === 'critical' || f.severity === 'major');
  return {
    pair: (index.title || index.setName || index.entryId) + ' — ' + sheetSummary(c, span),
    createdAt: index.createdAt,
    design: Object.assign({ source: 'set', ref: index.setName + ' (' + c.total + ' cells)' }, frame),
    impl: Object.assign({ source: 'set', ref: index.entryId + ' (' + c.measured + ' measured)' }, frame),
    alignment: { scale: 1, offsetX: 0, offsetY: 0, confidence: conf, basis: 'cells' },
    findings: findings,
    suppressed: [],
    policy: {},
    verdict: { pass: !worst, failThreshold: 'major' },
    artifacts: { designPng: '', implPng: '' },
  };
}

// Every cell's findings, translated onto the sheet — which is all it takes for
// the marks layer, the rail, the severity filters and highlight/dim/strobe to
// work on a sheet, because they were already world-space.
//
// Two rules. Ids are NAMESPACED by cell, because every report numbers its own
// findings from f1 and 41 cells would otherwise collide into one id. And a
// FRAME-LEVEL finding is dropped from the boxes: pixel-region/frame fires on
// 194/194 pairs of the DS root and its box IS the whole frame, so translated as
// a box it paints its cell solid and makes the diff lab useless at sheet scale.
// It becomes a cell badge instead (step 3), and until then it is counted only.
function sheetFindings(cells) {
  const out = [];
  for (const cell of cells) {
    if (!cell.report) continue;
    for (const f of cell.report.findings || []) {
      const box = f.implBox || f.designBox;
      if (!box) continue;
      if (isFrameLevel(box, cell.rect)) continue;
      const moved = Object.assign({}, f, { id: cell.key + '::' + f.id, cell: cell.key });
      if (f.implBox) moved.implBox = projectCellBox(f.implBox, cell);
      if (f.designBox) moved.designBox = projectCellBox(f.designBox, cell);
      out.push(moved);
    }
  }
  // The marks layer numbers badges by mark; per-cell numbering would repeat.
  out.forEach((f, i) => { f.mark = i + 1; });
  return out;
}

// A sheet that cannot be laid out renders the reason in the report view's own
// canvas area, so the chrome and the way back stay where they are.
function sheetFailure(entryId, message) {
  document.body.classList.remove('route-gallery');
  document.body.classList.add('route-gallery');
  $('gal-name').textContent = entryId;
  $('gal-count').textContent = '';
  $('gal-body').innerHTML = galleryError(entryId, message);
}

async function openPair(dir) {
  const base = dir + '/';
  try {
    const res = await fetch(base + 'findings.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const reportData = await res.json();
    currentPair = dir;
    await openReport(reportData, null, {
      indexHref: '#/',
      base: base,
      annotationsUrl: 'api/pairs/' + encodeURIComponent(dir) + '/annotations',
      triageUrl: 'api/pairs/' + encodeURIComponent(dir) + '/triage',
      focusUrl: 'api/pairs/' + encodeURIComponent(dir) + '/focus',
      readOnly: serverReadOnly,
    });
  } catch (e) {
    currentPair = null;
    location.hash = '';
    $('index-empty').hidden = false;
    $('index-empty').textContent = 'cannot open ' + dir + ': ' + e.message;
  }
}

function route() {
  const setId = routeSet();
  const dir = setId ? null : routePair();
  document.body.classList.toggle('route-index', !dir && !setId);
  // A sheet opens in the REPORT view — same chrome, same world space, one extra
  // offset per cell. route-gallery is only the un-layoutable fallback now.
  if (setId) {
    currentPair = null;
    document.body.classList.remove('route-index');
    document.body.classList.add('route-report');
    if (setId !== currentSet) void openGallery(setId);
    return;
  }
  document.body.classList.remove('route-gallery');
  document.body.classList.toggle('route-report', !!dir);
  currentSet = null;
  if (!dir) {
    currentPair = null;
    document.title = 'refdiff';
    // The list is cheap and reflects runs finished since load — refresh it.
    void loadPairs();
    return;
  }
  if (dir !== currentPair) void openPair(dir);
}

function measureNarrow() {
  const narrow = window.innerWidth < MOBILE_BREAKPOINT;
  if (narrow !== lib.narrow) { lib.narrow = narrow; renderIndexView(); }
}
lib.narrow = window.innerWidth < MOBILE_BREAKPOINT;
window.addEventListener('resize', measureNarrow);
$('pair-q').addEventListener('input', () => { lib.filter.query = $('pair-q').value; renderIndexView(); });
window.addEventListener('hashchange', route);
// The back link is an in-page route, not a document load.
document.addEventListener('click', (e) => {
  const back = e.target.closest && e.target.closest('header .back');
  if (back && back.getAttribute('href') === '#/') { e.preventDefault(); location.hash = ''; }
});
// A measured cell opens its own pair. The sheet is a way INTO the pairs, not a
// replacement for them: the per-cell view is where a finding's box means
// something, so the cell is a link and the gallery keeps no report state.
document.addEventListener('click', (e) => {
  const tile = e.target.closest && e.target.closest('.gcell[data-pair]');
  if (!tile) return;
  location.hash = '#/' + encodeURIComponent(tile.dataset.pair);
});
// A group row expands its set. aria-expanded is the state the row rendered, so
// the toggle reads the DOM rather than recomputing the default here — one place
// decides it (openGroups) and this only records the reader's choice.
//
// The row is a div with role="button", not a <button>: the comp makes the
// Open-sheet control one of its six COLUMNS, and an anchor inside a button is
// invalid HTML. (No backticks in this comment — this whole boot script is a
// template literal and a backticked identifier would close it.)
// So the anchor is guarded here instead, and Enter / Space are ours to handle.
function toggleGroup(row) {
  const id = row.dataset.group;
  if (row.getAttribute('aria-expanded') === 'true') { lib.opened.delete(id); lib.closed.add(id); }
  else { lib.closed.delete(id); lib.opened.add(id); }
  renderIndexView();
}
document.addEventListener('click', (e) => {
  if (!e.target.closest) return;
  const more = e.target.closest('.lmore[data-more]');
  if (more) { lib.more.add(more.dataset.more); renderIndexView(); return; }
  // The sheet link lives INSIDE the row; let it navigate instead of toggling.
  if (e.target.closest('.lsheet')) return;
  const row = e.target.closest('.lrow[role="button"]');
  if (row) toggleGroup(row);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest && e.target.closest('.lrow[role="button"]');
  if (!row) return;
  e.preventDefault();
  toggleGroup(row);
});
void loadPairs().then(route);
`


/**
 * The Library's CSS, the comp's values under the comp's token names. The
 * comp sets no line-height on its root (browser \`normal\`), so the Library
 * resets the report's 1.4 — otherwise every chip and row measures taller.
 */
const INDEX_CSS = `
body.route-index #view-report, body.route-report #view-index { display:none; }
/* The third route. Listed explicitly rather than folded into the two rules
   above: a :not() chain over three states is where the next route silently
   shows two sections at once. */
body.route-index #view-gallery, body.route-report #view-gallery { display:none; }
body.route-gallery #view-index, body.route-gallery #view-report { display:none; }
body.route-gallery { display:flex; flex-direction:column; }
#view-gallery { display:flex; flex-direction:column; flex:1; min-height:0; line-height:normal; }
body.route-report { display:flex; flex-direction:column; }
#view-report { display:flex; flex-direction:column; flex:1; min-height:0; }
body.route-index { display:block; height:auto; min-height:100%; overflow:auto; }
#view-index { line-height:normal; }
#view-index .mono { font-family:var(--font-mono); }
/* ---- topbar: brand only (gap 8), layout + theme toggles on the right */
.lib-top { position:sticky; top:0; z-index:10; display:flex; flex-wrap:nowrap; align-items:center; gap:10px; padding:0 14px; height:calc(46px + 1px);
  background:var(--bg1); border-bottom:1px solid var(--line); }
/* calc(N + border): the comp's inline boxes are content-box (see render.ts CSS); ours are border-box. */
.lib-top .brand { width:18px; height:18px; border-radius:5px; background:var(--acc); flex-shrink:0; }
.lib-top .brand-name { font-size:13px; font-weight:700; letter-spacing:.02em; }
.lib-top .spacer { flex:1; }
.lib-top .theme-toggle { margin-left:0; }
/* 1240 is the comps' own wrap (RefDiff Library Groups.dc.html: maxWidth 1240).
   It was 1180 — the OLD Library comp's VIEWPORT, where a max-width never binds,
   so nothing measured it. The groups comp captures at 1240, where 1180 does
   bind: the container centred, content started at x=46 instead of 16, and every
   element in the page was displaced. Measured on run 2 of
   refdiff-library-groups-desktop — the Library heading at x=46 against the
   comp's 16, the table card 1148 wide against 1208, every filter chip 7px left.
   Raising it cannot move the two RefDiff Library pairs: they capture at 1180 and
   1240 does not bind there either. Verified by re-running both. */
.lib { max-width:1240px; margin:0 auto; padding:20px 16px 40px; }
.lib-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
.lib-head h1 { font-size:19px; font-weight:700; letter-spacing:-.01em; margin:0; }
.lib-count { font-size:12.5px; color:var(--txt2); }
/* ---- filter row: search · source chips · divider · state chips */
.lib-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:16px; }
.lib-filters[hidden] { display:none; }
.search { display:flex; align-items:center; gap:8px; background:var(--bg1); border:1px solid var(--line); border-radius:9px;
  padding:0 10px; height:calc(36px + 2px); flex:1; min-width:170px; }
/* No max-width: the comp's SOURCE says 340px but its render never applies it
   (226px at 1180, the full 358px row at 390) — the render is what refdiff measures. */
.search .msi { font-size:17px; color:var(--txt2); }
.search input { flex:1; min-width:0; background:transparent; border:0; outline:none; color:var(--txt); font-size:13px; appearance:none; -webkit-appearance:none; }
/* The placeholder keeps the browser's own colour, as the comp's input does. */
.chips-group { display:flex; gap:6px; flex-wrap:wrap; }
.fchip { padding:6px 12px; border-radius:999px; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap; user-select:none;
  border:1px solid var(--line); color:var(--txt2); background:var(--bg1); }
.fchip.on { border-color:var(--acc); color:#fff; background:var(--acc); }
body.lib-mobile .fchip { padding:5px 10px; font-size:11.5px; }
.vsep { width:1px; height:20px; background:var(--line); flex-shrink:0; }
/* ---- desktop: the thumbnail card grid */
/* .thumb is the comp's content-box 132px + its 1px border-bottom: 133 in border-box. Rendered at 132 it
   shaved 1px per card row (alignment scaleY 0.9966 on the Library desktop pair, 3 rows = 3px). */
/* The table lays itself out; this was the card grid chunk 1 grouped inside.
   The .card rules below are kept for now with NO caller — see the follow-up. */
.cards { display:block; }
body.lib-mobile #cards { display:flex; flex-direction:column; gap:8px; }
.card { display:flex; flex-direction:column; background:var(--bg1); border:1px solid var(--line); border-radius:12px; overflow:hidden;
  color:var(--txt); text-decoration:none; cursor:pointer; }
a.card:hover { border-color:var(--acc); }
/* ---- the grouped TABLE (chunk 5, RefDiff Library Groups.dc.html).
   Every metric here is READ OFF the first refdiff-library-groups-desktop run,
   not off the comp's source: column template, gap 12, min-width 1064, the
   10.5px/.07em uppercase header, rows at 54 and sub-rows at 40. The header row
   sits OUTSIDE the bg1 card, which is how the comp draws it. */
.ltwrap { overflow-x:auto; margin:0 -16px; padding:0 16px; }
.lthead, .lrow, .lcell { display:grid;
  grid-template-columns:minmax(230px,1.5fr) 118px 96px minmax(210px,1fr) 208px 128px;
  gap:12px; min-width:1064px; box-sizing:border-box; }
.lthead { padding:0 14px 8px; font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:var(--txt2); }
.ltable { background:var(--bg1); border:1px solid var(--line); border-radius:12px; min-width:1064px; box-sizing:border-box; overflow:hidden; }
.lrow { align-items:center; padding:8px 14px; min-height:54px; border-bottom:1px solid var(--line); cursor:pointer; }
.lrow.open { background:var(--bg2); }
.lrow.flat { cursor:default; }
.lrow:not(.flat):not(.open):hover { background:var(--bg2); }
.lset { display:flex; align-items:center; gap:8px; min-width:0; }
/* TWO glyphs, as the comp draws them — not one rotated. The chevron-right glyph
   is in the icon subset since these comps landed; before that it was not, which
   is why chunk 1 rotated the expand-more glyph and lost 3px of height doing it.
   (No backticks in here: INDEX_CSS is a template literal.) */
.lrow .caret { font-size:18px; color:var(--txt2); flex-shrink:0; }
.caret-gap { width:18px; flex-shrink:0; }
.lthumb { width:44px; height:34px; border-radius:5px; background:#f4f5f7; border:1px solid var(--line); flex-shrink:0;
  display:grid; grid-template-columns:repeat(3,1fr); gap:3px; padding:4px; box-sizing:border-box; }
.lthumb i { border-radius:2px; }
.lthumb .t0 { background:#4F46E5; }
.lthumb .t1 { background:rgba(79,70,229,.35); }
.lthumb .t2 { background:#d9dbe0; }
.lnames { display:flex; flex-direction:column; gap:2px; min-width:0; }
.lname { font-size:13.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lcount { font-size:12px; color:var(--txt); white-space:nowrap; }
.lroll { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.rb { display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.rb .dot { width:8px; height:8px; border-radius:50%; display:inline-block; }
.rb.critical { color:var(--critical); } .rb.critical .dot { background:var(--critical); }
.rb.major { color:var(--major); } .rb.major .dot { background:var(--major); }
.rb.minor { color:var(--minor); } .rb.minor .dot { background:var(--minor); }
.rb.clean { color:#46a758; }
.lreg { display:flex; align-items:center; gap:3px; font-size:10px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  padding:2px 7px; border-radius:999px; background:var(--critical); color:#fff; white-space:nowrap; }
.lreg .msi { font-size:12px; }
.lcm { display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--txt2); }
.lcm .msi { font-size:14px; }
.lmeas { display:flex; flex-direction:column; gap:3px; min-width:0; }
.lspan { display:flex; align-items:center; gap:5px; font-size:11.5px; }
.lspan .arrow { font-size:13px; color:var(--txt2); }
.lrun { display:flex; align-items:center; gap:3px; white-space:nowrap; }
.lrun.old { padding:1px 6px; border-radius:5px; background:var(--bg3); color:var(--txt2); font-size:11px; }
.lrun.old .msi { font-size:12px; }
.lrun.new { color:var(--txt); font-size:11px; }
.lrun-flat { font-size:11.5px; }
.lwhen { font-size:11px; color:var(--txt2); white-space:nowrap; }
.lact { display:flex; justify-content:flex-end; }
.lsheet { display:flex; align-items:center; gap:6px; padding:0 11px; height:30px; border-radius:8px; border:1px solid var(--line);
  background:var(--bg2); color:var(--txt); font-size:12px; font-weight:600; white-space:nowrap; text-decoration:none; }
.lsheet:hover { border-color:var(--acc); }
.lsheet .msi { font-size:16px; }
/* ---- the expanded sub-rows: the set's CELLS, not chunk 1's cards */
.lcell { align-items:center; padding:0 14px; min-height:40px; border-bottom:1px solid var(--line); background:var(--bg0);
  color:var(--txt); text-decoration:none; }
a.lcell:hover { background:var(--bg2); }
.lcname { display:flex; align-items:center; gap:8px; min-width:0; padding-left:28px; }
.vdot { width:8px; height:8px; border-radius:50%; flex-shrink:0; box-sizing:border-box; }
.vdot.critical { background:var(--critical); }
.vdot.major { background:var(--major); }
.vdot.minor { background:var(--minor); }
.vdot.clean { background:transparent; border:1.5px solid #46a758; }
.vdot.unreadable { background:transparent; border:1.5px solid var(--major); }
.lcthumb { width:34px; height:24px; border-radius:4px; background:#f4f5f7; border:1px solid var(--line); flex-shrink:0;
  overflow:hidden; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
.lcthumb img { display:block; width:100%; height:100%; object-fit:cover; object-position:top; }
.lcthumb.blank { background:var(--bg2); }
.lcthumb.blank .msi { font-size:14px; color:var(--txt2); }
.lcn { font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cb { font-size:11.5px; font-weight:600; white-space:nowrap; }
.cb.critical { color:var(--critical); }
.cb.major { color:var(--major); }
.cb.minor { color:var(--minor); }
.cb.none { color:var(--txt2); font-weight:400; }
.lmeas-cell { flex-direction:row; align-items:center; gap:7px; font-size:11.5px; }
.lgo { display:flex; justify-content:flex-end; align-items:center; gap:4px; font-size:11.5px; font-weight:600; color:var(--txt2); }
.lgo .msi { font-size:15px; }
.lcell .tech { font-size:11px; color:var(--txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lmore { display:flex; align-items:center; gap:8px; width:100%; padding:0 14px 0 58px; min-height:38px; box-sizing:border-box;
  border:none; border-bottom:1px solid var(--line); background:var(--bg0); color:var(--acc); font:inherit; font-size:12px;
  font-weight:600; cursor:pointer; text-align:left; }
.lmore .msi { font-size:16px; }
/* The filter-semantics explainer, shown only while a filter is active. */
.lfx { display:flex; align-items:center; gap:8px; margin:-6px 0 12px; font-size:12px; color:var(--txt2); }
.lfx .msi { font-size:15px; }
.lclear { padding:2px 9px; border-radius:999px; border:1px solid var(--line); background:transparent; font:inherit;
  font-size:11.5px; font-weight:600; cursor:pointer; color:var(--txt); }
/* ---- the phone: the comp folds the same six fields into one rounded card per
   group, with an icon-only sheet button and 44px touch rows. */
body.lib-mobile .lgcard { background:var(--bg1); border:1px solid var(--line); border-radius:11px; overflow:hidden; }
body.lib-mobile .lrow { display:block; min-width:0; padding:0; border-bottom:none; }
body.lib-mobile .lrhead { display:flex; align-items:flex-start; gap:9px; padding:10px 10px 10px 8px; min-height:44px; box-sizing:border-box; }
body.lib-mobile .lrcol { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
body.lib-mobile .lrline { display:flex; align-items:center; gap:7px; min-width:0; }
body.lib-mobile .lrline.wrap { gap:8px; flex-wrap:wrap; }
body.lib-mobile .lrline .lname { flex:1; min-width:0; font-size:13px; }
body.lib-mobile .lrline.meas .lmeas { flex-direction:row; align-items:center; gap:6px; font-size:11px; }
body.lib-mobile .lsheet { width:44px; height:44px; margin:-6px -4px 0 0; padding:0; justify-content:center;
  border:none; background:transparent; color:var(--txt2); flex-shrink:0; }
body.lib-mobile .lsheet .msi { font-size:20px; }
body.lib-mobile .lsheet-label { display:none; }
body.lib-mobile .lcell { display:flex; align-items:center; gap:8px; min-width:0; padding:9px 12px 9px 35px; min-height:44px;
  border-top:1px solid var(--line); border-bottom:none; }
body.lib-mobile .lcbody { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
body.lib-mobile .lcmarks { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
body.lib-mobile .lcn { font-size:11.5px; }
body.lib-mobile .lcell .go { font-size:18px; color:var(--txt2); flex-shrink:0; }
body.lib-mobile .lmore { padding:10px 12px 10px 35px; min-height:44px; border-top:1px solid var(--line); border-bottom:none; }
.thumb { height:calc(132px + 1px); background:var(--bg2); border-bottom:1px solid var(--line); display:flex; align-items:flex-end; justify-content:center;
  position:relative; overflow:hidden; }
.thumb .shot { display:block; width:100%; height:100%; object-fit:cover; object-position:top; }
/* the comp's plate: what a run without a capture shows (gap 25) */
.plate { display:flex; flex-direction:column; }
.plate i { display:block; }
.thumb .plate { width:60%; height:86%; gap:6px; padding:10px; background:var(--bg1); border:1px solid var(--line); border-bottom:none; border-radius:6px 6px 0 0; }
.thumb .plate .b1 { height:7px; width:52%; border-radius:3px; background:var(--bg3); }
.thumb .plate .b2 { flex:1; border-radius:4px; background:var(--bg3); }
.thumb .plate .b3 { height:12px; border-radius:3px; background:var(--line); }
.verdict { padding:2px 9px; border-radius:999px; font-size:10.5px; font-weight:700; letter-spacing:.04em; color:#fff; }
.thumb .verdict { position:absolute; top:8px; left:8px; }
.verdict.pass { background:var(--ok); } .verdict.fail { background:var(--critical); }
.state { position:absolute; top:8px; right:8px; padding:2px 9px; border-radius:999px; font-size:10.5px; font-weight:600;
  color:var(--txt); background:var(--bg1); border:1px solid var(--ok); }
.body { padding:12px 14px; display:flex; flex-direction:column; gap:8px; }
.crow { display:flex; align-items:center; }
.name-row { gap:8px; }
.name { font-size:13.5px; font-weight:600; line-height:1.3; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.src { display:flex; align-items:center; gap:4px; font-size:10.5px; font-weight:600; padding:2px 8px 2px 6px; border-radius:999px;
  border:1px solid var(--line); color:var(--txt2); flex-shrink:0; white-space:nowrap; }
.src .msi { font-size:12px; }
.route { font-size:11.5px; color:var(--txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.badges { gap:9px; flex-wrap:wrap; }
.badge { display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.badge .dot { width:8px; height:8px; border-radius:50%; background:currentColor; display:inline-block; }
.badge.critical { color:var(--critical); } .badge.major { color:var(--major); } .badge.minor { color:var(--minor); }
.badge.none { font-weight:400; color:var(--txt2); }
.comments { display:flex; align-items:center; gap:4px; font-size:11.5px; color:var(--txt2); }
.foot { gap:9px; padding-top:8px; border-top:1px solid var(--line); }
.trend { display:flex; align-items:center; gap:4px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.trend .msi { font-size:14px; }
.trend.diverging { color:var(--critical); } .trend.converging { color:var(--ok); } .trend.steady { color:var(--txt2); }
.delta { font-size:11.5px; color:var(--txt2); }
.when { margin-left:auto; font-size:11px; color:var(--txt2); }
.lowconf { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--txt2); line-height:1.3; }
.lowconf .msi { font-size:14px; flex-shrink:0; }
/* the degraded card: a run dir whose findings.json could not be read (section C, state C) */
.card.broken { border-style:dashed; cursor:default; }
.card.broken .thumb { align-items:center; border-bottom-style:dashed; }
.card.broken .thumb .msi { font-size:26px; color:var(--txt2); }
.card.broken .body { gap:7px; }
.card.broken .name { color:var(--txt2); }
.warn { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--txt2); }
.warn .msi { font-size:14px; }
.tech { font-size:10.5px; color:var(--txt2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* ---- mobile: the row list (under 640px) */
.cards.list { display:flex; flex-direction:column; gap:8px; margin:0 auto; }
.cards.list.capped { max-width:420px; }
.cards.list .card { flex-direction:row; align-items:flex-start; gap:11px; border-radius:11px; padding:10px; min-height:44px; overflow:visible; }
.tile { width:44px; height:56px; border-radius:6px; background:var(--bg2); border:1px solid var(--line); overflow:hidden; flex-shrink:0; }
img.tile { object-fit:cover; object-position:top; display:block; }
.tile.plate { gap:3px; padding:5px 4px; }
.tile .b1 { height:5px; width:70%; border-radius:2px; background:var(--bg3); }
.tile .b2 { flex:1; border-radius:3px; background:var(--bg3); }
.tile .b3 { height:7px; border-radius:2px; background:var(--line); }
.col { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
.col .name-row { gap:7px; }
.col .name { font-size:13px; line-height:normal; }
.col .verdict { padding:2px 8px; font-size:10px; flex-shrink:0; }
.col .cmeta { gap:8px; flex-wrap:wrap; }
.col .comments { gap:3px; font-size:11px; }
.col .foot { gap:7px; padding-top:0; border-top:0; font-size:11px; color:var(--txt2); }
.col .trend .msi { font-size:13px; }
.col .delta { font-size:11px; }
.col .lowconf { gap:5px; font-size:11px; line-height:normal; }
.col .lowconf .msi { font-size:13px; }
.card.broken .tile { display:flex; align-items:center; justify-content:center; border-style:dashed; }
.card.broken .tile .msi { font-size:18px; color:var(--txt2); }
.col .name { color:inherit; }
.card.broken .col .name { color:var(--txt2); }
.col .warn { gap:5px; font-size:11px; }
.col .warn .msi { font-size:13px; }
/* ---- empty + the typed list-load failure (section C, states A and B) */
.lib-empty { padding:60px 20px; text-align:center; color:var(--txt2); font-size:13px; margin:0; }
.lib-empty[hidden] { display:none; }
.lib-error[hidden] { display:none; }
.errbox { display:flex; flex-direction:column; align-items:center; text-align:center; gap:10px; padding:52px 24px;
  background:var(--bg1); border:1px solid var(--line); border-radius:14px; max-width:560px; margin:0 auto; }
body.lib-mobile .errbox { padding:32px 16px; }
.err-icon { width:calc(46px + 2px); height:calc(46px + 2px); border-radius:12px; background:var(--bg2); border:1px solid var(--line); display:flex; align-items:center; justify-content:center; }
.err-icon .msi { font-size:24px; color:var(--major); }
.err-head { font-size:15.5px; font-weight:700; letter-spacing:-.01em; }
.err-body { font-size:12.5px; line-height:1.55; color:var(--txt2); max-width:420px; }
.err-lines { display:flex; flex-direction:column; gap:6px; width:100%; max-width:420px; margin-top:2px; }
.err-line { display:flex; align-items:center; gap:8px; padding:8px 11px; border-radius:8px; background:var(--bg2); border:1px solid var(--line);
  font-family:var(--font-mono); font-size:11px; color:var(--txt2); text-align:left; }
.err-line.root { color:var(--txt); }
.err-line .msi { font-size:14px; flex-shrink:0; }
.err-line.root .msi { color:var(--txt2); }
.err-line span:last-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.err-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:4px; }
.err-actions button { display:flex; align-items:center; gap:6px; padding:0 14px; height:36px; border-radius:9px; font-size:12.5px; font-weight:600; cursor:pointer; border:0; }
.err-actions .msi { font-size:16px; }
.err-retry { background:var(--acc); color:#fff; }
.err-copy { background:var(--bg2); border:1px solid var(--line); color:var(--txt); height:calc(36px + 2px); }
.err-copy:hover { border-color:var(--acc); }
.err-auto { font-size:11.5px; color:var(--txt2); margin-top:2px; }

/* ---- the variant sheet (chunk 3) ---------------------------------------- */
.gal-count { color:var(--txt2); font-size:12px; }
.gal-body { flex:1; min-height:0; overflow:auto; padding:16px; }
.gsheet { position:relative; }
.gcol, .grow { position:absolute; color:var(--txt2); font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; display:flex; align-items:center; }
.gcol { justify-content:center; }
.grow { padding-right:10px; justify-content:flex-end; text-align:right; text-transform:none; letter-spacing:0; font-weight:500; }
.gcell { position:absolute; box-sizing:border-box; border:1px solid var(--line); border-radius:6px; background:var(--bg1); display:flex; align-items:center; justify-content:center; gap:6px; font-size:11px; color:var(--txt2); }
.gcell.k-skipped, .gcell.k-pending { background:var(--bg0); border-style:dashed; }
.gcell.k-absent { background:transparent; border-style:dotted; opacity:.5; }
.gcell.sev-critical { border-color:#e5484d; }
.gcell.sev-major { border-color:#f5a623; }
.gcell.sev-minor { border-color:#8f7ee7; }
.gcell.stale { border-top:2px dashed var(--txt2); }
.gbadge { font-variant-numeric:tabular-nums; font-weight:600; color:var(--txt); }
.gbadge.ok { color:#46a758; font-weight:400; }
.gstale { font-family:var(--font-mono); font-size:10px; color:var(--txt2); }
.gnote { font-size:10px; }
.gerror { margin:24px; padding:16px 18px; border:1px solid #e5484d; border-radius:8px; background:var(--bg1); max-width:70ch; }
.gerr-t { margin:0 0 8px; font-weight:600; color:var(--txt); }
.gerr-m { margin:0 0 8px; color:var(--txt); }
.gerr-h { margin:0; color:var(--txt2); font-size:12px; }
.gwarn { margin:0 0 14px; padding:10px 14px 10px 30px; border:1px solid #f5a623; border-radius:8px; background:var(--bg1); color:var(--txt2); font-size:12px; max-width:90ch; }
.gwarn li + li { margin-top:6px; }
`
