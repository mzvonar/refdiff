// @visual-compare/annotator
//
// Human view of a comparison run: the FULL design and the FULL implementation
// side by side with one shared pan/zoom (the design pane projected through
// the run's Alignment), numbered finding marks on both sides, the finding
// list with expected/actual + crops, suppressed findings and the delta.
// Below 900px the same page scrolls and shows one side at a time (see the
// layout note at the top of render.ts).
// Two deliveries, one client: `renderAppShell` is the served app (data fetched
// per pair at runtime, app-shell.ts) and `renderReport` the self-contained
// file (data embedded). Both are pure; the CLI (cli.ts) is the effectful edge
// that reads the run dirs, serves them and optionally emits the files.
//
// Annotations (docs/architecture.md "Annotator"): element-anchored human notes
// flowing back to the agent (open → implemented → done) — pure model in
// annotations.ts, effects (file, HTTP API, digest PNGs) in cli.ts.

export { renderReport, embedJson, type RenderOptions } from "./render.js"
export { renderAppShell, type AppShellOptions } from "./app-shell.js"
export {
  pairCard,
  pairCards,
  pairsSummaryLine,
  CONFIDENCE_GATE,
  type PairSummary,
} from "./index-view.js"
export {
  anchorFor,
  anchorOf,
  boxDistance,
  counts,
  createAnnotation,
  describeAnchor,
  digestSvg,
  digestText,
  editNote,
  emptySet,
  parseAnnotationSet,
  reproject,
  reprojectAll,
  resolveAnchor,
  shapeBox,
  shapeCenter,
  snapToElement,
  transition,
  STATUSES,
  STATUS_COLORS,
  type ABox,
  type Action,
  type Anchor,
  type Annotation,
  type AnnotationSet,
  type AnnotationStatus,
  type ElementLike,
  type ParseResult,
  type Shape,
  type Side,
} from "./annotations.js"
export {
  IDENTITY_ALIGNMENT,
  designCaptureDpr,
  designImageTransform,
  designToWorld,
  designWorldBox,
  fitView,
  focusView,
  implImageTransform,
  panBy,
  rawDesignSize,
  screenToWorld,
  unionBoxes,
  worldLayerTransform,
  worldToDesign,
  zoomAt,
  type Size,
  type VAlignment,
  type VBox,
  type View,
} from "./view-math.js"
