/**
 * Systematic-finding aggregation (pure).
 *
 * The same `(type, expected→actual delta)` reported on many matched pairs is
 * ONE root cause — a wrong ink token, a shifted row — not N defects. This
 * stage collapses groups of identical deltas into a single finding that
 * carries every member's boxes, so the list gets short while the report
 * loses nothing: `members` still carries each location, so the viewer marks
 * every instance and the model still sees where they are.
 *
 * Presence findings (missing/extra) and text-content never aggregate — each
 * of those is its own element and its own fix.
 */

import type { Finding, FindingMember, FindingType, Severity } from "../types.js"

export interface AggregateOptions {
  /** Groups smaller than this stay as individual findings. Default 3. */
  minInstances?: number
  /** Position/size deltas within this many px (dominant axis) of a cluster's mean share a cause. Default 2. */
  deltaTolerance?: number
}

const DEFAULTS: Required<AggregateOptions> = { minInstances: 3, deltaTolerance: 2 }

const NEVER_AGGREGATE: ReadonlySet<FindingType> = new Set<FindingType>([
  "missing-element",
  "extra-element",
  "text-content",
  "alignment",
])

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, major: 1, minor: 2 }

const maxSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b

const num = (v: string | number | undefined): number => (typeof v === "number" ? v : 0)

/** Canonical (dx, dy)-style delta for the metric types. */
function metricDelta(f: Finding): readonly [number, number] {
  const e = f.expected ?? {}
  const a = f.actual ?? {}
  switch (f.type) {
    case "position":
      return [num(a["x"]) - num(e["x"]), num(a["y"]) - num(e["y"])]
    case "spacing":
      // One gap that grew by N px, wherever it occurs, is one cause.
      return [num(a["gap"]) - num(e["gap"]), 0]
    default:
      return [num(a["w"]) - num(e["w"]), num(a["h"]) - num(e["h"])]
  }
}

/**
 * Exact grouping key for the categorical types. Position/size/spacing get a
 * coarse key (type, plus axis for spacing) and are clustered by delta
 * afterwards.
 */
function groupKey(f: Finding): string {
  switch (f.type) {
    case "position":
    case "size":
      return f.type
    case "spacing":
      return `${f.type}|${String(f.expected?.["axis"] ?? "")}`
    case "pixel-region":
      // One cause = the same KIND of pixel change on the same kind of element;
      // ratios and pixel counts differ per instance.
      return `${f.type}|${f.role ?? ""}|${String(f.actual?.["changeKind"] ?? "")}`
    case "color":
    case "typography":
    case "border-radius":
    case "border": {
      const canon = (r: Record<string, string | number> | undefined): string =>
        JSON.stringify(Object.entries(r ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      return `${f.type}|${canon(f.expected)}|${canon(f.actual)}`
    }
    case "missing-element":
    case "extra-element":
    case "text-content":
    case "alignment":
      return f.type
  }
}

const isMetric = (t: FindingType): boolean => t === "position" || t === "size" || t === "spacing"

/**
 * Split one coarse group into clusters of "the same shift". A delta joins a
 * cluster when, on the cluster's dominant axis, it lies within `tol` of the
 * cluster's running mean, and on the other axis it lies within `tol` or
 * within half the dominant shift — a row moved 24px down also picks up a few
 * px of horizontal residue from the alignment fit, and that is still one
 * cause. Greedy and order-stable: findings arrive severity-sorted, so the
 * primary is always the worst-ranked member.
 */
function clusterByDelta(group: readonly Finding[], tol: number): Finding[][] {
  interface Cluster {
    sum: readonly [number, number]
    items: Finding[]
  }
  const mean = (c: Cluster): readonly [number, number] => [
    c.sum[0] / c.items.length,
    c.sum[1] / c.items.length,
  ]
  /** Is delta `d` the same shift as a cluster whose mean is `m`? */
  const sameShift = (m: readonly [number, number], d: readonly [number, number]): boolean => {
    const xDominant = Math.abs(m[0]) >= Math.abs(m[1])
    const [md, mm] = xDominant ? m : [m[1], m[0]]
    const [dd, dm] = xDominant ? d : [d[1], d[0]]
    if (Math.abs(md - dd) > tol) return false
    if (Math.sign(md) !== Math.sign(dd) && Math.abs(dd) > tol) return false
    return Math.abs(mm - dm) <= Math.max(tol, Math.abs(md) / 2)
  }
  const add = (c: Cluster, f: Finding, d: readonly [number, number]): Cluster => ({
    sum: [c.sum[0] + d[0], c.sum[1] + d[1]],
    items: [...c.items, f],
  })

  // Pass 1: greedy assignment in arrival order.
  let clusters: Cluster[] = []
  for (const f of group) {
    const d = metricDelta(f)
    const i = clusters.findIndex((c) => sameShift(mean(c), d))
    clusters =
      i === -1
        ? [...clusters, { sum: d, items: [f] }]
        : clusters.map((c, j) => (j === i ? add(c, f, d) : c))
  }

  // Pass 2: an early outlier may have seeded its own cluster before the
  // neighbours arrived — merge clusters whose means are the same shift.
  for (let merged = true; merged; ) {
    merged = false
    outer: for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const ca = clusters[a]!
        const cb = clusters[b]!
        if (sameShift(mean(ca), mean(cb))) {
          const union: Cluster = {
            sum: [ca.sum[0] + cb.sum[0], ca.sum[1] + cb.sum[1]],
            items: [...ca.items, ...cb.items].sort((x, y) => group.indexOf(x) - group.indexOf(y)),
          }
          clusters = clusters.flatMap((c, j) => (j === a ? [union] : j === b ? [] : [c]))
          merged = true
          break outer
        }
      }
    }
  }
  return clusters.map((c) => c.items)
}

