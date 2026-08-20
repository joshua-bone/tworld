import { describe, expect, it } from "vitest";
import { assertP7TrainingRepositoryHead } from "./p7TrainingRepositoryHead";

describe("P7 repository HEAD attestation", () => {
  it("accepts an exact HEAD and rejects foreign or malformed identities", async () => {
    const actual = "a".repeat(40);
    await expect(assertP7TrainingRepositoryHead({
      repositoryRoot: "/fixture",
      expectedHead: actual,
      resolveHead: async () => actual,
    })).resolves.toBeUndefined();
    await expect(assertP7TrainingRepositoryHead({
      repositoryRoot: "/fixture",
      expectedHead: "b".repeat(40),
      resolveHead: async () => actual,
    })).rejects.toThrow("HEAD mismatch");
    await expect(assertP7TrainingRepositoryHead({
      repositoryRoot: "/fixture",
      expectedHead: "HEAD",
      resolveHead: async () => actual,
    })).rejects.toThrow("invalid");
  });
});
