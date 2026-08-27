import { describe, expect, it } from "vitest";

import type { ElementNode } from "../types.js";
import { estimateTransform } from "./align.js";

const el = (id: string, x: number, y: number, w: number, h: number, text?: string): ElementNode => ({
  id,
  box: { x, y, w, h },
  role: text ? "text" : "box",
  ...(text ? { text } : {}),
});

describe("estimateTransform", () => {
  it("fits per-axis scale + offset from ≥3 unique-text anchors", () => {
    // Anchors must be separated on BOTH axes (≥24px) for a slope to exist.
    const design = [el("a", 10, 10, 50, 10, "Alpha"), el("b", 110, 60, 50, 10, "Bravo"), el("c", 210, 130, 50, 10, "Charlie"), el("x", 400, 400, 30, 30)];
    // impl = design × 2 + (5, 7)
    const impl = [el("a", 25, 27, 100, 20, "Alpha"), el("b", 225, 127, 100, 20, "Bravo"), el("c", 425, 267, 100, 20, "Charlie"), el("y", 900, 900, 5, 5)];
    const t = estimateTransform(design, impl);
    expect(t.anchors).toBe(3);
    expect(t.scaleX).toBeCloseTo(2, 5);
    expect(t.scaleY).toBeCloseTo(2, 5);
    expect(t.offsetX).toBeCloseTo(5, 5);
    expect(t.offsetY).toBeCloseTo(7, 5);
    expect(t.confidence).toBeCloseTo(3 / 8, 5);
  });

  it("uses a pure offset when EVERY design leaf is an anchor (one component vs one cell)", () => {
    // A Figma variant COMPONENT: one label, centred in a 76×40 button at (12, 12).
    const design = [el("label", 12, 12, 52, 16, "LABEL")];
    // The story cell is wider (92px) and the label is a different size: centre moves by (+8.1, −3).
    const impl = [el("label", 29.4, 8, 33.3, 19, "LABEL")];
    const t = estimateTransform(design, impl);
    expect(t.anchors).toBe(1);
    expect([t.scaleX, t.scaleY]).toEqual([1, 1]);
    expect(t.offsetX).toBeCloseTo(29.4 + 33.3 / 2 - (12 + 26), 5);
    expect(t.offsetY).toBeCloseTo(8 + 9.5 - (12 + 8), 5);
    // Honest about how little it rests on: 1 anchor → 1/8.
    expect(t.confidence).toBeCloseTo(1 / 8, 5);
  });

  it("stays at identity when a page shares only an accidental word", () => {
    const design = [el("t", 10, 10, 60, 12, "Uložiť"), el("v", 300, 400, 80, 20), el("w", 500, 40, 80, 20, "Iné")];
    const impl = [el("t", 400, 700, 60, 12, "Uložiť"), el("v", 300, 400, 80, 20)];
    const t = estimateTransform(design, impl);
    expect(t.anchors).toBe(1);
    expect(t).toMatchObject({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, confidence: 0 });
  });
});
