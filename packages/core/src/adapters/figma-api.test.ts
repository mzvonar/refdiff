import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chunk, cooldownFromHeaders, FigmaClient, isCoolingDown, parseFigmaRef, readToken } from "./figma-api.js";

describe("parseFigmaRef", () => {
  it("accepts fileKey:nodeId and normalizes dashed ids", () => {
    expect(parseFigmaRef("M0hnCQJIUho3tcW6PcnHWH:5972:3662")).toEqual({
      ok: true,
      value: { fileKey: "M0hnCQJIUho3tcW6PcnHWH", nodeId: "5972:3662" },
    });
    expect(parseFigmaRef("abc/12-34")).toMatchObject({ ok: true, value: { fileKey: "abc", nodeId: "12:34" } });
  });

  it("reads a Figma URL", () => {
    expect(parseFigmaRef("https://www.figma.com/design/M0hnCQJIUho3tcW6PcnHWH/DS?node-id=5972-3662&m=dev")).toEqual({
      ok: true,
      value: { fileKey: "M0hnCQJIUho3tcW6PcnHWH", nodeId: "5972:3662" },
    });
    expect(parseFigmaRef("https://www.figma.com/design/abc/DS").ok).toBe(false);
  });

  it("rejects garbage with a message", () => {
    expect(parseFigmaRef("nope")).toMatchObject({ ok: false });
  });
});

describe("cooldown", () => {
  it("derives the reset time from retry-after with a 60s floor", () => {
    const now = Date.parse("2026-08-26T10:00:00Z");
    const h = new Headers({ "retry-after": "7200", "x-figma-rate-limit-type": "low", date: "Wed, 26 Aug 2026 10:00:00 GMT" });
    expect(cooldownFromHeaders(h, now)).toEqual({ until: "2026-08-26T12:00:00.000Z", limitType: "low" });
    expect(cooldownFromHeaders(new Headers(), now).until).toBe("2026-08-26T10:01:00.000Z");
  });

  it("isCoolingDown compares against now", () => {
    const now = Date.parse("2026-08-26T10:00:00Z");
    expect(isCoolingDown({ until: "2026-08-26T10:30:00Z" }, now)).toBe(true);
    expect(isCoolingDown({ until: "2026-08-26T09:30:00Z" }, now)).toBe(false);
    expect(isCoolingDown(undefined, now)).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into fixed-size batches", () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    expect(chunk([], 5)).toEqual([]);
  });
});

describe("FigmaClient (fake fetch)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-figma-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const fakeFetch =
    (respond: (url: string) => Response): typeof fetch =>
    async (input) =>
      respond(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

  it("readToken prefers $FIGMA_TOKEN, else walks up to a .figma-token file, stripping the prefix", async () => {
    await writeFile(join(dir, ".figma-token"), "FIGMA_TOKEN=figd_file\n");
    const nested = join(dir, "a", "b");
    await import("node:fs/promises").then((fs) => fs.mkdir(nested, { recursive: true }));
    expect(await readToken({ env: {}, cwd: nested })).toBe("figd_file");
    expect(await readToken({ env: { FIGMA_TOKEN: " figd_env " }, cwd: nested })).toBe("figd_env");
    expect(await readToken({ env: {}, cwd: tmpdir() })).toBe("");
  });

  it("maps 401/403 to auth and other statuses to http", async () => {
    const client = new FigmaClient("t", { cooldownFile: join(dir, "cd.json"), env: {}, fetchImpl: fakeFetch(() => new Response("bad token", { status: 403 })) });
    expect(await client.get("/v1/files/x/nodes?ids=1")).toMatchObject({ ok: false, error: { kind: "auth", status: 403 } });
    const c2 = new FigmaClient("t", { cooldownFile: join(dir, "cd.json"), env: {}, fetchImpl: fakeFetch(() => new Response("boom", { status: 500 })) });
    expect(await c2.get("/x")).toMatchObject({ ok: false, error: { kind: "http", status: 500 } });
  });

  it("records a 429 and refuses further requests until it passes; success clears it", async () => {
    const file = join(dir, "cd.json");
    let now = Date.parse("2026-08-26T10:00:00Z");
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls++;
      return calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "3600", "x-figma-rate-limit-type": "low" } })
        : new Response(JSON.stringify({ nodes: {} }), { status: 200 });
    });
    const client = new FigmaClient("t", { cooldownFile: file, env: {}, fetchImpl, now: () => now });

    const first = await client.get("/v1/images/x?ids=1");
    expect(first).toMatchObject({ ok: false, error: { kind: "rate-limited", until: "2026-08-26T11:00:00.000Z", limitType: "low" } });
    expect(JSON.parse(await readFile(file, "utf8"))).toMatchObject({ until: "2026-08-26T11:00:00.000Z" });

    // Zero-cost re-run: no fetch happens while cooling down.
    const second = await client.get("/v1/images/x?ids=1");
    expect(second).toMatchObject({ ok: false, error: { kind: "cooling-down" } });
    expect(calls).toBe(1);

    now += 3601_000;
    const third = await client.get("/v1/files/x/nodes?ids=1");
    expect(third.ok).toBe(true);
    await expect(readFile(file, "utf8")).rejects.toThrow();
  });

  it("FIGMA_IGNORE_COOLDOWN=1 bypasses the record", async () => {
    const file = join(dir, "cd.json");
    await writeFile(file, JSON.stringify({ until: "2999-01-01T00:00:00Z" }));
    const client = new FigmaClient("t", { cooldownFile: file, env: { FIGMA_IGNORE_COOLDOWN: "1" }, fetchImpl: fakeFetch(() => new Response("{}", { status: 200 })) });
    expect((await client.get("/x")).ok).toBe(true);
  });

  it("treats a 403/404 on /variables/local as 'no variables API', not an error", async () => {
    const client = new FigmaClient("t", { cooldownFile: join(dir, "cd.json"), env: {}, fetchImpl: fakeFetch(() => new Response("", { status: 403 })) });
    expect(await client.localVariables("x")).toEqual({ ok: true, value: undefined });
  });

  it("renders in chunks of 5 with use_absolute_bounds and merges the maps", async () => {
    const urls: string[] = [];
    const client = new FigmaClient("t", {
      cooldownFile: join(dir, "cd.json"),
      env: {},
      fetchImpl: fakeFetch((url) => {
        urls.push(url);
        const ids = new URL(url).searchParams.get("ids")!.split(",");
        return new Response(JSON.stringify({ err: null, images: Object.fromEntries(ids.map((id) => [id, `https://cdn/${id}.png`])) }));
      }),
    });
    const ids = ["1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:1"];
    const r = await client.renderImages("key", ids, 2);
    expect(r.ok && Object.keys(r.value)).toHaveLength(6);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("use_absolute_bounds=true");
    expect(urls[0]).toContain("scale=2");
  });

  it("surfaces the images endpoint's err field", async () => {
    const client = new FigmaClient("t", { cooldownFile: join(dir, "cd.json"), env: {}, fetchImpl: fakeFetch(() => new Response(JSON.stringify({ err: "Render timeout" }))) });
    expect(await client.renderImages("key", ["1:1"], 2)).toMatchObject({ ok: false, error: { kind: "http", detail: "images: Render timeout" } });
  });
});
