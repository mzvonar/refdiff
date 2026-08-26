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
  /** Role of the element(s) involved (design side wins) — policies key on it. */
  role?: string;
}

/**
 * What to ignore for one pair — serializable so it can live in a manifest.
 * Regions are in impl (aligned) CSS-px space, the same space findings use.
 */
export interface IgnorePolicy {
  /** Regex sources (`u` flag) matched against a finding's texts — demo IDs, amounts, names. */
  textPatterns?: string[];
  /** Element roles ("text" | "image" | "icon" | "box") whose findings are out of scope. */
  roles?: string[];
  /** Boxes whose contents are chrome, not UI. */
  regions?: Box[];
  /** CSS selector inside the design frame to compare instead of the whole frame. */
  scope?: string;
  /** Matched pairs with differing text are data, not drift → text-content suppressed. */
  dataSlots?: boolean;
}

export type SuppressionReason = "text-pattern" | "role" | "region" | "data-slot";

/** A finding a policy rule removed from the kept list — still reported. */
export interface SuppressedFinding extends Finding {
  suppressedBy: SuppressionReason;
  /** The concrete rule that hit: regex source, role name, region, … */
  rule: string;
}

/**
 * Which node of the design frame a capture actually describes.
 *  - explicit:      the policy's `scope` selector
 *  - largest-child: fallback heuristic — the frame's largest child by area
 *                   (the backdrop/modal, not the label strip or notes)
 *  - frame:         the frame itself (no children to pick from)
 */
export interface CaptureScope {
  mode: "explicit" | "largest-child" | "frame";
  selector: string;
  /** Debug aid: what the heuristic saw when it picked. */
  candidates?: number;
}

/** Result of aligning the two frames before any comparison. */
export interface Alignment {
  /** Total horizontal design→impl scale (normalization × structural fit). */
  scale: number;
  /** Vertical scale when the estimate is anisotropic; defaults to `scale`. */
  scaleY?: number;
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
  design: { source: string; ref: string; width: number; height: number; scope?: CaptureScope };
  impl: { source: string; ref: string; width: number; height: number };
  alignment: Alignment;
  findings: Finding[];
  /** Findings the ignore policy removed — visible, never silently dropped. */
  suppressed: SuppressedFinding[];
  /** The policy that produced `suppressed` (empty object when none). */
  policy: IgnorePolicy;
  /** Deterministic gate over `findings` only: pass when none is at/above the threshold. */
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
