/**
 * Relative verdict (pure): what changed between two runs of the same pair.
 *
 * Finding ids and marks are renumbered on every run, so identity is by
 * CONTENT: type, role, canonical expected/actual, and the nearest box (design
 * side, impl as fallback) within a few px. A finding of the previous run with
 * no counterpart in the new one is `resolved`; a new finding with no
 * counterpart in the previous run is `introduced`. Ids listed under
 * `resolved` are the PREVIOUS run's, under `introduced` the new run's.
 */

import type { Box, ComparisonReport, Finding } from "../types.js";

export interface DeltaOptions {
  /** Max distance (px, per edge) between boxes that still count as the same place. Default 5. */
  boxTolerance?: number;
}

export type ReportDelta = NonNullable<ComparisonReport["delta"]>;

const canon = (r: Record<string, string | number> | undefined): string =>
  JSON.stringify(Object.entries(r ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Everything about a finding that is not geometry — must match exactly. */
export const identityKey = (f: Finding): string =>
  `${f.type}|${f.role ?? ""}|${canon(f.expected)}|${canon(f.actual)}`;

const anchor = (f: Finding): Box | undefined => f.designBox ?? f.implBox;

/** Largest per-edge distance between two boxes; Infinity when only one has a box. */
export function boxDistance(a: Box | undefined, b: Box | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined || b === undefined) return Infinity;
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.x + a.w - (b.x + b.w)),
    Math.abs(a.y + a.h - (b.y + b.h)),
  );
}

/**
 * Pair findings of `prev` and `next` one-to-one by identity key + nearest
 * box; return the unpaired ids on each side.
 */
export function diffFindings(
  prev: readonly Finding[],
  next: readonly Finding[],
  { boxTolerance = 5 }: DeltaOptions = {},
): { resolved: string[]; introduced: string[] } {
  const remaining = new Map<string, Finding[]>();
  for (const f of prev) {
    const key = identityKey(f);
    remaining.set(key, [...(remaining.get(key) ?? []), f]);
  }
  const introduced: string[] = [];
  for (const f of next) {
    const candidates = remaining.get(identityKey(f)) ?? [];
    let best = -1;
    let bestDistance = Infinity;
    candidates.forEach((c, i) => {
      const d = boxDistance(anchor(c), anchor(f));
      if (d <= boxTolerance && d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    if (best === -1) introduced.push(f.id);
    else remaining.set(identityKey(f), candidates.filter((_, i) => i !== best));
  }
  const resolved = [...remaining.values()].flat().map((f) => f.id);
  // Keep the previous run's own order for readability.
  const prevOrder = new Map(prev.map((f, i) => [f.id, i]));
  resolved.sort((a, b) => (prevOrder.get(a) ?? 0) - (prevOrder.get(b) ?? 0));
  return { resolved, introduced };
}

/** Pure: the `delta` block of `next` relative to `prev` (kept findings only). */
export function diffReports(
  prev: ComparisonReport,
  next: Pick<ComparisonReport, "findings">,
  options: DeltaOptions = {},
): ReportDelta {
  return { previousRun: prev.createdAt, ...diffFindings(prev.findings, next.findings, options) };
}
