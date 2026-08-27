/**
 * Typed per-pair checks — the structural channel's finding generators (pure).
 *
 * Severity follows the human-correlation evidence (research.md §3):
 * element presence and position correlate best with human judgment, color
 * second, everything else after. Raw text similarity is anti-correlated —
 * text findings stay minor.
 */

import { differenceCiede2000, parse } from "culori";

import type { ElementMatch, MatchResult } from "../pipeline.js";
import type { Box, ElementNode, Finding, FindingType, Severity } from "../types.js";

export interface CheckOptions {
  /** CSS px tolerance for position and size deltas (GVT calibration). */
  positionTolerance?: number;
  sizeTolerance?: number;
  /** CIEDE2000 thresholds: below `minor` colors count as equal. */
  colorDeltaEMinor?: number;
  colorDeltaEMajor?: number;
  fontSizeTolerance?: number;
  lineHeightTolerance?: number;
  radiusTolerance?: number;
  /** Border width deltas up to this many px count as equal (sub-pixel rendering). */
  borderWidthTolerance?: number;
  /** Sibling-gap deltas up to this many px count as equal; > `spacingMajor` is major. */
  spacingTolerance?: number;
  spacingMajor?: number;
  /** Design-side gaps wider than this are layout distance, not sibling spacing — not checked. */
  spacingMaxGap?: number;
  /** Elements smaller than this (either dimension) never report alone. */
  minElementSize?: number;
}

const DEFAULTS: Required<CheckOptions> = {
  positionTolerance: 5,
  sizeTolerance: 5,
  colorDeltaEMinor: 2.5,
  colorDeltaEMajor: 8,
  fontSizeTolerance: 0.6,
  lineHeightTolerance: 1.5,
  radiusTolerance: 1.5,
  borderWidthTolerance: 0.5,
  spacingTolerance: 2,
  spacingMajor: 8,
  spacingMaxGap: 64,
  minElementSize: 4,
};

export type RawFinding = Omit<Finding, "id" | "mark">;

const deltaE = differenceCiede2000();

const round1 = (n: number): number => Math.round(n * 10) / 10;

function colorDelta(a: string, b: string): number | undefined {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return undefined;
  return deltaE(ca, cb);
}

