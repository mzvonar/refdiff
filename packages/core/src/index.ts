// @visual-compare/core
//
// Pipeline: capture (pluggable adapters) -> normalize/align -> structural
// channel (element matching + typed checks) -> pixel channel (scoped,
// AA-aware diff) -> agent packaging (findings.json + SoM overlay + crops).
//
// Not implemented yet — see docs/architecture.md at the repo root.

export type {
  Alignment,
  Box,
  ComparisonReport,
  ElementNode,
  Finding,
  FindingType,
  Severity,
} from "./types.js";
