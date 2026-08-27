/**
 * Relative verdict (pure): what changed between two runs of the same pair.
 *
 * Finding ids and marks are renumbered on every run, so identity is by
 * CONTENT. A finding that knows its element's `text` is identified by type,
 * role and that text (plus the axis for spacing) — NOT by coordinates: a
 * fixture change that moves the alignment moves every box and every
 * position value, but "the amount is offset" is still the same finding
 * (S10 iteration 1 churned +47/−48 for a net −1 before this). Among several
 * candidates with the same key (three "−219,00 €" rows) the nearest box
 * wins. A finding with no text (an icon, a box) has nothing but geometry to
 * go by: type, role, canonical expected/actual, and a box within a few px.
 * A finding of the previous run with no counterpart in the new one is
 * `resolved`; a new finding with no counterpart in the previous run is
 * `introduced`. Ids under `resolved` are the PREVIOUS run's, under
 * `introduced` the new run's.
 */

import type { Box, ComparisonReport, Finding } from "../types.js";

export interface DeltaOptions {
  /** Max distance (px, per edge) between boxes that still count as the same place (textless findings). Default 5. */
  boxTolerance?: number;
}

export type ReportDelta = NonNullable<ComparisonReport["delta"]>;

const canon = (r: Record<string, string | number> | undefined): string =>
  JSON.stringify(Object.entries(r ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Types whose expected/actual are coordinates — meaningless as identity once the text is known. */
const COORDINATE_TYPES = new Set<Finding["type"]>(["position", "missing-element", "extra-element", "spacing"]);

/** Everything about a finding that is not geometry — must match exactly. */
export const identityKey = (f: Finding): string => {
  const head = `${f.type}|${f.role ?? ""}`;
  if (f.text !== undefined) {
    const axis = f.type === "spacing" ? `|${String(f.expected?.["axis"] ?? "")}` : "";
    return COORDINATE_TYPES.has(f.type)
      ? `${head}|text:${f.text}${axis}`
      : `${head}|${canon(f.expected)}|${canon(f.actual)}|text:${f.text}`;
  }
  return `${head}|${canon(f.expected)}|${canon(f.actual)}`;
};

/** Does this identity need a box to be complete? (No text → geometry is all it has.) */
const needsBox = (f: Pick<Finding, "text">): boolean => f.text === undefined;

/** The impl box is world space and does not move with the alignment; design as fallback. */
const anchor = (f: Finding): Box | undefined => f.implBox ?? f.designBox;

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
    const limit = needsBox(f) ? boxTolerance : Infinity;
    candidates.forEach((c, i) => {
      const d = boxDistance(anchor(c), anchor(f));
      if (d <= limit && d < bestDistance) {
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

/**
 * Pure: the `delta` block of `next` relative to `prev` (kept findings only).
 * With a ledger of what earlier runs resolved, introduced findings that match
 * a ledger entry are ALSO listed under `regressions` — the loop's loud
 * failure: a fix undone, not a new problem.
 */
export function diffReports(
  prev: ComparisonReport,
  next: Pick<ComparisonReport, "findings">,
  options: DeltaOptions = {},
  ledger?: ResolvedLedger,
): ReportDelta {
  const delta = diffFindings(prev.findings, next.findings, options);
  const regressions = ledger ? findRegressions(ledger, next.findings, delta.introduced, options) : [];
  return {
    previousRun: prev.createdAt,
    ...delta,
    ...(regressions.length > 0 ? { regressions } : {}),
  };
}

/* ---------------------------------------------------------- ledger -- */

/**
 * One finding an earlier run of this pair resolved: enough to recognise it
 * if it ever comes back (identity key + place), plus what it said.
 */
export interface LedgerEntry {
  key: string;
  /** Set when the identity is by text — the box is then a tie-break, not a requirement. */
  text?: string;
  box?: Box;
  message: string;
  /** `createdAt` of the run that no longer showed it. */
  resolvedAt: string;
}

/** Everything every run of one pair has resolved so far (`resolved-ledger.json`). */
export interface ResolvedLedger {
  pair: string;
  entries: LedgerEntry[];
}

export const emptyLedger = (pair: string): ResolvedLedger => ({ pair, entries: [] });

const matchesEntry = (e: LedgerEntry, f: Finding, tolerance: number): boolean =>
  e.key === identityKey(f) && (!needsBox(e) || boxDistance(e.box, anchor(f)) <= tolerance);

/**
 * Pure: ids (of `next`) among `introduced` that an earlier run had resolved.
 * Same identity as `diffFindings`: key + nearest box within tolerance.
 */
export function findRegressions(
  ledger: ResolvedLedger,
  next: readonly Finding[],
  introduced: readonly string[],
  { boxTolerance = 5 }: DeltaOptions = {},
): string[] {
  const byId = new Map(next.map((f) => [f.id, f]));
  return introduced.filter((id) => {
    const f = byId.get(id);
    return f !== undefined && ledger.entries.some((e) => matchesEntry(e, f, boxTolerance));
  });
}

/**
 * Pure: the ledger after this run — every finding the previous run showed
 * and this one resolved is recorded once (a finding resolved twice keeps its
 * first entry; only `resolvedAt` moves forward).
 */
export function recordResolved(
  ledger: ResolvedLedger,
  prev: ComparisonReport,
  delta: Pick<ReportDelta, "resolved">,
  resolvedAt: string,
  { boxTolerance = 5 }: DeltaOptions = {},
): ResolvedLedger {
  const resolved = new Set(delta.resolved);
  const entries = [...ledger.entries];
  for (const f of prev.findings) {
    if (!resolved.has(f.id)) continue;
    const existing = entries.findIndex((e) => matchesEntry(e, f, boxTolerance));
    const box = anchor(f);
    const entry: LedgerEntry = {
      key: identityKey(f),
      ...(f.text !== undefined ? { text: f.text } : {}),
      ...(box !== undefined ? { box } : {}),
      message: f.message,
      resolvedAt,
    };
    if (existing === -1) entries.push(entry);
    else entries[existing] = { ...entries[existing]!, resolvedAt };
  }
  return { pair: ledger.pair, entries };
}

/** Parse a ledger file's JSON; anything malformed → a fresh ledger for `pair`. */
export function parseLedger(raw: unknown, pair: string): ResolvedLedger {
  if (typeof raw !== "object" || raw === null) return emptyLedger(pair);
  const r = raw as { pair?: unknown; entries?: unknown };
  if (r.pair !== pair || !Array.isArray(r.entries)) return emptyLedger(pair);
  const entries = r.entries.filter(
    (e: unknown): e is LedgerEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as LedgerEntry).key === "string" &&
      typeof (e as LedgerEntry).message === "string" &&
      typeof (e as LedgerEntry).resolvedAt === "string",
  );
  return { pair, entries };
}
