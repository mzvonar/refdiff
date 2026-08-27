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

  it("turns live-app entries into live-url specs with route and role", () => {
    const parsed = parseManifest([
      {
        id: "docs-owner-desktop",
        design: { file: "d.dc.html", frame: "8a" },
        app: { source: "live", role: "owner", route: "/sk/app/docs", viewport: { width: 1280, height: 900 }, waitFor: "table" },
      },
    ]);
    expect(parsed.ok && parsed.value.pairs[0]).toEqual({
      id: "docs-owner-desktop",
      design: { kind: "dc-html", file: "d.dc.html", frame: "8a", viewport: { width: 1280, height: 900 } },
      impl: { kind: "live-url", route: "/sk/app/docs", role: "owner", viewport: { width: 1280, height: 900 }, waitFor: "table" },
    });
  });

  it("reads figma designs and lists unknown app sources as skipped", () => {
    const parsed = parseManifest([
      {
        id: "button-fill",
        design: { kind: "figma", fileKey: "M0hn", nodeId: "8226-4244", scale: 3 },
        app: { source: "storybook", storyId: "ds-button--fill" },
      },
      { id: "weird", design: { file: "d.dc.html", frame: "1" }, app: { source: "screenshot" } },
    ]);
    expect(parsed.ok && parsed.value.pairs[0]?.design).toEqual({ kind: "figma", fileKey: "M0hn", nodeId: "8226:4244", scale: 3 });
    expect(parsed.ok && parsed.value.skipped[0]?.id).toBe("weird");
    expect(parseManifest([{ id: "x", design: { kind: "figma" }, app: { source: "storybook", storyId: "s" } }])).toMatchObject({
      ok: false,
      error: { kind: "invalid-entry", index: 0 },
    });
  });

  it("rejects malformed input with a typed error", () => {
    expect(parseManifest({})).toMatchObject({ ok: false, error: { kind: "not-an-array" } });
    expect(parseManifest([{ id: "x", design: {}, app: {} }])).toMatchObject({
      ok: false,
      error: { kind: "invalid-entry", index: 0 },
    });
  });
});

describe("readAccepted", () => {
  it("reads accepted deviations from a manifest ignore block and drops malformed ones", async () => {
    const { parseManifest, readAccepted } = await import("./manifest.js");
    const parsed = parseManifest([
      {
        ...entry,
        ignore: {
          accepted: [
            { type: "color", expected: { color: "a" }, actual: { color: "b" }, reason: "token" },
            { type: "color" },
            { type: "spacing", expected: { gap: { nested: true } }, reason: "bad values" },
          ],
        },
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs[0]?.ignore?.accepted).toEqual([
      { type: "color", expected: { color: "a" }, actual: { color: "b" }, reason: "token" },
    ]);
    expect(readAccepted({ type: "size", reason: "r" })).toEqual({ type: "size", reason: "r" });
    expect(readAccepted({ reason: "r" })).toBeUndefined();
    expect(readAccepted({ type: "pixel-region", role: "icon", changeKind: "shape", reason: "r" })).toEqual({
      type: "pixel-region",
      role: "icon",
      changeKind: "shape",
      reason: "r",
    });
    expect(readAccepted({ type: "pixel-region", changeKind: 3, reason: "r" })).toBeUndefined();
  });
});
