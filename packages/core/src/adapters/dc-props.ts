/**
 * Design-side props: driving a `.dc.html` comp into a state by SETTING it,
 * rather than by clicking the comp into it.
 *
 * Why this exists alongside `steps`. A Claude Design comp is a live component,
 * and several of its frames differ only by state — which thread is open, which
 * tab is active. `steps` reaches those states through the comp's own
 * affordances, which works and needs nothing from the designer, but it couples
 * a pair to what happens to be clickable and to the order those clicks run in.
 * The dc-runtime has a first-class answer: a comp declares props
 * (`<script data-dc-script data-props='{"selAd":{"default":1}}'>`) and the host
 * overrides them through `window.__dcSetProps(rootName, overrides)`, which
 * re-renders. That is declarative, order-independent, and survives the comp
 * being re-drawn as long as the prop keeps its name.
 *
 * THE FAILURE THIS MODULE EXISTS TO PREVENT. An override for a prop the comp
 * does not declare is silently inert: `__dcSetProps` accepts it, the registry
 * bumps, the render is identical, and the capture shoots the DEFAULT state
 * while the pair's app side sits in the state that was asked for. Every
 * difference between the two states is then reported as drift, confidently. It
 * is the same class of failure as `blank-render` and `step-target-not-found`,
 * and it gets the same treatment: a typed error, never a screenshot.
 *
 * The check is exact rather than heuristic. The runtime exposes the declared
 * props as `propsMeta` on the registry entry, so "is this prop real?" is a set
 * membership test against the comp's own declaration — not a before/after
 * comparison of the rendered text, which cannot tell "the prop does nothing"
 * from "the prop was already at this value".
 */

/** What the page reports back after an override attempt. Serializable. */
export interface DcPropsProbe {
  /** False when the runtime predates `__dcSetProps` (or is not a dc canvas). */
  supported: boolean
  /** Prop names the comp DECLARES, from the registry entry's `propsMeta`. */
  declared: string[]
}

export type DcPropsError =
  | { kind: "props-unsupported" }
  | { kind: "props-undeclared"; undeclared: string[]; declared: string[] }

/**
 * Pure: decide whether an override set is safe to apply, given what the comp
 * declares.
 *
 * A comp that declares NOTHING while props were asked for is `props-undeclared`
 * with an empty `declared` list, not a separate error: the remedy is the same
 * sentence either way — the comp has to declare the prop before a pair can set
 * it.
 */
export function checkProps(
  props: Record<string, unknown>,
  probe: DcPropsProbe,
): DcPropsError | undefined {
  if (!probe.supported) return { kind: "props-unsupported" }
  const declared = new Set(probe.declared)
  const undeclared = Object.keys(props).filter((k) => !declared.has(k))
  if (undeclared.length > 0) {
    return { kind: "props-undeclared", undeclared, declared: probe.declared }
  }
  return undefined
}

/** Pure: the operator-facing sentence for a props failure. */
export function describePropsError(error: DcPropsError): string {
  if (error.kind === "props-unsupported") {
    return "the comp's dc-runtime exposes no __dcSetProps — support.js predates prop overrides, so re-vendor it alongside the comp"
  }
  const { undeclared, declared } = error
  const has =
    declared.length === 0
      ? "the comp declares no props at all"
      : `the comp declares: ${declared.join(", ")}`
  return `${undeclared.join(", ")} — ${has}. An override for a prop the comp does not declare is silently inert: the frame would shoot its DEFAULT state while the pair claims the requested one`
}

/**
 * Pure: validate a manifest `props` entry.
 *
 * Deliberately permissive about VALUES — a prop's type is the comp's business
 * (`messages.dc.html` takes either an index or a thread id for the same prop),
 * and a value this cannot know how to check is not a value it should reject.
 * What it does reject is a shape that cannot be a prop bag at all.
 */
export function readProps(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined
  const entries = Object.entries(v as Record<string, unknown>)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
}
