import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FigmaNode, FigmaNodesResponse, FigmaVariablesResponse } from "./figma-api.js";
import { applyTextCase, figmaTreeToElements, indexVariables, paintToCss } from "./figma-tree.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../test/fixtures/figma");
const nodes = JSON.parse(readFileSync(join(fixtures, "nodes-button.json"), "utf8")) as FigmaNodesResponse;
const variables = JSON.parse(readFileSync(join(fixtures, "variables.json"), "utf8")) as FigmaVariablesResponse;
const root = nodes.nodes["1:2"]!.document;

describe("paintToCss", () => {
  it("emits rgb()/rgba() like the DOM side, folding paint opacity into alpha", () => {
    expect(paintToCss({ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } })).toBe("rgb(255, 0, 0)");
    expect(paintToCss({ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 0.5 })).toBe("rgba(0, 0, 255, 0.5)");
    expect(paintToCss({ type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0, a: 1 } })).toBeUndefined();
    expect(paintToCss({ type: "GRADIENT_LINEAR" })).toBeUndefined();
  });
});

describe("figmaTreeToElements", () => {
  const { elements, quality, width, height } = figmaTreeToElements(root, indexVariables(variables));
  const byText = (t: string) => elements.find((e) => e.text === t);

  it("uses the root's bounding box as the coordinate frame (CSS px, scale 1)", () => {
    expect([width, height]).toEqual([240, 80]);
    const label = byText("Save changes")!;
    expect(label.box).toEqual({ x: 60, y: 30, w: 104, h: 20 });
  });

  it("emits text leaves with collapsed whitespace, typography and glyph color", () => {
    const label = byText("Save changes")!;
    expect(label.role).toBe("text");
    expect(label.style).toMatchObject({
      color: "rgb(255, 255, 255)",
      fontFamily: "Inter",
      fontSize: 14,
      fontWeight: 600,
      lineHeight: 20,
    });
    // A text's fill is its color, never a background of its own — the background it
    // carries is the button's, hoisted (the icon sibling does not break the chain).
    expect(label.style?.backgroundColor).toBe("rgb(16, 118, 232)");
  });

  it("collapses an all-vector instance into one icon leaf and never descends into it", () => {
    const icon = elements.find((e) => e.role === "icon")!;
    expect(icon.box).toEqual({ x: 36, y: 32, w: 16, h: 16 });
    expect(elements.filter((e) => e.id.startsWith("vector"))).toHaveLength(0);
  });

  it("hoists decoration from a single-child ancestor and clamps pill radii", () => {
    // ⋯ inside a bordered 40×24 frame: border + radius belong to the text leaf.
    const dots = byText("⋯")!;
    expect(dots.style).toMatchObject({ borderWidth: 2, borderColor: "rgb(51, 51, 51)", borderRadius: 8 });
    // The button instance has two children, icon + label → the label takes its
    // fill/radius (an icon sibling is part of the same labelled control), and the
    // pill radius (cornerRadius 9999 on 160×40) is clamped to the button's 20.
    expect(byText("Save changes")!.style?.borderRadius).toBe(20);
    // Container with children and decoration is not itself a leaf.
    expect(elements.some((e) => e.style?.borderRadius === 9999)).toBe(false);
    // The icon does not take the button's paint.
    expect(elements.find((e) => e.role === "icon")!.style?.backgroundColor).toBeUndefined();
  });

  it("skips invisible, transparent and childless-undecorated nodes", () => {
    expect(elements.some((e) => e.box.w === 240 && e.box.h === 80)).toBe(false); // hidden rect
    expect(elements.some((e) => e.box.w === 10 && e.box.h === 10)).toBe(false); // opacity 0
    expect(elements.some((e) => e.box.x === 100 && e.box.w === 20)).toBe(false); // empty frame, no paint
    expect(elements).toHaveLength(4); // icon, label, ⋯, helper
  });

  it("resolves bound variables to names and records shared styles as tokens", () => {
    expect(byText("Save changes")!.token).toEqual({ color: "color/primary/fg", typography: "style:S:abc" });
    expect(byText("⋯")!.token).toBeUndefined();
  });

  it("drops INTRINSIC_% line heights and folds alpha into rgba()", () => {
    const helper = byText("Helper text")!;
    expect(helper.style?.lineHeight).toBeUndefined();
    expect(helper.style?.color).toBe("rgba(128, 128, 128, 0.5)");
  });

  it("scores quality as the bound share penalized by detached instances", () => {
    // 4 leaves, 1 bound (label). 3 instances, 1 detached → ×(1 − 0.5·⅓).
    expect(quality).toEqual({ score: 0.21, leaves: 4, bound: 1, instances: 3, detached: 1 });
  });

  it("falls back to variable ids when the variables endpoint is unavailable", () => {
    const { elements: plain } = figmaTreeToElements(root, indexVariables(undefined));
    expect(plain.find((e) => e.text === "Save changes")!.token?.["color"]).toBe("VariableID:1:101");
  });

  it("returns an empty mapping for a frame without visible content", () => {
    const empty: FigmaNode = {
      id: "0:1",
      name: "blank",
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 100 },
      children: [{ id: "0:2", name: "t", type: "TEXT", characters: "   ", absoluteBoundingBox: { x: 0, y: 0, width: 10, height: 10 } }],
    };
    const m = figmaTreeToElements(empty);
    expect(m.elements).toEqual([]);
    expect(m.quality.score).toBe(0);
  });
});

