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
    <div class="cards" id="cards"></div>
    <p class="lib-empty" id="index-empty" hidden></p>
  </div>
</section>
<section id="view-report">
${REPORT_BODY}
</section>
<script type="module">
${options.viewMathSource}
${options.annotationsSource}
${options.indexViewSource}
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
// From /api/pairs: a --read-only server refuses every PUT, and the report's rail says so up front.
let serverReadOnly = false;
const MOBILE_BREAKPOINT = 640;
const RETRY_SECS = 30;
// Library state. The filter survives opening a pair and coming back; the
// layout follows the width alone (the comp's computer/smartphone button is
// its DESIGN-PREVIEW switch, not a product control — the app has none).
const lib = { filter: Object.assign({}, DEFAULT_FILTER), narrow: false, error: null, retries: 0, secs: RETRY_SECS, timer: null, copyTimer: null };

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
    $('index-empty').hidden = true;
    return;
  }
  err.hidden = true;
  err.innerHTML = '';
  $('lib-filters').hidden = false;
  const shown = filterEntries(pairs, lib.filter);
  $('lib-count').textContent = countMessage(shown.length, pairs.length);
  const cards = $('cards');
  cards.className = 'cards' + (mobile ? ' list' : '') + (mobile && !lib.narrow ? ' capped' : '');
  cards.innerHTML = pairCards(shown, (p) => '#/' + encodeURIComponent(p.dir), mobile ? 'mobile' : 'desktop');
  const empty = $('index-empty');
  empty.hidden = !(shown.length === 0 && pairs.length > 0);
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
  const dir = routePair();
  document.body.classList.toggle('route-index', !dir);
  document.body.classList.toggle('route-report', !!dir);
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
void loadPairs().then(route);
`

/**
 * The Library's CSS, the comp's values under the comp's token names. The
 * comp sets no line-height on its root (browser \`normal\`), so the Library
 * resets the report's 1.4 — otherwise every chip and row measures taller.
 */
const INDEX_CSS = `
body.route-index #view-report, body.route-report #view-index { display:none; }
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
.lib { max-width:1180px; margin:0 auto; padding:20px 16px 40px; }
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
.cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(262px, 1fr)); gap:14px; }
.card { display:flex; flex-direction:column; background:var(--bg1); border:1px solid var(--line); border-radius:12px; overflow:hidden;
  color:var(--txt); text-decoration:none; cursor:pointer; }
a.card:hover { border-color:var(--acc); }
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
`
