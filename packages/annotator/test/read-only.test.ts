import { describe, expect, it } from "vitest"

import { readOnlyRefusal } from "../src/read-only.js"

describe("readOnlyRefusal — the served fixture must not change under a measurement", () => {
  it("refuses every write under /api/ with 405 and says how to save", () => {
    for (const method of ["PUT", "POST", "DELETE", "PATCH"]) {
      const r = readOnlyRefusal(true, method, "/api/pairs/p/annotations")
      expect(r?.status).toBe(405)
      expect(r?.error).toContain("--read-only")
    }
  })

  it("lets reads through, and everything through when the server is not read-only", () => {
    expect(readOnlyRefusal(true, "GET", "/api/pairs")).toBeUndefined()
    expect(readOnlyRefusal(true, "HEAD", "/api/pairs/p/triage")).toBeUndefined()
    expect(readOnlyRefusal(undefined, "PUT", "/api/pairs/p/annotations")).toBeUndefined()
    expect(readOnlyRefusal(false, "PUT", "/api/pairs/p/focus")).toBeUndefined()
  })

  it("does not touch static serving — only the API is a write surface", () => {
    expect(readOnlyRefusal(true, "PUT", "/p/findings.json")).toBeUndefined()
  })
})
