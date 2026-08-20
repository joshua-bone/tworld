import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "vite";
import { P7_SHARED_PLAYER_SOURCE_ENTRY } from "../p7b-training-review/p7SharedPlayerGraphAttestation";
import {
  P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
  P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
  attestCheckedP7TrainingPlayerGraph,
  buildFreshP7TrainingPlayerGraph,
  checkP7TrainingPlayerGraph,
  writeP7TrainingPlayerGraphTransactionally,
} from "./p7TrainingPlayerGraphIo";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const repositoryRoot = resolve(webRoot, "..");
const sha256 = new WebCryptoSha256();
let temporaryRoot = "";

afterEach(async () => {
  if (temporaryRoot !== "") await rm(temporaryRoot, { force: true, recursive: true });
  temporaryRoot = "";
});

describe("P7 shared player graph production-build acceptance", () => {
  it("builds, writes, checks, and attests the real Vite-expanded player graph", async () => {
    temporaryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p7-player-production-"));
    const distRoot = resolve(temporaryRoot, "web/dist");
    const copiedEntry = resolve(temporaryRoot, P7_SHARED_PLAYER_SOURCE_ENTRY);
    await mkdir(dirname(copiedEntry), { recursive: true });
    await copyFile(resolve(repositoryRoot, P7_SHARED_PLAYER_SOURCE_ENTRY), copiedEntry);

    await build({
      base: "/tworld/",
      build: { emptyOutDir: true, outDir: distRoot },
      configFile: resolve(webRoot, "vite.config.ts"),
      logLevel: "silent",
      root: webRoot,
    });

    const fresh = await buildFreshP7TrainingPlayerGraph({
      repositoryRoot: temporaryRoot,
      sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
      toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
      sha256,
    });
    expect(fresh.graphAttestation.files.some(({ path }) => /\/CCLP1-[\w-]+\.dat$/u.test(path)))
      .toBe(true);

    await writeP7TrainingPlayerGraphTransactionally({ repositoryRoot: temporaryRoot, sha256 });
    await expect(checkP7TrainingPlayerGraph({ repositoryRoot: temporaryRoot, sha256 }))
      .resolves.toMatchObject({ graphAttestation: fresh.graphAttestation });
    await expect(attestCheckedP7TrainingPlayerGraph({ repositoryRoot: temporaryRoot, sha256 }))
      .resolves.toMatchObject({ fileCount: fresh.graphAttestation.totals.fileCount });
  }, 30_000);
});
