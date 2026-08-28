import type { AnnotationSet } from "../src/annotations.js"
import type { ComparisonReport } from "@refdiff/core"

import { describe, expect, it } from "vitest"

import { embedJson, renderReport } from "../src/render.js"

const report: ComparisonReport = {
  pair: "doc-detail-owner-desktop",
  createdAt: "2026-08-26T18:08:44.917Z",
  design: {
    source: "dc-html",
    ref: "doc-detail-modal.dc.html#1a",
    width: 756.3,
    height: 955.4,
    scope: { mode: "largest-child", selector: "x" },
  },
  impl: { source: "storybook", ref: "storybook:story", width: 760, height: 740 },
  alignment: { scale: 0.943, scaleY: 0.935, offsetX: 3.5, offsetY: 5.8, confidence: 0.57 },
  findings: [
    {
      id: "f1",
      type: "missing-element",
      severity: "critical",
      mark: 1,
      designBox: { x: 330, y: 251, w: 35, h: 13 },
      message: 'design "Služby" has no counterpart </script><b>x</b>',
      crops: { design: "crops/f1-design.png", impl: "crops/f1-impl.png" },
    },
  ],
  suppressed: [
    {
      id: "s1",
      type: "text-content",
      severity: "minor",
      mark: 0,
      message: "data slot",
      suppressedBy: "data-slot",
      rule: "dataSlots",
    },
  ],
  policy: { dataSlots: true },
  verdict: { pass: false, failThreshold: "major" },
  delta: { previousRun: "2026-08-26T17:00:00.000Z", resolved: [], introduced: [] },
  artifacts: { designPng: "design.png", implPng: "impl.png" },
}

const viewMathSource = "export const IDENTITY_ALIGNMENT = { scale: 1, offsetX: 0, offsetY: 0 };"
const annotationsSource = "export const STATUSES = ['open', 'implemented', 'done'];"
const triageSource = "export const TRIAGE_STATES = ['fix', 'ignore', 'snooze'];"
const focusSource = "export const FOCUS_HANDLES = ['nw', 'ne', 'se', 'sw', 'move'];"
const railSource = "export const SUPPRESSED_LABEL = (n) => n + ' suppressed by policy rules';"
const sources = { viewMathSource, annotationsSource, triageSource, focusSource, railSource }
const annotations: AnnotationSet = {
  version: 1,
  pair: "doc-detail-owner-desktop",
  annotations: [
    {
      id: "n1",
      side: "impl",
      shape: { kind: "point", x: 120, y: 110 },
      anchor: {
        elementId: "span-2",
        role: "text",
        text: "Save </script>",
        box: { x: 112, y: 108, w: 40, h: 16 },
      },
      note: "bolder",
      status: "open",
      createdAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:00:00.000Z",
    },
  ],
}

