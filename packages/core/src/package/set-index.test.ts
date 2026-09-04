import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FigmaNode, FigmaNodesResponse } from "../adapters/figma-api.js";
import type { GalleryConfig, VariantConfig } from "../adapters/figma-variants.js";

import { expandVariants, variantAxes } from "../adapters/figma-variants.js";
import { buildSetIndex, setIndexFileName } from "./set-index.js";

const here = dirname(fileURLToPath(import.meta.url));
const load = (file: string, nodeId: string): FigmaNode => {
  const fixture = JSON.parse(
    readFileSync(join(here, "../../test/fixtures/figma/", file), "utf8"),
  ) as FigmaNodesResponse;
  return fixture.nodes[nodeId]!.document;
};

// The two real recorded COMPONENT_SETs, with the DS's own configs — so every
// number below is the one a live run produces, not one invented for a test.
const buttonFill = load("nodes-button-fill-set.json", "8226:4244");
const alert = load("nodes-alert-set.json", "6765:4792");

/** The DS Storybook's `rowSignature` contract: variant:tone:size:label:icons, column = state. */
const BUTTON_FILL: VariantConfig = {
  selector: '[data-rowkey="fill:{variant|tone}:md:{variant|label}:{iconPlacement|icons}"][data-col="{State}"]',
  maps: {
    tone: { default: "label", success: "success", danger: "danger" },
    label: { default: "Label", success: "Success", danger: "Danger" },
    icons: { none: "", left: "s", right: "e" },
  },
};

/**
 * Alert's story renders its matrix as ONE untagged column, so its cells are
 * positional and the map is composite. Empty here on purpose: a map that
 * lists nothing skips every variant with a reason, which is the case where a
 * whole set measures NOTHING — see the test that names it.
 */
const ALERT_NO_CELLS: VariantConfig = {
  selector: "#storybook-root > div > div.flex-col > :nth-child({Color,Aligned,Type|cell})",
  maps: { cell: {} },
};

const NOW = "2026-09-04T10:00:00.000Z";

const indexOf = (
  entryId: string,
  set: FigmaNode,
  config: VariantConfig,
  over: { title?: string; designRef?: string; gallery?: GalleryConfig } = {},
) => {
  const expansion = expandVariants(set, config);
  if (!expansion.ok) throw new Error(`fixture did not expand: ${JSON.stringify(expansion.error)}`);
  return buildSetIndex({
    entryId,
    ...(over.title !== undefined ? { title: over.title } : {}),
    designRef: over.designRef ?? "M0hnCQJIUho3tcW6PcnHWH#8226:4244@2394716977561734647",
    axes: variantAxes(set),
    ...(over.gallery !== undefined ? { gallery: over.gallery } : {}),
    expansion: expansion.value,
    now: NOW,
  });
};

