/**
 * Inter-stage data types of the comparison pipeline.
 *
 * Every stage is a pure function over these immutable, serializable values;
 * effects (browser, network, fs) live only in adapters. See
 * docs/architecture.md "Pipeline".
 */

import type { Alignment, Box, CaptureScope, ElementNode } from "./types.js";

export interface Viewport {
  width: number;
  height: number;
}

/** Claude Design `.dc.html` canvas served from a local directory. */
export interface DcHtmlSource {
  kind: "dc-html";
  /** Directory containing the comp; served over http (the dc-runtime's
   *  fetch of React from unpkg breaks under file://). */
  dir: string;
  /** File name within `dir`, e.g. "doc-detail-modal.dc.html". */
  file: string;
  /** Frame address inside the canvas: element id, falling back to
   *  data-screen-label (some comps ship label-only frames). */
  frame: string;
  /**
   * CSS selector (relative to the frame) of the node to compare — the
   * component, not the artboard chrome around it. When absent the adapter
   * falls back to the frame's largest child by area and records that in
   * `Capture.scope`.
   */
  scope?: string;
  viewport?: Viewport;
}

/** A Storybook story rendered via the bare iframe. */
export interface StorybookSource {
  kind: "storybook";
  /** Storybook origin, e.g. http://localhost:6006 */
  url: string;
  storyId: string;
  viewport?: Viewport;
  /** Dialog/sheet stories portal their content to <body>, outside
   *  #storybook-root — capture the whole viewport instead of the root. */
  overlay?: boolean;
}

export type SourceConfig = DcHtmlSource | StorybookSource;

/** One concrete thing to capture, with provenance. */
export interface RefDescriptor {
  side: "design" | "impl";
  source: SourceConfig;
  /** Human-readable identity, e.g. "doc-detail-modal.dc.html#1a". */
  ref: string;
}

/**
 * A successful capture of one side. "Successful" is a strong claim: the
 * adapter has verified a real component rendered (hydration, error-overlay
 * and blank-render checks) — degraded input is a CaptureError, never a
 * Capture.
 */
export interface Capture {
  side: "design" | "impl";
  source: SourceConfig["kind"];
  ref: string;
  pngPath: string;
  /** CSS px of the captured region (the PNG is width*dpr × height*dpr). */
  width: number;
  height: number;
  dpr: number;
  /** Leaf element tree, boxes in CSS px relative to the capture origin. */
  elements: ElementNode[];
  /** Design side only: which node inside the frame was captured, and why. */
  scope?: CaptureScope;
}

/** Typed capture failures — data, not exceptions. */
export type CaptureError =
  | { kind: "unreachable"; ref: string; url: string; detail?: string }
  | { kind: "navigation-failed"; ref: string; url: string; detail: string }
  | { kind: "frame-not-found"; ref: string; frame: string; file: string }
  | { kind: "scope-not-found"; ref: string; frame: string; scope: string }
  | { kind: "hydration-failed"; ref: string; detail: string }
  | { kind: "story-error"; ref: string; storyId: string; detail: string }
  | { kind: "blank-render"; ref: string; detail: string }
  /** The host was still preparing the render (Storybook/Vite compiling the story) when we gave up. */
  | { kind: "still-loading"; ref: string; detail: string }
  | { kind: "capture-failed"; ref: string; detail: string };

/** Both sides captured, nothing derived yet. */
export interface Pair {
  id: string;
  design: Capture;
  impl: Capture;
}

/**
 * Pair with the design side rescaled into impl CSS-px space so geometry is
 * directly comparable. Style values (fontSize etc.) are NOT scaled — a
 * scale far from 1 means the two sides were authored for different
 * viewports, which the report should surface, not hide.
 */
export interface NormalizedPair {
  id: string;
  /** Design capture with element boxes and dimensions multiplied by designScale. */
  design: Capture;
  impl: Capture;
  /** impl.width / original design.width; 1 when the sides already agree. */
  designScale: number;
}

/** NormalizedPair after pixel-level alignment (pixel channel only). */
export interface AlignedPair extends NormalizedPair {
  alignment: Alignment;
}

/** One design element geometrically matched to one impl element. */
export interface ElementMatch {
  design: ElementNode;
  impl: ElementNode;
  /** γ = |Δx|+|Δy|+|Δw|+|Δh| in normalized CSS px (GVT). */
  gamma: number;
  /**
   * How the pair was formed: identical unique text, GVT geometry, or the
   * width-blind slot pass (same anchor and height, different text — a
   * value slot showing different data).
   */
  via: "text" | "geometry" | "slot";
}

/** Output of matchElements — unmatched boxes become missing/extra findings. */
export interface MatchResult {
  matches: ElementMatch[];
  /** Design elements with no impl counterpart (→ missing-element). */
  designOnly: ElementNode[];
  /** Impl elements with no design counterpart (→ extra-element). */
  implOnly: ElementNode[];
}

export function pairRefs(id: string, design: Capture, impl: Capture): Pair {
  return { id, design, impl };
}

const SCALE_EPSILON = 0.005;

function scaleBox(box: Box, s: number): Box {
  return { x: box.x * s, y: box.y * s, w: box.w * s, h: box.h * s };
}

/** Pure: rescales design-side geometry into impl CSS-px space. */
export function normalize(pair: Pair): NormalizedPair {
  const raw = pair.impl.width / pair.design.width;
  const designScale = Math.abs(raw - 1) < SCALE_EPSILON ? 1 : raw;
  const design =
    designScale === 1
      ? pair.design
      : {
          ...pair.design,
          width: pair.design.width * designScale,
          height: pair.design.height * designScale,
          elements: pair.design.elements.map((el) => ({
            ...el,
            box: scaleBox(el.box, designScale),
          })),
        };
  return { id: pair.id, design, impl: pair.impl, designScale };
}