describe("applyTextCase", () => {
  it("renders Figma textCase like CSS text-transform", () => {
    expect(applyTextCase("label", "UPPER")).toBe("LABEL");
    expect(applyTextCase("Label", "LOWER")).toBe("label");
    expect(applyTextCase("save all changes", "TITLE")).toBe("Save All Changes");
    expect(applyTextCase("Label", "ORIGINAL")).toBe("Label");
    expect(applyTextCase("Label", undefined)).toBe("Label");
  });
});

/**
 * The REAL `/v1/files/:key/nodes?geometry=paths` response for the
 * population-registry DS `*Button/Fill` COMPONENT_SET (recorded 2026-08-27,
 * fileKey M0hnCQJIUho3tcW6PcnHWH, node 8226:4244): 42 variant COMPONENTs,
 * INSTANCE icons (`*Icon/globe`, `*Icon/loader`), Focus variants wrapped in a
 * FRAME with a stroked focus-ring RECTANGLE, variables bound but no variables
 * endpoint (non-Enterprise plan).
 */
describe("figmaTreeToElements on the recorded Button/Fill component set", () => {
  const real = JSON.parse(readFileSync(join(fixtures, "nodes-button-fill-set.json"), "utf8")) as FigmaNodesResponse;
  const set = real.nodes["8226:4244"]!.document;
  const { elements, quality, width, height } = figmaTreeToElements(set, indexVariables(undefined));
  const roles = elements.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.role ?? "?"]: (acc[e.role ?? "?"] ?? 0) + 1 }), {});

  it("uses the set's bounding box and emits one leaf per label, icon and focus ring", () => {
    expect([width, height]).toEqual([1283, 761]);
    // 42 variants → 42 labels; 27 icon instances (globe/loader) → 27 icons; 7 Focus rings → 7 boxes.
    // …and 7 SURFACES, one per Focus variant (42 variants / 6 states). Those are the
    // button fills that were invisible before: hoisting gives a painted frame's
    // decoration to its lone label, but a Focus variant's frame has a focus-ring
    // child too, and a ring is not icon-like, so it BREAKS the chain and the label
    // cannot claim the fill. The other 35 frames are still not emitted — their
    // labels did claim them (`claimed`), and emitting both would report every pill
    // twice, which is what the "Container with children and decoration is not
    // itself a leaf" test below pins.
    expect(roles).toEqual({ text: 42, icon: 27, box: 7, surface: 7 });
    const surfaces = elements.filter((e) => e.role === "surface");
    // They carry real paint — otherwise this channel would be adding noise, not design.
    expect(surfaces.every((e) => e.style?.backgroundColor !== undefined)).toBe(true);
    expect(elements.some((e) => e.id.startsWith("vector") || e.id.startsWith("boolean_operation"))).toBe(false);
  });

  it("applies textCase UPPER so the label reads as rendered (LABEL, not label)", () => {
    const labels = elements.filter((e) => e.role === "text").map((e) => e.text);
    expect(new Set(labels)).toEqual(new Set(["LABEL", "SUCCESS", "DANGER"]));
  });

  it("keeps HUGGING TEXT boxes (textAutoResize WIDTH_AND_HEIGHT) at the layout box, not the glyph-ink render bounds", () => {
    // absoluteRenderBounds is 49.86×9.8 for this label; the DOM side measures
    // advance × content-area, so the 52×16 layout box is the closer analogue.
    const label = elements.find((e) => e.role === "text")!;
    expect(label.box).toEqual({ x: 127, y: 193, w: 52, h: 16 });
    expect(label.style).toMatchObject({ fontFamily: "Montserrat", fontSize: 14, lineHeight: 16, fontWeight: 700, color: "rgb(0, 0, 0)" });
  });

  it("hoists the variant's fill/radius onto a lone label AND onto a label with an icon sibling", () => {
    const lone = elements.find((e) => e.box.x === 127 && e.box.y === 193)!; // State=Default, iconPlacement=none
    expect(lone.style).toMatchObject({ backgroundColor: "rgb(90, 216, 230)", borderRadius: 5 });
    // State=Loading, icon left: `[icon] LABEL` in a filled frame is one labelled control — the DOM
    // side emits the <button> itself as the text leaf with its paint, so the label carries it here.
    const withIcon = elements.find((e) => e.box.x === 1123 && e.box.y === 193)!;
    expect(withIcon.style).toMatchObject({ backgroundColor: "rgb(90, 216, 230)", borderRadius: 5 });
    // The icon itself does not take the button's paint.
    const icon = elements.find((e) => e.role === "icon" && e.box.y === 189 && e.box.x > 1080 && e.box.x < 1123)!;
    expect(icon?.style?.backgroundColor).toBeUndefined();
  });

  it("collapses INSTANCE icons to one 24×24 leaf and keeps the stroked focus ring as a bordered box", () => {
    const icons = elements.filter((e) => e.role === "icon");
    expect(icons.every((e) => e.box.w === 24 && e.box.h === 24)).toBe(true);
    const ring = elements.find((e) => e.role === "box" && e.box.w === 84 && e.box.h === 48)!;
    expect(ring.style).toMatchObject({ borderWidth: 2, borderColor: "rgb(89, 171, 230)", borderRadius: 10 });
    expect(ring.style?.backgroundColor).toBeUndefined();
  });

  it("folds the variant's LAYER opacity into every emitted color (State=Disabled draws at 0.3)", () => {
    const disabled = set.children!.filter((c) => c.name.startsWith("State=Disabled"));
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled.every((c) => Math.abs((c.opacity ?? 1) - 0.3) < 1e-6)).toBe(true);
    // Compare a Disabled variant on its own, as the CLI captures one variant COMPONENT per cell.
    const one = figmaTreeToElements(disabled[0]!, indexVariables(undefined)).elements;
    const label = one.find((e) => e.role === "text")!;
    expect(label.style).toMatchObject({ color: "rgba(0, 0, 0, 0.3)", backgroundColor: "rgba(90, 216, 230, 0.3)", opacity: 0.3 });
    // Full-strength variants are untouched.
    const full = figmaTreeToElements(set.children!.find((c) => c.name.startsWith("State=Default"))!, indexVariables(undefined)).elements;
    expect(full.find((e) => e.role === "text")!.style).toMatchObject({ color: "rgb(0, 0, 0)", backgroundColor: "rgb(90, 216, 230)" });
    expect(full.find((e) => e.role === "text")!.style?.opacity).toBeUndefined();
  });

  it("scores 0.64 with variable ids as tokens (no variables endpoint on this plan)", () => {
    expect(quality).toEqual({ score: 0.64, leaves: 76, bound: 49, instances: 27, detached: 0 });
    expect(elements.find((e) => e.role === "text")!.token?.["color"]).toMatch(/^VariableID:/);
  });
});

