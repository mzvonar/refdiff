import { describe, expect, it } from "vitest"

import { renderAppShell } from "../src/app-shell.js"

const sources = {
  viewMathSource: "export const IDENTITY_ALIGNMENT = { scale: 1, offsetX: 0, offsetY: 0 };",
  annotationsSource: "export const STATUSES = ['open', 'implemented', 'done'];",
  indexViewSource: "export const CONFIDENCE_GATE = 0.5;",
  triageSource: "export const TRIAGE_STATES = ['fix', 'ignore', 'snooze'];",
  focusSource: "export const FOCUS_HANDLES = ['nw', 'ne', 'se', 'sw', 'move'];",
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

  it("loads a pair's data from its own directory, and its notes from the pair API", () => {
    expect(html).toContain("fetch(base + 'findings.json')")
    expect(html).toContain(
      "annotationsUrl: 'api/pairs/' + encodeURIComponent(dir) + '/annotations'",
    )
    // The report client prefixes every artifact with the pair's base.
    expect(html).toContain("page.base + report.artifacts.designPng")
  })

  it("embeds the three import-free modules and refuses one that would close the script", () => {
    expect(html).toContain(sources.viewMathSource)
    expect(html).toContain(sources.annotationsSource)
    expect(html).toContain(sources.indexViewSource)
    expect(html).toContain(sources.triageSource)
    expect(html).toContain(sources.focusSource)
    for (const key of [
      "viewMathSource",
      "annotationsSource",
      "indexViewSource",
      "triageSource",
      "focusSource",
    ] as const) {
      expect(() => renderAppShell({ ...sources, [key]: "</script><script>alert(1)" })).toThrow()
    }
  })

  it("names the served root without letting it become markup", () => {
    expect(renderAppShell({ ...sources, root: "/a<b" })).toContain("/a&lt;b")
  })
})
