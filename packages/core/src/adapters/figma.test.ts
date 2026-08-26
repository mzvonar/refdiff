/**
 * Adapter-level test through a fake fetch: the full nodes → variables →
 * gate → render → verify → Capture path, plus the typed errors the CLI's
 * "done when" clause names (bad token → figma-auth, etc.).
 */
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureFigma } from "./figma.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../test/fixtures/figma");
const nodesJson = readFileSync(join(fixtures, "nodes-button.json"), "utf8");
const variablesJson = readFileSync(join(fixtures, "variables.json"), "utf8");

const source = { kind: "figma" as const, fileKey: "KEY", nodeId: "1:2" };

async function png(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe("captureFigma", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vc-figma-cap-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const client = (fetchImpl: typeof fetch, token = "figd_ok") => ({
    env: { FIGMA_TOKEN: token },
    cooldownFile: join(dir, "cd.json"),
    fetchImpl,
  });

  const happyFetch =
    (pngBuf: Buffer, opts: { variables?: number } = {}): typeof fetch =>
    async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/nodes?")) return new Response(nodesJson);
      if (url.includes("/variables/local")) return new Response(opts.variables === 403 ? "" : variablesJson, { status: opts.variables ?? 200 });
      if (url.includes("/v1/images/")) return new Response(JSON.stringify({ err: null, images: { "1:2": "https://cdn/1-2.png" } }));
      if (url.startsWith("https://cdn/")) return new Response(new Uint8Array(pngBuf));
      return new Response("nope", { status: 404 });
    };

  it("produces a design Capture with dpr = scale, quality echoed and version in the ref", async () => {
    const r = await captureFigma(
      { ...source, scale: 2, minQuality: 0.1 },
      { pngPath: join(dir, "design.png"), client: client(happyFetch(await png(480, 160))) },
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      side: "design",
      source: "figma",
      ref: "KEY#1:2@1234567890",
      width: 240,
      height: 80,
      dpr: 2,
      quality: { score: 0.21, leaves: 4 },
    });
    expect(r.value.elements).toHaveLength(4);
    expect((await sharp(r.value.pngPath).metadata()).width).toBe(480);
  });

  it("fails the GIGO gate below --min-design-quality with the score in the error", async () => {
    const r = await captureFigma(source, { pngPath: join(dir, "d.png"), client: client(happyFetch(await png(480, 160))) });
    expect(r).toMatchObject({ ok: false, error: { kind: "figma-low-quality", minQuality: 0.3, quality: { score: 0.21 } } });
  });

  it("an empty or wrong token is figma-auth", async () => {
    const none = await captureFigma(source, { pngPath: join(dir, "d.png"), client: { env: {}, cwd: dir, cooldownFile: join(dir, "cd.json") } });
    expect(none).toMatchObject({ ok: false, error: { kind: "figma-auth" } });
    const bad = await captureFigma(source, {
      pngPath: join(dir, "d.png"),
      client: client(async () => new Response("Invalid token", { status: 403 }), "x"),
    });
    expect(bad).toMatchObject({ ok: false, error: { kind: "figma-auth" } });
  });

  it("an unknown node is figma-node-not-found", async () => {
    const r = await captureFigma({ ...source, nodeId: "1:999" }, { pngPath: join(dir, "d.png"), client: client(happyFetch(await png(1, 1))) });
    expect(r).toMatchObject({ ok: false, error: { kind: "figma-node-not-found", nodeId: "1:999" } });
  });

  it("a PNG that does not match the node bounds is figma-render-failed", async () => {
    const r = await captureFigma({ ...source, minQuality: 0 }, { pngPath: join(dir, "d.png"), client: client(happyFetch(await png(300, 300))) });
    expect(r).toMatchObject({ ok: false, error: { kind: "figma-render-failed" } });
  });

  it("a 429 is figma-rate-limited with the reset time", async () => {
    const r = await captureFigma(source, {
      pngPath: join(dir, "d.png"),
      client: client(async () => new Response("", { status: 429, headers: { "retry-after": "600" } })),
    });
    expect(r).toMatchObject({ ok: false, error: { kind: "figma-rate-limited" } });
  });

  it("works without the variables API (non-Enterprise plan)", async () => {
    const r = await captureFigma({ ...source, minQuality: 0 }, { pngPath: join(dir, "d.png"), client: client(happyFetch(await png(480, 160), { variables: 403 })) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.elements.find((e) => e.text === "Save changes")!.token?.["color"]).toBe("VariableID:1:101");
  });
});