describe("figmaTreeToElements on the recorded Alert component set (fill-width text)", () => {
  const real = JSON.parse(readFileSync(join(fixtures, "nodes-alert-set.json"), "utf8")) as FigmaNodesResponse;
  const set = real.nodes["6765:4792"]!.document;
  const info = set.children!.find((c) => c.name === "Color=Info, Aligned=Left, Type=Text")!;
  const center = set.children!.find((c) => c.name === "Color=Info, Aligned=Center, Type=Text")!;

  it("measures a fill-width (textAutoResize HEIGHT) message by its glyph ink horizontally, layout box vertically", () => {
    const { elements } = figmaTreeToElements(info, indexVariables(undefined));
    const msg = elements.find((e) => e.role === "text")!;
    expect(msg.text).toBe("Left-aligned text + Responsive width.");
    // absoluteBoundingBox is 724×19 at x=48 (the row's free width); absoluteRenderBounds 255.3×13.2 at x=49.6.
    expect(msg.box).toEqual({ x: 49.6, y: 18.5, w: 255.31, h: 19 });
    expect(elements.find((e) => e.role === "icon")!.box).toEqual({ x: 16, y: 16, w: 24, h: 24 });
  });

  it("keeps a hugging (WIDTH_AND_HEIGHT) message at its layout box even inside the same set", () => {
    // "Center-aligned text + No responsive width." hugs: bbox 297×19 at x=261.5, render 295.3 wide.
    const { elements } = figmaTreeToElements(center, indexVariables(undefined));
    const msg = elements.find((e) => e.role === "text")!;
    expect(msg.box).toEqual({ x: 261.5, y: 18.5, w: 297, h: 19 });
  });

  it("exposes the raw node shape the decision rests on", () => {
    const text = info.children!.find((c) => c.type === "TEXT")!;
    expect(text.style?.textAutoResize).toBe("HEIGHT");
    expect(text.layoutSizingHorizontal).toBe("FILL");
    expect(text.absoluteBoundingBox!.width).toBe(724);
    expect(Math.round(text.absoluteRenderBounds!.width)).toBe(255);
  });
});
