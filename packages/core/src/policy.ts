/**
 * Ignore policies (pure).
 *
 * Real comps carry two kinds of true-but-uninteresting differences: demo
 * data that differs from the story's seed data, and artboard chrome that is
 * not UI. A policy names what to ignore; `applyPolicy` partitions findings
 * into kept and suppressed. Suppression is ALWAYS visible — suppressed
 * findings travel into the report under `suppressed` with the rule that hit
 * them, never silently dropped, so the model (and a human) can audit it.
 *
 * The policy is plain serializable data (regex sources, not RegExp
 * objects) so it can live in a manifest.
 */

import type {
  AcceptedDeviation,
  Box,
  ElementNode,
  Finding,
  FindingType,
  IgnorePolicy,
  SuppressedFinding,
  SuppressionReason,
  TextPattern,
} from "./types.js"

export interface PolicyResult {
  /** Findings that survive, renumbered f1..fn / marks 1..n. */
  kept: Finding[]
  /** Findings a rule removed, renumbered s1..sm, tagged with the rule. */
  suppressed: SuppressedFinding[]
}

const normText = (t: string): string => t.replace(/\s+/g, " ").trim()

/**
 * Every text a finding is about — the element's own label (`f.text`), the
 * strings quoted in the message, and both compared strings. `f.text` comes
 * first and in full: the message quotes a label TRUNCATED to a display width,
 * so an anchored pattern (`^…$`) could never excuse a long sentence on a
 * missing/extra-element finding from the message alone.
 */
function findingTexts(f: Finding): string[] {
  const out: string[] = []
  if (typeof f.text === "string") out.push(f.text)
  const quoted = /"([^"]*)"/g
  for (const m of f.message.matchAll(quoted)) out.push(m[1]!)
  for (const side of [f.expected, f.actual]) {
    const t = side?.["text"]
    if (typeof t === "string") out.push(t)
  }
  return out.map(normText)
}

/** A compiled `textPatterns` entry: the regex, plus the role it is scoped to (if any). */
export interface CompiledTextPattern {
  re: RegExp
  role?: string
  types?: readonly FindingType[]
}

function compilePatterns(sources: readonly TextPattern[] | undefined): CompiledTextPattern[] {
  return (sources ?? []).map((s) =>
    typeof s === "string"
      ? { re: new RegExp(s, "u") }
      : {
          re: new RegExp(s.pattern, "u"),
          ...(s.role !== undefined ? { role: s.role } : {}),
          ...(s.types !== undefined ? { types: s.types } : {}),
        },
  )
}

/**
 * The shapes of the narrowed `dataSlots` form; empty for the boolean forms.
 * Compiled `g` because they are used to MASK every occurrence in a string, not
 * to test it — a row can carry two dates.
 */
function compileDataSlotPatterns(dataSlots: IgnorePolicy["dataSlots"]): RegExp[] {
  return typeof dataSlots === "object"
    ? (dataSlots.patterns ?? []).map((s) => new RegExp(s, "gu"))
    : []
}

const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h

/** Center-inside test — a box that merely grazes a region is not "in" it. */
const centerIn = (region: Box, box: Box): boolean =>
  box.x + box.w / 2 >= region.x &&
  box.x + box.w / 2 <= region.x + region.w &&
  box.y + box.h / 2 >= region.y &&
  box.y + box.h / 2 <= region.y + region.h

const subsetOf = (
  wanted: Record<string, string | number> | undefined,
  have: Record<string, string | number> | undefined,
): boolean => Object.entries(wanted ?? {}).every(([k, v]) => have?.[k] === v)

/** An accepted deviation hits when type, role, changeKind, text and every listed expected/actual value agree. */
export const acceptsFinding = (a: AcceptedDeviation, f: Finding): boolean =>
  a.type === f.type &&
  (a.role === undefined || a.role === f.role) &&
  (a.changeKind === undefined || a.changeKind === f.actual?.["changeKind"]) &&
  (a.text === undefined || (f.text !== undefined && normText(a.text) === normText(f.text))) &&
  subsetOf(a.expected, f.expected) &&
  subsetOf(a.actual, f.actual)

