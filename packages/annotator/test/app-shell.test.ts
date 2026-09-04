import { describe, expect, it } from "vitest"

import { renderAppShell } from "../src/app-shell.js"

const sources = {
  viewMathSource: "export const IDENTITY_ALIGNMENT = { scale: 1, offsetX: 0, offsetY: 0 };",
  annotationsSource: "export const STATUSES = ['open', 'implemented', 'done'];",
  indexViewSource: "export const CONFIDENCE_GATE = 0.5;",
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

  it("draws the Library as GROUPS, and still counts comparisons rather than groups", () => {
    expect(html).toContain("const groups = groupEntries(pairs, lib.filter);")
    expect(html).toContain("const shown = cellsShown(groups);")
    expect(html).toContain("countMessage(shown, pairs.length)")
    expect(html).toContain("openGroups(groups, lib.filter, { opened: lib.opened, closed: lib.closed })")
    expect(html).toContain("cards.innerHTML = libraryList(groups,")
    // The empty state is still about cells: a filter that matches nothing
    // leaves no groups either, and "N of M comparisons" is what the head says.
    expect(html).toContain("empty.hidden = !(shown === 0 && pairs.length > 0);")
  })

  it("makes a group row a control: the reader's own expand/collapse survives a re-render", () => {
    expect(html).toContain("opened: new Set(), closed: new Set()")
    expect(html).toContain("e.target.closest('.ghead')")
    expect(html).toContain("head.getAttribute('aria-expanded') === 'true'")
    expect(html).toContain("lib.opened.delete(id); lib.closed.add(id);")
    expect(html).toContain("lib.closed.delete(id); lib.opened.add(id);")
  })

  it("styles the group row so a set spans the whole card grid and its cells keep the grid", () => {
    expect(html).toContain(".grp { grid-column:1/-1;")
    expect(html).toContain(".gcells { display:grid; grid-template-columns:repeat(auto-fill, minmax(262px, 1fr)); gap:14px; }")
    // One glyph for both states — chevron_right is not in the icon subset.
    expect(html).toContain(".grp:not(.open) .ghead .caret { transform:rotate(-90deg); }")
    expect(html).toContain("body.lib-mobile .gcells { display:flex; flex-direction:column; gap:8px; }")
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
