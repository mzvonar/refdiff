/**
 * The agent-facing comparison contract.
 *
 * Everything the model consumes is derived from these types. Design rule:
 * the model never judges two raw screenshots — it receives localized,
 * typed, measured findings and acts on them. See docs/architecture.md.
 */

/** Axis-aligned box in CSS pixels of the normalized (aligned) frame. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One leaf element extracted from a side (design or implementation). */
export interface ElementNode {
  id: string;
  box: Box;
  /** Role hint when known: "text" | "image" | "icon" | "container" | ... */
  role?: string;
  text?: string;
  /** Resolved visual style values relevant to typed checks. */
  style?: Partial<{
    color: string;
    backgroundColor: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
    borderRadius: number;
    borderColor: string;
    borderWidth: number;
    gap: number;
    padding: [number, number, number, number];
  }>;
  /** Design-token name when the source resolves one (Figma variable etc.). */
  token?: Record<string, string>;
}

export type FindingType =
  | "missing-element"
  | "extra-element"
  | "position"
  | "size"
  | "color"
  | "typography"
  | "border-radius"
  | "border"
  | "spacing"
  | "text-content"
  | "pixel-region";

export type Severity = "critical" | "major" | "minor";

/** One localized, typed, measured difference. */
export interface Finding {
  id: string;
  type: FindingType;
  severity: Severity;
  /** Set-of-marks number rendered on the overlay image. */
  mark: number;
  designBox?: Box;
  implBox?: Box;
  /** Machine-readable expected vs actual, e.g. { fontSize: [24, 28] }. */
  expected?: Record<string, string | number>;
  actual?: Record<string, string | number>;
  /** Short, code-actionable description ("heading renders 28px, design says 24px"). */
  message: string;
  /** Native-resolution crop pair for this finding, paths relative to the run dir. */
  crops?: { design: string; impl: string };
}

/** Result of aligning the two frames before any comparison. */
export interface Alignment {
  scale: number;
  offsetX: number;
  offsetY: number;
  /** 0..1 — low confidence means the pixel channel is unreliable. */
  confidence: number;
  /** Regions present on only one side (reported, not silently cropped). */
  designOnly?: Box[];
  implOnly?: Box[];
}

/** Full result of one pair comparison — serialized as findings.json. */
export interface ComparisonReport {
  pair: string;
  createdAt: string;
  design: { source: string; ref: string; width: number; height: number };
  impl: { source: string; ref: string; width: number; height: number };
  alignment: Alignment;
  findings: Finding[];
  /** Deterministic gate: pass only when no findings at/above the threshold. */
  verdict: { pass: boolean; failThreshold: Severity };
  /** Relative to the previous run of the same pair, when one exists. */
  delta?: { previousRun: string; resolved: string[]; introduced: string[] };
  artifacts: {
    overlay: string;
    designPng: string;
    implPng: string;
    diffMask?: string;
  };
}
