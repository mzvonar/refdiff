/**
 * Set summary (pure): one table over MANY runs — a component set expanded into
 * 23 or 41 cell pairs, or every pair of a manifest — so the loop reads one
 * page instead of N `findings.json` files.
 *
 * Two views, both lossless with respect to what they claim:
 *  - `runs`: one row per pair (counts, verdict, alignment confidence + transform, delta).
 *  - `groups`: the same finding seen across pairs is ONE cause. Categorical
 *    types group on exact `(type, role, expected, actual)` like `aggregate`;
 *    metric types (position/size/spacing) group on `(type, role, axis)` with
 *    the value range, because their numbers differ per cell while the cause
 *    is shared. Every group lists the pairs it appears in.
 *
 * Nothing here decides anything — the per-pair reports stay the truth; this
 * is the index into them.
 */

import type { ComparisonReport, Finding, FindingType, Severity } from "../types.js";

export interface RunRow {
  /** Run directory name (relative to the summarized root). */
  dir: string;
  pair: string;
  createdAt: string;
  findings: number;
  critical: number;
  /** How many of `findings` carry a diagnosed cause (see ExplainRule) — reported, not hidden. */
  explained: number;
  /** cause → count, so the set summary can name what the explained ones are. */
  causes: Record<string, number>;
  /** Every cause the pair's policy DECLARES, matched or not — the set summary calls the stale ones. */
  declaredCauses: string[];
  major: number;
  minor: number;
  instances: number;
  suppressed: number;
  pass: boolean;
  confidence: number;
  /** The structural fit (design → impl); `1 / 0,0` in the table when it is the identity. */
  alignment: { scale: number; scaleY?: number; offsetX: number; offsetY: number };
  delta?: { introduced: number; resolved: number; regressions: number };
}

export interface SetGroup {
  type: FindingType;
  role?: string;
  /** Worst severity among the members. */
  severity: Severity;
  /** Pairs (dirs) the finding appears in, in run order. */
  pairs: string[];
  /** Total findings across pairs (aggregated findings count once here …). */
  findings: number;
  /** … and their `instances` here. */
  instances: number;
  /** Exact values for categorical groups; absent for metric groups. */
  expected?: Record<string, string | number>;
  actual?: Record<string, string | number>;
  /** First member's message — a representative, not a claim about the others. */
  sample: string;
  /** Metric groups: the axis (spacing) or the value spread across members. */
  axis?: string;
  range?: string;
}

