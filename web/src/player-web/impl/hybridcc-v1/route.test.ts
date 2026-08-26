import { describe, expect, it } from "vitest";
import { isHybridCcV1Path } from "./route";

describe("HybridCC v1 browser route", () => {
  it("matches the development player with or without a trailing slash", () => {
    expect(isHybridCcV1Path("/tworld/dev/hybridcc/v1", "/tworld/")).toBe(true);
    expect(isHybridCcV1Path("/tworld/dev/hybridcc/v1/", "/tworld/")).toBe(true);
    expect(isHybridCcV1Path("/dev/hybridcc/v1", "/")).toBe(true);
  });

  it("leaves v0 and the ordinary Tile World player on their existing routes", () => {
    expect(isHybridCcV1Path("/tworld/", "/tworld/")).toBe(false);
    expect(isHybridCcV1Path("/tworld/dev/hybridcc", "/tworld/")).toBe(false);
    expect(isHybridCcV1Path("/tworld/dev/hybridcc/v0", "/tworld/")).toBe(false);
    expect(isHybridCcV1Path("/tworld/dev/hybridcc/v10", "/tworld/")).toBe(false);
  });

  it("does not treat a partial base-path prefix as the configured base", () => {
    expect(isHybridCcV1Path("/tworldish/dev/hybridcc/v1", "/tworld/")).toBe(false);
  });
});
