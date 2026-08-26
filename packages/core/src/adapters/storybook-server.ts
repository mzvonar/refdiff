/**
 * Storybook dev-server lifecycle (effectful edge).
 *
 * The harness normally talks to a Storybook the user already runs. When a
 * project dir is given and nothing answers at the URL, we start one
 * ourselves — in CI mode (`--ci`: no browser tab, no prompts) unless asked to
 * open — and stop it when the run ends. A Storybook the user started is
 * never touched: `ensureStorybook` returns a no-op `stop` for it.
 */

import { spawn, type ChildProcess } from "node:child_process";

import { isReachable } from "./browser.js";
import { err, ok, type Result } from "../result.js";

export interface StorybookServerOptions {
  /** Where Storybook should answer, e.g. http://localhost:6006. */
  url: string;
  /** Project directory to run `storybook dev` in. */
  dir: string;
  /** Let Storybook open its browser tab (default false — the harness does not want one). */
  open?: boolean;
  /** How long to wait for the server to answer. Default 120 s. */
  startTimeoutMs?: number;
  log?: (line: string) => void;
}

export interface StorybookServer {
  url: string;
  /** True when this run started the process (and `stop` will end it). */
  started: boolean;
  stop: () => Promise<void>;
}

export type StorybookServerError = {
  kind: "storybook-start-failed";
  dir: string;
  url: string;
  detail: string;
};

const noop = async (): Promise<void> => {};

function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.pid === undefined) return resolve();
    child.once("exit", () => resolve());
    try {
      // Detached child = its own process group; negative pid signals the group
      // (pnpm → node → vite), not just the pnpm shim.
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
    setTimeout(() => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
      resolve();
    }, 5_000).unref();
  });
}

/**
 * Reuse a running Storybook at `url`, or start one in `dir` and wait until
 * it answers. Errors are data — a Storybook that never comes up is a typed
 * `storybook-start-failed`, not a thrown exception.
 */
export async function ensureStorybook({
  url,
  dir,
  open = false,
  startTimeoutMs = 120_000,
  log = () => {},
}: StorybookServerOptions): Promise<Result<StorybookServer, StorybookServerError>> {
  if (await isReachable(url)) return ok({ url, started: false, stop: noop });

  const port = new URL(url).port || "6006";
  const args = ["exec", "storybook", "dev", "-p", port, ...(open ? [] : ["--ci"])];
  log(`starting storybook in ${dir}: pnpm ${args.join(" ")}`);
  const child = spawn("pnpm", args, {
    cwd: dir,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...(open ? {} : { BROWSER: "none", CI: process.env["CI"] ?? "1" }) },
  });
  let output = "";
  const collect = (chunk: Buffer): void => {
    output = (output + chunk.toString()).slice(-4_000);
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  const deadline = Date.now() + startTimeoutMs;
  while (Date.now() < deadline) {
    if (exited) {
      return err({
        kind: "storybook-start-failed",
        dir,
        url,
        detail: `storybook exited with code ${child.exitCode}: ${output.trim().slice(-600)}`,
      });
    }
    if (await isReachable(url)) {
      log(`storybook answering at ${url}`);
      return ok({ url, started: true, stop: () => killTree(child) });
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  await killTree(child);
  return err({
    kind: "storybook-start-failed",
    dir,
    url,
    detail: `storybook did not answer at ${url} within ${startTimeoutMs}ms: ${output.trim().slice(-600)}`,
  });
}
