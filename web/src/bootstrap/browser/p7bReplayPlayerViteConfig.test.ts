import { describe, expect, it } from "vitest";
import { tworldEntryFileName } from "../../../vite.config";

describe("Vite entry filenames", () => {
  it("keeps one shared P7B player URL stable while normal entries remain content-hashed", () => {
    expect(tworldEntryFileName({ name: "p7b-replay-player" }))
      .toBe("assets/p7b-replay-player.js");
    expect(tworldEntryFileName({ name: "app" }))
      .toBe("assets/[name]-[hash].js");
  });
});
