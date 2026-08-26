import { describe, expect, it } from "vitest";

import type { ComparisonReport } from "@visual-compare/core";

import { embedJson, renderReport } from "../src/render.js";

const report: ComparisonReport = {
  pair: "doc-detail-owner-desktop",
  createdAt: "2026-08-26T18:08:44.917Z",
  design: { source: "dc-html", ref: "doc-detail-modal.dc.html#1a", width: 756.3, height: 955.4, scope: { mode: "largest-child", selector: "x" } },
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
  artifacts: { overlay: "overlay.png", designPng: "design.png", implPng: "impl.png" },
};

const viewMathSource = "export const IDENTITY_ALIGNMENT = { scale: 1, offsetX: 0, offsetY: 0 };";

describe("renderReport", () => {
  const html = renderReport(report, { viewMathSource });

  it("is a self-contained page referencing the run dir's full images relatively", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>doc-detail-owner-desktop — visual-compare</title>");
    expect(html).toContain('id="img-design"');
    expect(html).toContain('id="img-impl"');
    // No CDN, no fonts, no fetches — only the run dir's own files are referenced.
    expect(html).not.toMatch(/(src|href)=["']https?:|url\(\s*["']?https?:|@import|\bfetch\(/);
    expect(html).toContain(viewMathSource);
  });

  it("embeds the whole report — findings, suppressed, delta, alignment — as data", () => {
    const m = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const embedded = JSON.parse(m![1]!) as ComparisonReport;
    expect(embedded).toEqual(report);
  });

  it("cannot be broken out of by a finding message containing </script>", () => {
    // The only closing script tags are the two we emit ourselves.
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).not.toContain("<b>x</b>");
  });

  it("refuses a view-math source that would close the module script", () => {
    expect(() => renderReport(report, { viewMathSource: "</script><script>alert(1)" })).toThrow();
  });

  it("honours a custom title", () => {
    expect(renderReport(report, { viewMathSource, title: "T & U" })).toContain("<title>T &amp; U</title>");
  });
});

describe("embedJson", () => {
  it("escapes < and the line separators but stays valid JSON", () => {
    const s = embedJson({ a: "</script>\u2028" });
    expect(s).not.toContain("<");
    expect(s).not.toContain("\u2028");
    expect(JSON.parse(s)).toEqual({ a: "</script>\u2028" });
  });
});
