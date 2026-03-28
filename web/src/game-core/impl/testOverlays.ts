import { expect } from "vitest";

type OverlayLike = {
  z: number;
  pos: number;
  kind: string;
  ttl?: number;
  tileId?: number;
};

function overlayMatches(
  overlay: OverlayLike,
  expected: Pick<OverlayLike, "z" | "pos" | "kind"> & Partial<OverlayLike>,
): boolean {
  return Object.entries(expected).every(([key, value]) => overlay[key as keyof OverlayLike] === value);
}

export function expectOverlayPresent(
  overlays: ReadonlyArray<OverlayLike> | null | undefined,
  expected: Pick<OverlayLike, "z" | "pos" | "kind"> & Partial<OverlayLike>,
): void {
  expect((overlays ?? []).some((overlay) => overlayMatches(overlay, expected))).toBe(true);
}

export function expectOverlayAbsent(
  overlays: ReadonlyArray<OverlayLike> | null | undefined,
  expected: Pick<OverlayLike, "z" | "pos" | "kind"> & Partial<OverlayLike>,
): void {
  expect((overlays ?? []).some((overlay) => overlayMatches(overlay, expected))).toBe(false);
}
