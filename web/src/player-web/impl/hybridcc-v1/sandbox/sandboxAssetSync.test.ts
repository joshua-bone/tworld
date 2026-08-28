import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import engineManifest from "../engine/engine-manifest.json";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../../../../../..");
const script = resolve(
  repositoryRoot,
  "web/src/player-web/impl/hybridcc-v1/sandbox/syncSandboxAssets.mjs",
);
const checkedInAssets = resolve(import.meta.dirname, "assets");
const temporaryRoots: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tworld-hybridcc-sandbox-sync-"));
  temporaryRoots.push(root);
  return root;
}

async function runSync(source: string, destination: string, checkOnly = false) {
  return execFileAsync(process.execPath, [script, ...(checkOnly ? ["--check"] : []), source], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      HYBRIDCC_SANDBOX_ASSET_DESTINATION_DIR: destination,
      HYBRIDCC_SANDBOX_SOURCE_COMMIT: engineManifest.sourceCommit,
    },
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })));
});

describe("Hybrid v1 sandbox asset synchronization", () => {
  it("rejects unindexed HCR1 files in either generated input or checked-in output", async () => {
    const root = await temporaryDirectory();
    const source = join(root, "generated");
    const destination = join(root, "browser-assets");
    const staleRelativePath = "replays/1.0.12/stale-tour.hcr1";
    await cp(checkedInAssets, source, { recursive: true });

    await runSync(source, destination);
    await expect(runSync(source, destination, true)).resolves.toMatchObject({
      stdout: expect.stringContaining("Checked 5 HybridCC sandbox assets."),
    });

    await writeFile(join(source, staleRelativePath), new Uint8Array([0x48, 0x43, 0x52, 0x31]));
    await expect(runSync(source, destination, true)).rejects.toMatchObject({
      stderr: expect.stringContaining(`unexpected ${staleRelativePath}`),
    });
    await rm(join(source, staleRelativePath));

    await mkdir(join(destination, "replays/1.0.12"), { recursive: true });
    await writeFile(join(destination, staleRelativePath), new Uint8Array([0x48, 0x43, 0x52, 0x31]));
    await expect(runSync(source, destination, true)).rejects.toMatchObject({
      stderr: expect.stringContaining(`unexpected ${staleRelativePath}`),
    });
  });
});
