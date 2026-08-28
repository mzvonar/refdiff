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
  /** Shown under the index title — which out root is being served. */
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
<section id="view-index">
  <header class="index-head">
    <h1 id="index-title">refdiff</h1>
    <span class="kv" id="index-summary"></span>
    ${options.root ? `<span class="kv root">${escapeHtml(options.root)}</span>` : ""}
    <button type="button" class="theme-toggle" id="index-theme-toggle" title="Toggle chrome theme"><span class="msi" aria-hidden="true">light_mode</span></button>
  </header>
  <input id="pair-q" type="search" placeholder="filter pairs…" aria-label="filter pairs" autocomplete="off">
  <ol class="cards" id="cards"></ol>
  <p class="empty" id="index-empty"></p>
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
${CLIENT}
${APP_BOOT}
</script>
</body>
</html>
`
}

/**
 * Router + index view. The report half is CLIENT, shared verbatim with an
 * emitted report.html; all this adds is "which pair, and where is its data".
 */
const APP_BOOT = String.raw`
let pairs = [];
let currentPair = null;

const routePair = () => {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash ? decodeURIComponent(hash) : null;
};

function renderIndexView() {
  $('cards').innerHTML = pairCards(pairs, (p) => '#/' + encodeURIComponent(p.dir));
  $('index-title').textContent = pairs.length + (pairs.length === 1 ? ' pair' : ' pairs');
  $('index-summary').textContent = pairsSummaryLine(pairs);
  filterPairs();
}
function filterPairs() {
  const needle = $('pair-q').value.trim().toLowerCase();
  let shown = 0;
  for (const card of document.querySelectorAll('#cards .card')) {
    const hit = card.textContent.toLowerCase().includes(needle);
    card.hidden = !hit;
    if (hit) shown++;
  }
  $('index-empty').textContent = shown === 0 && pairs.length ? 'no pair matches' : '';
}

async function loadPairs() {
  try {
    const res = await fetch('api/pairs');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    pairs = body.pairs || [];
    if (body.root) document.title = 'refdiff — ' + body.root;
  } catch (e) {
    $('index-empty').textContent = 'cannot load the pair list: ' + e.message;
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
    });
  } catch (e) {
    currentPair = null;
    location.hash = '';
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

$('pair-q').addEventListener('input', filterPairs);
window.addEventListener('hashchange', route);
// The back link is an in-page route, not a document load.
document.addEventListener('click', (e) => {
  const back = e.target.closest && e.target.closest('header .back');
  if (back && back.getAttribute('href') === '#/') { e.preventDefault(); location.hash = ''; }
});
void loadPairs().then(route);
`

const INDEX_CSS = `
body.route-index #view-report, body.route-report #view-index { display:none; }
body.route-report { display:flex; flex-direction:column; }
#view-report { display:flex; flex-direction:column; flex:1; min-height:0; }
body.route-index { display:block; height:auto; overflow:auto; }
.index-head { display:flex; flex-wrap:wrap; gap:4px 14px; align-items:baseline; padding:14px 16px 10px; border:0; background:transparent; }
.index-head h1 { font-size:17px; margin:0; }
.root { font-family:var(--font-mono); font-size:11px; }
.index-head .theme-toggle { margin-left:auto; align-self:center; }
#pair-q { display:block; width:calc(100% - 32px); margin:0 16px 12px; padding:9px 12px; font-size:16px;
  border:1px solid var(--line); border-radius:8px; background:var(--bg1); color:var(--txt); }
.cards { list-style:none; margin:0; padding:0 16px 24px; display:grid; gap:8px;
  grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); }
.card { background:var(--bg1); border:1px solid var(--line); border-radius:10px; }
.card[hidden] { display:none; }
/* The degraded card: a run dir whose findings.json could not be read. Nothing to open. */
.card.broken { border-style:dashed; opacity:.8; }
.card.broken .pill.broken { background:transparent; border:1px solid var(--line); color:var(--txt2); }
.card.broken .mono { font-family:var(--font-mono); }
.hit { display:block; padding:10px 12px; color:inherit; text-decoration:none; }
.hit:hover { background:rgba(127,127,127,.08); }
.row1 { display:flex; align-items:center; gap:8px; justify-content:space-between; }
.name { font-weight:600; overflow-wrap:anywhere; }
.row2, .row3 { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; margin-top:6px; }
.row3 { font-size:11px; }
.nums { display:inline-flex; gap:4px; }
.n { min-width:22px; text-align:center; padding:0 6px; border-radius:5px; font-weight:700; font-size:11px; color:#fff; }
.n.critical { background:var(--critical); } .n.major { background:var(--major); color:#111; } .n.minor { background:var(--minor); }
.notes { padding:0 7px; border-radius:999px; font-size:11px; font-weight:600; background:var(--open); color:#fff; }
.conf.weak { color:var(--major); }
.empty { color:var(--txt2); padding:0 16px; }
@media (max-width: 900px) { .cards { grid-template-columns:1fr; } }
`
