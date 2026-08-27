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

  it("compares translucent colors flattened over white (folded CSS opacity, Figma paint opacity)", () => {
    // A disabled button at opacity .5: rgba(184, 92, 36, .5) over white ≈ rgb(220, 174, 146).
    const faded = runTypedChecks(
      matched(
        el("d", { style: { backgroundColor: "rgb(220, 174, 146)" } }),
        el("i", { style: { backgroundColor: "rgba(184, 92, 36, 0.5)" } }),
      ),
    );
    expect(faded).toEqual([]);
    // Ignoring the alpha would have called the full-strength orange a major color finding.
    const full = runTypedChecks(
      matched(
        el("d", { style: { backgroundColor: "rgb(220, 174, 146)" } }),
        el("i", { style: { backgroundColor: "rgb(184, 92, 36)" } }),
      ),
    );
    expect(full.map((f) => f.type)).toEqual(["color"]);
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

  describe("border", () => {
    it("is quiet for sub-pixel width and imperceptible color differences", () => {
      const findings = runTypedChecks(
        matched(
          el("d", { style: { borderWidth: 1, borderColor: "rgb(200, 200, 200)" } }),
          el("i", { style: { borderWidth: 1.33, borderColor: "rgb(201, 200, 200)" } }),
        ),
      );
      expect(findings).toEqual([]);
    });

    it("reports a border the design does not have as major", () => {
      const findings = runTypedChecks(
        matched(el("d", {}), el("i", { style: { borderWidth: 1, borderColor: "rgb(0, 0, 0)" } })),
      );
      expect(findings).toHaveLength(1);
      expect(findings[0]!.type).toBe("border");
      expect(findings[0]!.severity).toBe("major");
      expect(findings[0]!.expected).toEqual({ borderWidth: 0 });
      expect(findings[0]!.actual).toEqual({ borderWidth: 1, borderColor: "rgb(0, 0, 0)" });
    });

    it("treats a transparent border as no border", () => {
      const findings = runTypedChecks(
        matched(el("d", {}), el("i", { style: { borderWidth: 1, borderColor: "rgba(0, 0, 0, 0)" } })),
      );
      expect(findings).toEqual([]);
    });

    it("reports a missing border with a message that says so", () => {
      const findings = runTypedChecks(
        matched(el("d", { style: { borderWidth: 1, borderColor: "rgb(0, 0, 0)" } }), el("i", {})),
      );
      expect(findings[0]!.severity).toBe("major");
      expect(findings[0]!.message).toContain("no border, design has one");
    });

    it("does not compare decoration of non-text boxes whose size already differs", () => {
      const findings = runTypedChecks(
        matched(
          el("d", { role: "box", box: { x: 10, y: 10, w: 8, h: 8 }, style: { borderRadius: 4, backgroundColor: "rgb(0, 0, 0)" } }),
          el("i", { role: "box", box: { x: 10, y: 10, w: 18, h: 18 }, style: { borderRadius: 9, borderWidth: 1, borderColor: "rgb(0, 0, 0)", backgroundColor: "rgb(0, 0, 0)" } }),
        ),
      );
      expect(findings.map((f) => f.type)).toEqual(["size"]);
    });

    it("scores border color with CIEDE2000 and width by tolerance", () => {
      const minor = runTypedChecks(
        matched(
          el("d", { style: { borderWidth: 1, borderColor: "rgb(220, 220, 220)" } }),
          el("i", { style: { borderWidth: 2, borderColor: "rgb(205, 205, 205)" } }),
        ),
      );
      expect(minor).toHaveLength(1);
      expect(minor[0]!.type).toBe("border");
      expect(minor[0]!.severity).toBe("minor");
      expect(minor[0]!.message).toContain("width 2px vs 1px");
      expect(minor[0]!.message).toContain("ΔE2000");

      const major = runTypedChecks(
        matched(
          el("d", { style: { borderWidth: 1, borderColor: "rgb(37, 99, 235)" } }),
          el("i", { style: { borderWidth: 1, borderColor: "rgb(220, 38, 38)" } }),
        ),
      );
      expect(major[0]!.severity).toBe("major");
      expect(major[0]!.expected).toEqual({ borderWidth: 1, borderColor: "rgb(37, 99, 235)" });
    });
  });

  describe("spacing", () => {
    const stack = (implShift: number, rightShift = 0): MatchResult => ({
      matches: [
        {
          design: el("d1", { text: "Label", box: { x: 10, y: 10, w: 100, h: 20 } }),
          impl: el("i1", { text: "Label", box: { x: 10, y: 10, w: 100, h: 20 } }),
          gamma: 0,
          via: "text",
        },
        {
          design: el("d2", { text: "Value", box: { x: 10, y: 38, w: 100, h: 20 } }),
          impl: el("i2", { text: "Value", box: { x: 10, y: 38 + implShift, w: 100, h: 20 } }),
          gamma: 0,
          via: "text",
        },
        {
          design: el("d3", { text: "Side", box: { x: 130, y: 10, w: 40, h: 20 } }),
          impl: el("i3", { text: "Side", box: { x: 130 + rightShift, y: 10, w: 40, h: 20 } }),
          gamma: 0,
          via: "text",
        },
      ],
      designOnly: [],
      implOnly: [],
    });

    it("is quiet when gaps agree within 2px", () => {
      expect(runTypedChecks(stack(2)).filter((f) => f.type === "spacing")).toEqual([]);
    });

    it("reports a grown vertical gap as ONE finding spanning both elements", () => {
      const findings = runTypedChecks(stack(4));
      const spacing = findings.filter((f) => f.type === "spacing");
      expect(spacing).toHaveLength(1);
      expect(spacing[0]!.severity).toBe("minor");
      expect(spacing[0]!.expected).toEqual({ gap: 8, axis: "vertical" });
      expect(spacing[0]!.actual).toEqual({ gap: 12, axis: "vertical" });
      expect(spacing[0]!.designBox).toEqual({ x: 10, y: 10, w: 100, h: 48 });
      expect(spacing[0]!.implBox).toEqual({ x: 10, y: 10, w: 100, h: 52 });
      expect(spacing[0]!.message).toContain('between "Label" and "Value"');
      // Only a 4px shift: the moved element itself stays within position tolerance.
      expect(findings.filter((f) => f.type === "position")).toEqual([]);
    });

    it("is major beyond 8px and reports horizontal gaps too", () => {
      const findings = runTypedChecks(stack(24, 12)).filter((f) => f.type === "spacing");
      expect(findings.map((f) => [f.expected!["axis"], f.severity])).toEqual([
        ["vertical", "major"],
        ["horizontal", "major"],
      ]);
      expect(findings[1]!.expected).toEqual({ gap: 20, axis: "horizontal" });
      expect(findings[1]!.actual).toEqual({ gap: 32, axis: "horizontal" });
    });

    it("ignores wide layout distances and negative (overlapping) gaps", () => {
      const far: MatchResult = {
        matches: [
          {
            design: el("d1", { text: "Header", box: { x: 10, y: 10, w: 100, h: 20 } }),
            impl: el("i1", { text: "Header", box: { x: 10, y: 10, w: 100, h: 20 } }),
            gamma: 0,
            via: "text",
          },
          {
            design: el("d2", { text: "Footer", box: { x: 10, y: 400, w: 100, h: 20 } }),
            impl: el("i2", { text: "Footer", box: { x: 10, y: 380, w: 100, h: 20 } }),
            gamma: 0,
            via: "text",
          },
        ],
        designOnly: [],
        implOnly: [],
      };
      expect(runTypedChecks(far).filter((f) => f.type === "spacing")).toEqual([]);

      // Impl swapped the order: overlap on the impl side is a position matter.
      const swapped = stack(-40);
      expect(runTypedChecks(swapped).filter((f) => f.type === "spacing")).toEqual([]);
    });

    it("only measures gaps between elements adjacent on BOTH sides", () => {
      // A design-only row sits between Label and Value: that is a missing
      // element, and the Label→Value distance is not a sibling gap.
      const withMissing = stack(24);
      withMissing.designOnly = [el("gone", { text: "Popis", box: { x: 10, y: 34, w: 100, h: 20 } })];
      withMissing.matches[1] = {
        ...withMissing.matches[1]!,
        design: el("d2", { text: "Value", box: { x: 10, y: 62, w: 100, h: 20 } }),
      };
      expect(runTypedChecks(withMissing).filter((f) => f.type === "spacing")).toEqual([]);

      // An impl-only element wedged between them on the impl side, likewise.
      const withExtra = stack(24);
      withExtra.implOnly = [el("extra", { text: "Zdroj", box: { x: 10, y: 34, w: 100, h: 20 } })];
      expect(runTypedChecks(withExtra).filter((f) => f.type === "spacing")).toEqual([]);
    });

    it("skips horizontal gaps next to data slots (width is content)", () => {
      const m = stack(0, 12);
      m.matches[2] = {
        ...m.matches[2]!,
        impl: el("i3", { text: "Different", box: { x: 142, y: 10, w: 40, h: 20 } }),
      };
      const spacing = runTypedChecks(m).filter((f) => f.type === "spacing");
      expect(spacing).toEqual([]);
    });
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
