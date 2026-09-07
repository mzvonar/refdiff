import { describe, expect, it } from "vitest"

import { renderAppShell } from "../src/app-shell.js"

const sources = {
  viewMathSource: "export const IDENTITY_ALIGNMENT = { scale: 1, offsetX: 0, offsetY: 0 };",
  annotationsSource: "export const STATUSES = ['open', 'implemented', 'done'];",
  indexViewSource: "export const CONFIDENCE_GATE = 0.5;",
  galleryViewSource: "export const FRAME_COVERAGE = 0.9;",
  triageSource: "export const TRIAGE_STATES = ['fix', 'ignore', 'snooze'];",
  focusSource: "export const FOCUS_HANDLES = ['nw', 'ne', 'se', 'sw', 'move'];",
  railSource: "export const SUPPRESSED_LABEL = (n) => n + ' suppressed by policy rules';",
}

describe("renderAppShell", () => {
  const html = renderAppShell({ ...sources, root: "/root/uctoinak2/out" })

  it("ships markup and code but NO data — the point of the app shell", () => {
    // The generator embedded a whole ComparisonReport per file; the shell must
    // not, or it is a static site again.
    expect(html).not.toContain('id="report-data"')
    expect(html).not.toContain('id="annotations-data"')
    expect(html).toContain('id="view-index"')
    expect(html).toContain('id="view-gallery"')
    expect(html).toContain('id="view-report"')
    expect(html).toContain("fetch('api/pairs')")
  })

  it("holds both views in one document and toggles them by route class", () => {
    expect(html).toContain(
      "body.route-index #view-report, body.route-report #view-index { display:none; }",
    )
    expect(html).toContain("classList.toggle('route-index'")
    expect(html).toContain("window.addEventListener('hashchange', route)")
  })

  it("carries the server's read-only flag from /api/pairs into the opened report", () => {
    expect(html).toContain("serverReadOnly = body.readOnly === true")
    expect(html).toContain("readOnly: serverReadOnly")
  })

  it("loads a pair's data from its own directory, and its notes from the pair API", () => {
    expect(html).toContain("fetch(base + 'findings.json')")
    expect(html).toContain(
      "annotationsUrl: 'api/pairs/' + encodeURIComponent(dir) + '/annotations'",
    )
    // The report client prefixes every artifact with the pair's base.
    expect(html).toContain("page.base + report.artifacts.designPng")
  })

  it("embeds the import-free modules and refuses one that would close the script", () => {
    expect(html).toContain(sources.viewMathSource)
    expect(html).toContain(sources.annotationsSource)
    expect(html).toContain(sources.indexViewSource)
    expect(html).toContain(sources.triageSource)
    expect(html).toContain(sources.focusSource)
    expect(html).toContain(sources.railSource)
    for (const key of [
      "viewMathSource",
      "annotationsSource",
      "indexViewSource",
      "triageSource",
      "focusSource",
      "railSource",
    ] as const) {
      expect(() => renderAppShell({ ...sources, [key]: "</script><script>alert(1)" })).toThrow()
    }
  })

  it("draws the Library's chrome: brand-only topbar, head row, search + chip groups, the card grid", () => {
    expect(html).toContain('<header class="lib-top">')
    expect(html).toContain('<span class="brand-name">RefDiff</span>')
    expect(html).toContain("<h1>Library</h1>")
    expect(html).toContain('placeholder="Search comparisons…"')
    expect(html).toContain('id="src-chips"')
    expect(html).toContain('id="state-chips"')
    expect(html).toContain('<div class="cards" id="cards"></div>')
    // The comp's Library topbar is brand only (gap 8): no breadcrumb, no root path in the chrome.
    expect(html).not.toContain('class="kv root"')
  })

  it("keeps the list-load failure typed: the server-gone box knows the root and the port to restart on", () => {
    expect(html).toContain('data-root="/root/uctoinak2/out"')
    expect(html).toContain("kind: classifyListError(e)")
    expect(html).toContain("'refdiff-annotator ' + root + ' --serve --port ' + port")
    expect(html).toContain("setInterval(tickRetry, 1000)")
  })

  it("switches layouts by width or by the topbar toggle, re-rendering the cards for the layout", () => {
    // The comp's computer/smartphone button is its design-preview switch, not a
    // product control (removed 2026-08-28): the width alone picks the layout.
    expect(html).not.toContain('layout-toggle')
    expect(html).not.toContain('forceMobile')
    expect(html).toContain("window.innerWidth < MOBILE_BREAKPOINT")
    expect(html).toContain("mobile ? 'mobile' : 'desktop'")
  })

  it("draws the Library as the comp's TABLE, and counts cells and the groups they sit in", () => {
    expect(html).toContain("const groups = groupEntries(pairs, lib.filter);")
    expect(html).toContain("const shown = cellsShown(groups);")
    expect(html).toContain("countMessage(shown, pairs.length, groups.length, totalGroups)")
    // The denominator is derived the way groupEntries derives groups, so the
    // two can never disagree about what a group is.
    expect(html).toContain("const allGroupIds = [...new Set(pairs.map((p) => entryIdOf(p.dir) || p.dir))];")
    expect(html).toContain("const totalGroups = allGroupIds.length;")
    // The prefix is derived from the ROOT, not from the filtered groups — a
    // label computed from those would rename a row as the reader narrowed.
    expect(html).toContain("const idPrefix = commonIdPrefix(allGroupIds);")
    expect(html).toContain("lib.names, idPrefix);")
    expect(html).toContain("openGroups(groups, lib.filter, { opened: lib.opened, closed: lib.closed })")
    expect(html).toContain("cards.innerHTML = libraryTable(groups,")
    expect(html).not.toContain("libraryList(")
    // The empty state is still about cells: a filter that matches nothing
    // leaves no groups either.
    expect(html).toContain("empty.hidden = !(shown === 0 && pairs.length > 0);")
  })

  it("makes a group row a control: the reader's own expand/collapse survives a re-render", () => {
    expect(html).toContain("opened: new Set(), closed: new Set()")
    expect(html).toContain("e.target.closest('.lrow[role=\"button\"]')")
    expect(html).toContain("row.getAttribute('aria-expanded') === 'true'")
    expect(html).toContain("lib.opened.delete(id); lib.closed.add(id);")
    expect(html).toContain("lib.closed.delete(id); lib.opened.add(id);")
  })

  // The row is a div, not a button, because Open sheet is one of its COLUMNS
  // and an anchor inside a button is invalid — so the anchor is guarded and the
  // keyboard is ours.
  it("lets the nested sheet link navigate, and handles Enter and Space itself", () => {
    expect(html).toContain("if (e.target.closest('.lsheet')) return;")
    expect(html).toContain("if (e.key !== 'Enter' && e.key !== ' ') return;")
  })

  it("lifts one group's ten-row cap, and clears every filter with the comp's Clear button", () => {
    expect(html).toContain("e.target.closest('.lmore[data-more]')")
    expect(html).toContain("lib.more.add(more.dataset.more);")
    expect(html).toContain("fx.innerHTML = filterExplainer(lib.filter);")
    expect(html).toContain("if (clear) clear.addEventListener('click', clearFilters);")
    expect(html).toContain("lib.more.clear();")
  })

  // The variant-props join: /api/pairs carries none, so a sub-row's name comes
  // from <entryId>.set.json — fetched only for a group the reader has OPENED.
  it("fetches a set index lazily, once per group, and never retries a root that has none", () => {
    expect(html).toContain("fetch(encodeURIComponent(g.id) + '.set.json')")
    expect(html).toContain("g.set && open.has(g.id) && !setNamesAsked.has(g.id)")
    expect(html).toContain("setNamesAsked.add(g.id);")
    expect(html).toContain("const order = Object.keys((idx.axes && idx.axes.properties) || {});")
  })

  it("styles the table with the comp's own column template, row metric and header", () => {
    expect(html).toContain("grid-template-columns:minmax(230px,1.5fr) 118px 96px minmax(210px,1fr) 208px 128px;")
    expect(html).toContain("gap:12px; min-width:1064px; box-sizing:border-box; }")
    expect(html).toContain("font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase")
    expect(html).toContain(".lrow { align-items:center; padding:8px 14px; min-height:54px;")
    expect(html).toContain(".lcell { align-items:center; padding:0 14px; min-height:40px;")
    // The card grid and chunk 1's group sections are gone with the renderers.
    expect(html).not.toContain(".grp {")
    expect(html).not.toContain(".gcount {")
    expect(html).not.toContain("transform:rotate(-90deg)")
    expect(html).toContain("body.lib-mobile .lgcard {")
  })

  it("gives the index its own theme toggle, driven by the report client's shared handler", () => {
    expect(html).toContain('class="theme-toggle" id="index-theme-toggle"')
    expect(html).toContain("e.target.closest('.theme-toggle')")
    // The faces are served by the CLI on fonts/, relative to the shell — never a CDN.
    expect(html).toMatch(/src:url\(fonts\/[a-z0-9]+\/material-symbols-outlined\.woff2\)/)
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
  })

  it("carries the served root for the error state without letting it become markup", () => {
    expect(renderAppShell({ ...sources, root: '/a<b"' })).toContain('data-root="/a&lt;b&quot;"')
  })
})

describe("the gallery route", () => {
  const html = renderAppShell({ ...sources, root: "/root/ds/out" })

  // Three routes, three explicit rules. A :not() chain over three states is
  // where the next route silently shows two sections at once.
  it("hides the sheet on the other two routes, and both of them on the sheet", () => {
    expect(html).toContain("body.route-index #view-gallery, body.route-report #view-gallery { display:none; }")
    expect(html).toContain("body.route-gallery #view-index, body.route-gallery #view-report { display:none; }")
  })

  // A run dir is one path segment under the out root and can never hold a
  // slash, which is what makes the prefix a namespace no pair can collide with.
  it("routes #/set/<entryId> by a prefix a run dir cannot produce", () => {
    expect(html).toContain("hash.startsWith('set/')")
    expect(html).toContain("'.set.json'")
  })

  it("embeds the gallery module beside the others", () => {
    expect(html).toContain("export const FRAME_COVERAGE = 0.9;")
  })

  it("makes a measured cell a link into its own pair", () => {
    expect(html).toContain(".gcell[data-pair]")
  })
})
