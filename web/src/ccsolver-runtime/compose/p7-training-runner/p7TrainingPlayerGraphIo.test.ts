import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  canonicalizeJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  P7_SHARED_PLAYER_SOURCE_ENTRY,
} from "../p7b-training-review/p7SharedPlayerGraphAttestation";
import {
  P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
  P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
  attestCheckedP7TrainingPlayerGraph,
  buildFreshP7TrainingPlayerGraph,
  checkP7TrainingPlayerGraph,
  writeP7TrainingPlayerGraphTransactionally,
} from "./p7TrainingPlayerGraphIo";

const sha256 = new WebCryptoSha256();
let root = "";

async function fixture(): Promise<void> {
  await mkdir(resolve(root, dirname(P7_SHARED_PLAYER_SOURCE_ENTRY)), { recursive: true });
  await mkdir(resolve(root, "web/dist/.vite"), { recursive: true });
  await mkdir(resolve(root, "web/dist/assets"), { recursive: true });
  await writeFile(resolve(root, P7_SHARED_PLAYER_SOURCE_ENTRY), "export const player = true;\n");
  await writeFile(resolve(root, "web/dist/assets/p7b-replay-player.js"), "export{player};\n");
  await writeFile(resolve(root, "web/dist/assets/player.css"), "body{color:#123}");
  await writeFile(resolve(root, "web/dist/.vite/manifest.json"), JSON.stringify({
    "src/bootstrap/browser/p7bReplayPlayer.tsx": {
      file: "assets/p7b-replay-player.js",
      isEntry: true,
      src: "src/bootstrap/browser/p7bReplayPlayer.tsx",
      css: ["assets/player.css"],
    },
  }));
}

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), "tworld-p7-player-graph-"));
  await fixture();
});

afterEach(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

describe("P7 shared player graph bootstrap IO", () => {
  it("builds a fresh graph without silently requiring a checked graph", async () => {
    const fresh = await buildFreshP7TrainingPlayerGraph({
      repositoryRoot: root,
      sourceClosureRevision: "test-source-closure-v1",
      toolchainRevision: "test-vite-v1",
      sha256,
    });
    expect(fresh.graphAttestation.files.map(({ path }) => path)).toEqual([
      "assets/p7b-replay-player.js",
      "assets/player.css",
    ]);
    await expect(checkP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
      .rejects.toThrow("missing");
  });

  it("traverses real Vite lookup keys without using them as filesystem paths", async () => {
    await writeFile(resolve(root, "web/dist/assets/CCLP1-a1b2.js"), "export default 'CCLP1-c3d4.dat';\n");
    await writeFile(resolve(root, "web/dist/assets/CCLP1-c3d4.dat"), Uint8Array.of(1, 2, 3));
    await writeFile(resolve(root, "web/dist/.vite/manifest.json"), JSON.stringify({
      "src/bootstrap/browser/p7bReplayPlayer.tsx": {
        file: "assets/p7b-replay-player.js",
        isEntry: true,
        src: "src/bootstrap/browser/p7bReplayPlayer.tsx",
        imports: ["../data/CCLP1.dat?url"],
        css: ["assets/player.css"],
      },
      "../data/CCLP1.dat?url": {
        file: "assets/CCLP1-a1b2.js",
        assets: ["assets/CCLP1-c3d4.dat"],
      },
    }));

    await expect(buildFreshP7TrainingPlayerGraph({
      repositoryRoot: root,
      sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
      toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
      sha256,
    })).resolves.toMatchObject({
      graphAttestation: { totals: { fileCount: 4 } },
    });

    const manifest = JSON.parse(await readFile(resolve(root, "web/dist/.vite/manifest.json"), "utf8"));
    manifest["../data/CCLP1.dat?url"].file = "../outside.js";
    await writeFile(resolve(root, "web/dist/.vite/manifest.json"), JSON.stringify(manifest));
    await expect(buildFreshP7TrainingPlayerGraph({
      repositoryRoot: root,
      sourceClosureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
      toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
      sha256,
    })).rejects.toThrow("unsafe");
  });

  it("writes the graph only through the explicit transaction, then checks and attests it", async () => {
    await writeP7TrainingPlayerGraphTransactionally({
      repositoryRoot: root,
      sha256,
    });
    const checkedBytes = await readFile(resolve(root, P7_SHARED_PLAYER_GRAPH_CHECKED_PATH));
    expect(checkedBytes.byteLength).toBeGreaterThan(0);
    await expect(checkP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
      .resolves.toMatchObject({
        graphAttestationPath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
        graphAttestation: {
          source: {
            closureRevision: P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION,
          },
          toolchainRevision: P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION,
        },
      });
    expect(P7_TRAINING_SHARED_PLAYER_SOURCE_CLOSURE_REVISION)
      .toBe("p7-shared-player-source-closure-v1");
    expect(P7_TRAINING_SHARED_PLAYER_TOOLCHAIN_REVISION)
      .toBe("node22.22.0-vite7.3.1-base-tworld-v1");
    await expect(attestCheckedP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
      .resolves.toMatchObject({ fileCount: 2 });

    await writeFile(resolve(root, "web/dist/assets/p7b-replay-player.js"), "substituted\n");
    await expect(checkP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
      .rejects.toThrow("drifted");
  });

  it("rejects a symlinked checked parent before the explicit write", async () => {
    const checkedParent = resolve(root, dirname(P7_SHARED_PLAYER_GRAPH_CHECKED_PATH));
    await mkdir(dirname(checkedParent), { recursive: true });
    const other = await mkdtemp(resolve(tmpdir(), "tworld-p7-player-graph-other-"));
    await symlink(other, checkedParent);
    await expect(writeP7TrainingPlayerGraphTransactionally({
      repositoryRoot: root,
      sha256,
    })).rejects.toThrow("symbolic link");
    await rm(other, { recursive: true, force: true });
  });

  it("rejects canonical checked graphs with stale source or toolchain labels", async () => {
    const checkedPath = resolve(root, P7_SHARED_PLAYER_GRAPH_CHECKED_PATH);
    for (const drift of ["source", "toolchain"] as const) {
      await writeP7TrainingPlayerGraphTransactionally({
        repositoryRoot: root,
        sha256,
      });
      const graph = JSON.parse(await readFile(checkedPath, "utf8")) as Record<string, unknown>;
      if (drift === "source") {
        (graph.source as Record<string, unknown>).closureRevision = "stale-source-closure-v0";
      } else {
        graph.toolchainRevision = "stale-toolchain-v0";
      }
      await writeFile(checkedPath, canonicalizeJson(graph as CanonicalJsonValue), "utf8");

      await expect(checkP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
        .rejects.toThrow(`${drift} revision drifted`);
      await expect(attestCheckedP7TrainingPlayerGraph({ repositoryRoot: root, sha256 }))
        .rejects.toThrow(`${drift} revision drifted`);
    }
  });
});
