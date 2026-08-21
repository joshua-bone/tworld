import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it, vi } from "vitest";
import { loadCheckedTrainingPackInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import { summarizeP7bPortableBlockers } from "../p7b-portable/composeCclp1FoundationTrainingReplayPack";
import { processP7TrainingLevel } from "./p7TrainingLevelProcessor";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sha256 = new WebCryptoSha256();
const diagnostics = vi.hoisted(() => ({ processingDetails: [] as string[] }));

vi.mock("../p7b-training/trainingReplayContract", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../p7b-training/trainingReplayContract")
  >();
  return {
    ...actual,
    buildP7bTrainingReplayLevel(value: unknown) {
      const detail = (value as { readonly processing?: { readonly detail?: unknown } })
        .processing?.detail;
      if (typeof detail === "string") diagnostics.processingDetails.push(detail);
      return actual.buildP7bTrainingReplayLevel(value);
    },
  };
});

describe("production P7 CCLP4 row processing", () => {
  it("counts every blocker kind in deterministic order", () => {
    expect(summarizeP7bPortableBlockers([
      { kind: "same-step-collision", detail: "third" },
      { kind: "nondefault-flags", detail: "first" },
      { kind: "same-step-collision", detail: "second" },
      { kind: "mouse-input", detail: "zeroth" },
    ])).toBe("mouse-input×1, nondefault-flags×1, same-step-collision×2");
  });

  it("keeps Unravel's blocked portable summary bounded and attributable", async () => {
    diagnostics.processingDetails.length = 0;
    const inventory = await loadCheckedTrainingPackInventory(repositoryRoot, "cclp4", sha256);
    const source = inventory.packs[0]!.levels[138]!;
    expect(source.occurrenceId).toBe("cclp4/139");
    expect(source.title).toBe("Unravel");

    const output = await processP7TrainingLevel(source, sha256);
    const portableSummary = diagnostics.processingDetails.find((detail) => (
      detail.includes("portable candidate blocked")
    ));

    expect(portableSummary).toBe(
      "raw donors certified; portable candidate blocked: same-step-collision×201",
    );
    expect(new TextEncoder().encode(portableSummary!).byteLength).toBeLessThanOrEqual(4_096);
    expect(output.trainingReplayLevel.processing.status).toBe("complete");
  }, 110_000);
});