/**
 * Which rule (if any) suppresses a finding. Rules are checked in a fixed
 * order so a finding hit by several reports the most specific one.
 */
export function suppressionFor(
  f: Finding,
  policy: IgnorePolicy,
  patterns: readonly CompiledTextPattern[],
  dataSlotPatterns: readonly RegExp[] = compileDataSlotPatterns(policy.dataSlots),
): { reason: SuppressionReason; rule: string } | undefined {
  // Regions (impl/aligned CSS-px space): anything whose box sits in an
  // ignored region is chrome.
  for (const region of policy.regions ?? []) {
    const box = f.implBox ?? f.designBox
    if (box && (contains(region, box) || centerIn(region, box))) {
      return { reason: "region", rule: `${region.x},${region.y} ${region.w}×${region.h}` }
    }
  }

  // Roles: element kinds the policy declares out of scope.
  if (f.role !== undefined && (policy.roles ?? []).includes(f.role)) {
    return { reason: "role", rule: f.role }
  }

  // Text patterns: demo strings (IDs, amounts, names) by regex.
  if (patterns.length > 0) {
    const texts = findingTexts(f)
    for (const p of patterns) {
      // A role-scoped entry only excuses findings of that role: the same word can
      // belong to an artboard label and to a real control.
      if (p.role !== undefined && p.role !== f.role) continue
      // Type scope: a rule that says "this string is absent" must not also say
      // "and its geometry is uninteresting".
      if (p.types !== undefined && !p.types.includes(f.type)) continue
      if (texts.some((t) => p.re.test(t))) {
        const scope = [p.role === undefined ? "" : `@${p.role}`, p.types === undefined ? "" : `:${p.types.join("/")}`]
          .filter((x) => x !== "")
          .join(" ")
        return { reason: "text-pattern", rule: scope === "" ? p.re.source : `${p.re.source} ${scope}` }
      }
    }
  }

  // Accepted deviations: intended, reviewed differences (the reason is the rule).
  for (const a of policy.accepted ?? []) {
    if (acceptsFinding(a, f)) return { reason: "accepted", rule: a.reason }
  }

  // Data slots: a MATCHED pair whose texts differ is data, not drift. The
  // position/size/color/typography checks on that pair are untouched — only
  // the text-content finding goes.
  if (f.type === "text-content") {
    const rule = dataSlotRule(f, policy.dataSlots, dataSlotPatterns)
    if (rule) return { reason: "data-slot", rule }
  }

  return undefined
}

/** Stands in for a matched data run while the surrounding copy is compared. */
const DATA_MASK = "\u0000"

/** Replace every match of every pattern with the mask; report which ones hit. */
function maskData(text: string, patterns: readonly RegExp[]): { masked: string; hits: RegExp[] } {
  const hits: RegExp[] = []
  let masked = text
  for (const re of patterns) {
    const next = masked.replace(re, DATA_MASK)
    if (next !== masked) hits.push(re)
    masked = next
  }
  return { masked, hits }
}

/**
 * Which data-slot rule, if any, covers this text-content finding.
 *
 * The narrowed form MASKS each declared data shape out of both strings and
 * compares what is left, rather than asking whether the whole string looks like
 * data. That is what makes a MIXED slot work: `"Blok · 12. 7. 2026"` vs
 * `"Doklad · 12. 7. 2026"` masks to `"Blok · ␀"` vs `"Doklad · ␀"`, which differ,
 * so the copy drift is reported even though the dates were ignored — while
 * `"Blok · 12. 7. 2026"` vs `"Blok · 11. 7. 2026"` masks to the same string on
 * both sides and is correctly suppressed as data churn.
 *
 * It also makes the rule self-expiring in the same move. When a slot that showed
 * `412,00 €` is restructured to hold static copy, the copy does not match the
 * shape, nothing is masked out of it, the remainders differ, and the change is
 * reported — instead of being excused forever by a structural "this was a data
 * slot" claim that nothing ever re-checks.
 *
 * Masking also makes UNANCHORED patterns safe: `\d{1,2}\. \d{1,2}\. \d{4}` masks
 * only the date it matched instead of swallowing the whole string, which a
 * `re.test()` design would have done (`test` is a substring search).
 */
