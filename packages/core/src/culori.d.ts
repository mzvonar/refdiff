/**
 * Minimal ambient types for culori v4 (ships without TypeScript
 * declarations). Only what the structural channel uses.
 */
declare module "culori" {
  export interface Color {
    mode: string;
    alpha?: number;
    [channel: string]: string | number | undefined;
  }

  /** Parses any CSS color string; undefined when unparseable. */
  export function parse(color: string): Color | undefined;

  /** Returns a CIEDE2000 color-difference function (accepts strings too). */
  export function differenceCiede2000(
    kL?: number,
    kC?: number,
    kH?: number,
  ): (a: Color | string, b: Color | string) => number;

  export function formatHex(color: Color | string): string | undefined;
}