export interface SetSummary {
  runs: RunRow[];
  groups: SetGroup[];
  totals: {
    pairs: number;
    pass: number;
    fail: number;
    findings: number;
    instances: number;
    suppressed: number;
    introduced: number;
    resolved: number;
    regressions: number;
  };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const worst = (a: Severity, b: Severity): Severity => (SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b);

const canon = (r: Record<string, string | number> | undefined): string =>
  JSON.stringify(Object.entries(r ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const isMetric = (t: FindingType): boolean => t === "position" || t === "size" || t === "spacing";

/** Cross-pair grouping key: exact values for categorical types, coarse for metric ones. */
export function setGroupKey(f: Finding): string {
  const role = f.role ?? "";
  if (isMetric(f.type)) return `${f.type}|${role}|${String(f.expected?.["axis"] ?? "")}`;
  if (f.type === "missing-element" || f.type === "extra-element" || f.type === "text-content") {
    return `${f.type}|${role}`;
  }
  // Pixel regions: the same KIND of change on the same kind of element is one
  // cause across cells; the ratio is the spread, not the identity.
  if (f.type === "pixel-region") return `${f.type}|${role}|${String(f.actual?.["changeKind"] ?? "")}`;
  // The identity note: one cause across pairs whatever each fit's numbers are.
  if (f.type === "alignment") return f.type;
  return `${f.type}|${role}|${canon(f.expected)}|${canon(f.actual)}`;
}

export function runRow(dir: string, r: ComparisonReport): RunRow {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of r.findings) counts[f.severity]++;
  return {
    dir,
    pair: r.pair,
    createdAt: r.createdAt,
    findings: r.findings.length,
    ...counts,
    explained: r.findings.filter((f) => f.explained !== undefined).length,
    causes: r.findings.reduce<Record<string, number>>((acc, f) => {
      if (f.explained) acc[f.explained.cause] = (acc[f.explained.cause] ?? 0) + 1;
      return acc;
    }, {}),
    declaredCauses: (r.policy?.explain ?? []).map((e) => e.cause),
    instances: r.findings.reduce((n, f) => n + (f.instances ?? 1), 0),
    suppressed: r.suppressed.length,
    pass: r.verdict.pass,
    confidence: r.alignment.confidence,
    alignment: {
      scale: r.alignment.scale,
      ...(r.alignment.scaleY !== undefined ? { scaleY: r.alignment.scaleY } : {}),
      offsetX: r.alignment.offsetX,
      offsetY: r.alignment.offsetY,
    },
    ...(r.delta
      ? {
          delta: {
            introduced: r.delta.introduced.length,
            resolved: r.delta.resolved.length,
            regressions: r.delta.regressions?.length ?? 0,
          },
        }
      : {}),
  };
}

const fmtScale = (s: number): string => (Math.abs(s - 1) < 0.0005 ? "1" : s.toFixed(3));
const fmtOffset = (v: number): string => (Math.abs(v) < 0.05 ? "0" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(1));

/** `1 / 0,0` for the identity, else `1.002 / −0.5,−2.0` (`1×0.997` when the axes differ). */
export function formatAlignment(a: RunRow["alignment"]): string {
  const scale =
    a.scaleY !== undefined && Math.abs(a.scaleY - a.scale) >= 0.0005
      ? `${fmtScale(a.scale)}×${fmtScale(a.scaleY)}`
      : fmtScale(a.scale);
  return `${scale} / ${fmtOffset(a.offsetX)},${fmtOffset(a.offsetY)}`;
}

const num = (v: string | number | undefined): number | undefined =>
  typeof v === "number" ? v : v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined;

/** "w 692→302, h 19→15" style spread over the members of a metric group. */
function metricRange(members: readonly Finding[]): string {
  const keys = [...new Set(members.flatMap((f) => Object.keys(f.expected ?? {})))].filter((k) => k !== "axis");
  const parts: string[] = [];
  for (const k of keys) {
    const e = members.map((f) => num(f.expected?.[k])).filter((v): v is number => v !== undefined);
    const a = members.map((f) => num(f.actual?.[k])).filter((v): v is number => v !== undefined);
    if (e.length === 0 || a.length === 0) continue;
    const span = (xs: number[]): string => {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const fmt = (v: number): string => String(Math.round(v * 10) / 10);
      return lo === hi ? fmt(lo) : `${fmt(lo)}..${fmt(hi)}`;
    };
    parts.push(`${k} ${span(e)}→${span(a)}`);
  }
  return parts.join(", ");
}

/**
 * Pure: summarize the reports of one set. `reports` in run order; `dir` is
 * how the caller names each run (directory name), used as the pair label.
 */
export function summarizeReports(reports: readonly { dir: string; report: ComparisonReport }[]): SetSummary {
  const runs = reports.map(({ dir, report }) => runRow(dir, report));

  const groups = new Map<string, { members: Finding[]; pairs: string[] }>();
  for (const { dir, report } of reports) {
    for (const f of report.findings) {
      const key = setGroupKey(f);
      const g = groups.get(key) ?? { members: [], pairs: [] };
      g.members.push(f);
      if (!g.pairs.includes(dir)) g.pairs.push(dir);
      groups.set(key, g);
    }
  }
  const setGroups: SetGroup[] = [...groups.values()].map(({ members, pairs }) => {
    const first = members[0]!;
    const severity = members.reduce<Severity>((s, f) => worst(s, f.severity), first.severity);
    const base: SetGroup = {
      type: first.type,
      ...(first.role !== undefined ? { role: first.role } : {}),
      severity,
      pairs,
      findings: members.length,
      instances: members.reduce((n, f) => n + (f.instances ?? 1), 0),
      sample: first.message,
    };
    if (isMetric(first.type)) {
      const axis = first.expected?.["axis"];
      return {
        ...base,
        ...(axis !== undefined ? { axis: String(axis) } : {}),
        range: metricRange(members),
      };
    }
    if (first.type === "missing-element" || first.type === "extra-element" || first.type === "text-content") {
      return base;
    }
    if (first.type === "pixel-region") {
      const kind = first.actual?.["changeKind"];
      return {
        ...base,
        ...(kind !== undefined ? { axis: String(kind) } : {}),
        range: metricRange(members),
      };
    }
    return {
      ...base,
      ...(first.expected ? { expected: first.expected } : {}),
      ...(first.actual ? { actual: first.actual } : {}),
    };
  });
  // Worst severity first, then the most widespread cause.
  setGroups.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.pairs.length - a.pairs.length || b.findings - a.findings,
  );

  const sum = (pick: (r: RunRow) => number): number => runs.reduce((n, r) => n + pick(r), 0);
  return {
    runs,
    groups: setGroups,
    totals: {
      pairs: runs.length,
      pass: runs.filter((r) => r.pass).length,
      fail: runs.filter((r) => !r.pass).length,
      findings: sum((r) => r.findings),
      instances: sum((r) => r.instances),
      suppressed: sum((r) => r.suppressed),
      introduced: sum((r) => r.delta?.introduced ?? 0),
      resolved: sum((r) => r.delta?.resolved ?? 0),
      regressions: sum((r) => r.delta?.regressions ?? 0),
    },
  };
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));
const lpad = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);