function dataSlotRule(
  f: Finding,
  dataSlots: IgnorePolicy["dataSlots"],
  patterns: readonly RegExp[],
): string | undefined {
  if (dataSlots === undefined || dataSlots === false) return undefined
  if (dataSlots === true) return "matched pair, differing text"
  const expected = f.expected?.["text"]
  const actual = f.actual?.["text"]
  if (typeof expected !== "string" || typeof actual !== "string") return undefined
  const design = maskData(normText(expected), patterns)
  const impl = maskData(normText(actual), patterns)
  // Copy around the data differs → this is drift, not data.
  if (design.masked !== impl.masked) return undefined
  // Equal remainders but nothing was masked means the pattern is irrelevant here.
  const hits = [...new Set([...design.hits, ...impl.hits])]
  if (hits.length === 0) return undefined
  return `data shape ${hits.map((re) => re.source).join(", ")}`
}

/** Rounding slack (px) for "inside": a bar flush with the plate's edge is inside it. */
const INSIDE_SLACK = 1

const within = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x - INSIDE_SLACK &&
  inner.y >= outer.y - INSIDE_SLACK &&
  inner.x + inner.w <= outer.x + outer.w + INSIDE_SLACK &&
  inner.y + inner.h <= outer.y + outer.h + INSIDE_SLACK

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/** The region an accepted finding occupies: both of its boxes (one world space), or the one it has. */
const regionOf = (f: Finding): Box | undefined =>
  f.designBox && f.implBox ? union(f.designBox, f.implBox) : (f.implBox ?? f.designBox)

interface Container {
  region: Box
  rule: string
  reason: SuppressionReason
  /**
   * Finding types this container explains. `undefined` is the `accepted[].contents` case: the
   * region is the whole argument, so text is never excused (see `insideRule`).
   */
  types?: readonly FindingType[]
}

/**
 * The regions `accepted[].contents` rules excuse: one per finding such a rule
 * hit in the first pass. Nothing hit → nothing excused, so a placeholder rule
 * that no longer matches (the comp stopped drawing the plate) drops its
 * contents with it.
 */
function contentContainers(
  policy: IgnorePolicy,
  findings: readonly Finding[],
  hits: readonly ({ reason: SuppressionReason; rule: string } | undefined)[],
): Container[] {
  const out: Container[] = []
  for (const a of policy.accepted ?? []) {
    if (a.contents !== true) continue
    findings.forEach((f, i) => {
      const hit = hits[i]
      if (hit?.reason !== "accepted" || hit.rule !== a.reason || !acceptsFinding(a, f)) return
      const region = regionOf(f)
      if (region) out.push({ region, rule: `${a.reason} (inside)`, reason: "accepted" })
    })
  }
  return out
}

/**
 * The containers a `contentsOf` rule names: one per implementation element of that role, whether or
 * not the element is itself reported. That is the whole point — see `ContentsOfRule`.
 */
function contentsOfContainers(
  policy: IgnorePolicy,
  implElements: readonly ElementNode[],
  frame: { w: number; h: number } | undefined,
): Container[] {
  const out: Container[] = []
  const inFrame = (b: Box): boolean =>
    frame === undefined ||
    (b.x >= -1 && b.y >= -1 && b.x + b.w <= frame.w + 1 && b.y + b.h <= frame.h + 1)
  for (const rule of policy.contentsOf ?? []) {
    for (const el of implElements) {
      if (el.role !== rule.role) continue
      if (el.box.w <= 0 || el.box.h <= 0) continue
      // A container the frame does not contain says nothing about what is inside it: a panned,
      // zoomed canvas covers the whole viewport and everything drawn beside it.
      if (!inFrame(el.box)) continue
      out.push({
        region: el.box,
        rule: `${rule.reason} (contents of ${rule.role})`,
        reason: "contents",
        types: rule.types,
      })
    }
  }
  return out
}

