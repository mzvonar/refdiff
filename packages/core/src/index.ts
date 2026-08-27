// @visual-compare/core
//
// Pipeline: capture (pluggable adapters) -> normalize -> structural channel
// (element matching + typed checks) -> ignore policy -> aggregation of
// systematic findings -> agent packaging (findings.json + set-of-marks
// overlay + crops). The pixel channel (pixel/) adds AA-aware diffs inside
// matched boxes, merged with the structural findings before the policy.
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
  type DesignSpec,
  type ImplSpec,
  type LiveSpec,
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
  defaultDesignScale,
  normalize,
  pairRefs,
  type NormalizeOptions,
  type AlignedPair,
  type Capture,
  type CaptureError,
  type DcHtmlSource,
  type DesignQuality,
  type ElementMatch,
  type FigmaSource,
  type LiveAuth,
  type LiveUrlSource,
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
  type ServeDirOptions,
  type StaticServer,
} from "./adapters/browser.js";
export { extractElementTree } from "./adapters/extract.js";
export { captureDcHtml, frameSelectors, type DcHtmlCaptureOptions } from "./adapters/dc-html.js";
export { captureStorybook, type StorybookCaptureOptions } from "./adapters/storybook.js";
export {
  captureLiveUrl,
  classifyPage,
  LOGIN_PATH_RE,
  type LiveUrlCaptureOptions,
  type PageSignals,
  type PageVerdict,
} from "./adapters/live-url.js";
export { captureFigma, FIGMA_DEFAULTS, type FigmaCaptureOptions } from "./adapters/figma.js";
export {
  FigmaClient,
  chunk,
  cooldownFromHeaders,
  isCoolingDown,
  normalizeNodeId,
  parseFigmaRef,
  readToken,
  type CooldownRecord,
  type FigmaApiError,
  type FigmaClientOptions,
  type FigmaNode,
  type FigmaNodesResponse,
  type FigmaPaint,
  type FigmaVariablesResponse,
} from "./adapters/figma-api.js";
export {
  figmaTreeToElements,
  indexVariables,
  paintToCss,
  type FigmaMapping,
  type VariableIndex,
} from "./adapters/figma-tree.js";
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
export { finalize, runTypedChecks, type CheckOptions, type RawFinding } from "./structural/checks.js";
export { aggregate, type AggregateOptions } from "./structural/aggregate.js";

export { clampBox, padBox, scaleBox, toDesignNative, toImplNative } from "./geometry.js";
export {
  clusterMask,
  unionBox,
  type Cluster,
  type ClusterOptions,
  type DiffMask,
} from "./pixel/cluster.js";
export {
  isPixelEligible,
  lowConfidenceFinding,
  PIXEL_DEFAULTS,
  runPixelChecks,
  severityForRatio,
  type MatchDiff,
  type PixelCheckOptions,
} from "./pixel/checks.js";
export { DIFF_DEFAULTS, diffMatches, writeDiffMask, type DiffOptions } from "./pixel/diff.js";

export { packageForModel, type PackageOptions } from "./package/package-for-model.js";
export {
  boxDistance,
  diffFindings,
  diffReports,
  identityKey,
  type DeltaOptions,
  type ReportDelta,
} from "./package/delta.js";