/** Pure: the summary as plain text (Markdown-compatible tables). */
export function renderSummary(s: SetSummary, options: { title?: string } = {}): string {
  const lines: string[] = [];
  const t = s.totals;
  if (options.title) lines.push(`# ${options.title}`, "");
  lines.push(
    `${t.pairs} pairs: ${t.pass} PASS / ${t.fail} FAIL — ${t.findings} findings covering ${t.instances} instances, ${t.suppressed} suppressed` +
      (s.runs.some((r) => r.delta) ? `; delta +${t.introduced} / −${t.resolved}${t.regressions > 0 ? `, ${t.regressions} REGRESSION(S)` : ""}` : ""),
    ...(() => {
      // The split a reader needs first: how many findings still have no diagnosed cause, and what
      // the rest are. Explained findings are in the counts above — they are labelled, not removed.
      const causes: Record<string, number> = {};
      let explained = 0;
      for (const r of s.runs) {
        explained += r.explained ?? 0;
        for (const [c, n] of Object.entries(r.causes ?? {})) causes[c] = (causes[c] ?? 0) + n;
      }
      if (explained === 0) return [];
      const named = Object.entries(causes)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${n} ${c}`)
        .join(", ");
      const lines = [`${t.findings - explained} unexplained · ${explained} explained: ${named}`];
      // STALE EXPLANATIONS: a cause declared by some pair's policy and matched by NO pair in the
      // set. An explain rule cannot lapse by itself the way an `accepted` one does — it is keyed to
      // a region and a set of types, not to measured values — so the moment its cause is actually
      // fixed on the comp's side the rule becomes a standing excuse over live ground. Nothing
      // matching it anywhere is the signal to re-read it.
      const declared = new Set(s.runs.flatMap((r) => r.declaredCauses ?? []));
      const stale = [...declared].filter((c) => !(c in causes));
      if (stale.length > 0) {
        lines.push(
          `explain rules matching NOTHING in this set — re-read them, their cause may be fixed: ${stale
            .map((c) => `"${c}"`)
            .join(", ")}`,
        );
      }
      return lines;
    })(),
    "",
  );

  const dirWidth = Math.max(4, ...s.runs.map((r) => r.dir.length));
  const aligns = s.runs.map((r) => formatAlignment(r.alignment));
  const alignWidth = Math.max(5, ...aligns.map((a) => a.length));
  lines.push(
    `| ${pad("pair", dirWidth)} | verdict | findings (c/M/m) | inst | supp | conf | ${pad("align", alignWidth)} | delta |`,
  );
  lines.push(
    `|${"-".repeat(dirWidth + 2)}|---------|------------------|------|------|------|${"-".repeat(alignWidth + 2)}|-------|`,
  );
  s.runs.forEach((r, i) => {
    const delta = r.delta
      ? `+${r.delta.introduced}/−${r.delta.resolved}${r.delta.regressions > 0 ? ` R${r.delta.regressions}` : ""}`
      : "-";
    lines.push(
      `| ${pad(r.dir, dirWidth)} | ${pad(r.pass ? "PASS" : "FAIL", 7)} | ${lpad(`${r.findings} (${r.critical}/${r.major}/${r.minor})`, 16)} | ${lpad(String(r.instances), 4)} | ${lpad(String(r.suppressed), 4)} | ${r.confidence.toFixed(2)} | ${pad(aligns[i]!, alignWidth)} | ${pad(delta, 5)} |`,
    );
  });
  lines.push("");

  if (s.groups.length > 0) {
    lines.push(`Across pairs (one row = one cause; \`pairs\` = how many cells show it):`, "");
    lines.push(`| severity | type | role | pairs | findings | values | sample |`);
    lines.push(`|----------|------|------|-------|----------|--------|--------|`);
    for (const g of s.groups) {
      const values =
        g.expected || g.actual
          ? `${canonText(g.expected)} → ${canonText(g.actual)}`
          : [g.axis, g.range].filter(Boolean).join(" ");
      lines.push(
        `| ${g.severity} | ${g.type} | ${g.role ?? ""} | ${g.pairs.length}/${s.totals.pairs} | ${g.findings}${g.instances !== g.findings ? ` (×${g.instances})` : ""} | ${values} | ${g.sample.replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

const canonText = (r: Record<string, string | number> | undefined): string =>
  r === undefined
    ? "-"
    : Object.entries(r)
        .filter(([k]) => k !== "axis")
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ");
