/**
 * Accepted-deviation DECISIONS (pure) — the file behind `refdiff accept`.
 *
 * "We looked at this difference and the implementation is right" is a decision
 * a person makes once and the harness must then remember. The mechanism already
 * exists — `ignore.accepted` — but it lived only in a hand-edited manifest, so
 * recording a decision meant editing code, and in practice nobody did: the
 * finding came back every run and was re-judged from scratch.
 *
 * This module is the durable, machine-writable home for those decisions:
 * `accepted.json` next to the manifest, keyed by pair. A compare run merges the
 * pair's entries into its ignore policy, so the finding travels under
 * `suppressed` with its rule rather than vanishing — and, because each entry
 * carries the MEASUREMENT it was decided against, the rule lapses by itself the
 * moment either value changes. That is the whole point of accepting rather than
 * editing the comp: a comp edited to match agrees forever, including on the day
 * the implementation regresses.
 *
 * What may be accepted is deliberately narrow (`acceptedFromFinding`): a rule
 * that cannot identify WHICH difference it forgives is worse than no rule.
 */

import type { AcceptedDeviation, Finding, FindingType } from "./types.js"

import { err, ok, type Result } from "./result.js"

/** One decision, plus the provenance a human needs when re-reading the file. */
export interface AcceptedRecord extends AcceptedDeviation {
  /** `Finding.key` when the decision was taken. Provenance — matching uses the values. */
  key?: string
  /** ISO timestamp of the decision. */
  decidedAt?: string
}

export interface AcceptedFile {
  version: 1
  /** Pair id → the deviations accepted for it. */
  pairs: Record<string, AcceptedRecord[]>
}

export const emptyAcceptedFile = (): AcceptedFile => ({ version: 1, pairs: {} })

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const isValues = (v: unknown): v is Record<string, string | number> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === "string" || typeof x === "number")

function readRecord(value: unknown): AcceptedRecord | undefined {
  if (!isRecord(value) || typeof value["type"] !== "string" || typeof value["reason"] !== "string")
    return undefined
  const optionalString = (k: string): boolean =>
    value[k] === undefined || typeof value[k] === "string"
  if (!["role", "changeKind", "text", "key", "decidedAt"].every(optionalString)) return undefined
  if (value["expected"] !== undefined && !isValues(value["expected"])) return undefined
  if (value["actual"] !== undefined && !isValues(value["actual"])) return undefined
  if (value["contents"] !== undefined && value["contents"] !== true) return undefined
  const str = (k: string): Record<string, string> =>
    typeof value[k] === "string" ? { [k]: value[k] } : {}
  return {
    type: value["type"] as FindingType,
    ...str("role"),
    ...str("changeKind"),
    ...str("text"),
    ...(isValues(value["expected"]) ? { expected: value["expected"] } : {}),
    ...(isValues(value["actual"]) ? { actual: value["actual"] } : {}),
    ...(value["contents"] === true ? { contents: true as const } : {}),
    reason: value["reason"],
    ...str("key"),
    ...str("decidedAt"),
  }
}

/** Parse a decisions file. A malformed ENTRY is an error, not a silent drop: a decision that quietly stopped applying is the failure this file exists to prevent. */
export function parseAcceptedFile(value: unknown): Result<AcceptedFile, string> {
  if (!isRecord(value)) return err("accepted file must be an object")
  if (value["version"] !== 1)
    return err(`accepted file version must be 1, got ${String(value["version"])}`)
  if (!isRecord(value["pairs"])) return err("accepted file needs a pairs object")
  const pairs: Record<string, AcceptedRecord[]> = {}
  for (const [pair, entries] of Object.entries(value["pairs"])) {
    if (!Array.isArray(entries)) return err(`accepted.pairs["${pair}"] must be an array`)
    const parsed: AcceptedRecord[] = []
    for (const [i, entry] of entries.entries()) {
      const record = readRecord(entry)
      if (!record) return err(`accepted.pairs["${pair}"][${i}] needs at least { type, reason }`)
      parsed.push(record)
    }
    pairs[pair] = parsed
  }
  return ok({ version: 1, pairs })
}

/** The deviations to merge into one pair's ignore policy. */
export const acceptedFor = (file: AcceptedFile, pair: string): AcceptedDeviation[] =>
  file.pairs[pair] ?? []

/**
 * Types this tool refuses to write a decision for, and what to do instead. A
 * refusal beats a rule that looks recorded and silently never applies again.
 */
const REFUSALS: Partial<Record<FindingType, string>> = {
  position:
    "an offset is a coordinate pair that moves with every recapture, so the rule would lapse on the next run — fix the comp, the alignment or the fixture instead",
  spacing:
    "a gap is measured in fractional px and changes with the alignment, so the rule would lapse on the next run — fix the comp or the layout instead",
  alignment:
    "the identity note's numbers move on every capture and it is not a deviation to keep — fix the size difference it names (box model, chrome height) and it goes away",
}

