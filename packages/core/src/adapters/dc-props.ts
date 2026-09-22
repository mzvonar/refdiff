/**
 * Design-side props: driving a `.dc.html` comp into a state by SETTING it,
 * rather than by clicking the comp into it.
 *
 * Why this exists alongside `steps`. A Claude Design comp is a live component,
 * and several of its frames differ only by state — which row is selected, which
 * tab is open. `steps` reaches those states through the comp's own affordances,
 * which needs nothing from the designer but couples a pair to whatever happens
 * to be clickable and to the order those clicks run in. The dc-runtime has a
 * first-class answer: a comp declares props
 * (`<script data-dc-script data-props='{"selAd":{"default":1}}'>`) and the host
 * overrides them through `window.__dcSetProps(rootName, overrides)`, which
 * re-renders. Declarative, order-independent, and durable as long as the prop
 * keeps its name.
 *
 * Measured 2026-09-22, on the comp this was built for: both accountant frames
 * booted on a thread with no request row, so the branch drawing the whole
 * "waiting" card was never rendered by any capture. The census said so —
 * "12 never true in this captured state: … r.showWaiting" — and nothing read
 * it. With `props: { selAd: "t1" }` the same census reports 10.
 *
 * THE FAILURE THIS MODULE EXISTS TO PREVENT. An override for a prop the comp
 * does not declare is silently inert: `__dcSetProps` accepts it, the registry
 * bumps, the render is identical, and the capture shoots the DEFAULT state
 * while the pair's app side sits in the state that was asked for. Every
 * difference between the two is then reported as drift, confidently. Same class
 * as `blank-render` and `step-target-not-found`, and the same treatment: a
 * typed error, never a screenshot.
 *
 * WHAT THE CHECK PROVES, AND WHAT IT DOES NOT — stated because a half-closed
 * door is more dangerous than an open one. It proves the prop NAME is one the
 * comp declares, by set membership against the comp's own `propsMeta`. It does
 * NOT prove:
 *   - that the VALUE means anything (`selAd: "t99"` for a thread that does not
 *     exist is accepted, and renders the default);
 *   - that the mounted component CONSUMES the override. The runtime stores it
 *     and re-renders whatever the mount path reads; a canvas mounted outside
 *     the standalone root path would store and ignore it.
 * Both remain the caller's job, and the post-hoc signal for both is the branch
 * census: if the state you asked for did not draw, its branch is still listed
 * as never true. A rendered-diff check was considered for these and rejected —
 * it cannot separate "the prop did nothing" from "the prop was already at that
 * value", which is exactly the case it would need to catch.
 */

import { err, ok, type Result } from "../result.js"

/** What the page reports back about the runtime and the comp. Serializable. */
export interface DcPropsProbe {
  /** False when the runtime predates `__dcSetProps` (or this is not a dc canvas). */
  supported: boolean
  /** The component mounted as the page root — what `__dcSetProps` targets. */
  root: string
  /**
   * Whether the root's REGISTRY ENTRY was readable at all.
   *
   * Kept apart from an empty `declared` on purpose: "I could not see the
   * declaration" and "there is no declaration" have opposite remedies, and
   * collapsing them produces an error telling the operator to declare a prop
   * that may already exist.
   */
  registryVisible: boolean
  /** Prop names the comp DECLARES, from the registry entry's `propsMeta`. */
  declared: string[]
}

export type DcPropsError =
  | { kind: "props-unsupported" }
  | { kind: "props-registry-unreadable"; root: string }
  | { kind: "props-undeclared"; undeclared: string[]; declared: string[]; root: string }

/**
 * Pure: decide whether an override set is safe to apply, given what the comp
 * declares.
 */
export function checkProps(
  props: Record<string, unknown>,
  probe: DcPropsProbe,
): DcPropsError | undefined {
  if (!probe.supported) return { kind: "props-unsupported" }
  if (!probe.registryVisible) return { kind: "props-registry-unreadable", root: probe.root }
  const declared = new Set(probe.declared)
  const undeclared = Object.keys(props).filter((k) => !declared.has(k))
  if (undeclared.length > 0) {
    return { kind: "props-undeclared", undeclared, declared: probe.declared, root: probe.root }
  }
  return undefined
}