const memberOf = (f: Finding): FindingMember => ({
  ...(f.designBox ? { designBox: f.designBox } : {}),
  ...(f.implBox ? { implBox: f.implBox } : {}),
})

/** Collapse one cluster into a single finding carrying every member's boxes. */
function collapse(cluster: readonly Finding[]): Finding {
  const [primary, ...rest] = cluster as [Finding, ...Finding[]]
  const severity = rest.reduce<Severity>((s, f) => maxSeverity(s, f.severity), primary.severity)
  return {
    ...primary,
    severity,
    message: `${primary.message} ×${cluster.length}`,
    instances: cluster.length,
    members: cluster.map(memberOf),
  }
}

const renumber = (list: readonly Finding[]): Finding[] =>
  list.map((f, i) => ({ ...f, id: `f${i + 1}`, mark: i + 1 }))

/**
 * Pure stage: collapse groups of ≥ `minInstances` identical deltas into one
 * finding each (severity = max of members, message suffixed "×N"). Output is
 * severity-sorted (stable) and renumbered f1..; input is not mutated.
 */
export function aggregate(findings: readonly Finding[], options: AggregateOptions = {}): Finding[] {
  const o = { ...DEFAULTS, ...options }

  // Bucket in first-seen order so the output stays deterministic.
  const buckets = new Map<string, Finding[]>()
  const order: string[] = []
  const passthrough: { index: number; finding: Finding }[] = []
  findings.forEach((f, index) => {
    if (NEVER_AGGREGATE.has(f.type)) {
      passthrough.push({ index, finding: f })
      return
    }
    const key = groupKey(f)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(f)
    else {
      buckets.set(key, [f])
      order.push(key)
    }
  })

  // Every output finding remembers the input position of its primary so the
  // stable re-sort below keeps the checks stage's within-severity ordering.
  const positioned: { index: number; finding: Finding }[] = [...passthrough]
  for (const key of order) {
    const bucket = buckets.get(key)!
    const clusters = isMetric(bucket[0]!.type) ? clusterByDelta(bucket, o.deltaTolerance) : [bucket]
    for (const cluster of clusters) {
      if (cluster.length >= o.minInstances) {
        positioned.push({ index: findings.indexOf(cluster[0]!), finding: collapse(cluster) })
      } else {
        for (const f of cluster) positioned.push({ index: findings.indexOf(f), finding: f })
      }
    }
  }

  positioned.sort(
    (a, b) =>
      SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] || a.index - b.index,
  )
  return renumber(positioned.map((p) => p.finding))
}
