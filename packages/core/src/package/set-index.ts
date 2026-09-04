/**
 * The SET INDEX (pure): what a component set CONTAINS, as opposed to what a
 * run measured.
 *
 * A run root can only show what was measured. It structurally cannot show
 * ABSENCE — and absence is what has actually misled us. `ds-button-stroke`
 * expands to 24 pairs and **36 skipped**; `ds-button-fill` to 41 and 1
 * (`no tone mapping for variant=label`); whole families in a consuming repo's
 * bindings are unpaired. Until this artifact existed that skip list was
 * printed to a console and persisted NOWHERE, so it vanished the moment a run
 * log was piped through `tail` — which is exactly how it vanished.
 *
 * One file per entry, `<out-root>/<entryId>.set.json`, written at EXPANSION
 * time rather than after the captures. Two consequences, both deliberate:
 *
 *  - A subset re-run cannot truncate it. `--pair` filters MANIFEST ENTRY ids
 *    before expansion (cli.ts), so a selected entry is always re-expanded
 *    whole and an unselected one's file is never opened. The per-entry file
 *    is what makes "merge, never replace" structural instead of a merge rule
 *    somebody has to remember.
 *  - An entry whose every variant skipped still gets its index. That is the
 *    most valuable case there is: a set that measured NOTHING, with the
 *    reason on every cell, where the run root would hold not one directory.
 *
 * Nothing here decides anything and nothing here reads a file: the per-pair
 * reports stay the truth, this says which cells were ever supposed to exist.
 */

import type { GalleryConfig, VariantAxes, VariantExpansion } from "../adapters/figma-variants.js";

import { parseVariantName } from "../adapters/figma-variants.js";

export interface SetIndexPair {
  /** "state-default_iconplacement-none_variant-default". */
  slug: string;
  /** The run dir under the out root — `<entryId>--<slug>`, which IS the pair's identity. */
  dir: string;
  props: Record<string, string>;
}

export interface SetIndexSkipped {
  nodeId: string;
  /** The variant's Figma name ("State=Default, iconPlacement=none, variant=default"). */
  name: string;
  reason: string;
  /**
   * Parsed back out of `name`. New here, and not cosmetic: a reason string
   * alone cannot place a cell in a grid, so without this a skipped cell can
   * be listed but never DRAWN in its own column and row.
   */
  props: Record<string, string>;
}

export interface SetIndex {
  /** The manifest entry's id — the first half of every one of its pair ids. */
  entryId: string;
  title?: string;
  /** The SET's node in findings.json's own `design.ref` shape (`fileKey#nodeId@version`). */
  designRef: string;
  /**
   * The designer's name for the set (`*Button/Fill`). Beyond the shape the
   * plan specified: `entryId` is ours and `designRef` is opaque, so without
   * it nothing in the artifact says what a reader would recognise in Figma.
   */
  setName: string;
  /**
   * When the EXPANSION was observed — not when any pair was compared. Also
   * beyond the specified shape, and it is the one field that lets a reader
   * tell a fresh index from one describing axes that have since changed:
   * every consumer of this file cross-references it against run dirs that
   * carry their own `createdAt`, and a set index older than the cells it
   * indexes is the mixed-vintage failure this workstream keeps meeting.
   */
  createdAt: string;
  axes: VariantAxes;
  /**
   * The manifest entry's `gallery` declaration, VERBATIM — which property is
   * columns, which is rows, pinned option order, human labels.
   *
   * It rides here because this is the artifact a grid is built from: axes,
   * pairs and skips are all in this file, and the declaration that says how to
   * arrange them would otherwise be the one input a consumer had to go back to
   * the manifest for. Absent when the entry declares none.
   *
   * Unresolved on purpose. `columns` may name a property `axes.properties`
   * does not have, and `order` an option no cell carries — the manifest parser
   * has no Figma node, so it can only check the SHAPE. The consumer holding
   * the axes resolves the names and owns what a miss means.
   */
  gallery?: GalleryConfig;
  /** The cells that became pairs, in the set's own child order. */
  pairs: SetIndexPair[];
  /** The cells that did not, each with why. Never empty for a reason. */
  skipped: SetIndexSkipped[];
}

export interface SetIndexInput {
  entryId: string;
  title?: string;
  designRef: string;
  axes: VariantAxes;
  gallery?: GalleryConfig;
  expansion: VariantExpansion;
  /** Injectable clock, so the shaping stays pure and the tests stay fixed. */
  now?: string;
}

/**
 * Shape one set's index. Total over its input: every pair and every skip the
 * expansion produced appears exactly once, so `pairs.length + skipped.length`
 * is the set's variant count and can be checked against the line the CLI
 * prints (`N variant pairs, M skipped`) — the numbers that until now existed
 * only in a log.
 */
export function buildSetIndex(input: SetIndexInput): SetIndex {
  const { entryId, designRef, axes, expansion } = input;
  return {
    entryId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    designRef,
    setName: expansion.setName,
    createdAt: input.now ?? new Date().toISOString(),
    axes,
    ...(input.gallery !== undefined ? { gallery: input.gallery } : {}),
    pairs: expansion.pairs.map((p) => ({
      slug: p.slug,
      dir: `${entryId}--${p.slug}`,
      props: p.props,
    })),
    skipped: expansion.skipped.map((s) => ({
      nodeId: s.nodeId,
      name: s.name,
      reason: s.reason,
      props: parseVariantName(s.name),
    })),
  };
}

/** `<entryId>.set.json` — a FILE at the root, never a directory. */
export const setIndexFileName = (entryId: string): string => `${entryId}.set.json`;
