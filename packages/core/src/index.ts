// @visual-compare/core
//
// Pipeline: capture (pluggable adapters) -> normalize -> structural channel
// (element matching + typed checks) -> agent packaging (findings.json +
// set-of-marks overlay + crops). Pixel channel and alignment land later.
//
// Every stage is independently importable; the pipeline is just function
// composition. See docs/architecture.md at the repo root.

export type {
  Alignment,
  Box,
  ComparisonReport,
  ElementNode,
  Finding,
  FindingType,
  Severity,
} from "./types.js";

export {
  all,
  andThen,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
  type Err,
  type Ok,
  type Result,
} from "./result.js";

export {
  normalize,
  pairRefs,
  type AlignedPair,
  type Capture,
  type CaptureError,
  type DcHtmlSource,
  type ElementMatch,
  type MatchResult,
  type NormalizedPair,
  type Pair,
  type RefDescriptor,
  type SourceConfig,
  type StorybookSource,
  type Viewport,
} from "./pipeline.js";

export {
  captureUntilStable,
  FREEZE_CSS,
  isReachable,
  launchBrowser,
  serveDir,
  waitForFonts,
  type StaticServer,
} from "./adapters/browser.js";
export { extractElementTree } from "./adapters/extract.js";
export { captureDcHtml, frameSelectors, type DcHtmlCaptureOptions } from "./adapters/dc-html.js";
export { captureStorybook, type StorybookCaptureOptions } from "./adapters/storybook.js";

export {
  alignStructural,
  estimateTransform,
  type TransformEstimate,
} from "./structural/align.js";
export {
  DEFAULT_MAX_GAMMA,
  gamma,
  matchElements,
  type MatchOptions,
} from "./structural/match.js";
export { runTypedChecks, type CheckOptions } from "./structural/checks.js";

export { packageForModel, type PackageOptions } from "./package/package-for-model.js";
