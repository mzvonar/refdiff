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
import { err, ok, type Result } from "../result.js";
import { FigmaClient, readToken, type FigmaApiError, type FigmaClientOptions } from "./figma-api.js";
import { figmaTreeToElements, indexVariables } from "./figma-tree.js";

export const FIGMA_DEFAULTS = { scale: 2, minQuality: 0.3 } as const;

export interface FigmaCaptureOptions {
  pngPath: string;
  ref?: string;
  /** Client plumbing (token lookup, cooldown file, fetch) — tests inject here. */
  client?: FigmaClientOptions;
  /** Skip the GIGO gate entirely (score still recorded). */
  skipQualityGate?: boolean;
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
  { pngPath, ref, client: clientOptions = {}, skipQualityGate = false }: FigmaCaptureOptions,
): Promise<Result<Capture, CaptureError>> {
  const scale = source.scale ?? FIGMA_DEFAULTS.scale;
  const minQuality = source.minQuality ?? FIGMA_DEFAULTS.minQuality;
  let identity = ref ?? `${source.fileKey}#${source.nodeId}${source.version ? `@${source.version}` : ""}`;

  const token = await readToken(clientOptions);
  if (!token) {
    return err({ kind: "figma-auth", ref: identity, detail: "no Figma token: set $FIGMA_TOKEN or create .figma-token" });
  }
  const client = new FigmaClient(token, clientOptions);

  try {
    // 1. Subtree (also validates the token).
    const nodes = await client.nodes(source.fileKey, [source.nodeId], source.version);
    if (!nodes.ok) return err(apiError(identity, nodes.error));
    const entry = nodes.value.nodes[source.nodeId];
    if (!entry?.document) {
      return err({ kind: "figma-node-not-found", ref: identity, fileKey: source.fileKey, nodeId: source.nodeId });
    }
    const version = source.version ?? nodes.value.version;
    if (ref === undefined && version) identity = `${source.fileKey}#${source.nodeId}@${version}`;

    // 2. Variables — optional (Enterprise); absence is not an error.
    const variables = await client.localVariables(source.fileKey);
    if (!variables.ok) return err(apiError(identity, variables.error));

    // 3. Map + gate BEFORE spending an /images request on a hopeless frame.
    const mapping = figmaTreeToElements(entry.document, indexVariables(variables.value));
    if (mapping.elements.length === 0 || mapping.width < 1 || mapping.height < 1) {
      return err({
        kind: "blank-render",
        ref: identity,
        detail: `node ${source.nodeId} ("${entry.document.name}") has no visible leaf elements (${mapping.width}x${mapping.height})`,
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

    // 4. Render + download + verify.
    const images = await client.renderImages(source.fileKey, [source.nodeId], scale, {
      ...(source.version ? { version: source.version } : {}),
    });
    if (!images.ok) return err(apiError(identity, images.error));
    const url = images.value[source.nodeId];
    if (!url) {
      return err({ kind: "figma-render-failed", ref: identity, detail: `images endpoint returned no URL for ${source.nodeId}` });
    }
    const png = await client.download(url);
    if (!png.ok) return err(apiError(identity, png.error));

    const meta = await sharp(png.value).metadata();
    const expectW = Math.round(mapping.width * scale);
    const expectH = Math.round(mapping.height * scale);
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
      quality: mapping.quality,
    });
  } catch (e) {
    return err({ kind: "capture-failed", ref: identity, detail: e instanceof Error ? e.message : String(e) });
  }
}