/**
 * A TEXTLESS finding whose every box lies inside an excused region is that container's contents (the
 * placeholder's bars, the logo square in the artboard, the live DOM inside the screenshot).
 *
 * Text is never excused this way, whichever kind of container names the region: a label or a badge
 * drawn over it is a finding the rule must not hide, and the comp draws its badges over the very
 * artboard a `contentsOf` rule excuses. A container that names TYPES excuses only those types, so
 * the app's own marks over the same region stay compared.
 */
function insideRule(f: Finding, containers: readonly Container[]): { reason: SuppressionReason; rule: string } | undefined {
  if (f.text !== undefined) return undefined
  const boxes = [f.designBox, f.implBox].filter((b): b is Box => b !== undefined)
  if (boxes.length === 0) return undefined
  const c = containers.find(
    (c) => (c.types === undefined || c.types.includes(f.type)) && boxes.every((b) => within(c.region, b)),
  )
  return c ? { reason: c.reason, rule: c.rule } : undefined
}

const renumber = <T extends Finding>(prefix: string, list: readonly T[]): T[] =>
  list.map((f, i) => ({ ...f, id: `${prefix}${i + 1}`, mark: i + 1 }))

/**
 * Pure stage: partition findings by the policy. Order is preserved within
 * each partition (findings arrive severity-sorted from the checks stage).
 */
export function applyPolicy(
  findings: readonly Finding[],
  policy: IgnorePolicy = {},
  /**
   * What a `contentsOf` rule needs: the implementation's elements (its containers are elements, not
   * findings) and the frame that bounds a usable container. Absent = no such rule can fire.
   */
  context: { implElements?: readonly ElementNode[]; frame?: { w: number; h: number } } = {},
): PolicyResult {
  const patterns = compilePatterns(policy.textPatterns)
  const dataSlotPatterns = compileDataSlotPatterns(policy.dataSlots)
  const hits = findings.map((f) => suppressionFor(f, policy, patterns, dataSlotPatterns))
  // Second pass: what an `accepted[].contents` rule excused also excuses the
  // textless findings inside it — decided from the FIRST pass's hits, so the
  // contents can never excuse each other.
  const containers = [
    ...contentContainers(policy, findings, hits),
    ...contentsOfContainers(policy, context.implElements ?? [], context.frame),
  ]
  const kept: Finding[] = []
  const suppressed: SuppressedFinding[] = []
  findings.forEach((f, i) => {
    const hit = hits[i] ?? (containers.length > 0 ? insideRule(f, containers) : undefined)
    if (hit) suppressed.push({ ...f, suppressedBy: hit.reason, rule: hit.rule })
    else kept.push(f)
  })
  return { kept: renumber("f", kept), suppressed: renumber("s", suppressed) }
}

/** Merge policies; later ones win on `scope`/`dataSlots`, lists concatenate. */
export function mergePolicies(...policies: readonly (IgnorePolicy | undefined)[]): IgnorePolicy {
  const out: IgnorePolicy = {}
  for (const p of policies) {
    if (!p) continue
    if (p.textPatterns) out.textPatterns = [...(out.textPatterns ?? []), ...p.textPatterns]
    if (p.roles) out.roles = [...(out.roles ?? []), ...p.roles]
    if (p.regions) out.regions = [...(out.regions ?? []), ...p.regions]
    if (p.accepted) out.accepted = [...(out.accepted ?? []), ...p.accepted]
    if (p.contentsOf) out.contentsOf = [...(out.contentsOf ?? []), ...p.contentsOf]
    if (p.scope !== undefined) out.scope = p.scope
    if (p.dataSlots !== undefined) out.dataSlots = p.dataSlots
  }
  return out
}
