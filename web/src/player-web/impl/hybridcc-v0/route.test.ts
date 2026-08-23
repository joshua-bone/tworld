import { describe, expect, it } from "vitest";
import { isHybridCcV0Path } from "./route";

describe("HybridCC v0 browser route", () => {
  it("matches the development player with or without a trailing slash", () => {
    expect(isHybridCcV0Path("/tworld/dev/hybridcc/v0", "/tworld/")).toBe(true);
    expect(isHybridCcV0Path("/tworld/dev/hybridcc/v0/", "/tworld/")).toBe(true);
    expect(isHybridCcV0Path("/dev/hybridcc/v0", "/")).toBe(true);
  });

  it("leaves the Tile World player on every other path", () => {
    expect(isHybridCcV0Path("/tworld/", "/tworld/")).toBe(false);
    expect(isHybridCcV0Path("/tworld/dev/hybridcc", "/tworld/")).toBe(false);
    expect(isHybridCcV0Path("/tworld/dev/hybridcc/v1", "/tworld/")).toBe(false);
  });
});
