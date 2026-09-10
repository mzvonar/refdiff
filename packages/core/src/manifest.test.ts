import { describe, expect, it } from "vitest";

import { parseManifest, readDisabled } from "./manifest.js";

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
  // A policy field the PARSER does not read is dropped in silence: the run then reports everything
  // the rule was meant to excuse and nothing says why. That is how `contentsOf` first shipped —
  // core, policy and manifest all correct, and five of six pairs unchanged because readIgnore
  // whitelists keys. Every new ignore field needs a row here.
  it("reads explain rules, and drops one with no types, no cause or no region", async () => {
    const { parseManifest, readExplain } = await import("./manifest.js");
    const parsed = parseManifest([
      {
        ...entry,
        ignore: {
          explain: [
            { types: ["position"], region: { x: 1, y: 2, w: 3, h: 4 }, cause: "c", reason: "r" },
            { types: ["position"], cause: "no region or within", reason: "r" },
            { types: [], region: { x: 1, y: 2, w: 3, h: 4 }, cause: "empty types", reason: "r" },
            { region: { x: 1, y: 2, w: 3, h: 4 }, cause: "no types", reason: "r" },
            { types: ["position"], region: { x: 1, y: 2, w: 3, h: 4 }, cause: "no reason" },
          ],
        },
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs[0]?.ignore?.explain).toEqual([
      { types: ["position"], region: { x: 1, y: 2, w: 3, h: 4 }, cause: "c", reason: "r" },
    ]);
    expect(readExplain({ types: ["size"], within: { role: "image" }, text: "^\\d+$", cause: "c", reason: "r" })).toEqual({
      types: ["size"],
      within: { role: "image" },
      text: "^\\d+$",
      cause: "c",
      reason: "r",
    });
  });

  it("reads contentsOf rules, and drops one without a type scope or a reason", async () => {
    const { parseManifest, readContentsOf } = await import("./manifest.js");
    const parsed = parseManifest([
      {
        ...entry,
        ignore: {
          contentsOf: [
            { role: "image", types: ["missing-element"], reason: "the app draws a screenshot" },
            { role: "image", reason: "no types: would forgive the whole interior" },
            { role: "image", types: [], reason: "empty types is the same thing" },
            { types: ["missing-element"], reason: "no role" },
            { role: "image", types: ["missing-element"] },
          ],
        },
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs[0]?.ignore?.contentsOf).toEqual([
      { role: "image", types: ["missing-element"], reason: "the app draws a screenshot" },
    ]);
    expect(readContentsOf({ role: "icon", types: ["size", "color"], reason: "r" })).toEqual({
      role: "icon",
      types: ["size", "color"],
      reason: "r",
    });
    expect(readContentsOf({ role: "image", types: "missing-element", reason: "r" })).toBeUndefined();
  });

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
    expect(readAccepted({ type: "extra-element", role: "image", contents: true, reason: "r" })).toEqual({
      type: "extra-element",
      role: "image",
      contents: true,
      reason: "r",
    });
    // Only the literal `true` widens a rule to its contents — never a truthy string.
    expect(readAccepted({ type: "extra-element", contents: "yes", reason: "r" })).toBeUndefined();
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

describe("readSectionPath — the hierarchy declaration (chunk 4)", () => {
  it("trims every segment, so a path written with spaces is the SAME node", async () => {
    const { readSectionPath } = await import("./manifest.js");
    // The comps draw a path as "Actions / Button", so a hand-written manifest
    // carries the spaces. Untrimmed, these would be two groups rendering with
    // one name — a split nobody can see.
    expect(readSectionPath("Actions / Button")).toEqual({ ok: true, value: "Actions/Button" });
    expect(readSectionPath("Actions/Button")).toEqual({ ok: true, value: "Actions/Button" });
    expect(readSectionPath("Foundations")).toEqual({ ok: true, value: "Foundations" });
  });

  it("refuses every shape that produces a nameless node", async () => {
    const { readSectionPath } = await import("./manifest.js");
    for (const bad of ["", "   ", "/A", "A/", "A//B", "A / / B"]) {
      expect(readSectionPath(bad).ok, bad).toBe(false);
    }
    expect(readSectionPath(3).ok).toBe(false);
    expect(readSectionPath(undefined).ok).toBe(false);
  });

  it("splits a normalized path back into its segments", async () => {
    const { sectionSegments } = await import("./manifest.js");
    expect(sectionSegments("Core components/Buttons")).toEqual(["Core components", "Buttons"]);
    expect(sectionSegments("Foundations")).toEqual(["Foundations"]);
  });
});

describe("readSections — order and label metadata", () => {
  it("takes a bare path or { path, label }, and DECLARATION ORDER is the order", async () => {
    const { readSections } = await import("./manifest.js");
    const parsed = readSections([
      "Foundations",
      { path: "Core components / Buttons", label: "Buttons" },
      { path: "Core patterns" },
    ]);
    expect(parsed).toEqual({
      ok: true,
      value: [
        { path: "Foundations" },
        { path: "Core components/Buttons", label: "Buttons" },
        { path: "Core patterns" },
      ],
    });
    expect(readSections(undefined)).toEqual({ ok: true, value: [] });
  });

  it("keeps a path NO entry uses — a pure grouping node is the point, not an error", async () => {
    // The comps' `Foundations` row: hierarchy only, nothing measured. Nothing
    // here is cross-checked against the entries in either direction.
    const { parseManifest } = await import("./manifest.js");
    const parsed = parseManifest([{ ...entry, section: "Core components/Buttons" }], ["Foundations"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sections).toEqual([{ path: "Foundations" }]);
    expect(parsed.value.pairs[0]?.section).toBe("Core components/Buttons");
  });

  it("refuses a duplicate path, naming where it was first declared", async () => {
    const { readSections } = await import("./manifest.js");
    // Normalized, so the two spellings collide — which is exactly the pair a
    // reader could never tell apart on screen.
    const dupe = readSections(["Actions/Button", { path: "Actions / Button", label: "Button" }]);
    expect(dupe.ok).toBe(false);
    if (dupe.ok) return;
    expect(dupe.error).toContain("sections[0]");
  });

  it("fails the manifest rather than dropping a malformed row", async () => {
    // A dropped row loses a label or a position in silence and the library
    // still draws, looking finished. The opposite call from an `ignore` rule,
    // where dropping makes the run report MORE.
    const { parseManifest, readSections } = await import("./manifest.js");
    expect(readSections({}).ok).toBe(false);
    expect(readSections([{ label: "no path" }]).ok).toBe(false);
    expect(readSections([{ path: "A", label: 3 }]).ok).toBe(false);
    expect(readSections([{ path: "A", labl: "typo" }]).ok).toBe(false);
    expect(parseManifest([entry], [{ path: "A/" }])).toMatchObject({
      ok: false,
      error: { kind: "invalid-sections" },
    });
  });
});

describe("readGallery — how a set's cells lay out", () => {
  const setEntry = {
    id: "ds-button-fill",
    design: {
      kind: "figma",
      fileKey: "M0hn",
      nodeId: "8226-4244",
      variants: { selector: '[data-col="{State}"]' },
    },
    app: { source: "storybook", storyId: "ds-button--fill" },
  };

  it("reads the four fields onto a set entry", async () => {
    const { parseManifest } = await import("./manifest.js");
    const parsed = parseManifest([
      {
        ...setEntry,
        section: "Actions / Button",
        gallery: {
          columns: "State",
          rows: "variant",
          order: { State: ["Default", "Hover", "Focus on text"] },
          labels: { State: { "Focus on text": "Focus" } },
        },
      },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs[0]?.section).toBe("Actions/Button");
    expect(parsed.value.pairs[0]?.gallery).toEqual({
      columns: "State",
      rows: "variant",
      order: { State: ["Default", "Hover", "Focus on text"] },
      labels: { State: { "Focus on text": "Focus" } },
    });
  });

  it("refuses an unknown key and an empty block — which is what catches a TYPO", async () => {
    // `{ colums: "State" }` has no valid key at all. Dropped, it would read as
    // "declares nothing" and the sheet would lay out on whatever the consumer
    // defaults to, looking fine. This is the single check that turns every
    // misspelling into a message naming the field.
    const { readGallery } = await import("./manifest.js");
    const typo = readGallery({ colums: "State" });
    expect(typo.ok).toBe(false);
    if (typo.ok) return;
    expect(typo.error).toContain("colums");
    expect(readGallery({}).ok).toBe(false);
    expect(readGallery({ columns: "State", labls: {} }).ok).toBe(false);
    expect(readGallery(undefined)).toEqual({ ok: true, value: undefined });
    expect(readGallery("State").ok).toBe(false);
  });

  it("refuses one property as both axes, and a malformed order or labels", async () => {
    const { readGallery } = await import("./manifest.js");
    expect(readGallery({ columns: "State", rows: "State" }).ok).toBe(false);
    expect(readGallery({ columns: "" }).ok).toBe(false);
    expect(readGallery({ columns: 3 }).ok).toBe(false);
    expect(readGallery({ order: { State: [] } }).ok).toBe(false);
    expect(readGallery({ order: { State: "Default" } }).ok).toBe(false);
    expect(readGallery({ order: { State: ["Default", 3] } }).ok).toBe(false);
    // A pinned option listed twice renders a column twice or is quietly deduped.
    const dupe = readGallery({ order: { State: ["Default", "Hover", "Default"] } });
    expect(dupe.ok).toBe(false);
    if (dupe.ok) return;
    expect(dupe.error).toContain("Default");
    expect(readGallery({ labels: { State: { Default: 3 } } }).ok).toBe(false);
    // One axis alone is a complete declaration.
    expect(readGallery({ columns: "State" })).toEqual({ ok: true, value: { columns: "State" } });
  });

  it("refuses a gallery on an entry with no component set", async () => {
    // Every gallery field names a VARIANT PROPERTY, so on a one-cell pair
    // there is nothing for it to describe — a block moved to the wrong entry,
    // or left behind when `variants` went.
    const { parseManifest } = await import("./manifest.js");
    const dcHtml = parseManifest([{ ...entry, gallery: { columns: "State" } }]);
    expect(dcHtml).toMatchObject({ ok: false, error: { kind: "invalid-entry", index: 0 } });
    if (dcHtml.ok) return;
    expect(dcHtml.error).toMatchObject({ detail: expect.stringContaining("design.variants") });
    const noVariants = parseManifest([
      {
        id: "x",
        design: { kind: "figma", fileKey: "M0hn", nodeId: "1-2" },
        app: { source: "storybook", storyId: "s" },
        gallery: { columns: "State" },
      },
    ]);
    expect(noVariants.ok).toBe(false);
  });

  it("takes an entry-level bleed, validates it, and REFUSES a bad one", async () => {
    // "Every new manifest field needs a row asserting it ARRIVES" — the note on
    // the test below. This is that row for `bleed`, and figma-variants.test.ts
    // carries its twin one level on, where a SET entry hands it to its cells.
    const { parseManifest } = await import("./manifest.js");
    const withBleed = parseManifest([{ ...entry, bleed: 8 }]);
    expect(withBleed.ok).toBe(true);
    if (withBleed.ok) expect(withBleed.value.pairs[0]?.bleed).toBe(8);
    // Absent stays absent — a written 0 would be a different statement from
    // "nobody asked", and the capture path branches on undefined.
    const none = parseManifest([entry]);
    expect(none.ok).toBe(true);
    if (none.ok) expect(none.value.pairs[0]?.bleed).toBeUndefined();
    for (const bad of ["8", -1, 500, true]) {
      const r = parseManifest([{ ...entry, bleed: bad }]);
      expect(r.ok, `bleed: ${JSON.stringify(bad)} should be refused`).toBe(false);
    }
  });

  it("carries an entry's section and gallery nowhere near the ignore policy", async () => {
    // Regression shape from `contentsOf`: core, policy and manifest were all
    // correct and five pairs of six did not move, because the parser dropped
    // the field. Every new manifest field needs a row asserting it ARRIVES.
    const { parseManifest } = await import("./manifest.js");
    const parsed = parseManifest([entry]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs[0]?.section).toBeUndefined();
    expect(parsed.value.pairs[0]?.gallery).toBeUndefined();
    expect(parsed.value.sections).toEqual([]);
  });
});

describe("readDisabled — a pair kept in the manifest but not measured", () => {
  it("takes the reason as a string, and trims it", () => {
    expect(readDisabled("superseded by the groups rebuild")).toEqual({
      ok: true,
      value: "superseded by the groups rebuild",
    });
    expect(readDisabled("  spaced  ")).toEqual({ ok: true, value: "spaced" });
  });

  it("is absent when the key is, and `false` means enabled", () => {
    expect(readDisabled(undefined)).toEqual({ ok: true, value: undefined });
    expect(readDisabled(false)).toEqual({ ok: true, value: undefined });
  });

  // A pair that silently does not run is the worst failure this tool has — a
  // comp with no pair reports its drift nowhere — so the ONE thing a disabled
  // pair must carry is why. Same call as gallery's empty `{}`.
  it("REFUSES `disabled: true` — the reason is the whole point", () => {
    const r = readDisabled(true);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("must be the REASON as a string");
  });

  it("refuses an empty or whitespace reason", () => {
    expect(readDisabled("").ok).toBe(false);
    expect(readDisabled("   ").ok).toBe(false);
    expect(readDisabled(0).ok).toBe(false);
    expect(readDisabled({ reason: "x" }).ok).toBe(false);
  });
});

describe("parseManifest — a disabled entry", () => {
  const disabled = {
    id: "refdiff-library-desktop",
    disabled: "the comp it names was superseded by the groups rebuild",
    design: { file: "old.dc.html", frame: "Library" },
    app: { source: "live", route: "/", viewport: { width: 1180, height: 800 } },
  };

  it("diverts it into `skipped` with the reason, and never into `pairs`", () => {
    const parsed = parseManifest([entry, disabled]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs.map((p) => p.id)).toEqual(["doc-detail-owner-desktop"]);
    expect(parsed.value.skipped).toEqual([
      {
        id: "refdiff-library-desktop",
        reason: "disabled — the comp it names was superseded by the groups rebuild",
      },
    ]);
  });

  // Read EARLY, before the design and impl specs are validated, so a disabled
  // pair whose spec has rotted does not fail the whole manifest for a pair
  // nobody runs. Stated consequence: a typo inside it waits until re-enabling.
  it("does not validate the rest of a disabled entry", () => {
    const parsed = parseManifest([
      { id: "rotted", disabled: "kept for later", design: 42, app: { source: "nonsense" } },
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs).toEqual([]);
    expect(parsed.value.skipped[0]?.reason).toBe("disabled — kept for later");
  });

  it("fails the manifest when the reason is missing, naming the entry", () => {
    const parsed = parseManifest([{ ...disabled, disabled: true }]);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.kind).toBe("invalid-entry");
    expect("detail" in parsed.error && parsed.error.detail).toContain("refdiff-library-desktop");
  });

  // The enabled pairs around it are untouched — a disabled entry is a hole in
  // the list, not a truncation of it.
  it("leaves the entries after it parsing normally", () => {
    const parsed = parseManifest([disabled, entry]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.pairs.map((p) => p.id)).toEqual(["doc-detail-owner-desktop"]);
  });
});
