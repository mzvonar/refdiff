import { describe, expect, it } from "vitest";

import { applyPolicy, mergePolicies } from "./policy.js";
import type { Finding } from "./types.js";

const finding = (id: string, partial: Partial<Finding>): Finding => ({
  id,
  mark: 0,
  type: "position",
  severity: "minor",
  message: "",
  ...partial,
});

const missing = (id: string, text: string, box = { x: 10, y: 10, w: 60, h: 14 }): Finding =>
  finding(id, {
    type: "missing-element",
    severity: "critical",
    role: "text",
    designBox: box,
    message: `design "${text}" (60×14) has no counterpart in the implementation`,
  });

const textDiff = (id: string, expected: string, actual: string): Finding =>
  finding(id, {
    type: "text-content",
    severity: "minor",
    role: "text",
    designBox: { x: 10, y: 50, w: 60, h: 14 },
    implBox: { x: 10, y: 50, w: 198, h: 14 },
    expected: { text: expected },
    actual: { text: actual },
    message: `text reads "${actual}", design says "${expected}"`,
  });

describe("applyPolicy", () => {
  it("keeps everything under an empty policy, renumbered", () => {
    const { kept, suppressed } = applyPolicy([missing("f9", "Alza"), textDiff("f3", "a", "b")]);
    expect(kept.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(kept.map((f) => f.mark)).toEqual([1, 2]);
    expect(suppressed).toEqual([]);
  });

  it("data-slot rule suppresses text-content only, other checks survive", () => {
    const position = finding("f2", {
      type: "position",
      designBox: { x: 10, y: 50, w: 60, h: 14 },
      implBox: { x: 30, y: 50, w: 198, h: 14 },
      message: `"Alza.sk s.r.o." is offset by (20, 0)px from the design position`,
    });
    const { kept, suppressed } = applyPolicy(
      [textDiff("f1", "Alza.sk s.r.o.", "Slovak Telekom, a.s."), position],
      { dataSlots: true },
    );
    expect(kept.map((f) => f.type)).toEqual(["position"]);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0]!.type).toBe("text-content");
    expect(suppressed[0]!.suppressedBy).toBe("data-slot");
    expect(suppressed[0]!.id).toBe("s1");
    // the original finding is intact in the suppressed list — never dropped
    expect(suppressed[0]!.expected).toEqual({ text: "Alza.sk s.r.o." });
  });

  it("text patterns match the element label and both compared strings", () => {
    const { kept, suppressed } = applyPolicy(
      [
        missing("f1", "FA-2026-0341"),
        missing("f2", "Extrahované údaje"),
        textDiff("f3", "1 249,00 €", "45,60 €"),
      ],
      { textPatterns: ["^FA-\\d{4}-\\d+$", "\\d+,\\d{2} €"] },
    );
    expect(kept.map((f) => f.message)).toEqual([
      'design "Extrahované údaje" (60×14) has no counterpart in the implementation',
    ]);
    expect(suppressed.map((s) => s.rule)).toEqual(["^FA-\\d{4}-\\d+$", "\\d+,\\d{2} €"]);
    expect(suppressed.every((s) => s.suppressedBy === "text-pattern")).toBe(true);
  });

  it("regions suppress findings whose box sits inside them (impl space)", () => {
    const inside = missing("f1", "1a", { x: 0, y: -20, w: 25, h: 16 });
    const outside = missing("f2", "Detail", { x: 60, y: 60, w: 60, h: 14 });
    const { kept, suppressed } = applyPolicy([inside, outside], {
      regions: [{ x: -10, y: -40, w: 800, h: 40 }],
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.message).toContain("Detail");
    expect(suppressed[0]!.suppressedBy).toBe("region");
  });

  it("roles suppress by element role", () => {
    const icon = finding("f1", {
      type: "extra-element",
      role: "icon",
      implBox: { x: 0, y: 0, w: 16, h: 16 },
      message: "implementation renders icon at (0, 0)",
    });
    const { kept, suppressed } = applyPolicy([icon, missing("f2", "x")], { roles: ["icon"] });
    expect(kept).toHaveLength(1);
    expect(suppressed[0]!.rule).toBe("icon");
  });

  it("does not mutate its input", () => {
    const input = [textDiff("f1", "a", "b")];
    const snapshot = JSON.stringify(input);
    applyPolicy(input, { dataSlots: true });
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("mergePolicies", () => {
  it("concatenates lists and lets later scalars win", () => {
    const merged = mergePolicies(
      { textPatterns: ["a"], scope: ".x", dataSlots: false },
      undefined,
      { textPatterns: ["b"], dataSlots: true },
    );
    expect(merged).toEqual({ textPatterns: ["a", "b"], scope: ".x", dataSlots: true });
  });
});

describe("accepted deviations", () => {
  const ink = {
    id: "f1",
    mark: 1,
    type: "color" as const,
    severity: "major" as const,
    role: "text",
    designBox: { x: 0, y: 0, w: 10, h: 10 },
    expected: { color: "rgb(26, 26, 26)" },
    actual: { color: "rgb(44, 36, 25)" },
    message: "ink",
  };
  const rule = {
    type: "color" as const,
    expected: { color: "rgb(26, 26, 26)" },
    actual: { color: "rgb(44, 36, 25)" },
    reason: "app ink token; the comp is the outlier",
  };

  it("suppresses a finding whose type and listed values match, keeping the reason", () => {
    const { kept, suppressed } = applyPolicy([ink], { accepted: [rule] });
    expect(kept).toEqual([]);
    expect(suppressed[0]).toMatchObject({ suppressedBy: "accepted", rule: rule.reason });
  });

  it("does not accept a different value, type, or a partial mismatch", () => {
    expect(applyPolicy([{ ...ink, actual: { color: "rgb(0, 0, 0)" } }], { accepted: [rule] }).kept).toHaveLength(1);
    expect(applyPolicy([{ ...ink, type: "border" }], { accepted: [rule] }).kept).toHaveLength(1);
    expect(applyPolicy([{ ...ink, actual: {} }], { accepted: [rule] }).kept).toHaveLength(1);
  });

  it("matches on the listed keys only (a type-wide acceptance needs no values)", () => {
    const { kept } = applyPolicy([ink], { accepted: [{ type: "color", reason: "all colors reviewed" }] });
    expect(kept).toEqual([]);
  });

  it("narrows by role when the rule names one (a boxless missing-element has no values to match)", () => {
    const { expected: _e, actual: _a, ...boxless } = ink;
    const ring = { ...boxless, type: "missing-element" as const, role: "box", message: "ring" };
    const rule = { type: "missing-element" as const, role: "box", reason: "focus ring is a CSS outline" };
    expect(applyPolicy([ring], { accepted: [rule] }).suppressed[0]).toMatchObject({ suppressedBy: "accepted", rule: rule.reason });
    expect(applyPolicy([{ ...ring, role: "text" }], { accepted: [rule] }).kept).toHaveLength(1);
    expect(applyPolicy([ring], { accepted: [{ type: rule.type, reason: rule.reason }] }).kept).toEqual([]);
  });

  it("concatenates accepted rules when merging policies", () => {
    const merged = mergePolicies({ accepted: [rule] }, { accepted: [{ type: "spacing", reason: "x" }] });
    expect(merged.accepted).toHaveLength(2);
  });
});