describe("buildSetIndex", () => {
  it("indexes the real Button/Fill set: 41 pairs + 1 skipped = its 42 variants", () => {
    // The measured live figures (docs/plan-gallery-groups.md), and the sum is
    // what makes the artifact checkable against the CLI's own
    // `N variant pairs, M skipped` line.
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL, { title: "DS · Button / Fill" });
    expect(index.pairs).toHaveLength(41);
    expect(index.skipped).toHaveLength(1);
    expect(index.pairs.length + index.skipped.length).toBe(
      (buttonFill.children ?? []).filter((c) => c.type === "COMPONENT").length,
    );
    expect(index.entryId).toBe("ds-button-fill");
    expect(index.title).toBe("DS · Button / Fill");
    expect(index.setName).toBe("*Button/Fill");
    expect(index.createdAt).toBe(NOW);
  });

  it("names every pair's RUN DIR, which is the pair's identity under the out root", () => {
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL);
    const proven = index.pairs.find((p) => p.slug === "state-default_iconplacement-none_variant-default");
    expect(proven).toEqual({
      slug: "state-default_iconplacement-none_variant-default",
      dir: "ds-button-fill--state-default_iconplacement-none_variant-default",
      props: { State: "Default", iconPlacement: "none", variant: "default" },
    });
    // The dir is `<entryId>--<slug>` for every pair — the join the Library
    // groups on and the only thing tying this file to the run dirs.
    for (const p of index.pairs) expect(p.dir).toBe(`ds-button-fill--${p.slug}`);
  });

  it("keeps the skip REASON and adds the props a reason cannot carry", () => {
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL);
    expect(index.skipped[0]).toEqual({
      nodeId: "19285:51581",
      name: "State=Focus, iconPlacement=left, variant=label",
      reason: "no tone mapping for variant=label (no such story cell)",
      // Parsed back out of the name: without these a skipped cell can be
      // listed but never placed in a column and a row.
      props: { State: "Focus", iconPlacement: "left", variant: "label" },
    });
  });

  it("carries the axes AND where they came from", () => {
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL);
    expect(index.axes.source).toBe("definitions");
    expect(index.axes.properties["State"]).toEqual([
      "Default",
      "Hover",
      "Active",
      "Disabled",
      "Loading",
      "Focus",
    ]);
    const { componentPropertyDefinitions: _defs, ...bare } = buttonFill;
    void _defs;
    expect(indexOf("ds-button-fill", bare, BUTTON_FILL).axes.source).toBe("child-names");
  });

  it("makes ABSENCE computable — the thing a run root structurally cannot show", () => {
    // Alert declares 4 × 2 × 4 = 32 combinations and Figma holds 23 of them,
    // so nine cells exist in the axes and in neither list. That gap is the
    // whole reason this file exists; before it, a reader had 23 run dirs and
    // no way to know 32 were declared.
    const index = indexOf("ds-alert", alert, ALERT_NO_CELLS);
    const declared = Object.values(index.axes.properties).reduce((n, o) => n * o.length, 1);
    expect(declared).toBe(32);
    expect(index.pairs.length + index.skipped.length).toBe(23);
    expect(declared - (index.pairs.length + index.skipped.length)).toBe(9);
  });

  it("indexes a set whose EVERY variant skipped — when the run root gets no directory at all", () => {
    const index = indexOf("ds-alert", alert, ALERT_NO_CELLS);
    expect(index.pairs).toEqual([]);
    expect(index.skipped).toHaveLength(23);
    // Still a complete artifact: the set's name, its axes, and a reason per cell.
    expect(index.setName).toBe("*Alert");
    expect(index.axes.properties["Color"]).toEqual(["Info", "Success", "Warning", "Error"]);
    expect(new Set(index.skipped.map((s) => s.reason)).size).toBe(23);
    for (const s of index.skipped) {
      expect(s.reason).toContain("no cell mapping for");
      expect(Object.keys(s.props).sort()).toEqual(["Aligned", "Color", "Type"]);
    }
  });

  it("omits `title` rather than writing it null, and takes the clock it is given", () => {
    const index = indexOf("ds-alert", alert, ALERT_NO_CELLS);
    expect("title" in index).toBe(false);
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
    expect(buildSetIndex({
      entryId: "e",
      designRef: "f#1",
      axes: { source: "definitions", properties: {} },
      expansion: { setId: "1", setName: "S", pairs: [], skipped: [] },
    }).createdAt).not.toBe("");
  });
});

describe("setIndexFileName", () => {
  it("is a FILE beside the run dirs, so every isDirectory() walker ignores it", () => {
    // A `sets/` directory would be read as a run dir by `readRunDirs` and by
    // the annotator's own scan — counted in summaries and drawn as a broken
    // card in the Library — until each of them special-cased it.
    expect(setIndexFileName("ds-button-fill")).toBe("ds-button-fill.set.json");
    expect(setIndexFileName("ds-alert").endsWith(".set.json")).toBe(true);
    expect(setIndexFileName("ds-alert")).not.toContain("/");
  });
});

describe("buildSetIndex — the gallery declaration (chunk 4)", () => {
  it("carries the manifest's gallery VERBATIM, including a property this set has no axis for", () => {
    // Deliberate: `columns: "Nonsense"` is shape-valid (the manifest parser has
    // no Figma node) and this artifact must not quietly repair or drop it. The
    // consumer holding `axes` is the only place the miss can be seen, and it
    // can only see what arrived.
    const gallery: GalleryConfig = {
      columns: "Nonsense",
      order: { State: ["Default", "Hover"] },
      labels: { State: { Default: "Rest" } },
    };
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL, { gallery });
    expect(index.gallery).toEqual(gallery);
    expect(Object.keys(index.axes.properties)).not.toContain("Nonsense");
  });

  it("omits the key entirely for an entry that declares none", () => {
    const index = indexOf("ds-button-fill", buttonFill, BUTTON_FILL);
    expect(index.gallery).toBeUndefined();
    expect("gallery" in index).toBe(false);
  });
});
