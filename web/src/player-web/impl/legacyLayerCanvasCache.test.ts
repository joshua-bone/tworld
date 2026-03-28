import { describe, expect, it } from "vitest";
import {
  createLayerCanvasCache,
  getCachedLayerCanvas,
  storeCachedLayerCanvas,
} from "@player-web/impl/legacyLayerCanvasCache";

describe("legacyLayerCanvasCache", () => {
  it("evicts the least recently used canvas when the cache exceeds its max size", () => {
    const cache = createLayerCanvasCache(2);
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const third = {} as HTMLCanvasElement;

    storeCachedLayerCanvas(cache, "first", first);
    storeCachedLayerCanvas(cache, "second", second);
    expect(getCachedLayerCanvas(cache, "first")).toBe(first);

    storeCachedLayerCanvas(cache, "third", third);

    expect(getCachedLayerCanvas(cache, "first")).toBe(first);
    expect(getCachedLayerCanvas(cache, "second")).toBeNull();
    expect(getCachedLayerCanvas(cache, "third")).toBe(third);
  });
});
