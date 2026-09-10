import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FigmaNode, FigmaNodesResponse } from "./figma-api.js";
import { expandVariants, parseVariantName, variantAxes, variantProperties, variantSpec, type VariantConfig } from "./figma-variants.js";
import type { FigmaDesignSpec, PairSpec } from "../manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../../test/fixtures/figma/nodes-button-fill-set.json"), "utf8"),
) as FigmaNodesResponse;
const set = fixture.nodes["8226:4244"]!.document;

/** The DS Storybook's `rowSignature` contract: variant:tone:size:label:icons, column = state. */
const BUTTON_FILL: VariantConfig = {
  selector: '[data-rowkey="fill:{variant|tone}:md:{variant|label}:{iconPlacement|icons}"][data-col="{State}"]',
  maps: {
    tone: { default: "label", success: "success", danger: "danger" },
    label: { default: "Label", success: "Success", danger: "Danger" },
    icons: { none: "", left: "s", right: "e" },
  },
};

describe("parseVariantName", () => {
  it("splits Figma's 'Prop=Value, Prop=Value' names", () => {
    expect(parseVariantName("State=Default, iconPlacement=none, variant=default")).toEqual({
      State: "Default",
      iconPlacement: "none",
      variant: "default",
    });
    expect(parseVariantName("Loose name")).toEqual({});
  });
});

describe("variantProperties", () => {
  it("reads VARIANT definitions (not text/instance-swap properties)", () => {
    const props = variantProperties(set);
    expect(Object.keys(props).sort()).toEqual(["State", "iconPlacement", "variant"]);
    expect(props["iconPlacement"]).toEqual(["left", "none", "right"]);
  });

  it("falls back to the children's names when a set has no definitions", () => {
    const { componentPropertyDefinitions: _defs, ...bare } = set;
    void _defs;
    expect(variantProperties(bare)["State"]).toContain("Default");
  });
});

describe("variantAxes", () => {
  it("says the axes came from the DEFINITIONS, in the designer's declared order", () => {
    const axes = variantAxes(set);
    expect(axes.source).toBe("definitions");
    expect(axes.properties).toEqual({
      State: ["Default", "Hover", "Active", "Disabled", "Loading", "Focus"],
      iconPlacement: ["left", "none", "right"],
      variant: ["label", "danger", "default", "success"],
    });
  });

  it("says the axes came from the CHILD NAMES when a set has no definitions — a DIFFERENT order", () => {
    // The whole reason the source travels with the axes: on this real set the
    // two branches disagree about State (the designer declares
    // Default,Hover,Active,Disabled,Loading,Focus; the children are traversed
    // Default,Loading,Hover,Focus,Active,Disabled). A consumer that labels a
    // grid's columns from the fallback while claiming the designer's order
    // looks entirely fine and is wrong — and only `source` can tell it.
    const { componentPropertyDefinitions: _defs, ...bare } = set;
    void _defs;
    const axes = variantAxes(bare);
    expect(axes.source).toBe("child-names");
    expect(axes.properties["State"]).toEqual([
      "Default",
      "Loading",
      "Hover",
      "Focus",
      "Active",
      "Disabled",
    ]);
    expect(axes.properties["State"]).not.toEqual(variantAxes(set).properties["State"]);
    // Same SET of options either way — it is the order that differs.
    expect([...(axes.properties["State"] ?? [])].sort()).toEqual(
      [...(variantAxes(set).properties["State"] ?? [])].sort(),
    );
  });

  it("is what variantProperties returns, minus the provenance", () => {
    expect(variantProperties(set)).toEqual(variantAxes(set).properties);
  });
});

