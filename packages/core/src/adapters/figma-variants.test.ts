import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FigmaNode, FigmaNodesResponse } from "./figma-api.js";
import { expandVariants, parseVariantName, variantProperties, type VariantConfig } from "./figma-variants.js";

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
