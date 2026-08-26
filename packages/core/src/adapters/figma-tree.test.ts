import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FigmaNode, FigmaNodesResponse, FigmaVariablesResponse } from "./figma-api.js";
import { figmaTreeToElements, indexVariables, paintToCss } from "./figma-tree.js";

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
    // A text's fill is its color, never a background of its own.
    expect(label.style?.backgroundColor).toBeUndefined();
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
    // The button instance has two children → the label does NOT take its fill.
    expect(byText("Save changes")!.style?.borderRadius).toBeUndefined();
    // Container with children and decoration is not itself a leaf; the pill
    // (cornerRadius 9999 on 160×40) would clamp to 20 if it were.
    expect(elements.some((e) => e.style?.borderRadius === 9999)).toBe(false);
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