describe("expandVariants", () => {
  it("expands the real Button/Fill set into per-variant pairs with story cell selectors", () => {
    const r = expandVariants(set, BUTTON_FILL);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const proven = r.value.pairs.find((p) => p.nodeId === "12:229");
    expect(proven).toEqual({
      nodeId: "12:229",
      name: "State=Default, iconPlacement=none, variant=default",
      props: { State: "Default", iconPlacement: "none", variant: "default" },
      selector: '[data-rowkey="fill:label:md:Label:"][data-col="Default"]',
      slug: "state-default_iconplacement-none_variant-default",
    });
    // 42 variants: one (Focus/left/label) has no tone mapping → skipped, visibly.
    expect(r.value.pairs).toHaveLength(41);
    expect(r.value.skipped).toEqual([
      {
        nodeId: expect.any(String),
        name: "State=Focus, iconPlacement=left, variant=label",
        reason: "no tone mapping for variant=label (no such story cell)",
        // `unmapped`, not `filtered`: the design declares this variant and the
        // STORY has no cell for it. That is the impl's coverage gap, and the
        // only kind the sheet marks as missing.
        kind: "unmapped",
      },
    ]);
    expect(
      r.value.pairs.find((p) => p.props["iconPlacement"] === "right" && p.props["State"] === "Active")?.selector,
    ).toBe('[data-rowkey="fill:label:md:Label:e"][data-col="Active"]');
  });

  it("applies `only` and `omit` filters and reports them as skipped", () => {
    const r = expandVariants(set, {
      ...BUTTON_FILL,
      only: { State: ["Default"] },
      omit: [{ variant: "danger" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pairs.map((p) => p.props["variant"] + "/" + p.props["iconPlacement"]).sort()).toEqual([
      "default/left",
      "default/none",
      "default/right",
      "success/left",
      "success/none",
    ]);
    expect(r.value.skipped.filter((s) => s.reason.startsWith("only:"))).toHaveLength(35);
    expect(r.value.skipped.filter((s) => s.reason.startsWith("omit:"))).toHaveLength(2);

    // The KIND, on the same real set. `only` and `omit` are both scope
    // decisions — the design defines those variants and nobody looked — so both
    // are `filtered`; only a missing story cell is `unmapped`, and that is the
    // one thing here that says anything about the implementation. Measured
    // across the DS's fourteen sets: 191 filtered against 90 unmapped, all 281
    // of which the sheet used to label "Skipped · no impl cell".
    const byKind = (k: string) => r.value.skipped.filter((s) => s.kind === k);
    expect(byKind("filtered")).toHaveLength(37);
    // PRECEDENCE, and it is deliberate: `only` and `omit` are tested BEFORE the
    // selector is resolved, so a variant that is both out of scope and unmapped
    // is reported as `filtered`. The Focus/left/label variant — the one
    // `unmapped` case in this set, asserted in the test above — has State=Focus
    // and so is filtered out here before its missing story cell is ever looked
    // for. That is the right way round: "we did not look" is the honest answer
    // when we did not, and claiming the impl lacks a cell we never asked for
    // would be the same over-claim this whole split exists to remove.
    expect(byKind("unmapped")).toHaveLength(0);
    // The kinds PARTITION the list: no skip is left without one, which is what
    // lets a consumer stop reading the reason prose.
    expect(byKind("filtered").length + byKind("unmapped").length).toBe(r.value.skipped.length);
    expect(r.value.skipped.every((s) => s.kind !== undefined)).toBe(true);
    // Every `only:` / `omit:` reason is filtered and no other reason is — the
    // exact correspondence the annotator's prefix FALLBACK relies on for set
    // indexes written before `kind` existed.
    expect(
      r.value.skipped.every((s) => /^(only|omit):/.test(s.reason) === (s.kind === "filtered")),
    ).toBe(true);
  });

  it("resolves composite placeholders for positional (untagged) story cells", () => {
    const r = expandVariants(set, {
      selector: ".grid > :nth-child({State,variant|cell})",
      maps: { cell: { "Default,default": "1", "Hover,default": "2" } },
      only: { iconPlacement: ["none"] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pairs.map((p) => p.selector).sort()).toEqual([".grid > :nth-child(1)", ".grid > :nth-child(2)"]);
    expect(r.value.skipped.find((s) => s.name.includes("State=Active, iconPlacement=none, variant=default"))?.reason).toBe(
      "no cell mapping for State=Active, variant=default (no such story cell)",
    );
    expect(expandVariants(set, { selector: "{State,Nope|cell}", maps: { cell: {} } })).toMatchObject({
      ok: false,
      error: { kind: "unknown-property", property: "Nope" },
    });
  });

  it("rejects a template naming a property or map the set does not have", () => {
    expect(expandVariants(set, { selector: "[data-col={Size}]" })).toEqual({
      ok: false,
      error: { kind: "unknown-property", property: "Size", known: ["State", "iconPlacement", "variant"] },
    });
    expect(expandVariants(set, { selector: "[data-col={State|cols}]", maps: { tone: {} } })).toEqual({
      ok: false,
      error: { kind: "unknown-map", map: "cols", known: ["tone"] },
    });
  });

  it("refuses a node that is not a component set", () => {
    const frame: FigmaNode = { id: "1:1", name: "Frame", type: "FRAME", children: [] };
    expect(expandVariants(frame, BUTTON_FILL)).toEqual({
      ok: false,
      error: { kind: "not-a-component-set", nodeId: "1:1", type: "FRAME" },
    });
  });
});

describe("variantSpec — what an entry hands down to its cells", () => {
  const design: FigmaDesignSpec = {
    kind: "figma",
    fileKey: "FILE",
    nodeId: "1:1",
    variants: { selector: '[data-col="{State}"]' },
  };
  const entry: PairSpec = {
    id: "button-stroke",
    title: "DS · Button / Stroke",
    design,
    impl: { kind: "storybook", storyId: "ds-button--stroke" },
    bleed: 8,
    ground: "keep",
    section: "Core components/Buttons",
    gallery: { columns: "State" },
    ignore: { textPatterns: ["^\\d+$"] },
  };
  const variant = { slug: "state-default", name: "State=Default", nodeId: "2:2", selector: '[data-col="Default"]' };

  // A SET entry is never run — N specs built from it are. Anything this builder
  // does not copy is absent on every one of them, while the SAME setting works
  // on a single-pair entry. `bleed` shipped with exactly that: declared on all
  // fourteen DS entries, present in the parse, undefined in all 24 reports.
  it("carries the settings that describe the COMPONENT", () => {
    const out = variantSpec(entry, variant, design);
    expect(out.bleed).toBe(8);
    // `ground` is the second setting to walk into this trap: entry-level, and
    // silently absent on all 24 cells of a set if this builder forgets it.
    expect(out.ground).toBe("keep");
    expect(out.ignore).toEqual(entry.ignore);
    expect(out.id).toBe("button-stroke--state-default");
    expect(out.title).toBe("DS · Button / Stroke — State=Default");
    expect(out.impl).toEqual({ kind: "storybook", storyId: "ds-button--stroke", selector: '[data-col="Default"]' });
    expect(out.design.nodeId).toBe("2:2");
  });

  // The mirror row, so "carry everything" does not become the rule by accident:
  // these two describe where the SET sits and how its grid is laid out, and
  // neither means anything on one cell of it.
  it("drops the settings that describe the SET", () => {
    const out = variantSpec(entry, variant, design);
    expect(out.section).toBeUndefined();
    expect(out.gallery).toBeUndefined();
  });

  it("omits an absent ground rather than pinning the default onto the cell", () => {
    const { ground, ...noGround } = entry;
    void ground;
    // Absent must stay absent, not become "transparent": the run-wide
    // `--ground` tier resolves BELOW the entry, and a default written in here
    // would shadow it on every cell of every set.
    expect("ground" in variantSpec(noGround, variant, design)).toBe(false);
  });

  it("omits an absent bleed rather than writing a zero", () => {
    const { bleed, ...noBleed } = entry;
    void bleed;
    expect("bleed" in variantSpec(noBleed, variant, design)).toBe(false);
  });

  it("fills the render scale only when the design has not pinned its own", () => {
    expect(variantSpec(entry, variant, design, 3).design.scale).toBe(3);
    expect(variantSpec(entry, variant, { ...design, scale: 2 }, 3).design.scale).toBe(2);
    expect(variantSpec(entry, variant, design).design.scale).toBeUndefined();
  });
});