/** Pure: the operator-facing sentence for a props failure. */
export function describePropsError(error: DcPropsError): string {
  if (error.kind === "props-unsupported") {
    return "the comp's dc-runtime exposes no __dcSetProps — support.js predates prop overrides, so re-vendor it alongside the comp"
  }
  if (error.kind === "props-registry-unreadable") {
    return `the dc-runtime exposes no registry entry for the page root "${error.root}", so what the comp declares could not be read — this is a harness/runtime mismatch, NOT a missing declaration`
  }
  const { undeclared, declared, root } = error
  const has =
    declared.length === 0
      ? `the root "${root}" declares no props at all`
      : `the root "${root}" declares: ${declared.join(", ")}`
  return `${undeclared.join(", ")} — ${has}. An override for a prop the comp does not declare is silently inert: the frame would shoot its DEFAULT state while the pair claims the requested one. Note props reach the component mounted as the page ROOT: a wrapper that pulls the real comp in with <dc-import> declares nothing itself, and its child cannot be reached this way — use steps, or point the pair at the comp directly`
}

/**
 * Pure: validate a manifest `props` entry.
 *
 * A malformed entry is an ERROR, never a drop. Dropping is safe for an `ignore`
 * rule — the run then reports what the rule would have excused, loudly — and it
 * is the opposite here: a dropped `props` block leaves the capture in the very
 * default state the module exists to keep it out of, with nothing to show for
 * it. `props: [{ selAd: "t1" }]` is the mistake to expect, because the
 * neighbouring `steps` IS an array.
 *
 * `{}` is refused for the same reason `readGallery` refuses an empty block: it
 * reads as "this pair sets props" while setting none.
 *
 * Deliberately permissive about VALUES — a prop's type is the comp's business
 * (the comp above takes either an index or a thread id for the same prop), and
 * a value this cannot know how to check is not one it should reject.
 */
export function readProps(v: unknown): Result<Record<string, unknown> | undefined, string> {
  if (v === undefined) return ok(undefined)
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return err(
      'design.props must be an object of prop overrides, e.g. { selAd: "t1" } — note `steps` is an array but `props` is not',
    )
  }
  const entries = Object.entries(v as Record<string, unknown>)
  if (entries.length === 0) {
    return err("design.props is empty — remove it, or name the prop the pair means to set")
  }
  return ok(Object.fromEntries(entries))
}

/* ------------------------------------------------------------ effects -- */

/** The slice of Playwright's Page this module needs — keeps the pure tests pure. */
export interface PropsPage {
  evaluate: <T, A>(fn: (arg: A) => T, arg: A) => Promise<T>
  waitForTimeout: (ms: number) => Promise<void>
}

/**
 * Read the runtime's props surface. Runs IN the page, so it is covered by a
 * real-browser test (`dc-props.browser.test.ts`) rather than a fake page: a
 * canned `evaluate` would test this caller and not one statement of the closure,
 * and the closure is where a runtime rename would bite.
 */
export async function probeProps(page: PropsPage): Promise<DcPropsProbe> {
  return page.evaluate((_: null) => {
    const w = window as unknown as {
      __dcSetProps?: (name: string, overrides: Record<string, unknown>) => void
      __dcRootName?: () => string
      __dcRegistry?: Record<string, { propsMeta?: Record<string, unknown> | null }>
    }
    if (typeof w.__dcSetProps !== "function" || typeof w.__dcRootName !== "function") {
      return { supported: false, root: "", registryVisible: false, declared: [] }
    }
    const root = w.__dcRootName()
    const entry = w.__dcRegistry?.[root]
    return {
      supported: true,
      root,
      registryVisible: entry !== undefined,
      // `propsMeta` is null on an entry that declared none — distinct from the
      // entry being absent, which `registryVisible` carries.
      declared: Object.keys(entry?.propsMeta ?? {}),
    }
  }, null)
}

/**
 * Probe, validate, apply, settle. One entry point returning an error or
 * undefined, as `runSteps` does — the caller maps it to a CaptureError.
 *
 * Nothing is applied before the check passes: an inert override cannot reach a
 * report anyway (the capture aborts), but "never mutate before validating" is
 * the better default and costs one round-trip measured at ~2.4ms.
 */
export async function driveProps(
  page: PropsPage,
  props: Record<string, unknown>,
  settleMs: number,
): Promise<DcPropsError | undefined> {
  const probe = await probeProps(page)
  const problem = checkProps(props, probe)
  if (problem) return problem

  await page.evaluate((overrides: Record<string, unknown>) => {
    const w = window as unknown as {
      __dcSetProps: (name: string, o: Record<string, unknown>) => void
      __dcRootName: () => string
    }
    w.__dcSetProps(w.__dcRootName(), overrides)
  }, props)

  // The registry bump schedules a React update rather than flushing one
  // synchronously, so this wait is load-bearing and not a grace period. What it
  // protects is narrower than it looks: the element tree is extracted AFTER
  // `captureUntilStable` has already proved two byte-identical shots, so the
  // only box read that precedes any stability gate is `resolveScope`'s
  // largest-child area pick.
  await page.waitForTimeout(settleMs)
  return undefined
}
