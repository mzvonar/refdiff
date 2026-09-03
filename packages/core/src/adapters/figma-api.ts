/**
 * Figma REST edge (effectful): token, rate-limit cooldown, node subtree,
 * local variables, PNG renders. Ported from population-registry's
 * `figma-api.mjs`, with `process.exit` / console output replaced by typed
 * `Result`s so the adapter decides what a failure means.
 *
 * Figma's rate limit is seat-scoped and lasts DAYS; the costly mistake is
 * re-running while locked out — every "did it clear yet?" run burns another
 * request. Hence the cooldown record: a 429 stores the reset time in a
 * machine-local file (timing only, never the token) and later runs return
 * `rate-limited` before making any request until it has passed
 * (`FIGMA_IGNORE_COOLDOWN=1` overrides). Success clears the record.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, parse as parsePath, resolve } from "node:path";

import { err, ok, type Result } from "../result.js";

export type FigmaApiError =
  | { kind: "no-token"; detail: string }
  | { kind: "auth"; status: number; detail: string }
  | { kind: "rate-limited"; until: string; limitType?: string; detail: string }
  | { kind: "cooling-down"; until: string; limitType?: string; detail: string }
  | { kind: "http"; status: number; detail: string }
  | { kind: "network"; detail: string }
  | { kind: "malformed"; detail: string };

export interface CooldownRecord {
  /** ISO time after which requests may resume. */
  until: string;
  limitType?: string;
  planTier?: string;
}

const TOKEN_PREFIX_RE = /^FIGMA_TOKEN=/;
export const API = "https://api.figma.com";

/* ------------------------------------------------------------- pure -- */

/** Parse `<fileKey>:<nodeId>`, `<fileKey>/<nodeId>` or a Figma URL with `node-id=`. */
export function parseFigmaRef(raw: string): Result<{ fileKey: string; nodeId: string }, string> {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      const m = /\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/.exec(url.pathname);
      const nodeParam = url.searchParams.get("node-id");
      if (!m?.[1] || !nodeParam) return err(`Figma URL needs /design/<fileKey> and ?node-id=… : "${raw}"`);
      return ok({ fileKey: m[1], nodeId: normalizeNodeId(nodeParam) });
    } catch {
      return err(`not a valid URL: "${raw}"`);
    }
  }
  const m = /^([A-Za-z0-9]+)[:/](\d+[-:]\d+)$/.exec(s);
  if (!m?.[1] || !m[2]) return err(`expected <fileKey>:<nodeId> (e.g. M0hnCQJ…:5972:3662) or a Figma URL, got "${raw}"`);
  return ok({ fileKey: m[1], nodeId: normalizeNodeId(m[2]) });
}

/** URLs spell node ids "123-456"; the API wants "123:456". */
export const normalizeNodeId = (id: string): string => id.replace("-", ":");

/** Cooldown record from a 429 response's headers; floor 60s so a missing retry-after still blocks a tight loop. */
export function cooldownFromHeaders(headers: Headers, now: number): CooldownRecord {
  const retryAfter = Number(headers.get("retry-after") ?? "0");
  const serverNow = Date.parse(headers.get("date") ?? "");
  const base = Number.isNaN(serverNow) ? now : serverNow;
  const until = new Date(base + Math.max(Number.isFinite(retryAfter) ? retryAfter : 0, 60) * 1000).toISOString();
  const limitType = headers.get("x-figma-rate-limit-type");
  const planTier = headers.get("x-figma-plan-tier");
  return {
    until,
    ...(limitType ? { limitType } : {}),
    ...(planTier ? { planTier } : {}),
  };
}

/** True while a recorded reset time lies in the future. */
export function isCoolingDown(rec: CooldownRecord | undefined, now: number): boolean {
  if (!rec) return false;
  const until = Date.parse(rec.until);
  return !Number.isNaN(until) && now < until;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------------------------------------------------------- effects -- */

export interface FigmaClientOptions {
  /** Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Where `.figma-token` is looked for (this dir and its parents). Default cwd. */
  cwd?: string;
  /** Cooldown record location. Default ~/.cache/refdiff/figma-cooldown.json. */
  cooldownFile?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** `$FIGMA_TOKEN`, else the first `.figma-token` file from `cwd` upwards. Never logged. */
export async function readToken({ env = process.env, cwd = process.cwd() }: FigmaClientOptions = {}): Promise<string> {
  const fromEnv = (env["FIGMA_TOKEN"] ?? "").trim();
  if (fromEnv) return fromEnv.replace(TOKEN_PREFIX_RE, "").trim();
  let dir = resolve(cwd);
  for (;;) {
    try {
      const raw = await readFile(join(dir, ".figma-token"), "utf8");
      return raw.trim().replace(TOKEN_PREFIX_RE, "").trim();
    } catch {
      const parent = dirname(dir);
      if (parent === dir || dir === parsePath(dir).root) return "";
      dir = parent;
    }
  }
}

const defaultCooldownFile = (): string => join(homedir(), ".cache", "refdiff", "figma-cooldown.json");

async function readCooldown(file: string): Promise<CooldownRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as CooldownRecord).until === "string") {
      return parsed as CooldownRecord;
    }
  } catch {
    // none recorded
  }
  return undefined;
}

