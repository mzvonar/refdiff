/**
 * Interaction steps before a capture: how a state that only exists AFTER a
 * click becomes a measurable pair.
 *
 * The problem, measured 2026-09-02. A Claude Design comp is a LIVE page, and
 * designers put real behaviour in it — the ghost language for one-sided findings
 * (a hatched footprint, a direction pill, a side switch) exists only once a
 * finding row is tapped. A capture takes the DEFAULT state, so that whole
 * design shipped invisible to the harness: nothing to compare against, and an
 * implementation of it could not be verified by the tool whose entire premise is
 * that the model is never the comparator. The same is true of every hover state,
 * every open menu, every expanded row, on both sides of a pair.
 *
 * Two rules this module exists to enforce:
 *
 * 1. **Steps belong on BOTH sides.** A state is a state. Driving the comp into
 *    its selected state and capturing the app in its default one produces a
 *    confident report about nothing — every finding would be the difference
 *    between "selected" and "not selected". So `design.steps` and `app.steps`
 *    are separate, and a pair that sets one without the other is a warning
 *    (`stepsOnOneSide`), not a convenience.
 * 2. **A step that cannot run HARD-STOPS.** If the selector is gone — the
 *    designer renamed a row, the app changed a hook — the capture must fail
 *    loudly. Silently photographing the default state is the worst outcome
 *    available: the pair goes green while measuring a different state than it
 *    claims, exactly the class of failure `figma-low-quality` and
 *    `blank-render` exist to prevent.
 */

/** One action before the capture. Serializable, so it lives in a manifest. */
export type CaptureStep =
  /** Click the first element matching this CSS selector. */
  | { click: string }
  /**
   * Click the innermost element whose trimmed text STARTS WITH this string.
   * For a comp with no stable hooks on its interactive parts — a rail row is a
   * bare div. Prefer `click` against a `data-vc-*` hook where the designer can
   * add one; this is the escape hatch, and it is why `stepHint` exists.
   */
  | { clickText: string }
  /** Press a key on the focused element (Escape, Enter, …). */
  | { press: string }
  /** Settle time in ms after the previous step. */
  | { wait: number }

export type StepError =
  | { kind: "step-target-not-found"; index: number; step: CaptureStep }
  | { kind: "step-failed"; index: number; step: CaptureStep; detail: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Pure: validate one manifest entry into a step, or say why not. */
export function readStep(v: unknown): CaptureStep | undefined {
  if (!isRecord(v)) return undefined
  if (typeof v["click"] === "string" && v["click"] !== "") return { click: v["click"] }
  if (typeof v["clickText"] === "string" && v["clickText"] !== "") return { clickText: v["clickText"] }
  if (typeof v["press"] === "string" && v["press"] !== "") return { press: v["press"] }
  if (typeof v["wait"] === "number" && Number.isFinite(v["wait"]) && v["wait"] >= 0) {
    return { wait: v["wait"] }
  }
  return undefined
}

/** Pure: validate a list; unreadable entries are dropped and counted. */
export function readSteps(v: unknown): { steps: CaptureStep[]; dropped: number } {
  if (!Array.isArray(v)) return { steps: [], dropped: 0 }
  const steps: CaptureStep[] = []
  let dropped = 0
  for (const raw of v) {
    const s = readStep(raw)
    if (s === undefined) dropped++
    else steps.push(s)
  }
  return { steps, dropped }
}

/**
 * Pure: true when exactly one side of a pair carries steps. Not an error — a
 * hover state may exist on one side only while it is being built — but it is
 * the shape that produces a whole report about "selected vs not selected", so
 * the CLI says so out loud.
 */
export function stepsOnOneSide(
  design: readonly CaptureStep[] | undefined,
  app: readonly CaptureStep[] | undefined,
): boolean {
  const d = (design ?? []).length > 0
  const a = (app ?? []).length > 0
  return d !== a
}

/** Pure: a one-line description for logs and errors. */
export function describeStep(s: CaptureStep): string {
  if ("click" in s) return `click ${s.click}`
  if ("clickText" in s) return `clickText ${JSON.stringify(s.clickText)}`
  if ("press" in s) return `press ${s.press}`
  return `wait ${s.wait}ms`
}

/**
 * Pure: the advice printed when a `clickText` step is used. A text match breaks
 * the moment a label is reworded, which on a comp is a normal Tuesday — so the
 * durable fix is a hook the designer owns, the same way `data-vc-scope` already
 * marks the node a pair is scoped to.
 */
export const stepHint =
  "clickText matches rendered copy, so it breaks when a label is reworded — ask for a data-vc-step hook on the trigger and use `click` instead"

/* ------------------------------------------------------------ effects -- */

/** The slice of Playwright's Page this module needs — keeps the pure tests pure. */
export interface StepPage {
  locator: (selector: string) => {
    count: () => Promise<number>
    first: () => { click: (options?: { timeout?: number }) => Promise<void> }
  }
  keyboard: { press: (key: string) => Promise<void> }
  waitForTimeout: (ms: number) => Promise<void>
  evaluate: <T>(fn: (arg: string) => T, arg: string) => Promise<T>
}

/**
 * Run the steps, in order, and settle briefly after the last one. Any failure
 * is returned, never swallowed: a capture of the wrong state is worse than no
 * capture, because it looks like a result.
 */
export async function runSteps(
  page: StepPage,
  steps: readonly CaptureStep[],
  settleMs = 350,
): Promise<StepError | undefined> {
  for (const [index, step] of steps.entries()) {
    try {
      if ("wait" in step) {
        await page.waitForTimeout(step.wait)
        continue
      }
      if ("press" in step) {
        await page.keyboard.press(step.press)
        continue
      }
      if ("click" in step) {
        if ((await page.locator(step.click).count()) === 0) {
          return { kind: "step-target-not-found", index, step }
        }
        await page.locator(step.click).first().click({ timeout: 5000 })
        continue
      }
      // clickText: resolved in the page, because "the innermost element whose
      // text starts with X" is not expressible as a CSS selector.
      const marked = await page.evaluate((needle: string) => {
        const txt = (e: Element): string => (e.textContent ?? "").replace(/\s+/g, " ").trim()
        const all = Array.from(document.querySelectorAll("*"))
        const hits = all.filter((e) => txt(e).startsWith(needle))
        // Innermost: the deepest hit that contains no other hit.
        const inner = hits.filter((e) => !hits.some((o) => o !== e && e.contains(o)))
        const target = inner[0] ?? hits[hits.length - 1]
        if (!target) return false
        target.setAttribute("data-vc-step-target", "")
        return true
      }, step.clickText)
      if (!marked) return { kind: "step-target-not-found", index, step }
      await page.locator("[data-vc-step-target]").first().click({ timeout: 5000 })
      await page.evaluate(
        (_: string) => {
          for (const e of Array.from(document.querySelectorAll("[data-vc-step-target]"))) {
            e.removeAttribute("data-vc-step-target")
          }
          return true
        },
        "",
      )
    } catch (e) {
      return { kind: "step-failed", index, step, detail: e instanceof Error ? e.message : String(e) }
    }
  }
  if (steps.length > 0) await page.waitForTimeout(settleMs)
  return undefined
}
