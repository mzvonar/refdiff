import { describe, expect, it } from "vitest";

import type { ComparisonReport } from "@visual-compare/core";

import type { AnnotationSet } from "../src/annotations.js";
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
const annotationsSource = "export const STATUSES = ['open', 'implemented', 'done'];";
const annotations: AnnotationSet = {
  version: 1,
  pair: "doc-detail-owner-desktop",
  annotations: [
    {
      id: "n1",
      side: "impl",
      shape: { kind: "point", x: 120, y: 110 },
      anchor: { elementId: "span-2", role: "text", text: "Save </script>", box: { x: 112, y: 108, w: 40, h: 16 } },
      note: "bolder",
      status: "open",
      createdAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:00:00.000Z",
    },
  ],
};

describe("renderReport", () => {
  const html = renderReport(report, { viewMathSource, annotationsSource, annotations });

  it("is a self-contained page referencing the run dir's full images relatively", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>doc-detail-owner-desktop — visual-compare</title>");
    expect(html).toContain('id="img-design"');
    expect(html).toContain('id="img-impl"');
    // No CDN, no fonts, no absolute URLs — only the run dir's own files are
    // referenced (the client fetches elements.json and api/annotations RELATIVELY).
    expect(html).not.toMatch(/(src|href)=["']https?:|url\(\s*["']?https?:|@import|fetch\(\s*["']https?:/);
    expect(html).toContain(viewMathSource);
    expect(html).toContain(annotationsSource);
  });

  it("embeds the whole report — findings, suppressed, delta, alignment — as data", () => {
    const m = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const embedded = JSON.parse(m![1]!) as ComparisonReport;
    expect(embedded).toEqual(report);
  });

  it("embeds the annotation set as data (an empty set for the pair when none is given)", () => {
    const m = /<script type="application\/json" id="annotations-data">([\s\S]*?)<\/script>/.exec(html);
    expect(JSON.parse(m![1]!)).toEqual(annotations);
    const bare = renderReport(report, { viewMathSource, annotationsSource });
    const m2 = /<script type="application\/json" id="annotations-data">([\s\S]*?)<\/script>/.exec(bare);
    expect(JSON.parse(m2![1]!)).toEqual({ version: 1, pair: report.pair, annotations: [] });
  });

  it("cannot be broken out of by a finding message or an annotation containing </script>", () => {
    // The only closing script tags are the three we emit ourselves.
    expect(html.match(/<\/script>/g)).toHaveLength(3);
    expect(html).not.toContain("<b>x</b>");
  });

  it("refuses an embedded module source that would close the module script", () => {
    expect(() => renderReport(report, { viewMathSource: "</script><script>alert(1)", annotationsSource })).toThrow();
    expect(() => renderReport(report, { viewMathSource, annotationsSource: "</script><script>alert(1)" })).toThrow();
  });

  it("honours a custom title", () => {
    expect(renderReport(report, { viewMathSource, annotationsSource, title: "T & U" })).toContain("<title>T &amp; U</title>");
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
