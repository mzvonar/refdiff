import { tmpdir } from "node:os"
import { join } from "node:path"

import { defineConfig } from "vitest/config"

/**
 * Defaults everywhere except one thing: the Figma cache root.
 *
 * `captureFigma` caches by DEFAULT, so an adapter test that injects a fake
 * fetch and forgets `cache: false` writes its fixtures into the developer's
 * real `~/.cache/refdiff/figma` — and the next test reads them back. That is
 * not hypothetical: it turned this suite green -> 5 failures that read as a
 * broken feature, and it had already written three files into a real home
 * directory before anyone looked (2026-09-10).
 *
 * Individual tests still pass `cache: false`, which is the honest declaration
 * that a unit test does no IO. This is the floor under that: forgetting it can
 * cost a confusing hour, never the developer's cache.
 */
export default defineConfig({
  test: {
    env: {
      REFDIFF_FIGMA_CACHE_DIR: join(tmpdir(), "refdiff-vitest-figma-cache"),
    },
  },
})
