import { describe, expect, it } from "vitest";

import type { MatchResult } from "../pipeline.js";
import type { ElementNode } from "../types.js";
import { runTypedChecks } from "./checks.js";

const el = (id: string, partial: Partial<ElementNode> = {}): ElementNode => ({
  id,
  box: { x: 10, y: 10, w: 200, h: 40 },
  ...partial,
});

const matched = (design: ElementNode, impl: ElementNode): MatchResult => ({
  matches: [{ design, impl, gamma: 0, via: "geometry" }],
  designOnly: [],
  implOnly: [],
});

describe("runTypedChecks", () => {
  it("is quiet when the pair agrees within tolerances", () => {
    const design = el("d", {
      box: { x: 10, y: 10, w: 200, h: 40 },
      text: "Save",
      style: { color: "rgb(20, 20, 20)", fontSize: 14, fontWeight: 600 },
    });
    const impl = el("i", {
      box: { x: 12, y: 11, w: 198, h: 42 },
      text: "Save",
      style: { color: "rgb(21, 20, 20)", fontSize: 14, fontWeight: 600 },
    });
    expect(runTypedChecks(matched(design, impl))).toEqual([]);
  });

  it("reports unmatched elements as missing/extra, presence first", () => {
    const findings = runTypedChecks({
      matches: [],
      designOnly: [el("d", { box: { x: 0, y: 0, w: 100, h: 100 }, text: "Header" })],
      implOnly: [el("i", { box: { x: 0, y: 200, w: 10, h: 10 } })],
    });
    expect(findings.map((f) => f.type)).toEqual(["missing-element", "extra-element"]);
    expect(findings[0]!.severity).toBe("critical");
    expect(findings[0]!.designBox).toBeDefined();
    expect(findings[1]!.severity).toBe("minor");
  });

  it("measures position offsets beyond the 5px tolerance", () => {
    const findings = runTypedChecks(
      matched(
        el("d", { box: { x: 10, y: 10, w: 100, h: 20 } }),
        el("i", { box: { x: 10, y: 30, w: 100, h: 20 } }),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("position");
    expect(findings[0]!.severity).toBe("major"); // 20px > 3×tolerance
    expect(findings[0]!.expected).toEqual({ x: 10, y: 10 });
    expect(findings[0]!.actual).toEqual({ x: 10, y: 30 });
  });

  it("scores color differences with CIEDE2000", () => {
    const findings = runTypedChecks(
      matched(
        el("d", { style: { backgroundColor: "rgb(37, 99, 235)" } }),
        el("i", { style: { backgroundColor: "rgb(220, 38, 38)" } }),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("color");
    expect(findings[0]!.severity).toBe("major");
    expect(findings[0]!.message).toContain("ΔE2000");
  });

  it("ignores imperceptible color differences", () => {
    const findings = runTypedChecks(
      matched(
        el("d", { style: { backgroundColor: "rgb(37, 99, 235)" } }),
        el("i", { style: { backgroundColor: "rgb(38, 99, 236)" } }),
      ),
    );
    expect(findings).toEqual([]);
  });

  it("reports typography and border-radius deltas", () => {
    const findings = runTypedChecks(
      matched(
        el("d", { text: "Title", style: { fontSize: 24, fontWeight: 700, borderRadius: 8 } }),
        el("i", { text: "Title", style: { fontSize: 28, fontWeight: 400, borderRadius: 2 } }),
      ),
    );
    const types = findings.map((f) => f.type).sort();
    expect(types).toEqual(["border-radius", "typography"]);
    const typo = findings.find((f) => f.type === "typography")!;
    expect(typo.expected).toEqual({ fontSize: 24, fontWeight: 700 });
    expect(typo.actual).toEqual({ fontSize: 28, fontWeight: 400 });
  });

  it("keeps text-content findings minor", () => {
    const findings = runTypedChecks(
      matched(el("d", { text: "Uložiť" }), el("i", { text: "Save" })),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.type).toBe("text-content");
    expect(findings[0]!.severity).toBe("minor");
  });

  it("carries the element role so policies can key on it", () => {
    const findings = runTypedChecks({
      matches: [],
      designOnly: [el("d", { role: "icon", box: { x: 0, y: 0, w: 20, h: 20 } })],
      implOnly: [],
    });
    expect(findings[0]!.role).toBe("icon");
  });

  it("compares only height on pairs with differing text (data slots)", () => {
    const findings = runTypedChecks({
      matches: [
        {
          design: el("d", { text: "Alza.sk", box: { x: 10, y: 10, w: 68, h: 14 }, style: { fontSize: 12 } }),
          impl: el("i", { text: "Telekom", box: { x: 10, y: 10, w: 198, h: 14 }, style: { fontSize: 16 } }),
          gamma: 130,
          via: "slot",
        },
      ],
      designOnly: [],
      implOnly: [],
    });
    expect(findings.map((f) => f.type).sort()).toEqual(["text-content", "typography"]);

    const taller = runTypedChecks(
      matched(
        el("d", { text: "Alza.sk", box: { x: 10, y: 10, w: 68, h: 14 } }),
        el("i", { text: "Telekom", box: { x: 10, y: 10, w: 198, h: 24 } }),
      ),
    );
    const size = taller.find((f) => f.type === "size")!;
    expect(size.expected).toEqual({ h: 14 });
    expect(size.actual).toEqual({ h: 24 });
  });

  it("assigns sequential ids and marks in severity order", () => {
    const findings = runTypedChecks({
      matches: [
        {
          design: el("d", { text: "a" }),
          impl: el("i", { text: "b" }),
          gamma: 0,
          via: "geometry",
        },
      ],
      designOnly: [el("gone", { box: { x: 0, y: 0, w: 100, h: 100 } })],
      implOnly: [],
    });
    expect(findings.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(findings.map((f) => f.mark)).toEqual([1, 2]);
    expect(findings[0]!.type).toBe("missing-element");
  });
});
