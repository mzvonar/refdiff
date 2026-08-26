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
// Still to come (docs/architecture.md "Annotator"): element-anchored human
// annotations flowing back to the agent (open → implemented → done).

export { renderReport, embedJson, type RenderOptions } from "./render.js";
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
