/**
 * Text normalisation shared by the three stages that compare strings: anchor fitting (align),
 * element matching (match) and the `text-content` check (checks).
 *
 * They had a private copy each — identical apart from case folding — so a rule added to one silently
 * did not apply to the others.
 *
 * ## Typographic folding
 *
 * A glyph the locale picked is not a difference worth reporting. The case that forced this: design
 * comps draw negative amounts with U+2212 MINUS SIGN, while `Intl.NumberFormat` follows CLDR, which
 * says U+002D for sk/cs/de/en and U+2212 for sv/fi/lt. Comparing the raw characters therefore
 * reported every money row as `text-content` drift AND — the expensive part — cost those strings
 * their status as ANCHORS: on `client-pending-accountant-desktop` the sign alone moved alignment
 * confidence 0.55 → 0.35, under the gate that runs the pixel channel.
 *
 * Folding is deliberately narrow: only marks whose variants carry the same meaning, where a
 * difference could never be a product bug. A missing sign is still a difference (`−850` vs `850`),
 * because that is semantics, not typography.
 */

/** U+2212 MINUS SIGN → U+002D. Same operator; which one appears is locale data. */
const TYPOGRAPHIC_FOLDS: readonly [RegExp, string][] = [[/−/g, "-"]]

const fold = (text: string): string =>
  TYPOGRAPHIC_FOLDS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)

/** Collapse whitespace (JS `\s` already covers NBSP and the narrow spaces) and fold typography. */
const collapse = (text: string): string => fold(text).replace(/\s+/g, " ").trim()

/**
 * For ANCHORS and element matching: case-insensitive, because the two sides legitimately differ in
 * `text-transform` and the shown text is compared elsewhere.
 */
export const normalizeForMatching = (text: string): string => collapse(text).toLowerCase()

/**
 * For the `text-content` CHECK: case-SENSITIVE, because a label that changed case is copy drift and
 * the whole point of that finding is to report it.
 */
export const normalizeForComparison = (text: string): string => collapse(text)
