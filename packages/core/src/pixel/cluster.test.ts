import { describe, expect, it } from "vitest";

import { clusterMask, unionBox, type DiffMask } from "./cluster.js";

/** Build a mask from ASCII rows: '#' = differing pixel. */
const mask = (rows: string[]): DiffMask => {
  const width = rows[0]!.length;
  const height = rows.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) data[y * width + x] = row[x] === "#" ? 1 : 0;
  });
  return { width, height, data };
};

describe("clusterMask", () => {
  it("returns nothing for an empty mask", () => {
    expect(clusterMask(mask(["....", "....", "...."]))).toEqual([]);
  });

  it("finds separate components with tight boxes and pixel counts", () => {
    const m = mask([
      "##......", //
      "##......",
      "........",
      ".....###",
      ".....#.#",
    ]);
    expect(clusterMask(m)).toEqual([
      { box: { x: 0, y: 0, w: 2, h: 2 }, pixels: 4 },
      { box: { x: 5, y: 3, w: 3, h: 2 }, pixels: 5 },
    ]);
  });

  it("uses 8-connectivity: diagonal neighbours join", () => {
    const m = mask([
      "#...", //
      ".#..",
      "..#.",
    ]);
    expect(clusterMask(m)).toHaveLength(1);
    expect(clusterMask(m)[0]!.box).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  });

  it("bridges gaps up to `gap` pixels", () => {
    const m = mask(["#.#.#"]);
    expect(clusterMask(m)).toHaveLength(3);
    expect(clusterMask(m, { gap: 2 })).toHaveLength(1);
  });

  it("drops clusters below minSize", () => {
    const m = mask([
      "#....", //
      ".....",
      "..###",
      "..###",
    ]);
    expect(clusterMask(m, { minSize: 2 })).toEqual([{ box: { x: 2, y: 2, w: 3, h: 2 }, pixels: 6 }]);
  });

  it("orders clusters top-to-bottom, left-to-right", () => {
    const m = mask([
      "....#", //
      ".....",
      "#....",
    ]);
    expect(clusterMask(m).map((c) => c.box.x)).toEqual([4, 0]);
  });

  it("handles a large mask iteratively (no stack overflow)", () => {
    const size = 600;
    const m: DiffMask = { width: size, height: size, data: new Uint8Array(size * size).fill(1) };
    const [only] = clusterMask(m);
    expect(only).toEqual({ box: { x: 0, y: 0, w: size, h: size }, pixels: size * size });
  });
});

describe("unionBox", () => {
  it("is null for no clusters and the bounding box otherwise", () => {
    expect(unionBox([])).toBeNull();
    expect(
      unionBox([
        { box: { x: 1, y: 1, w: 2, h: 2 }, pixels: 4 },
        { box: { x: 5, y: 4, w: 1, h: 3 }, pixels: 3 },
      ]),
    ).toEqual({ x: 1, y: 1, w: 5, h: 6 });
  });
});