describe("renderReport", () => {
  const html = renderReport(report, { ...sources, annotations })

  it("is a self-contained page referencing the run dir's full images relatively", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain("<title>doc-detail-owner-desktop — refdiff</title>")
    expect(html).toContain('id="img-design"')
    expect(html).toContain('id="img-impl"')
    // No CDN, no fonts, no absolute URLs — only the run dir's own files are
    // referenced (the client fetches elements.json and api/annotations RELATIVELY).
    expect(html).not.toMatch(
      /(src|href)=["']https?:|url\(\s*["']?https?:|@import|fetch\(\s*["']https?:/,
    )
    expect(html).toContain(viewMathSource)
    expect(html).toContain(annotationsSource)
    // The client calls into triage.js (loadTriage), focus.js (renderFocusBand) and rail.js
    // (renderRail) too: an emitted report that embeds only two of the five modules throws a
    // ReferenceError in openReport and shows nothing at all.
    expect(html).toContain(triageSource)
    expect(html).toContain(focusSource)
    expect(html).toContain(railSource)
  })

  it("strobes on hard keyframe stops, never `steps(1) … alternate`", () => {
    // A reversed iteration flips the step position as well as the direction, so Chrome sampled the
    // SAME keyframe going both ways: the animation ran and nothing on the page ever changed.
    expect(html).not.toMatch(/animation:vc-(mask-)?strobe[^;]*alternate/)
    expect(html).toContain(".marks.diffs.strobing rect.region { animation:vc-strobe .84s linear")
    expect(html).toContain(".strobing-mask .mask { animation:vc-mask-strobe .84s linear")
    // Both halves of the cycle are stated, and the second one differs in more than position:
    // `translate` is world px, so at fit-to-page zoom the wiggle alone is sub-pixel.
    expect(html).toMatch(/0%,49\.99% \{ stroke:var\(--diff\); stroke-width:2; translate:0 0; \}/)
    // The alternate is a different HUE from --diff (the comps' magenta), or the pulse only moves.
    expect(html).toMatch(/50%,100% \{ stroke:#00ff9c; stroke-width:4; translate:1px 1px; \}/)
  })

  it("carries the diff lab: highlight/dim/strobe tools, region layers on both panes, a ghost over the impl", () => {
    // The comps' tool strip: pan · focus · comment · highlight (difference) · dim (tonality) · strobe (flare).
    for (const id of ["move-toggle", "focus-toggle", "ann-draw", "diff-toggle", "dim-toggle", "strobe-toggle"]) {
      expect(html).toContain(`id="${id}" class="tool`)
    }
    expect(html).toContain('id="diff-toggle" class="tool" aria-pressed="false" title="Highlight changed parts (d)')
    expect(html).toContain('<span class="msi" aria-hidden="true">flare</span>')
    expect(html).toContain('id="diffs-design"')
    expect(html).toContain('id="diffs-impl"')
    // The ghost and the raster mask belong to the impl pane only: superimposing
    // means drawing the design ONTO the implementation.
    expect(html).toContain('id="ghost-wrap"')
    expect(html).toContain('id="img-ghost"')
    expect(html).toContain('id="img-mask"')
    // The set-of-marks PNG is gone — the panes draw the marks live.
    expect(html).not.toContain("overlay.png")
    // Highlight boxes EVERY listed difference, not only the pixel channel's regions: the demo pair
    // has no pixel-region finding and the tool must still show something.
    expect(html).toContain("const b = f[key] || (side === 'design' ? f.implBox : f.designBox);")
    // The comps' dim mask: 6px round each box, 8px radius, rgba(15,17,20,.5).
    expect(html).toContain("rect(pad(r.box, 6), 'dim-hole', r.id, 8)")
    expect(html).toContain(".marks.diffs rect.dim { fill:rgba(15,17,20,.5);")
  })

  it("puts the overlay segment in the topbar: Off / Wipe / Onion / Blink / Diff, with the opacity pill and a wipe handle", () => {
    expect(html).toContain('id="seg-variant"')
    for (const [mode, label] of [["none", "Off"], ["swipe", "Wipe"], ["onion", "Onion"], ["blink", "Blink"], ["difference", "Diff"]]) {
      expect(html).toContain(`data-lab="${mode}"`)
      expect(html).toContain(`>${label}</button>`)
    }
    expect(html).not.toContain('id="lab-mode"')
    // The opacity pill serves onion and difference (the comps' opShow), each with its own amount.
    expect(html).toContain('id="op-pill"')
    expect(html).toContain('id="lab-amount"')
    expect(html).toContain("labAmount: { onion: 55, difference: 100 }")
    expect(html).toContain("else if (state.lab === 'difference') { ghost.style.opacity = state.labAmount.difference / 100; }")
    // The wipe is a curtain at a WORLD x with the comps' sync_alt knob, not a percentage of the pane.
    expect(html).toContain('id="wipe"')
    expect(html).toContain(">sync_alt</span>")
    expect(html).toContain("$('ghost-wrap').style.clipPath = 'inset(0 0 0 ' + Math.max(0, sx) + 'px)'")
    // Pane labels go while an overlay is on (the panes no longer show one side each).
    expect(html).toContain("body.lab-on .pane-label { display:none; }")
  })

  it("offers the align modes as the comps' pill + dropdown, with the lock and the confidence warning", () => {
    expect(html).toContain('id="align-mode"')
    expect(html).toContain('id="align-label"')
    expect(html).toContain('id="align-menu"')
    expect(html).toContain('id="align-lock"')
    expect(html).toContain('id="conf-warn"')
    expect(html).toContain("<h3>Align lock mode</h3>")
    // "aligned / not aligned" never said what it aligned ON; the menu names the mode (and `a` still cycles).
    expect(html).not.toContain('id="aligned"')
    expect(html).toContain("cycleAlign(")
    expect(html).toContain("displayAlignment(state.align")
    // Confidence is a warning STATE under the gate, on the Anchors mode only — never a number on the chrome (gap 2).
    expect(html).toContain("const CONF_MIN = 0.5;")
    expect(html).toContain("function confWarn() { return anchorLow() && state.lock && state.align === 'anchors'; }")
    // The lock (gap 22): off, the design pane has its own view; on, it snaps back to the shared one.
    expect(html).toContain("function viewOf(side) { return side === 'design' && !state.lock ? state.viewD : state.view; }")
    expect(html).toContain("if (on) state.viewD = state.view;")
  })

  it("has ONE comment tool: click = note, drag = region", () => {
    expect(html).toContain('id="ann-draw"')
    expect(html).not.toContain('id="ann-point"')
    expect(html).not.toContain('id="ann-rect"')
    expect(html).toContain(">add_comment</span>")
    // The gesture decides the shape, in one place, so the preview cannot disagree with what is saved.
    expect(html).toContain("const shape = drawn ? { kind: 'rect'")
  })

  it("draws the comps' numbered badges as HTML, the box only while selected or highlighted", () => {
    // A div per badge, like the comps: its number is TEXT the element extractor sees and matches,
    // where an SVG <text> was invisible to it (phase 3 measured 22 missing/extra badge numbers).
    expect(html).toContain('<div class="vmarks" id="vmarks-design"></div>')
    expect(html).toContain('<div class="vmarks" id="vmarks-impl"></div>')
    expect(html).toContain("d.className = 'vmark ' + cls; d.dataset.id = f.id;")
    expect(html).toContain("d.style.left = (box.x - r) + 'px'; d.style.top = (box.y - r) + 'px';")
    expect(html).toContain("if (sel) layer.append(rect(pad(primary, 4), f.severity + ' sel'")
    // Constant screen size, capped like the comps' scale(min(2.4, 1/s)), through one custom property per layer.
    expect(html).toContain("cs = Math.min(2.4, 1 / z)")
    expect(html).toContain("markLayers[side].style.setProperty('--cs', cs)")
    expect(html).toContain(".vmark { position:absolute; box-sizing:content-box; width:24px; height:24px; border-radius:50%;")
    // Comment badges: the 22px rounded square in the status colour.
    expect(html).toContain(".vmark.ann { width:22px; height:22px; border-radius:6px; font-size:11px; }")
    expect(html).toContain("d.className = 'vmark ann ' + a.status + (ann.saveError && ann.unsaved.has(a.id) ? ' unsaved' : ''); d.dataset.ann = a.id;")
    expect(html).not.toContain("g.lbl")
    // The comps mark the primary instance only by default: a ×15 aggregate must not carpet the artboard (gap 12).
    expect(html).toContain("layer: 'all', showMarks: true, showMembers: false,")
    // …and the toggle is the comps' instance chip above the list, plus the box in a selected aggregate's row.
    expect(html).not.toContain('id="members"')
    expect(html).toContain("instanceChipLabel(state.showMembers, kept)")
    expect(html).toContain("'Show primary only' : 'Show all instances'")
  })

  it("carries the phone layout (< 760px, the comps' breakpoint): scrolling page, sticky viewer, floating tools", () => {
    const mobile = /@media \(max-width: 759px\) \{([\s\S]*?)\n\}/.exec(html)
    expect(mobile).not.toBeNull()
    const rules = mobile![1]!
    expect(html).toContain("const narrow = window.matchMedia('(max-width: 759px)');")
    expect(html).not.toContain("max-width: 900px")
    // The tool strip floats bottom-left over the canvas, the zoom pill moves top-left, the layer
    // strip appears under the topbar and the brand + the two desktop segments go.
    expect(rules).toContain(".tools { position:absolute; left:8px; bottom:56px;")
    expect(rules).toContain(".zoom-pill { left:12px; top:12px; bottom:auto; }")
    expect(rules).toContain(".layer-strip { display:flex; }")
    expect(rules).toContain(".tb-left .brand-name, #seg-layout, #seg-layer { display:none; }")
    // The rail is the comps' bottom sheet: 44px of handle over the canvas, 52% when open, the
    // tabs and lists hidden while it is down. The page itself never scrolls.
    expect(rules).toContain(".rail { position:absolute; left:0; right:0; bottom:0; width:auto; height:44px;")
    expect(rules).toContain("body.rail-open .rail { height:52%; }")
    expect(rules).toContain("body:not(.rail-open) .rail-tabs, body:not(.rail-open) .rail-panels { display:none; }")
    expect(rules).not.toContain("position:sticky")
    expect(html).not.toContain("html, body { height:auto; }")
    expect(html).toContain('id="rail-toggle" aria-expanded="false" aria-controls="rail-panels"')
  })

  it("puts the review rail on the RIGHT at the comps' 320px, with tabs, chips, prop lines and a collapse chip", () => {
    // Phase 4: the 340px left aside is gone; the rail follows the viewer in the DOM and the flex row.
    expect(html.indexOf('<section id="viewer">')).toBeLessThan(html.indexOf('<aside id="side" class="rail">'))
    expect(html).toContain(".rail { width:320px; flex-shrink:0; display:flex; flex-direction:column; min-height:0; background:var(--bg1); border-left:1px solid var(--line); line-height:normal; }")
    expect(html).not.toContain("grid-template-columns:340px 1fr")
    expect(html).toContain('<span class="rail-title">Review</span>')
    expect(html).toContain(">right_panel_close</span>")
    expect(html).toContain('id="rail-expand"')
    expect(html).toContain(">right_panel_open</span>")
    expect(html).toContain('data-tab="findings" role="tab">Findings · <span id="tab-f-count"></span>')
    expect(html).toContain('data-tab="items" role="tab">Comments · <span id="tab-i-count"></span>')
    // Severity chips with dots, counted; the instance chip; the suppressed disclosure.
    expect(html).toContain("SEV_CHIP_LABELS[s] + ' ' + report.findings.filter((f) => f.severity === s).length")
    expect(html).toContain('id="inst-row"')
    expect(html).toContain("SUPPRESSED_LABEL(sup.length)")
    // A row: badge, title, ×N, the Regression tag, the mono prop line with the actual in red.
    expect(html).toContain("'<span class=\"fgroup\" title=\"one cause in ' + f.instances + ' places")
    expect(html).toContain(">undo</span><span>Regression</span></span>")
    // Comment shapes and badges are drawn on BOTH panes (the comps' ovA.im / ovB.im): on a phone
    // only one side is on screen, and a note placed on the impl was invisible while the design showed.
    expect(html).not.toContain("if (a.side !== side) return;")
    expect(html).toContain("(a.side === side ? '' : ' mirror')")
    expect(html).toContain("for (const r of propRows(f.expected, f.actual, f.type))")
    expect(html).toContain(".fprop .a { color:var(--critical); }")
    // Selecting focuses the canvas (gap 13): no detail panel, no crop images in the page.
    expect(html).not.toContain('id="detail"')
    expect(html).not.toContain("f.crops")
    expect(html).toContain("if (focus && box) { setView(focusView(box, paneSize(), state.view)); state.userMoved = true; applyView(); }")
    // The comments tab: composer, rows with the status label and the model's reply (gap 19).
    expect(html).toContain('placeholder="Instruction for the model…"')
    expect(html).toContain(">Send to model</button>")
    expect(html).toContain('placeholder="Add another instruction…"')
    expect(html).toContain("if (a.reply) h += '<div class=\"ireply\"")
    expect(html).toContain("const STATUS_LABELS = { open: 'Open', implemented: 'Implemented', done: 'Done' };")
    // A failed save (section C): the row, the endpoint, Retry, the halo on the canvas badge, the summary.
    expect(html).toContain("ann.saveError = 'PUT ' + page.annotationsUrl + ' · ' + e.message;")
    expect(html).toContain('<span class="t">Not saved</span>')
    expect(html).toContain(".vmark.ann.unsaved { box-shadow:0 0 0 3px rgba(229,72,77,.6)")
    expect(html).toContain("railSummary(report.findings.filter(visible).length, visibleItems().length, ann.saveError ? ann.unsaved.size : 0)")
    // Triage (gap 11) lives in the selected row; the active verdict pressed again clears it.
    expect(html).toContain('placeholder="Note for the model…"')
    expect(html).toContain("applyTriage(tri.dataset.triage === cur ? null : tri.dataset.triage")
    // The text filter kept, off the drawn chrome (gap 31): `/` opens it.
    expect(html).toContain('<div class="fsearch" id="fsearch" hidden>')
    expect(html).toContain("if (e.key === '/') { e.preventDefault(); setTab('findings'); openSearch(); return; }")
  })

  it("makes one-side-at-a-time a mode, not a breakpoint: the Split / Full segment drives body.single", () => {
    expect(html).toContain('id="seg-layout"')
    expect(html).toContain('data-layout="split"')
    expect(html).toContain('data-layout="full"')
    expect(html).toContain("body.single .pane { display:none; }")
    expect(html).toContain("body.single .pane.active { display:block; }")
    // The Design / Impl fab only exists in Full mode; the pane labels stay (the comp keeps them).
    expect(html).toContain('id="side-switch"')
    expect(html).toContain("body.single .side-fab { display:flex; }")
    expect(html).not.toContain("body.single .pane-label")
  })

  it("has the comps' topbar and delta strip, and no verdict header (gap 14)", () => {
    expect(html).toContain('<header id="hdr" class="topbar">')
    expect(html).toContain('id="hdr-left"')
    expect(html).toContain('<span class="brand-name">RefDiff</span>')
    expect(html).toContain('id="seg-layer"')
    for (const label of ["Findings", "Comments", "All", "Clean"]) expect(html).toContain(`>${label}</button>`)
    // The layer segment generalises the old marks checkbox; Comments off hides the shapes, never the focus region.
    expect(html).not.toContain('id="marks"')
    expect(html).toContain("state.showMarks = state.layer === 'findings' || state.layer === 'all';")
    expect(html).toContain("body.layer-no-anns .marks.anns .ann, body.layer-no-anns .vmarks .vmark.ann")
    // The verdict pill, counts and alignment numbers are gone from the chrome.
    expect(html).not.toContain("hdr-more")
    expect(html).not.toContain("' · threshold '")
    // The delta strip (gap 15): only when the run changed something, red with a Review filter on a regression.
    expect(html).toContain('id="delta-strip"')
    expect(html).toContain("fixed earlier, back again — fix plan halted")
    expect(html).toContain("if (state.regOnly && !regressionIds().has(f.id)) return false;")
    // Zoom lives in a floating pill; the focus chip carries the comps' copy.
    expect(html).toContain('id="zoom-pill"')
    expect(html).toContain(">fit_screen</span>")
    expect(html).toContain("'Region focus · '")
  })

  it("embeds the whole report — findings, suppressed, delta, alignment — as data", () => {
    const m = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(html)
    expect(m).not.toBeNull()
    const embedded = JSON.parse(m![1]!) as ComparisonReport
    expect(embedded).toEqual(report)
  })

  it("embeds the annotation set as data (an empty set for the pair when none is given)", () => {
    const m = /<script type="application\/json" id="annotations-data">([\s\S]*?)<\/script>/.exec(
      html,
    )
    expect(JSON.parse(m![1]!)).toEqual(annotations)
    const bare = renderReport(report, { ...sources })
    const m2 = /<script type="application\/json" id="annotations-data">([\s\S]*?)<\/script>/.exec(
      bare,
    )
    expect(JSON.parse(m2![1]!)).toEqual({ version: 1, pair: report.pair, annotations: [] })
  })

  it("cannot be broken out of by a finding message or an annotation containing </script>", () => {
    // The only closing script tags are the four we emit ourselves
    // (report-data, annotations-data, page-data, the module).
    expect(html.match(/<\/script>/g)).toHaveLength(4)
    expect(html).not.toContain("<b>x</b>")
  })

  it("refuses an embedded module source that would close the module script", () => {
    for (const key of Object.keys(sources) as (keyof typeof sources)[]) {
      expect(() => renderReport(report, { ...sources, [key]: "</script><script>alert(1)" })).toThrow()
    }
  })

  it("honours a custom title", () => {
    expect(renderReport(report, { ...sources, title: "T & U" })).toContain(
      "<title>T &amp; U</title>",
    )
  })

  it("shows a back link only when the report belongs to a set", () => {
    // The client renders the header, so the link rides in the embedded page
    // data and is emitted only when a set gave it a place to go back to.
    expect(html).toContain('"indexHref":null')
    expect(html).toContain('page.indexHref ? \'<a class="back"')
    const inSet = renderReport(report, {
      ...sources,
      indexHref: "../index.html",
    })
    expect(inSet).toContain('"indexHref":"../index.html"')
  })

  it("self-hosts the comps' type: IBM Plex + the icon subset via relative @font-face, no system-ui first", () => {
    // Phase 1 of the redesign: the family mismatch was the top `typography` cause.
    expect(html).toContain("@font-face { font-family:'IBM Plex Sans'; font-style:normal; font-weight:100 700;")
    expect(html).toContain("@font-face { font-family:'IBM Plex Mono'; font-style:normal; font-weight:400;")
    expect(html).toContain("@font-face { font-family:'Material Symbols Outlined';")
    expect(html).toMatch(/src:url\(fonts\/ibm-plex-sans-latin\.woff2\) format\('woff2'\)/)
    expect(html).toContain("font:13px/1.4 var(--font-sans)")
    expect(html).toContain("--font-sans:'IBM Plex Sans',system-ui")
    // Icons are ligatures in the comps' face, so the rule must match theirs verbatim.
    expect(html).toContain(".msi { font-family:'Material Symbols Outlined';")
    expect(html).not.toContain("font:13px/1.4 system-ui")
    // <button>/<select> fall back to the UA font (Arial 13.33px) unless told to inherit — the last family mismatch.
    expect(html).toContain("button, input, select, textarea { font:inherit; }")
  })

  it("carries the comps' tokens under the comps' names, dark by default, light as a body override", () => {
    expect(html).toContain("--bg0:#2a2b2e; --bg1:#333438; --bg2:#3c3d42; --bg3:#46474d; --line:#4c4d54; --txt:#e7e9ec; --txt2:#a6abb3; --acc:#5b8def; --canvas:#232427;")
    expect(html).toContain("body.cc-theme-light { --bg0:#dfe1e4;")
    expect(html).toContain("--critical:#e5484d; --major:#f5a623; --minor:#4c9aff;")
    // The old navy palette and its names are gone, not aliased: one vocabulary.
    for (const gone of ["#0b1020", "#111a2e", "#60a5fa", "var(--panel)", "var(--ink)", "var(--muted)", "var(--accent)"]) {
      expect(html).not.toContain(gone)
    }
    expect(html).toContain(".pane { flex:1; position:relative; overflow:hidden; min-width:0; touch-action:none; cursor:grab; background:var(--canvas); }")
  })

  it("has a theme toggle in the header, persisted with the other controls but written on its own", () => {
    expect(html).toContain('class="theme-toggle" id="theme-toggle" title="Toggle chrome theme"')
    expect(html).toContain("classList.toggle('cc-theme-light', light)")
    expect(html).toContain("applyTheme(readControls().theme)")
    expect(html).toContain("theme: currentTheme(),")
    // On the index route no report is open; a full saveControls() there would persist unloaded defaults.
    expect(html).toContain("function toggleTheme() { applyTheme(currentTheme() === 'light' ? 'dark' : 'light'); saveTheme(); }")
  })

})

describe("embedJson", () => {
  it("escapes < and the line separators but stays valid JSON", () => {
    const s = embedJson({ a: "</script>\u2028" })
    expect(s).not.toContain("<")
    expect(s).not.toContain("\u2028")
    expect(JSON.parse(s)).toEqual({ a: "</script>\u2028" })
  })
})
