import type { LiveSpec } from "./manifest.js"

import { describe, expect, it } from "vitest"

import { liveAuth, type LiveOptions } from "./cli.js"

/**
 * The `name` in an `--auth-post` body is for an endpoint that CREATES the
 * session user. Endpoints that UPSERT onto a seeded fixture user apply it
 * instead, so every capture renames them — the harness edits the data it is
 * measuring, and the counterpart side of the next capture reads „refdiff
 * accountant" where the fixture says „Martin Hruška". That surfaces as
 * text-content findings indistinguishable from real drift, and the only
 * workaround was re-seeding between role batches by hand.
 */
describe("liveAuth — the display name in the session POST", () => {
  const spec = { source: "live", route: "/x", role: "accountant" } as unknown as LiveSpec
  const base: LiveOptions = { authHeaders: {}, authPost: "/api/test/session" }
  const bodyOf = (o: LiveOptions): Record<string, unknown> => {
    const auth = liveAuth(spec, o, "http://localhost:3200")
    if (auth === undefined || auth.kind !== "post") throw new Error("expected a post auth")
    return auth.body as Record<string, unknown>
  }

  it("defaults to the historical `refdiff <role>`", () => {
    expect(bodyOf(base)["name"]).toBe("refdiff accountant")
  })

  it("OMITS the field entirely for an empty template — the fixture-safe mode", () => {
    const body = bodyOf({ ...base, authName: "" })
    expect("name" in body).toBe(false)
    // The rest of the body is untouched: the endpoint still knows who to be.
    expect(body["email"]).toBe("__test__accountant@example.com")
    expect(body["role"]).toBe("accountant")
  })

  it("substitutes {role} so one template covers every role", () => {
    expect(bodyOf({ ...base, authName: "QA {role} ({role})" })["name"]).toBe(
      "QA accountant (accountant)",
    )
  })

  it("passes a literal template through when it names no role", () => {
    expect(bodyOf({ ...base, authName: "Martin Hruška" })["name"]).toBe("Martin Hruška")
  })
})
