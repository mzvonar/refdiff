/**
 * Element matching — the GVT geometric assignment (pure).
 *
 * Nearest-neighbor on γ = |Δx| + |Δy| + |Δw| + |Δh| over the normalized
 * CSS-px boxes, assigned greedily from the globally smallest γ up.
 * Unmatched design elements become missing-element findings; unmatched impl
 * elements become extra-element findings (done in checks.ts).
 */

import type { ElementMatch, MatchResult } from "../pipeline.js";
import type { ElementNode } from "../types.js";
import { normalizeForMatching } from "./text.js"

export interface MatchOptions {
  /**
   * Max γ (CSS px) for a credible match. Above it, elements are reported
   * missing/extra rather than force-paired with an absurd partner.
   */
  maxGamma?: number;
  /**
   * Max width-blind distance (|Δx|+|Δy|+|Δh|) for the slot pass that pairs
   * leftover TEXT elements sharing an anchor and line height but not a
   * width — value slots rendering different data (a block-width cell vs a
   * shrink-wrapped one). 0 disables the pass.
   */
  slotMaxGamma?: number;
}

export const DEFAULT_MAX_GAMMA = 100;
export const DEFAULT_SLOT_MAX_GAMMA = 40;

export function gamma(a: ElementNode, b: ElementNode): number {
  return (
    Math.abs(a.box.x - b.box.x) +
    Math.abs(a.box.y - b.box.y) +
    Math.abs(a.box.w - b.box.w) +
    Math.abs(a.box.h - b.box.h)
  );
}

/** Width-blind distance: same left/top anchor and same line height. */
export function slotGamma(a: ElementNode, b: ElementNode): number {
  return Math.abs(a.box.x - b.box.x) + Math.abs(a.box.y - b.box.y) + Math.abs(a.box.h - b.box.h);
}

const normText = (t: string | undefined): string | undefined =>
  t === undefined ? undefined : normalizeForMatching(t);

/** Indices of elements whose normalized text appears exactly once. */
function uniqueTextIndices(elements: readonly ElementNode[]): Map<string, number> {
  const counts = new Map<string, number[]>();
  for (let i = 0; i < elements.length; i++) {
    const key = normText(elements[i]!.text);
    if (key === undefined || key.length < 3) continue;
    const bucket = counts.get(key);
    if (bucket) bucket.push(i);
    else counts.set(key, [i]);
  }
  const unique = new Map<string, number>();
  for (const [key, idxs] of counts) if (idxs.length === 1) unique.set(key, idxs[0]!);
  return unique;
}

export function matchElements(
  design: readonly ElementNode[],
  impl: readonly ElementNode[],
  { maxGamma = DEFAULT_MAX_GAMMA, slotMaxGamma = DEFAULT_SLOT_MAX_GAMMA }: MatchOptions = {},
): MatchResult {
  const designTaken = new Set<number>();
  const implTaken = new Set<number>();
  const matches: ElementMatch[] = [];

  // Pass 1 — content identity: an element whose text appears exactly once
  // on each side IS the same semantic element, wherever it moved
  // (Design2Code matches text blocks by content, then scores geometry).
  // Its displacement then becomes a position finding, not missing+extra.
  const designUnique = uniqueTextIndices(design);
  const implUnique = uniqueTextIndices(impl);
  for (const [key, di] of designUnique) {
    const ii = implUnique.get(key);
    if (ii === undefined) continue;
    designTaken.add(di);
    implTaken.add(ii);
    matches.push({
      design: design[di]!,
      impl: impl[ii]!,
      gamma: gamma(design[di]!, impl[ii]!),
      via: "text",
    });
  }

  // Pass 2 — GVT geometric assignment for everything else: greedy from the
  // globally smallest γ, matching-text ties first.
  interface Candidate {
    di: number;
    ii: number;
    gamma: number;
    /** 0 when both carry the same text — used only to break γ ties. */
    textTie: number;
  }

  const candidates: Candidate[] = [];
  for (let di = 0; di < design.length; di++) {
    if (designTaken.has(di)) continue;
    const d = design[di]!;
    for (let ii = 0; ii < impl.length; ii++) {
      if (implTaken.has(ii)) continue;
      const i = impl[ii]!;
      const g = gamma(d, i);
      if (g > maxGamma) continue;
      const dt = normText(d.text);
      const it = normText(i.text);
      candidates.push({
        di,
        ii,
        gamma: g,
        textTie: dt !== undefined && dt === it ? 0 : 1,
      });
    }
  }

  candidates.sort((a, b) => a.gamma - b.gamma || a.textTie - b.textTie);

  for (const c of candidates) {
    if (designTaken.has(c.di) || implTaken.has(c.ii)) continue;
    designTaken.add(c.di);
    implTaken.add(c.ii);
    matches.push({ design: design[c.di]!, impl: impl[c.ii]!, gamma: c.gamma, via: "geometry" });
  }

  // Pass 3 — slot pairing for leftover text: a design value cell that
  // shrink-wraps "Alza.sk s.r.o." and an impl cell that stretches to its
  // column with "Slovak Telekom" share an anchor and a line height but not
  // a width, so γ rejects them. They are the same slot showing different
  // data — pair them (width-blind) so the data-slot policy can classify
  // the text difference instead of reporting missing + extra.
  if (slotMaxGamma > 0) {
    interface SlotCandidate {
      di: number;
      ii: number;
      dist: number;
    }
    const slots: SlotCandidate[] = [];
    for (let di = 0; di < design.length; di++) {
      if (designTaken.has(di) || design[di]!.text === undefined) continue;
      for (let ii = 0; ii < impl.length; ii++) {
        if (implTaken.has(ii) || impl[ii]!.text === undefined) continue;
        const dist = slotGamma(design[di]!, impl[ii]!);
        if (dist <= slotMaxGamma) slots.push({ di, ii, dist });
      }
    }
    slots.sort((a, b) => a.dist - b.dist);
    for (const c of slots) {
      if (designTaken.has(c.di) || implTaken.has(c.ii)) continue;
      designTaken.add(c.di);
      implTaken.add(c.ii);
      matches.push({
        design: design[c.di]!,
        impl: impl[c.ii]!,
        gamma: gamma(design[c.di]!, impl[c.ii]!),
        via: "slot",
      });
    }
  }

  return {
    matches,
    designOnly: design.filter((_, i) => !designTaken.has(i)),
    implOnly: impl.filter((_, i) => !implTaken.has(i)),
  };
}
