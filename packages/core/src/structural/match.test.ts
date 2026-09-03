import { describe, expect, it } from "vitest";

import type { ElementNode } from "../types.js";
import { DEFAULT_UNRELATED_MIN_GAMMA, gamma, matchElements, unrelatedPairing } from "./match.js";

const el = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text?: string,
): ElementNode => ({
  id,
  box: { x, y, w, h },
  ...(text !== undefined ? { text } : {}),
});

describe("gamma", () => {
  it("is the manhattan distance over x, y, w, h", () => {
    expect(gamma(el("a", 0, 0, 10, 10), el("b", 3, 4, 12, 8))).toBe(3 + 4 + 2 + 2);
  });
});

describe("matchElements", () => {
  it("pairs nearest neighbors and reports the leftovers", () => {
    const design = [el("d1", 0, 0, 100, 20), el("d2", 0, 50, 100, 20), el("d3", 0, 500, 40, 40)];
    const impl = [el("i1", 2, 1, 100, 20), el("i2", 1, 52, 98, 20)];

    const result = matchElements(design, impl);

    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((m) => [m.design.id, m.impl.id])).toEqual([
      ["d1", "i1"],
      ["d2", "i2"],
    ]);
    expect(result.designOnly.map((e) => e.id)).toEqual(["d3"]);
    expect(result.implOnly).toEqual([]);
  });

  it("never pairs elements beyond maxGamma", () => {
    const result = matchElements([el("d1", 0, 0, 10, 10)], [el("i1", 200, 200, 10, 10)], {
      maxGamma: 100,
    });
    expect(result.matches).toEqual([]);
    expect(result.designOnly).toHaveLength(1);
    expect(result.implOnly).toHaveLength(1);
  });

  it("assigns greedily from the globally smallest gamma", () => {
    // i1 is close to both d1 and d2, but closest to d2 — d2 must win it.
    const design = [el("d1", 0, 0, 10, 10), el("d2", 6, 0, 10, 10)];
    const impl = [el("i1", 5, 0, 10, 10)];
    const result = matchElements(design, impl);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.design.id).toBe("d2");
    expect(result.designOnly.map((e) => e.id)).toEqual(["d1"]);
  });

  it("pairs value slots width-blind when texts differ (slot pass)", () => {
    // Design shrink-wraps "Alza.sk s.r.o." (68px), impl stretches its cell to
    // the column (198px): γ = 130 > 100, yet same anchor and line height.
    const design = [el("d1", 280, 389, 68, 14, "Alza.sk s.r.o.")];
    const impl = [el("i1", 281, 390, 198, 14, "Slovak Telekom, a.s.")];
    const result = matchElements(design, impl);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.via).toBe("slot");
    expect(result.designOnly).toEqual([]);
    expect(result.implOnly).toEqual([]);
  });

  it("slot pass never pairs non-text or far-apart elements", () => {
    // 60px apart vertically AND 250px wider: γ = 310 (no geometry match),
    // slot distance 60 > 40 (no slot match either).
    const farText = matchElements([el("d1", 0, 0, 50, 14, "a")], [el("i1", 0, 60, 300, 14, "b")]);
    expect(farText.matches).toEqual([]);
    const boxes = matchElements([el("d1", 0, 0, 50, 14)], [el("i1", 0, 0, 300, 14)]);
    expect(boxes.matches).toEqual([]);
    const disabled = matchElements(
      [el("d1", 0, 0, 50, 14, "a")],
      [el("i1", 0, 0, 300, 14, "b")],
      { slotMaxGamma: 0 },
    );
    expect(disabled.matches).toEqual([]);
  });

  it("breaks gamma ties on matching text", () => {
    // Two identical boxes; the impl element carries d2's text.
    const design = [el("d1", 0, 0, 50, 10, "alpha"), el("d2", 0, 0, 50, 10, "beta")];
    const impl = [el("i1", 0, 0, 50, 10, "beta")];
    const result = matchElements(design, impl);
    expect(result.matches[0]!.design.id).toBe("d2");
  });

  // The Library comp's chip row (plan-next §15): `Pending` is not drawn, the
  // flex:1 search field absorbs its 78 px and every chip after it shifts.
  // "Figma" / "Claude Design" are NOT unique (the cards' source chips repeat
  // them), so pass 1 cannot claim them and the greedy γ paired design
  // "Claude Design" (x 435) with impl "Figma" (x 446): one cause, six findings.
  it("pairs repeated texts by content before the nearest box under a lateral shift", () => {
    const design = [
      el("d-figma", 360, 114, 60, 20, "Figma"),
      el("d-cd", 435, 114, 100, 20, "Claude Design"),
      el("c-figma", 100, 400, 60, 20, "Figma"), // a card's source chip: makes the text non-unique
      el("c-cd", 100, 500, 100, 20, "Claude Design"),
    ];
    const impl = [
      el("i-figma", 446, 114, 60, 20, "Figma"),
      el("i-cd", 513, 114, 100, 20, "Claude Design"),
      el("k-figma", 100, 400, 60, 20, "Figma"),
      el("k-cd", 100, 500, 100, 20, "Claude Design"),
    ];
    const r = matchElements(design, impl);
    const pairs = Object.fromEntries(r.matches.map((m) => [m.design.id, m.impl.id]));
    expect(pairs).toEqual({ "d-figma": "i-figma", "d-cd": "i-cd", "c-figma": "k-figma", "c-cd": "k-cd" });
    expect(r.matches.filter((m) => m.design.id === "d-cd")[0]?.via).toBe("text");
    expect(r.designOnly).toEqual([]);
    expect(r.implOnly).toEqual([]);
  });

  it("keeps the same-text band bounded: a `5` badge never pairs with a `5` chip three rows away", () => {
    const design = [el("badge", 20, 100, 12, 12, "5"), el("other", 20, 700, 12, 12, "5")];
    const impl = [el("chip", 20, 400, 12, 12, "5")]; // 300 px below the badge, 300 above the other
    const r = matchElements(design, impl, { maxGamma: 100 }); // band = 200
    expect(r.matches).toEqual([]);
    expect(r.implOnly.map((e) => e.id)).toEqual(["chip"]);
    // Within the band, the text wins over a nearer box of a different text.
    const near = matchElements(
      [el("badge", 20, 100, 12, 12, "5"), el("dot", 20, 250, 12, 12, "•")],
      [el("chip", 20, 260, 12, 12, "5")],
    );
    expect(near.matches.map((m) => [m.design.id, m.impl.id, m.via])).toEqual([["badge", "chip", "text"]]);
  });

  // The veto: a pairing PROVED wrong rather than merely different. Every row is
  // measured from the corpus that produced the rule (out/refdiff, 2026-09-02) —
  // the four accepted ones are pairings the loop wants kept, and if any of them
  // starts being vetoed the rule is broken, not the fixture.
  describe("the unrelated-text veto", () => {
    // The measured case: a rail badge "6" paired with a prop-line "element" 90 γ
    // away because the two lists are in a different order. Both texts occur on
    // the other side, so both elements had a same-text partner available and
    // this pair is not it.
    // The fixture has to reproduce WHY the earlier passes let it through, or it
    // proves nothing: "element" occurs twice on each side, so the unique-text
    // pass skips it; "6" is one character, and `uniqueTextIndices` skips a text
    // under 3 chars whatever its multiplicity; and the same-text pass is bounded
    // (in the corpus the two badge "6"s were 204 px apart against a 200 px
    // bound — four pixels), which `textMaxGamma: 1` stands in for here.
    const design = [
      el("badge6", 1058, 787, 7, 14, "6"),
      el("prop", 1080, 500, 49, 14, "element"),
      el("propFar", 9000, 9000, 49, 14, "element"),
    ];
    const impl = [
      el("elem", 1080, 813, 49, 14, "element"),
      el("badge6i", 1070, 530, 7, 14, "6"),
      el("badgeFar", 9500, 9500, 7, 14, "6"),
    ];

    it("refuses the pairing and reports both sides instead", () => {
      const r = matchElements(design, impl, { textMaxGamma: 1 });
      expect(r.matches).toEqual([]);
      expect(r.designOnly.map((e) => e.id)).toEqual(["badge6", "prop", "propFar"]);
      expect(r.implOnly.map((e) => e.id)).toEqual(["elem", "badge6i", "badgeFar"]);
      expect(r.vetoed?.map((v) => [v.designText, v.implText])).toEqual(
        expect.arrayContaining([["6", "element"], ["element", "6"]]),
      );
    });

    it("is what stands between the pair and five findings about two unrelated elements", () => {
      const without = matchElements(design, impl, { textMaxGamma: 1, unrelatedMinGamma: 0 });
      expect(without.matches.map((m) => [m.design.id, m.impl.id])).toEqual([
        ["prop", "badge6i"],
        ["badge6", "elem"],
      ]);
      expect(without.vetoed).toBeUndefined();
    });

    const texts = (side: readonly ElementNode[]) =>
      new Set(side.map((e) => (e.text ?? "").toLowerCase()).filter((t) => t.length > 0));
    const veto = (
      d: ElementNode,
      i: ElementNode,
      designSide: readonly ElementNode[] = [d],
      implSide: readonly ElementNode[] = [i],
    ) => unrelatedPairing(d, i, gamma(d, i), texts(designSide), texts(implSide));

    it("reports only the vetoes with a consequence — a refused candidate that would have lost anyway is not news", () => {
      // The veto works on candidates, so the assignment can still give both
      // elements their right partners; measured on the Library pairs, whose
      // outcome is byte-identical with and without it.
      const d = [el("d1", 0, 0, 60, 15, "Major 2"), el("d2", 0, 40, 60, 15, "Critical 3")];
      const i = [el("i1", 0, 41, 60, 15, "Critical 3"), el("i2", 1, 1, 60, 15, "Major 2")];
      const r = matchElements(d, i);
      expect(r.matches.map((m) => [m.design.id, m.impl.id])).toEqual([
        ["d1", "i2"],
        ["d2", "i1"],
      ]);
      expect(r.vetoed).toBeUndefined();
    });

    it("keeps a VALUE SLOT in the same place — the zoom pill, a card count", () => {
      // 146% vs 100% at γ 0.5, and a count at γ 0: measured, both kept.
      const zoomD = el("zd", 99, 782, 28, 15, "146%");
      const zoomI = el("zi", 99, 782, 28, 15, "100%");
      expect(veto(zoomD, zoomI)).toBe(false);
      expect(veto(el("cd", 0, 0, 7, 14, "3"), el("ci", 0, 0, 7, 14, "4"))).toBe(false);
    });

    it("keeps a status chip whose word the impl does not use anywhere", () => {
      // The Library's Pending → Pass at γ 19, Processing → Clean at γ 52: the
      // comp's word is nowhere on the impl side, so nothing proves the pairing
      // wrong and the text-pattern policy is what decides it.
      const d = el("d", 20, 100, 60, 15, "Processing");
      const i = el("i", 20, 140, 40, 15, "Clean");
      expect(gamma(d, i)).toBeGreaterThan(DEFAULT_UNRELATED_MIN_GAMMA);
      expect(veto(d, i)).toBe(false);
    });

    it("keeps copy drift, which shares tokens", () => {
      const d = el("d", 0, 0, 120, 14, "Blok · 12. 7. 2026");
      const i = el("i", 0, 40, 130, 14, "Doklad · 12. 7. 2026");
      expect(veto(d, i, [d, el("x", 0, 0, 130, 14, "Doklad · 12. 7. 2026")], [i, el("y", 0, 0, 120, 14, "Blok · 12. 7. 2026")])).toBe(false);
    });

    it("does not let the slot pass re-create what it refused, and leaves a real slot alone", () => {
      // A slot pair's full γ is dominated by the width it exists to forgive, so
      // pass 3's veto is measured on the anchor alone: this pair is 40 px away
      // and refused, while the Alza/Telekom slot below is 2 px away and kept.
      const r = matchElements(design, impl, { textMaxGamma: 1 });
      expect(r.matches.filter((m) => m.via === "slot")).toEqual([]);
      const slot = matchElements(
        [el("d1", 280, 389, 68, 14, "Alza.sk s.r.o.")],
        [el("i1", 281, 390, 198, 14, "Slovak Telekom, a.s.")],
      );
      expect(slot.matches.map((m) => m.via)).toEqual(["slot"]);
      expect(gamma(el("d1", 280, 389, 68, 14), el("i1", 281, 390, 198, 14))).toBeGreaterThan(
        DEFAULT_UNRELATED_MIN_GAMMA,
      );
    });

    it("needs BOTH counterparts — one is not proof", () => {
      // Measured: "missing" ↔ "×14" at γ 88.5 is a mispairing the veto lets
      // through, because "×14" is nowhere on the design side. Conservative on
      // purpose: the veto only fires on symmetric evidence.
      const d = el("d", 1208, 567, 49, 14, "missing");
      const i = el("i", 1188, 553, 21, 14, "×14");
      const oneWay = unrelatedPairing(d, i, gamma(d, i), texts([d]), texts([i, el("m", 0, 0, 49, 14, "missing")]));
      expect(oneWay).toBe(false);
    });
  });
});
