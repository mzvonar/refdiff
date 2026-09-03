/**
 * The agent-facing comparison contract.
 *
 * Everything the model consumes is derived from these types. Design rule:
 * the model never judges two raw screenshots — it receives localized,
 * typed, measured findings and acts on them. See docs/architecture.md.
 */

/** Axis-aligned box in CSS pixels of the normalized (aligned) frame. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** One leaf element extracted from a side (design or implementation). */
export interface ElementNode {
  id: string
  box: Box
  /** Role hint when known: "text" | "image" | "icon" | "container" | ... */
  role?: string
  text?: string
  /** Resolved visual style values relevant to typed checks. */
  style?: Partial<{
    color: string
    backgroundColor: string
    fontFamily: string
    fontSize: number
    lineHeight: number
    fontWeight: number
    borderRadius: number
    borderColor: string
    borderWidth: number
    /**
     * `solid` / `dashed` / `dotted` … — only set where the element HAS a visible
     * border, and only compared when both sides know it. A dashed border is a
     * design decision no other channel can see (measured: a whole ghost
     * language of dashed footprints, pills and chips produced zero findings
     * about dashedness). Figma says it with `strokeDashes`.
     */
    borderStyle: string
    /** As extracted (`0 2px 10px rgba(…)`); captured for every element, not just surfaces. */
    boxShadow: string
    /**
     * A PAINT SERVER where a colour would be — an SVG shape filled with
     * `url("#some-pattern")` or a gradient. Captured so a reader can see the
     * shape is patterned; NOT compared, because comparing paint servers across
     * a CSS comp and a Figma gradient is a decision of its own (still open).
     */
    backgroundImage: string
    /** Effective CSS opacity (< 1 only), already folded into the colors above. */
    opacity: number
    gap: number
    padding: [number, number, number, number]
  }>
  /** Design-token name when the source resolves one (Figma variable etc.). */
  token?: Record<string, string>
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
  | "pixel-region"
  /**
   * The pair-level note that the structural fit is NOT the identity on a
   * same-size page (a fluid frame rendered at the pair viewport, or a design
   * whose css px equal it): the transform absorbed a systematic size
   * difference in the chrome around the anchors that no per-element finding
   * shows. One per run, boxless, minor; it goes away when the sizes are right.
   */
  | "alignment"

export type Severity = "critical" | "major" | "minor"

/** One localized, typed, measured difference. */
export interface Finding {
  id: string
  type: FindingType
  severity: Severity
  /** Set-of-marks number the annotator draws on both panes. Renumbered every run. */
  mark: number
  /**
   * Stable across runs, unlike `id`/`mark` which are renumbered every time. It is the delta's
   * `identityKey` — everything about the finding that is not geometry — so a human decision
   * ("ignore this one") can be filed against it and still be found after a recapture. Written by
   * `packageForModel`; absent on findings built by hand.
   */
  key?: string
  designBox?: Box
  implBox?: Box
  /** Machine-readable expected vs actual, e.g. { fontSize: [24, 28] }. */
  expected?: Record<string, string | number>
  actual?: Record<string, string | number>
  /** Short, code-actionable description ("heading renders 28px, design says 24px"). */
  message: string
  /** Native-resolution crop pair for this finding, paths relative to the run dir. */
  crops?: { design: string; impl: string }
  /** Role of the element(s) involved (design side wins) — policies key on it. */
  role?: string
  /**
   * Text of the element(s) involved (design side wins; spacing: "a → b").
   * The finding's identity across runs: a fixture change that moves the
   * alignment moves every box, but not what the finding is about.
   */
  text?: string
  /**
   * Set when this finding aggregates several identical deltas (one root
   * cause): the number of members. `designBox`/`implBox` are the primary
   * (first) member's; every member's boxes are listed in `members`.
   */
  instances?: number
  members?: FindingMember[]
  /**
   * `pixel-region` only: where inside `implBox` the pixels actually differ —
   * the diff's connected components in impl CSS px, largest first. `implBox`
   * is their union, which on a sparse element (a glyph, a dashed rule) is
   * mostly empty space; a viewer that highlights, dims or steps through
   * differences wants these, not the union, and vector boxes stay crisp at
   * any zoom where a raster mask does not. Deliberately NOT part of
   * `expected`/`actual`: those two are the finding's identity across runs
   * (`identityKey`), and a region that moves a pixel must not orphan a
   * human's triage decision.
   */
  regions?: Box[]
}

/** One location of an aggregated finding. */
export interface FindingMember {
  designBox?: Box
  implBox?: Box
}

/**
 * What to ignore for one pair — serializable so it can live in a manifest.
 * Regions are in impl (aligned) CSS-px space, the same space findings use.
 */
/**
 * One `textPatterns` entry. A bare string matches whatever the pattern matches;
 * the object form ALSO requires the finding's role, so one word cannot excuse
 * two unrelated elements.
 *
 * The real-world case, 2026-09-02: an artboard-vocabulary pattern listed
 * `Review` — a word in the captured artboard AND the label of the delta strip's
 * Review button. The one pattern silenced both, and the strip's 84px shift went
 * with it. `{ pattern: "^Review$", role: "text" }` is no help there (both are
 * text), but a region or a narrower alternation is; the role scope is for the
 * commoner case of a word shared between a `box`/`icon` and a real label.
 */
export type TextPattern =
  | string
  | {
      pattern: string
      /** Also require this element role. */
      role?: string
      /**
       * Also require the finding to be one of these TYPES — the axis that
       * actually matters, and the one the 2026-09-02 incident turned on.
       *
       * The artboard-vocabulary rule that hid the delta strip's 84px shift was
       * doing two jobs at once: excusing 24 `missing-element` findings (the comp
       * draws its artboard as live DOM, the app draws a PNG, so those strings
       * genuinely have no counterpart) and, silently, 3 `position` + 1 `spacing`
       * findings about a real control that happened to share a word. Role scoping
       * does NOT separate those: both elements were `role: "text"`. Type scoping
       * does — `types: ["missing-element", "extra-element", "text-content"]` says
       * "this string is absent or is demo copy" without also saying "and I do not
       * care where anything by that name sits".
       */
      types?: FindingType[]
    }

export interface IgnorePolicy {
  /**
   * Regex sources (`u` flag) matched against a finding's texts — demo IDs,
   * amounts, names.
   *
   * REACH FOR THIS LAST. A text pattern removes EVERY finding type about a
   * matching string, geometry included: position, size and spacing go with the
   * wording. When the string is a volatile VALUE, `dataSlots: { patterns }` is
   * the narrower tool — it masks the value out of both sides and keeps
   * position, size, colour and typography compared. The run summary now warns
   * when a suppression hides a shift of ≥8px (`hiddenMovement`).
   */
  textPatterns?: TextPattern[]
  /** Element roles ("text" | "image" | "icon" | "box") whose findings are out of scope. */
  roles?: string[]
  /** Boxes whose contents are chrome, not UI. */
  regions?: Box[]
  /** CSS selector inside the design frame to compare instead of the whole frame. */
  scope?: string
  /**
   * Which matched pairs count as data rather than drift — only their
   * `text-content` finding is dropped; position, size, colour, typography and
   * border on the same pair are always still compared.
   *
   * - `false` / unset (DEFAULT) — none; every text difference is reported. The
   *   default is deliberately noisy: which strings are really data is a per-pair
   *   judgement, and a harness that guesses it wrong is silent about copy
   *   regressions. Declare the rule per pair once you know the corpus.
   * - `true` — EVERY matched pair whose text differs. Structural, so it cannot
   *   tell a volatile amount from a button label and will swallow a real copy
   *   regression; it also never expires, since a slot restructured from data to
   *   static copy still satisfies "matched pair, differing text". Measured on
   *   one uctoinak page, all 9 pairs it suppressed as "data" were static copy.
   *   Reach for `{ patterns }` instead unless you genuinely want every text
   *   difference on matched pairs gone.
   * - `{ patterns }` — each shape is MASKED out of both strings and the
   *   REMAINDER compared. Equal remainder = data churn (suppressed); different
   *   remainder = copy drift (reported). This is what makes a MIXED slot work:
   *   `"Blok · 12. 7. 2026"` vs `"Doklad · 12. 7. 2026"` is reported under a
   *   date shape, while `"Blok · 12. 7. 2026"` vs `"Blok · 11. 7. 2026"` is
   *   not. It is also self-expiring — copy that replaces data does not match
   *   the shape, so the remainders differ and the change surfaces. Anchors are
   *   optional: masking only removes what actually matched.
   *
   * Distinct from `textPatterns`, which suppress EVERY finding type about a
   * matching string — geometry and colour included.
   */
  dataSlots?: boolean | { patterns: string[] }
  /**
   * Intended deviations: a finding of `type` whose expected/actual contain
   * every listed key with the same value is accepted (e.g. the app's ink
   * token when one comp is the outlier). The `reason` is the audit trail.
   */
  accepted?: AcceptedDeviation[]
}

export interface AcceptedDeviation {
  type: FindingType
  /** Element role the finding must carry (e.g. a `missing-element` `box` = a focus ring the story cannot render). */
  role?: string
  /** `pixel-region` only: the classified change kind the finding must carry (`actual.changeKind`). */
  changeKind?: string
  /**
   * The finding's element text (whitespace-normalized, exact). The scoping tool
   * for findings whose `expected`/`actual` cannot identify WHICH element is
   * meant: a `missing-element` carries no values at all, so `{ type, role }`
   * alone would accept every missing element of that role in the pair. With
   * the text it accepts one.
   */
  text?: string
  expected?: Record<string, string | number>
  actual?: Record<string, string | number>
  /**
   * Also excuse what lies INSIDE the accepted element: every TEXTLESS finding
   * whose boxes fall within the boxes of a finding this rule hit is suppressed
   * too, as `"<reason> (inside)"`. For an accepted image whose comp stand-in
   * is a drawn placeholder (a grey plate with bars, a logo square) the bars
   * are the same decision — but text inside the region stays visible, so a
   * missing label or a badge drawn over the region is never hidden by it.
   * Content-shaped: the rule still names the element and expires with it.
   * Manifest-only — `refdiff accept` never writes it.
   */
  contents?: true
  reason: string
}

/**
 * One regression that carries the signature of a re-pairing: the same delta
 * resolved property findings about the same element text.
 */
export interface RepairedNote {
  /** The regressed finding's id in THIS run. */
  id: string
  /** The element text the regression and the resolved findings share. */
  text: string
  /** Ids in the PREVIOUS run that resolved in this delta about that text. */
  resolved: string[]
  /** Their types, so the reader sees what the old pairing was reporting. */
  types: string[]
}

/** One place, and how much of the report is about it. */
export interface RegionGroup {
  /** The container's box, in the same world space as the findings' (impl px). */
  box: Box
  /** `surface`, `box`, `image` … — whatever the container was extracted as. */
  role: string
  findings: number
  critical: number
  major: number
  minor: number
  /** Ids, so a reader can jump straight to them. */
  ids: string[]
}

export interface RegionBreakdown {
  groups: RegionGroup[]
  /** Findings inside no qualifying container (frame chrome, boxless notes). */
  elsewhere: number
}

export type SuppressionReason = "text-pattern" | "role" | "region" | "data-slot" | "accepted"

/** A finding a policy rule removed from the kept list — still reported. */
export interface SuppressedFinding extends Finding {
  suppressedBy: SuppressionReason
  /** The concrete rule that hit: regex source, role name, region, … */
  rule: string
}

/**
 * Which node of the design frame a capture actually describes.
 *  - explicit:      the policy's `scope` selector
 *  - largest-child: fallback heuristic — the frame's largest child by area
 *                   (the backdrop/modal, not the label strip or notes)
 *  - frame:         the frame itself (no children to pick from)
 */
export interface CaptureScope {
  mode: "explicit" | "screen-label" | "largest-child" | "frame"
  selector: string
  /** Debug aid: what the heuristic saw when it picked. */
  candidates?: number
  /**
   * The frame sized itself from the viewport (full-bleed comp), so the canvas was
   * snapped to the pair's exact viewport before capture instead of the padded one.
   */
  fluid?: boolean
}

/** Result of aligning the two frames before any comparison. */
export interface Alignment {
  /** Total horizontal design→impl scale (normalization × structural fit). */
  scale: number
  /** Vertical scale when the estimate is anisotropic; defaults to `scale`. */
  scaleY?: number
  offsetX: number
  offsetY: number
  /** 0..1 — low confidence means the pixel channel is unreliable. */
  confidence: number
  /**
   * The same score per axis — diagnosis only, nothing gates on them.
   * `confidence` needs an anchor to agree on BOTH axes, so a low joint score
   * alongside a high `confidenceY` says the sides line up vertically and
   * disagree horizontally (rows packed to different widths, a control that
   * moved side to side) rather than "this capture is unusable".
   */
  confidenceX?: number
  confidenceY?: number
  /**
   * What the transform rests on: a Theil–Sen fit over ≥3 unique-text
   * anchors; a pure offset (every design leaf an anchor, <3 of them); the
   * element pair itself (both sides captured ONE explicit node — a Figma
   * variant vs a story cell — so their origins coincide by construction);
   * or nothing (identity, confidence 0).
   */
  basis?: "anchors" | "offset" | "element-pair" | "none"
  /** Regions present on only one side (reported, not silently cropped). */
  designOnly?: Box[]
  implOnly?: Box[]
}

/** Full result of one pair comparison — serialized as findings.json. */
export interface ComparisonReport {
  pair: string
  createdAt: string
  /**
   * 1-based ordinal of this run of this pair. Derived, never stored separately:
   * the previous run's report is the counter (`(previous?.run ?? 0) + 1`), so a
   * fresh run dir starts at 1 and deleting it resets the count — the same
   * lifetime as the delta and the ledger. A timestamp identifies a run but does
   * not ORDER it for a reader; "Run 47 vs 46" is the thing a person can act on.
   *
   * OPTIONAL because it is absent from every report written before runs were
   * numbered, and those are exactly the reports `readPreviousReport` finds on
   * disk. A required field here would be a lie about existing run dirs; every
   * reader falls back to `createdAt`.
   */
  run?: number
  design: {
    source: string
    ref: string
    /**
     * The capture NORMALIZED onto the impl: raw capture CSS px ×
     * `alignment.scale`. `designPng` is still the RAW capture, so anything
     * sizing that image divides by `dpr` — never by this.
     */
    width: number
    height: number
    /** Native PNG px per RAW capture CSS px (the PNG is rawWidth·dpr wide). */
    dpr?: number
    scope?: CaptureScope
    /** Figma GIGO score (always echoed, even when the gate passed). */
    quality?: { score: number; leaves: number; bound: number; instances: number; detached: number }
  }
  impl: { source: string; ref: string; width: number; height: number; dpr?: number }
  alignment: Alignment
  findings: Finding[]
  /** Findings the ignore policy removed — visible, never silently dropped. */
  suppressed: SuppressedFinding[]
  /** The policy that produced `suppressed` (empty object when none). */
  policy: IgnorePolicy
  /** Deterministic gate over `findings` only: pass when none is at/above the threshold. */
  verdict: { pass: boolean; failThreshold: Severity }
  /**
   * Relative to the previous run of the same pair, when one exists.
   * `regressions` ⊆ `introduced`: findings an EARLIER run of this pair had
   * resolved (per `resolved-ledger.json`) that are back — a fix undone.
   */
  delta?: {
    /** The previous run's `createdAt` — identity. */
    previousRun: string
    /** The previous run's `run` ordinal, when it had one (reports written before runs were numbered do not). */
    previousRunNumber?: number
    resolved: string[]
    introduced: string[]
    regressions?: string[]
    /**
     * Evidence beside a regression that looks like a RE-PAIRING: the element
     * kept its place but lost its partner, so the property findings about the
     * old pair resolved in this same run and a presence finding took their
     * place. Read it before undoing anything — but it never removes the
     * regression, because a genuine vanish has the same shape.
     */
    repaired?: RepairedNote[]
  }
  /**
   * WHERE the findings are: each group is the smallest captured container that
   * holds them (see `groupByRegion`). Read it before the list on any page pair
   * — "106 in the rail, 70 in the canvas" is two different causes, and a
   * severity-sorted list shows neither. Absent when nothing groups.
   */
  byRegion?: RegionBreakdown
  artifacts: {
    designPng: string
    implPng: string
    /**
     * Pixel evidence the structural channel could NOT explain: the diffs that
     * became `pixel-region` findings, painted on the impl canvas. Absent when
     * the pixel channel did not run, or ran and reported nothing.
     */
    diffMask?: string
  }
}
