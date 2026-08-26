import { describe, expect, it } from "vitest";

import { parseManifest } from "./manifest.js";

const entry = {
  id: "doc-detail-owner-desktop",
  title: "Owner · Detail dokladu (desktop)",
  design: { file: "doc-detail-modal.dc.html", frame: "1a" },
  app: {
    source: "storybook",
    storyId: "pages-documents-docdetaildialog--owner-desktop",
    overlay: true,
    viewport: { width: 760, height: 740 },
  },
  ignore: { textPatterns: ["^FA-"], dataSlots: true, regions: [{ x: 0, y: 0, w: 10, h: 10 }] },
};

describe("parseManifest", () => {
  it("turns storybook entries into pair specs with their ignore policy", () => {
    const parsed = parseManifest([entry]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.skipped).toEqual([]);
    const [spec] = parsed.value.pairs;
    expect(spec).toEqual({
      id: "doc-detail-owner-desktop",
      title: "Owner · Detail dokladu (desktop)",
      design: {
        kind: "dc-html",
        file: "doc-detail-modal.dc.html",
        frame: "1a",
        viewport: { width: 760, height: 740 },
      },
      impl: {
        kind: "storybook",
        storyId: "pages-documents-docdetaildialog--owner-desktop",
        viewport: { width: 760, height: 740 },
        overlay: true,
      },
      ignore: { textPatterns: ["^FA-"], dataSlots: true, regions: [{ x: 0, y: 0, w: 10, h: 10 }] },
    });
  });

  it("lists live-app entries as skipped instead of dropping them", () => {
    const parsed = parseManifest([
      { id: "docs-owner-desktop", design: { file: "d.dc.html", frame: "8a" }, app: { source: "live" } },
    ]);
    expect(parsed.ok && parsed.value.pairs).toEqual([]);
    expect(parsed.ok && parsed.value.skipped[0]?.id).toBe("docs-owner-desktop");
  });

  it("rejects malformed input with a typed error", () => {
    expect(parseManifest({})).toMatchObject({ ok: false, error: { kind: "not-an-array" } });
    expect(parseManifest([{ id: "x", design: {}, app: {} }])).toMatchObject({
      ok: false,
      error: { kind: "invalid-entry", index: 0 },
    });
  });
});