/**
 * Values a decision must not be pinned to: the diff numbers change on every
 * capture, and `changeKind` is hoisted into its own field — leaving it in
 * `actual` too would state the same condition twice.
 */
const VOLATILE_VALUES: ReadonlySet<string> = new Set([
  "diffRatio",
  "diffPixels",
  "clusters",
  "edgeCorrelation",
  "meanColorDelta",
  "changeKind",
])

const pruneVolatile = (
  values: Record<string, string | number> | undefined,
): Record<string, string | number> | undefined => {
  if (!values) return undefined
  const kept = Object.entries(values).filter(([k]) => !VOLATILE_VALUES.has(k))
  return kept.length > 0 ? Object.fromEntries(kept) : undefined
}

/**
 * Turn a reported finding into a decision, or say why it cannot be one.
 *
 * The record is built FROM the measurement — that is what makes it lapse when
 * the measurement changes. Two narrowings matter:
 * - `pixel-region` keeps `changeKind` and drops the diff ratios; the ratio
 *   differs on every capture, and "any pixel difference here is fine" is
 *   exactly the blanket rule the policy docs forbid.
 * - a finding with no values at all (`missing-element`) is scoped by its
 *   element TEXT, without which `{ type, role }` would forgive every missing
 *   element of that role in the pair.
 */
export function acceptedFromFinding(
  finding: Finding,
  reason: string,
  now: string,
): Result<AcceptedRecord, string> {
  const trimmed = reason.trim()
  if (trimmed.length === 0) {
    return err("a decision needs a reason — an unexplained suppression cannot be audited later")
  }
  const refusal = REFUSALS[finding.type]
  if (refusal) return err(`${finding.type} cannot be accepted: ${refusal}`)
  const expected = pruneVolatile(finding.expected)
  const actual = pruneVolatile(finding.actual)
  const changeKind = finding.actual?.["changeKind"]
  const identifies =
    expected !== undefined ||
    actual !== undefined ||
    typeof changeKind === "string" ||
    finding.text !== undefined
  if (!identifies) {
    return err(
      `this ${finding.type} carries neither values nor text, so a rule for it would accept every ${finding.type} of role "${finding.role ?? "any"}" in the pair — narrow it by hand instead`,
    )
  }
  return ok({
    type: finding.type,
    ...(finding.role !== undefined ? { role: finding.role } : {}),
    ...(typeof changeKind === "string" ? { changeKind } : {}),
    ...(finding.text !== undefined ? { text: finding.text } : {}),
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
    reason: trimmed,
    ...(finding.key !== undefined ? { key: finding.key } : {}),
    decidedAt: now,
  })
}

/** Same rule, ignoring provenance: what the policy will actually match on. */
const sameRule = (a: AcceptedRecord, b: AcceptedRecord): boolean =>
  a.type === b.type &&
  a.role === b.role &&
  a.changeKind === b.changeKind &&
  a.text === b.text &&
  JSON.stringify(a.expected ?? null) === JSON.stringify(b.expected ?? null) &&
  JSON.stringify(a.actual ?? null) === JSON.stringify(b.actual ?? null)

/**
 * Add a decision. An identical rule is REPLACED (the newer reason and timestamp
 * win) rather than appended, so re-running `accept` over the same triage does
 * not grow the file. A hand-added `contents: true` on the existing rule
 * survives the replacement — the CLI never writes it and must not drop it.
 */
export function upsertAccepted(
  file: AcceptedFile,
  pair: string,
  record: AcceptedRecord,
): { file: AcceptedFile; added: boolean } {
  const existing = file.pairs[pair] ?? []
  const at = existing.findIndex((e) => sameRule(e, record))
  const merged: AcceptedRecord =
    at >= 0 && existing[at]!.contents === true && record.contents === undefined
      ? { ...record, contents: true }
      : record
  const next = at >= 0 ? existing.map((e, i) => (i === at ? merged : e)) : [...existing, record]
  return {
    file: { version: 1, pairs: { ...file.pairs, [pair]: next } },
    added: at < 0,
  }
}

/** Drop a rule by its `key` provenance. Returns the file unchanged when nothing matched. */
export function removeAcceptedByKey(
  file: AcceptedFile,
  pair: string,
  key: string,
): { file: AcceptedFile; removed: number } {
  const existing = file.pairs[pair] ?? []
  const next = existing.filter((e) => e.key !== key)
  return {
    file: { version: 1, pairs: { ...file.pairs, [pair]: next } },
    removed: existing.length - next.length,
  }
}
