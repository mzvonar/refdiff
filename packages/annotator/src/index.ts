// @visual-compare/annotator
//
// Human view of a comparison run: the FULL design and the FULL implementation
// side by side with one shared pan/zoom (the design pane projected through
// the run's Alignment), numbered finding marks on both sides, the finding
// list with expected/actual + crops, suppressed findings and the delta.
// `renderReport` is pure (report → HTML string); the CLI (cli.ts) is the
// effectful edge that reads findings.json, writes report.html into the run
// dir and optionally serves it.
//
// Annotations (docs/architecture.md "Annotator"): element-anchored human notes
// flowing back to the agent (open → implemented → done) — pure model in
// annotations.ts, effects (file, HTTP API, digest PNGs) in cli.ts.

export { renderReport, embedJson, type RenderOptions } from "./render.js";
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
} from "./annotations.js";
export {
  IDENTITY_ALIGNMENT,
  designImageTransform,
  designToWorld,
  designWorldBox,
  fitView,
  focusView,
  implImageTransform,
  panBy,
  screenToWorld,
  unionBoxes,
  worldLayerTransform,
  worldToDesign,
  zoomAt,
  type Size,
  type VAlignment,
  type VBox,
  type View,
} from "./view-math.js";
