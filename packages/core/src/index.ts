// @visual-compare/core
//
// Pipeline: capture (pluggable adapters) -> normalize -> structural channel
// (element matching + typed checks) -> ignore policy -> aggregation of
// systematic findings -> agent packaging (findings.json + set-of-marks
// overlay + crops). Pixel channel lands later.
//
// Every stage is independently importable; the pipeline is just function
// composition. See docs/architecture.md at the repo root.

export type {
  Alignment,
  Box,
  CaptureScope,
  ComparisonReport,
  ElementNode,
  Finding,
  FindingMember,
  FindingType,
  IgnorePolicy,
  Severity,
  SuppressedFinding,
  SuppressionReason,
} from "./types.js";

export { applyPolicy, mergePolicies, suppressionFor, type PolicyResult } from "./policy.js";
export {
  parseManifest,
  type ManifestError,
  type ManifestParse,
  type PairSpec,
} from "./manifest.js";
export { pickLargestChild, MIN_SCOPE_AREA, type ScopeCandidate } from "./adapters/scope.js";

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
  ensureStorybook,
  type StorybookServer,
  type StorybookServerError,
  type StorybookServerOptions,
} from "./adapters/storybook-server.js";

export {
  alignStructural,
  estimateTransform,
  type TransformEstimate,
} from "./structural/align.js";
export {
  DEFAULT_MAX_GAMMA,
  DEFAULT_SLOT_MAX_GAMMA,
  gamma,
  slotGamma,
  matchElements,
  type MatchOptions,
} from "./structural/match.js";
export { runTypedChecks, type CheckOptions } from "./structural/checks.js";
export { aggregate, type AggregateOptions } from "./structural/aggregate.js";

export { packageForModel, type PackageOptions } from "./package/package-for-model.js";
