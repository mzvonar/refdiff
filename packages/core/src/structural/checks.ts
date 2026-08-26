/**
 * Typed per-pair checks — the structural channel's finding generators (pure).
 *
 * Severity follows the human-correlation evidence (research.md §3):
 * element presence and position correlate best with human judgment, color
 * second, everything else after. Raw text similarity is anti-correlated —
 * text findings stay minor.
 */

import { differenceCiede2000, parse } from "culori";

import type { MatchResult } from "../pipeline.js";
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
  minElementSize: 4,
};

type RawFinding = Omit<Finding, "id" | "mark">;

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

const roleOf = (el: ElementNode): { role?: string } =>
  el.role !== undefined ? { role: el.role } : {};

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
  const boxes = { designBox: design.box, implBox: impl.box, ...roleOf(design) };
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

  // Border radius.
  const dr = ds.borderRadius ?? 0;
  const ir = is.borderRadius ?? 0;
  if ((ds.borderRadius !== undefined || is.borderRadius !== undefined) && Math.abs(dr - ir) > o.radiusTolerance) {
    out.push({
      type: "border-radius",
      severity: Math.abs(dr - ir) >= 8 ? "major" : "minor",
      ...boxes,
      expected: { borderRadius: dr },
      actual: { borderRadius: ir },
      message: `${label} border-radius is ${ir}px, design says ${dr}px`,
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

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const TYPE_ORDER: Partial<Record<FindingType, number>> = {
  "missing-element": 0,
  "extra-element": 1,
  position: 2,
  size: 3,
  color: 4,
};

/** Deterministic ordering + id/mark assignment. */
function finalize(raw: RawFinding[]): Finding[] {
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
  ];
  return finalize(raw);
}