const normText = (t: string): string => t.replace(/\s+/g, " ").trim();
const normFamily = (f: string): string => f.trim().replace(/^["']|["']$/g, "").toLowerCase();

const elementLabel = (el: ElementNode): string =>
  el.text !== undefined && el.text.length > 0
    ? `"${el.text.length > 40 ? `${el.text.slice(0, 40)}…` : el.text}"`
    : `${el.role ?? "element"} at (${Math.round(el.box.x)}, ${Math.round(el.box.y)})`;

const isSubstantial = (box: Box): boolean => box.w * box.h >= 64 * 64;

/** A border with a fully transparent color (or none) paints nothing. */
const isVisibleBorder = (s: NonNullable<ElementNode["style"]>): boolean => {
  if (s.borderWidth === undefined || s.borderWidth <= 0) return false;
  if (s.borderColor === undefined) return true;
  const c = parse(s.borderColor);
  return c === undefined || (c.alpha ?? 1) > 0;
};

const roleOf = (el: ElementNode): { role?: string } =>
  el.role !== undefined ? { role: el.role } : {};

/** The text a finding is about — design side first, impl as fallback. */
const textField = (design: ElementNode | undefined, impl?: ElementNode): { text?: string } => {
  const t = design?.text ?? impl?.text;
  return t !== undefined && t.length > 0 ? { text: normText(t) } : {};
};

/** Presence findings for elements only one side has. */
function presenceFindings(match: MatchResult, min: number): RawFinding[] {
  const out: RawFinding[] = [];
  // A backdrop/scrim's extent is the viewport's, so its presence alone says
  // little about the design — never more than minor.
  const isBackdrop = (el: ElementNode): boolean => el.role === "backdrop";
  for (const el of match.designOnly) {
    if (el.box.w < min || el.box.h < min) continue;
    out.push({
      type: "missing-element",
      severity: isBackdrop(el)
        ? "minor"
        : isSubstantial(el.box) || el.text !== undefined
          ? "critical"
          : "major",
      ...roleOf(el),
      ...textField(el),
      designBox: el.box,
      message: `design ${elementLabel(el)} (${Math.round(el.box.w)}×${Math.round(el.box.h)}) has no counterpart in the implementation`,
    });
  }
  for (const el of match.implOnly) {
    if (el.box.w < min || el.box.h < min) continue;
    out.push({
      type: "extra-element",
      severity: !isBackdrop(el) && (isSubstantial(el.box) || el.text !== undefined) ? "major" : "minor",
      ...roleOf(el),
      ...textField(el),
      implBox: el.box,
      message: `implementation renders ${elementLabel(el)} (${Math.round(el.box.w)}×${Math.round(el.box.h)}) that the design does not have`,
    });
  }
  return out;
}

function pairFindings(
  design: ElementNode,
  impl: ElementNode,
  o: Required<CheckOptions>,
): RawFinding[] {
  const out: RawFinding[] = [];
  const boxes = { designBox: design.box, implBox: impl.box, ...roleOf(design), ...textField(design, impl) };
  const label = elementLabel(design);

  // Position — the strongest human-judgment signal after presence.
  const dx = impl.box.x - design.box.x;
  const dy = impl.box.y - design.box.y;
  if (Math.abs(dx) > o.positionTolerance || Math.abs(dy) > o.positionTolerance) {
    const worst = Math.max(Math.abs(dx), Math.abs(dy));
    out.push({
      type: "position",
      severity: worst > 3 * o.positionTolerance ? "major" : "minor",
      ...boxes,
      expected: { x: round1(design.box.x), y: round1(design.box.y) },
      actual: { x: round1(impl.box.x), y: round1(impl.box.y) },
      message: `${label} is offset by (${round1(dx)}, ${round1(dy)})px from the design position`,
    });
  }

  // Size. A text pair showing DIFFERENT strings (a data slot) has a width
  // dictated by its content, so only the height (line box) is compared.
  const textDiffers =
    design.text !== undefined && impl.text !== undefined && normText(design.text) !== normText(impl.text);
  const dw = textDiffers ? 0 : impl.box.w - design.box.w;
  const dh = impl.box.h - design.box.h;
  if (Math.abs(dw) > o.sizeTolerance || Math.abs(dh) > o.sizeTolerance) {
    const worst = Math.max(Math.abs(dw), Math.abs(dh));
    out.push({
      type: "size",
      severity: worst > 3 * o.sizeTolerance ? "major" : "minor",
      ...boxes,
      expected: textDiffers ? { h: round1(design.box.h) } : { w: round1(design.box.w), h: round1(design.box.h) },
      actual: textDiffers ? { h: round1(impl.box.h) } : { w: round1(impl.box.w), h: round1(impl.box.h) },
      message: textDiffers
        ? `${label} renders ${Math.round(impl.box.h)}px tall, design says ${Math.round(design.box.h)}px (width not compared: differing text)`
        : `${label} renders ${Math.round(impl.box.w)}×${Math.round(impl.box.h)}, design says ${Math.round(design.box.w)}×${Math.round(design.box.h)}`,
    });
  }

  const ds = design.style ?? {};
  const is = impl.style ?? {};

  // Color (text color + background), CIEDE2000.
  for (const prop of ["color", "backgroundColor"] as const) {
    const expected = ds[prop];
    const actual = is[prop];
    if (expected === undefined || actual === undefined) continue;
    const de = colorDelta(expected, actual);
    if (de === undefined || de < o.colorDeltaEMinor) continue;
    out.push({
      type: "color",
      severity: de >= o.colorDeltaEMajor ? "major" : "minor",
      ...boxes,
      expected: { [prop]: expected },
      actual: { [prop]: actual },
      message: `${label} ${prop === "color" ? "text color" : "background"} is ${actual}, design says ${expected} (ΔE2000 ${round1(de)})`,
    });
  }

  // Typography.
  const typoExpected: Record<string, string | number> = {};
  const typoActual: Record<string, string | number> = {};
  const typoNotes: string[] = [];
  if (
    ds.fontFamily !== undefined &&
    is.fontFamily !== undefined &&
    normFamily(ds.fontFamily) !== normFamily(is.fontFamily)
  ) {
    typoExpected["fontFamily"] = ds.fontFamily;
    typoActual["fontFamily"] = is.fontFamily;
    typoNotes.push(`family "${is.fontFamily}" vs "${ds.fontFamily}"`);
  }
  if (
    ds.fontSize !== undefined &&
    is.fontSize !== undefined &&
    Math.abs(ds.fontSize - is.fontSize) > o.fontSizeTolerance
  ) {
    typoExpected["fontSize"] = ds.fontSize;
    typoActual["fontSize"] = is.fontSize;
    typoNotes.push(`size ${is.fontSize}px vs ${ds.fontSize}px`);
  }
  if (
    ds.lineHeight !== undefined &&
    is.lineHeight !== undefined &&
    Math.abs(ds.lineHeight - is.lineHeight) > o.lineHeightTolerance
  ) {
    typoExpected["lineHeight"] = ds.lineHeight;
    typoActual["lineHeight"] = is.lineHeight;
    typoNotes.push(`line-height ${is.lineHeight}px vs ${ds.lineHeight}px`);
  }
  if (ds.fontWeight !== undefined && is.fontWeight !== undefined && ds.fontWeight !== is.fontWeight) {
    typoExpected["fontWeight"] = ds.fontWeight;
    typoActual["fontWeight"] = is.fontWeight;
    typoNotes.push(`weight ${is.fontWeight} vs ${ds.fontWeight}`);
  }
  if (typoNotes.length > 0) {
    const familyOrLargeSize =
      typoExpected["fontFamily"] !== undefined ||
      (typeof typoExpected["fontSize"] === "number" &&
        typeof typoActual["fontSize"] === "number" &&
        Math.abs(typoExpected["fontSize"] - typoActual["fontSize"]) >=
          0.25 * typoExpected["fontSize"]);
    out.push({
      type: "typography",
      severity: familyOrLargeSize ? "major" : "minor",
      ...boxes,
      expected: typoExpected,
      actual: typoActual,
      message: `${label} typography differs: ${typoNotes.join(", ")}`,
    });
  }

  // Decoration (radius, border) is compared only between comparable boxes:
  // text pairs always (their box is the glyph ink, decoration comes from the
  // surrounding pill), other pairs when the size check passed — an 8px dot
  // matched to an 18px circle is a size finding, and its radius/border say
  // nothing about the design's radius/border.
  const isTextPair = design.text !== undefined && impl.text !== undefined;
  const decorationComparable =
    isTextPair || (Math.abs(dw) <= o.sizeTolerance && Math.abs(dh) <= o.sizeTolerance);

  // Border radius.
  const dr = ds.borderRadius ?? 0;
  const ir = is.borderRadius ?? 0;
  if (
    decorationComparable &&
    (ds.borderRadius !== undefined || is.borderRadius !== undefined) &&
    Math.abs(dr - ir) > o.radiusTolerance
  ) {
    out.push({
      type: "border-radius",
      severity: Math.abs(dr - ir) >= 8 ? "major" : "minor",
      ...boxes,
      expected: { borderRadius: dr },
      actual: { borderRadius: ir },
      message: `${label} border-radius is ${ir}px, design says ${dr}px`,
    });
  }

  // Border (top side, as extracted): width and color. A border appearing or
  // vanishing is a structural change (major); a hairline off by a fraction of
  // a px or a slightly different stroke color is minor.
  const dbw = isVisibleBorder(ds) ? (ds.borderWidth ?? 0) : 0;
  const ibw = isVisibleBorder(is) ? (is.borderWidth ?? 0) : 0;
  const widthDiffers = Math.abs(dbw - ibw) > o.borderWidthTolerance;
  const borderDe =
    dbw > 0 && ibw > 0 && ds.borderColor !== undefined && is.borderColor !== undefined
      ? colorDelta(ds.borderColor, is.borderColor)
      : undefined;
  const colorDiffers = borderDe !== undefined && borderDe >= o.colorDeltaEMinor;
  if (decorationComparable && (widthDiffers || colorDiffers)) {
    const presenceFlip = (dbw === 0) !== (ibw === 0);
    const notes: string[] = [];
    if (widthDiffers) notes.push(presenceFlip ? (ibw === 0 ? "no border, design has one" : "border the design does not have") : `width ${ibw}px vs ${dbw}px`);
    if (colorDiffers) notes.push(`color ${is.borderColor} vs ${ds.borderColor} (ΔE2000 ${round1(borderDe)})`);
    out.push({
      type: "border",
      severity: presenceFlip || (borderDe !== undefined && borderDe >= o.colorDeltaEMajor) ? "major" : "minor",
      ...boxes,
      expected: {
        borderWidth: dbw,
        ...(dbw > 0 && ds.borderColor !== undefined ? { borderColor: ds.borderColor } : {}),
      },
      actual: {
        borderWidth: ibw,
        ...(ibw > 0 && is.borderColor !== undefined ? { borderColor: is.borderColor } : {}),
      },
      message: `${label} border differs: ${notes.join(", ")}`,
    });
  }

  // Text content (kept minor — raw text similarity is anti-correlated with
  // human judgment, but a wrong string is still actionable).
  if (design.text !== undefined && impl.text !== undefined) {
    const dt = normText(design.text);
    const it = normText(impl.text);
    if (dt !== it) {
      out.push({
        type: "text-content",
        severity: "minor",
        ...boxes,
        expected: { text: dt },
        actual: { text: it },
        message: `text reads "${it.slice(0, 60)}", design says "${dt.slice(0, 60)}"`,
      });
    }
  }

  return out;
}

/** How much two intervals [a0,a1] and [b0,b1] overlap, in px (≤ 0 = disjoint). */
const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

const textOf = (el: ElementNode): string | undefined =>
  el.text !== undefined ? normText(el.text) : undefined;

const unionBox = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
};

/**
 * Sibling-gap spacing: for every matched pair, the nearest matched neighbour
 * below (overlapping horizontally) and to the right (overlapping vertically)
 * on the design side defines a gap; the same two elements' impl boxes give
 * the impl gap. A gap that grew or shrank is ONE spacing defect, whereas the
 * position channel reports every element it pushed. No container extraction
 * is needed — only data both sides already have. Horizontal gaps next to a
 * data slot (differing text) are content-dependent and skipped, as are gaps
 * wider than `spacingMaxGap` on the design side and negative gaps.
 */
function spacingFindings(match: MatchResult, o: Required<CheckOptions>): RawFinding[] {
  const out: RawFinding[] = [];
  const pairs = match.matches;
  const dataSlot = (m: ElementMatch): boolean => {
    const dt = textOf(m.design);
    const it = textOf(m.impl);
    return dt !== undefined && it !== undefined && dt !== it;
  };
  const minOverlap = 4;

  // Nearest element below / to the right of `A` among ALL of one side's
  // elements — unmatched ones included. A gap is a sibling gap only when
  // nothing sits between the two elements; a design-only row in between
  // is a missing-element finding, not a spacing one.
  type Axis = "vertical" | "horizontal";
  const nearest = (A: Box, all: readonly ElementNode[], self: ElementNode, axis: Axis): ElementNode | undefined => {
    let best: ElementNode | undefined;
    for (const el of all) {
      if (el === self) continue;
      const B = el.box;
      const adjacent =
        axis === "vertical"
          ? B.y >= A.y + A.h - 0.5 && overlap(A.x, A.x + A.w, B.x, B.x + B.w) >= minOverlap
          : B.x >= A.x + A.w - 0.5 && overlap(A.y, A.y + A.h, B.y, B.y + B.h) >= minOverlap;
      if (!adjacent) continue;
      const closer = best === undefined || (axis === "vertical" ? B.y < best.box.y : B.x < best.box.x);
      if (closer) best = el;
    }
    return best;
  };
  const designAll = [...pairs.map((m) => m.design), ...match.designOnly];
  const implAll = [...pairs.map((m) => m.impl), ...match.implOnly];
  const byDesign = new Map(pairs.map((m) => [m.design, m]));

  /** The matched neighbour of `a` on `axis`, when it is adjacent on BOTH sides. */
  const neighbour = (a: ElementMatch, axis: Axis): ElementMatch | undefined => {
    const d = nearest(a.design.box, designAll, a.design, axis);
    const b = d !== undefined ? byDesign.get(d) : undefined;
    if (b === undefined) return undefined;
    return nearest(a.impl.box, implAll, a.impl, axis) === b.impl ? b : undefined;
  };

  for (const a of pairs) {
    const A = a.design.box;
    const below = neighbour(a, "vertical");
    const right = neighbour(a, "horizontal");

    const report = (b: ElementMatch, axis: Axis): void => {
      const dGap =
        axis === "vertical" ? b.design.box.y - (A.y + A.h) : b.design.box.x - (A.x + A.w);
      const iGap =
        axis === "vertical"
          ? b.impl.box.y - (a.impl.box.y + a.impl.box.h)
          : b.impl.box.x - (a.impl.box.x + a.impl.box.w);
      // Wide gaps are layout distance (header → footer), not a spacing token;
      // a negative gap means the elements overlap or swapped order, which
      // the position check owns.
      if (dGap > o.spacingMaxGap || dGap < 0 || iGap < 0) return;
      const delta = iGap - dGap;
      if (Math.abs(delta) <= o.spacingTolerance) return;
      out.push({
        type: "spacing",
        severity: Math.abs(delta) > o.spacingMajor ? "major" : "minor",
        designBox: unionBox(A, b.design.box),
        implBox: unionBox(a.impl.box, b.impl.box),
        ...roleOf(a.design),
        ...(a.design.text !== undefined || b.design.text !== undefined
          ? { text: `${normText(a.design.text ?? "")} → ${normText(b.design.text ?? "")}` }
          : {}),
        expected: { gap: round1(dGap), axis },
        actual: { gap: round1(iGap), axis },
        message: `${axis} gap between ${elementLabel(a.design)} and ${elementLabel(b.design)} is ${round1(iGap)}px, design says ${round1(dGap)}px`,
      });
    };
    if (below) report(below, "vertical");
    if (right && !dataSlot(a) && !dataSlot(right)) report(right, "horizontal");
  }
  return out;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const TYPE_ORDER: Partial<Record<FindingType, number>> = {
  "missing-element": 0,
  "extra-element": 1,
  position: 2,
  spacing: 3,
  size: 4,
  color: 5,
  border: 6,
};

/**
 * Deterministic ordering + id/mark assignment: severity, then type, then
 * reading order. Also used to merge channels — pass structural findings and
 * raw pixel findings together and the numbering comes out consistent.
 */
export function finalize(raw: readonly RawFinding[]): Finding[] {
  const sorted = [...raw].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byType = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    if (byType !== 0) return byType;
    const boxA = a.designBox ?? a.implBox;
    const boxB = b.designBox ?? b.implBox;
    return (boxA?.y ?? 0) - (boxB?.y ?? 0) || (boxA?.x ?? 0) - (boxB?.x ?? 0);
  });
  return sorted.map((f, i) => ({ ...f, id: `f${i + 1}`, mark: i + 1 }));
}

/**
 * The structural channel: presence findings for unmatched elements + typed
 * checks per matched pair, severity-ranked and numbered for set-of-marks.
 */
export function runTypedChecks(match: MatchResult, options: CheckOptions = {}): Finding[] {
  const o: Required<CheckOptions> = { ...DEFAULTS, ...options };
  const raw: RawFinding[] = [
    ...presenceFindings(match, o.minElementSize),
    ...match.matches.flatMap((m) => pairFindings(m.design, m.impl, o)),
    ...spacingFindings(match, o),
  ];
  return finalize(raw);
}
