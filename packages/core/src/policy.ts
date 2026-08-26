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

import type { Box, Finding, IgnorePolicy, SuppressedFinding, SuppressionReason } from "./types.js";

export interface PolicyResult {
  /** Findings that survive, renumbered f1..fn / marks 1..n. */
  kept: Finding[];
  /** Findings a rule removed, renumbered s1..sm, tagged with the rule. */
  suppressed: SuppressedFinding[];
}

const normText = (t: string): string => t.replace(/\s+/g, " ").trim();

/** Every text a finding is about — the element label and both compared strings. */
function findingTexts(f: Finding): string[] {
  const out: string[] = [];
  const quoted = /"([^"]*)"/g;
  for (const m of f.message.matchAll(quoted)) out.push(m[1]!);
  for (const side of [f.expected, f.actual]) {
    const t = side?.["text"];
    if (typeof t === "string") out.push(t);
  }
  return out.map(normText);
}

function compilePatterns(sources: readonly string[] | undefined): RegExp[] {
  return (sources ?? []).map((s) => new RegExp(s, "u"));
}

const contains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Center-inside test — a box that merely grazes a region is not "in" it. */
const centerIn = (region: Box, box: Box): boolean =>
  box.x + box.w / 2 >= region.x &&
  box.x + box.w / 2 <= region.x + region.w &&
  box.y + box.h / 2 >= region.y &&
  box.y + box.h / 2 <= region.y + region.h;

/**
 * Which rule (if any) suppresses a finding. Rules are checked in a fixed
 * order so a finding hit by several reports the most specific one.
 */
export function suppressionFor(
  f: Finding,
  policy: IgnorePolicy,
  patterns: readonly RegExp[],
): { reason: SuppressionReason; rule: string } | undefined {
  // Regions (impl/aligned CSS-px space): anything whose box sits in an
  // ignored region is chrome.
  for (const region of policy.regions ?? []) {
    const box = f.implBox ?? f.designBox;
    if (box && (contains(region, box) || centerIn(region, box))) {
      return { reason: "region", rule: `${region.x},${region.y} ${region.w}×${region.h}` };
    }
  }

  // Roles: element kinds the policy declares out of scope.
  if (f.role !== undefined && (policy.roles ?? []).includes(f.role)) {
    return { reason: "role", rule: f.role };
  }

  // Text patterns: demo strings (IDs, amounts, names) by regex.
  if (patterns.length > 0) {
    const texts = findingTexts(f);
    for (const re of patterns) {
      if (texts.some((t) => re.test(t))) return { reason: "text-pattern", rule: re.source };
    }
  }

  // Data slots: a MATCHED pair whose texts differ is data, not drift. The
  // position/size/color/typography checks on that pair are untouched — only
  // the text-content finding goes.
  if (policy.dataSlots && f.type === "text-content") {
    return { reason: "data-slot", rule: "matched pair, differing text" };
  }

  return undefined;
}

const renumber = <T extends Finding>(prefix: string, list: readonly T[]): T[] =>
  list.map((f, i) => ({ ...f, id: `${prefix}${i + 1}`, mark: i + 1 }));

/**
 * Pure stage: partition findings by the policy. Order is preserved within
 * each partition (findings arrive severity-sorted from the checks stage).
 */
export function applyPolicy(findings: readonly Finding[], policy: IgnorePolicy = {}): PolicyResult {
  const patterns = compilePatterns(policy.textPatterns);
  const kept: Finding[] = [];
  const suppressed: SuppressedFinding[] = [];
  for (const f of findings) {
    const hit = suppressionFor(f, policy, patterns);
    if (hit) suppressed.push({ ...f, suppressedBy: hit.reason, rule: hit.rule });
    else kept.push(f);
  }
  return { kept: renumber("f", kept), suppressed: renumber("s", suppressed) };
}

/** Merge policies; later ones win on `scope`/`dataSlots`, lists concatenate. */
export function mergePolicies(...policies: readonly (IgnorePolicy | undefined)[]): IgnorePolicy {
  const out: IgnorePolicy = {};
  for (const p of policies) {
    if (!p) continue;
    if (p.textPatterns) out.textPatterns = [...(out.textPatterns ?? []), ...p.textPatterns];
    if (p.roles) out.roles = [...(out.roles ?? []), ...p.roles];
    if (p.regions) out.regions = [...(out.regions ?? []), ...p.regions];
    if (p.scope !== undefined) out.scope = p.scope;
    if (p.dataSlots !== undefined) out.dataSlots = p.dataSlots;
  }
  return out;
}