async function writeCooldown(file: string, rec: CooldownRecord): Promise<void> {
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(rec, null, 2)}\n`);
  } catch {
    // best-effort, machine-local
  }
}

async function clearCooldown(file: string): Promise<void> {
  await rm(file, { force: true }).catch(() => undefined);
}

/**
 * A Figma REST client bound to one token. Every call returns a typed Result;
 * a 429 is recorded and NEVER retried (a retry only burns budget).
 */
export class FigmaClient {
  private readonly token: string;
  private readonly cooldownFile: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly ignoreCooldown: boolean;

  constructor(token: string, o: FigmaClientOptions = {}) {
    this.token = token;
    this.cooldownFile = o.cooldownFile ?? defaultCooldownFile();
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.now = o.now ?? Date.now;
    this.ignoreCooldown = (o.env ?? process.env)["FIGMA_IGNORE_COOLDOWN"] === "1";
  }

  /** Raw fetch + JSON parse. Checks the cooldown record first (zero-cost re-runs while locked out). */
  async get(path: string): Promise<Result<unknown, FigmaApiError>> {
    if (!this.token) return err({ kind: "no-token", detail: "set $FIGMA_TOKEN or put a token in .figma-token" });
    if (!this.ignoreCooldown) {
      const rec = await readCooldown(this.cooldownFile);
      if (isCoolingDown(rec, this.now())) {
        const mins = Math.ceil((Date.parse(rec!.until) - this.now()) / 60_000);
        return err({
          kind: "cooling-down",
          until: rec!.until,
          ...(rec!.limitType ? { limitType: rec!.limitType } : {}),
          detail: `a previous 429 recorded a reset at ${rec!.until} (~${mins} min); skipping the request so this run does not burn budget (FIGMA_IGNORE_COOLDOWN=1 to force)`,
        });
      }
    }

    let res: Response;
    let body: string;
    try {
      res = await this.fetchImpl(`${API}${path}`, { headers: { "X-Figma-Token": this.token } });
      body = await res.text();
    } catch (e) {
      return err({ kind: "network", detail: e instanceof Error ? e.message : String(e) });
    }

    if (res.status === 429) {
      const rec = cooldownFromHeaders(res.headers, this.now());
      await writeCooldown(this.cooldownFile, rec);
      return err({
        kind: "rate-limited",
        until: rec.until,
        ...(rec.limitType ? { limitType: rec.limitType } : {}),
        detail: `429 on ${path}; limit-type ${rec.limitType ?? "?"} (low = Viewer/Collab seat, high = Full/Dev seat); unblocks at ${rec.until} — recorded, not retried`,
      });
    }
    if (res.status === 401 || res.status === 403) {
      return err({ kind: "auth", status: res.status, detail: `HTTP ${res.status} on ${path}: ${body.slice(0, 200)}` });
    }
    if (!res.ok) return err({ kind: "http", status: res.status, detail: `HTTP ${res.status} on ${path}: ${body.slice(0, 200)}` });

    await clearCooldown(this.cooldownFile);
    try {
      return ok(JSON.parse(body));
    } catch {
      return err({ kind: "malformed", detail: `non-JSON body on ${path}: ${body.slice(0, 120)}` });
    }
  }

  /** `GET /v1/files/:key/nodes?ids=…&geometry=paths` — the subtrees of the given nodes. */
  async nodes(
    fileKey: string,
    ids: readonly string[],
    version?: string,
  ): Promise<Result<FigmaNodesResponse, FigmaApiError>> {
    const q = new URLSearchParams({ ids: ids.join(","), geometry: "paths" });
    if (version) q.set("version", version);
    const r = await this.get(`/v1/files/${encodeURIComponent(fileKey)}/nodes?${q}`);
    if (!r.ok) return r;
    const v = r.value as Partial<FigmaNodesResponse>;
    if (typeof v !== "object" || v === null || typeof v.nodes !== "object")
      return err({ kind: "malformed", detail: "nodes response has no `nodes`" });
    return ok(v as FigmaNodesResponse);
  }

  /**
   * `GET /v1/files/:key/variables/local` — Enterprise only. A 403/404 here on
   * a token that just read the file means "plan has no variables API" →
   * `Ok(undefined)`, not an error.
   */
  async localVariables(fileKey: string): Promise<Result<FigmaVariablesResponse | undefined, FigmaApiError>> {
    const r = await this.get(`/v1/files/${encodeURIComponent(fileKey)}/variables/local`);
    if (!r.ok) {
      if ((r.error.kind === "auth" && r.error.status === 403) || (r.error.kind === "http" && r.error.status === 404)) {
        return ok(undefined);
      }
      return r;
    }
    const v = r.value as { meta?: FigmaVariablesResponse["meta"] };
    return ok(v.meta ? { meta: v.meta } : undefined);
  }

  /**
   * Render node ids → { [id]: cdnUrl | null }, one `/v1/images` call per
   * chunk (Figma times out on big batches: "request fewer or smaller
   * images"). `use_absolute_bounds` so the PNG covers `absoluteBoundingBox`
   * exactly, which is the coordinate frame the element tree uses.
   */
  async renderImages(
    fileKey: string,
    ids: readonly string[],
    scale: number,
    { chunkSize = 5, version }: { chunkSize?: number; version?: string } = {},
  ): Promise<Result<Record<string, string | null>, FigmaApiError>> {
    const images: Record<string, string | null> = {};
    for (const part of chunk([...new Set(ids)], chunkSize)) {
      const q = new URLSearchParams({
        ids: part.join(","),
        format: "png",
        scale: String(scale),
        use_absolute_bounds: "true",
      });
      if (version) q.set("version", version);
      const r = await this.get(`/v1/images/${encodeURIComponent(fileKey)}?${q}`);
      if (!r.ok) return r;
      const v = r.value as { err?: string | null; images?: Record<string, string | null> };
      if (v.err) return err({ kind: "http", status: 400, detail: `images: ${v.err}` });
      Object.assign(images, v.images ?? {});
    }
    return ok(images);
  }

  /** Download a rendered PNG from Figma's CDN (no token needed). */
  async download(url: string): Promise<Result<Buffer, FigmaApiError>> {
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) return err({ kind: "http", status: res.status, detail: `image download HTTP ${res.status}` });
      return ok(Buffer.from(await res.arrayBuffer()));
    } catch (e) {
      return err({ kind: "network", detail: e instanceof Error ? e.message : String(e) });
    }
  }
}

/* ------------------------------------------------ response shapes -- */

/** The subset of the Figma node schema the mapping reads. */
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string;
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  boundVariables?: { color?: { id: string } };
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string | null;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  lineHeightUnit?: string;
  textCase?: string;
  /** TEXT: WIDTH_AND_HEIGHT (hug), HEIGHT (fixed width), NONE (fixed box), TRUNCATE. */
  textAutoResize?: string;
  textAlignHorizontal?: string;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  opacity?: number;
  children?: FigmaNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  /** Glyph-ink bounds (TEXT) / painted bounds; null when nothing renders. */
  absoluteRenderBounds?: { x: number; y: number; width: number; height: number } | null;
  /** Auto-layout child sizing: FIXED | HUG | FILL. */
  layoutSizingHorizontal?: string;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  strokeAlign?: string;
  /**
   * Dash/gap lengths of a dashed stroke; absent or empty for a solid one. The
   * REST name (the Plugin API calls the same thing `dashPattern`) — verified
   * against the recorded `nodes-alert-set` / `nodes-button-fill-set` fixtures,
   * which carry `"strokeDashes":[10.0,5.0]`.
   */
  strokeDashes?: number[];
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  characters?: string;
  style?: FigmaTypeStyle;
  componentId?: string;
  /** Shared style ids: { fill, stroke, text, effect, … }. */
  styles?: Record<string, string>;
  boundVariables?: Record<string, unknown>;
  clipsContent?: boolean;
  /** COMPONENT_SET only: property definitions; VARIANT ones carry `variantOptions`. */
  componentPropertyDefinitions?: Record<
    string,
    { type: string; defaultValue?: unknown; variantOptions?: string[] }
  >;
}

export interface FigmaNodesResponse {
  name?: string;
  lastModified?: string;
  version?: string;
  nodes: Record<string, { document: FigmaNode; components?: Record<string, unknown> } | null>;
}

export interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, { id: string; name: string; resolvedType?: string }>;
    variableCollections?: Record<string, { id: string; name: string }>;
  };
}
