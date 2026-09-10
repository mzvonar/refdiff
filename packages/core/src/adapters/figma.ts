/**
 * Figma design-side capture adapter (effectful edge).
 *
 * Reads the node subtree + local variables, renders the node as PNG at the
 * requested scale, verifies the PNG matches the node's bounding box, maps
 * the tree to leaf elements and applies the GIGO quality gate. Everything
 * downstream of `Capture` is identical to the `.dc.html` path.
 *
 * Degraded input is a typed CaptureError: missing/invalid token, rate
 * limit (recorded cooldown), unknown node, empty render, low quality.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import sharp from "sharp";

import type { Capture, CaptureError, FigmaSource } from "../pipeline.js";
import { bleedOutset } from "../geometry.js";
import { err, ok, type Result } from "../result.js";
import {
  FigmaClient,
  readToken,
  type FigmaApiError,
  type FigmaClientOptions,
  type FigmaNode,
  type FigmaVariablesResponse,
} from "./figma-api.js";
import { figmaRenderBleed, figmaTreeToElements, indexVariables } from "./figma-tree.js";
import {
  defaultFigmaCacheRoot,
  imageCachePath,
  isCacheable,
  readCache,
  variablesCachePath,
  writeCache,
} from "./figma-cache.js";

export const FIGMA_DEFAULTS = { scale: 2, minQuality: 0.3 } as const;

export interface FigmaCaptureOptions {
  pngPath: string;
  ref?: string;
  /** Client plumbing (token lookup, cooldown file, fetch) — tests inject here. */
  client?: FigmaClientOptions;
  /** Skip the GIGO gate entirely (score still recorded). */
  skipQualityGate?: boolean;
  /**
   * Inputs already fetched for this node (a set expansion reads the whole
   * set once and renders all variants in one batch). `variables: null`
   * means "looked, the file has none". Missing fields are fetched.
   */
  prefetched?: {
    document?: FigmaNode;
    version?: string;
    variables?: FigmaVariablesResponse | null;
    imageUrl?: string;
  };
  /**
   * Version-keyed on-disk cache for the rendered PNG and the variables map.
   * `false` disables it. Never caches the node subtree — that call carries the
   * version every key is built from. See `figma-cache.ts`.
   */
  cache?: { root?: string } | false;
}

function apiError(ref: string, e: FigmaApiError): CaptureError {
  switch (e.kind) {
    case "no-token":
    case "auth":
      return { kind: "figma-auth", ref, detail: e.detail };
    case "rate-limited":
    case "cooling-down":
      return { kind: "figma-rate-limited", ref, until: e.until, detail: e.detail };
    default:
      return { kind: "figma-api", ref, detail: e.detail };
  }
}

