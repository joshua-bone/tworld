import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  P7_TRAINING_PRESENTATION_PROOF_TIMEOUT_MS,
  assertP7TrainingPresentationProofReceiptCurrent,
} from "./p7TrainingPresentationProofReceipt";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("P7 presentation proof receipt source freshness", () => {
  it("rejects HTML source drift even when the checked output and local receipt are unchanged", async () => {
    expect(P7_TRAINING_PRESENTATION_PROOF_TIMEOUT_MS).toBe(120_000);
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7-presentation-receipt-"));
    roots.push(root);
    await Promise.all([
      mkdir(resolve(root, "src"), { recursive: true }),
      mkdir(resolve(root, "checked"), { recursive: true }),
      mkdir(resolve(root, "proof"), { recursive: true }),
    ]);
    await writeFile(resolve(root, "src/player.html"), "<main>current</main>\n", "utf8");
    await writeFile(resolve(root, "checked/player.html"), "<main>current</main>\n", "utf8");
    await writeFile(resolve(root, "proof/spec.json"), JSON.stringify({
      schema: "tworld.proof-spec/v1",
      proofId: "p7-presentation",
      producerContract: "fixture-presentation-v1",
      inputScopes: [{ kind: "file", path: "src/player.html" }],
      outputScopes: [{ kind: "file", path: "checked/player.html" }],
      outputManifestPath: null,
    }), "utf8");
    const scriptPath = resolve(process.cwd(), "../scripts/ci/proof-receipt.mjs");
    await execFileAsync(process.execPath, [
      scriptPath,
      "generate",
      "--root", root,
      "--spec", "proof/spec.json",
      "--receipt", "proof/receipt.json",
    ], { encoding: "utf8", timeout: 15_000 });
    const input = {
      repositoryRoot: root,
      scriptPath,
      specPath: "proof/spec.json",
      receiptPath: "proof/receipt.json",
    };
    await expect(assertP7TrainingPresentationProofReceiptCurrent(input)).resolves.toBeUndefined();

    await writeFile(resolve(root, "src/player.html"), "<main>drifted</main>\n", "utf8");
    await expect(assertP7TrainingPresentationProofReceiptCurrent(input))
      .rejects.toThrow("verification failed");
  }, 20_000);
});