export async function captureFigma(
  source: FigmaSource,
  {
    pngPath,
    ref,
    client: clientOptions = {},
    skipQualityGate = false,
    prefetched = {},
    cache = {},
  }: FigmaCaptureOptions,
): Promise<Result<Capture, CaptureError>> {
  const cacheRoot = cache === false ? undefined : (cache.root ?? defaultFigmaCacheRoot());
  const scale = source.scale ?? FIGMA_DEFAULTS.scale;
  const minQuality = source.minQuality ?? FIGMA_DEFAULTS.minQuality;
  let identity = ref ?? `${source.fileKey}#${source.nodeId}${source.version ? `@${source.version}` : ""}`;

  const token = await readToken(clientOptions);
  if (!token) {
    return err({ kind: "figma-auth", ref: identity, detail: "no Figma token: set $FIGMA_TOKEN or create .figma-token" });
  }
  const client = new FigmaClient(token, clientOptions);

  try {
    // 1. Subtree (also validates the token) — unless the caller already has it.
    let document = prefetched.document;
    let version = source.version ?? prefetched.version;
    if (document === undefined) {
      const nodes = await client.nodes(source.fileKey, [source.nodeId], source.version);
      if (!nodes.ok) return err(apiError(identity, nodes.error));
      const entry = nodes.value.nodes[source.nodeId];
      if (!entry?.document) {
        return err({ kind: "figma-node-not-found", ref: identity, fileKey: source.fileKey, nodeId: source.nodeId });
      }
      document = entry.document;
      version = source.version ?? nodes.value.version;
    }
    if (ref === undefined && version) identity = `${source.fileKey}#${source.nodeId}@${version}`;

    // 2. Variables — optional (Enterprise); absence is not an error.
    let variableIndex = indexVariables(undefined);
    if (prefetched.variables === undefined) {
      // Cacheable only alongside a version: without one there is no way to know
      // the map still describes this file, and a variables map that has drifted
      // silently re-colours every token in the report.
      const varPath =
        cacheRoot && isCacheable(version) ? variablesCachePath(cacheRoot, source.fileKey, version) : undefined;
      const hit = varPath ? await readCache(varPath) : undefined;
      if (hit) {
        try {
          // `null` means "looked, the file has none" — a cached answer, not a miss.
          const parsed = JSON.parse(hit.toString("utf8")) as FigmaVariablesResponse | null;
          variableIndex = indexVariables(parsed ?? undefined);
        } catch {
          // A truncated cache file is a miss, never a crash.
          const variables = await client.localVariables(source.fileKey);
          if (!variables.ok) return err(apiError(identity, variables.error));
          variableIndex = indexVariables(variables.value);
        }
      } else {
        const variables = await client.localVariables(source.fileKey);
        if (!variables.ok) return err(apiError(identity, variables.error));
        variableIndex = indexVariables(variables.value);
        if (varPath) await writeCache(varPath, JSON.stringify(variables.value ?? null));
      }
    } else if (prefetched.variables !== null) {
      variableIndex = indexVariables(prefetched.variables);
    }

    // 3. Map + gate BEFORE spending an /images request on a hopeless frame.
    const mapping = figmaTreeToElements(document, variableIndex);
    if (mapping.elements.length === 0 || mapping.width < 1 || mapping.height < 1) {
      return err({
        kind: "blank-render",
        ref: identity,
        detail: `node ${source.nodeId} ("${document.name}") has no visible leaf elements (${mapping.width}x${mapping.height})`,
      });
    }
    if (!skipQualityGate && mapping.quality.score < minQuality) {
      const q = mapping.quality;
      return err({
        kind: "figma-low-quality",
        ref: identity,
        quality: q,
        minQuality,
        detail: `design quality ${q.score} < ${minQuality}: ${q.bound}/${q.leaves} leaves bound to variables/styles, ${q.detached}/${q.instances} instances detached — garbage in, garbage out; lower --min-design-quality to compare anyway`,
      });
    }

    // 4. Render + download + verify (a batch render may have supplied the URL).
    //
    // `bleed` here is a SWITCH, not a distance: Figma renders either the node's
    // box or everything it paints, with nothing in between, so the margin is
    // whatever the node has (`figmaRenderBleed`) and the requested px only says
    // whether to go looking for it. A pair that asks for 8 and meets a 4px ring
    // gets 4 — recorded truthfully, because `bleed` describes the PICTURE and a
    // wrong one makes every crop through `toDesignNative` read the wrong bytes.
    const bleed = source.bleed !== undefined && source.bleed > 0 ? figmaRenderBleed(document) : undefined;
    // The cache key carries `absoluteBounds`, because the same node renders to
    // two different pictures under the two settings and a set can ask for both.
    const imgPath =
      cacheRoot && isCacheable(version)
        ? imageCachePath(cacheRoot, {
            fileKey: source.fileKey,
            version,
            nodeId: source.nodeId,
            scale,
            absoluteBounds: !bleed,
          })
        : undefined;
    let bytes = imgPath ? await readCache(imgPath) : undefined;
    if (!bytes) {
      let url = prefetched.imageUrl;
      if (url === undefined) {
        const images = await client.renderImages(source.fileKey, [source.nodeId], scale, {
          ...(source.version ? { version: source.version } : {}),
          ...(bleed ? { absoluteBounds: false } : {}),
        });
        if (!images.ok) return err(apiError(identity, images.error));
        url = images.value[source.nodeId] ?? undefined;
      }
      if (!url) {
        return err({ kind: "figma-render-failed", ref: identity, detail: `images endpoint returned no URL for ${source.nodeId}` });
      }
      const downloaded = await client.download(url);
      if (!downloaded.ok) return err(apiError(identity, downloaded.error));
      bytes = downloaded.value;
      if (imgPath) await writeCache(imgPath, bytes);
    }
    const png = { ok: true as const, value: bytes };

    const meta = await sharp(png.value).metadata();
    // The PNG covers the mapping box PLUS the bleed — the render bounds when
    // one was asked for, the bounding box otherwise. Checking against the wrong
    // one turns a correct bleed capture into `figma-render-failed`.
    const outset = bleedOutset({ width: mapping.width, height: mapping.height }, bleed);
    const expectW = Math.round(outset.width * scale);
    const expectH = Math.round(outset.height * scale);
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w === 0 || h === 0 || Math.abs(w - expectW) > scale || Math.abs(h - expectH) > scale) {
      return err({
        kind: "figma-render-failed",
        ref: identity,
        detail: `rendered PNG is ${w}x${h}, node bounds say ${expectW}x${expectH} at scale ${scale}`,
      });
    }

    await mkdir(dirname(pngPath), { recursive: true });
    await writeFile(pngPath, png.value);

    return ok({
      side: "design",
      source: "figma",
      ref: identity,
      pngPath,
      width: mapping.width,
      height: mapping.height,
      dpr: scale,
      elements: mapping.elements,
      scope: { mode: "explicit", selector: `figma:${source.nodeId}` },
      ...(bleed ? { bleed } : {}),
      quality: mapping.quality,
    });
  } catch (e) {
    return err({ kind: "capture-failed", ref: identity, detail: e instanceof Error ? e.message : String(e) });
  }
}
