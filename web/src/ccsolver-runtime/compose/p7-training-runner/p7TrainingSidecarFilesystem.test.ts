import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildP7GeneratedEvidenceSidecar } from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import { P7GeneratedEvidenceStore } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7TrainingArtifactFilesystem,
} from "./p7TrainingSidecarFilesystem";

const sha256 = new WebCryptoSha256();
let root = "";

async function sidecar(occurrenceId: string) {
  const store = new P7GeneratedEvidenceStore({
    scopeId: `${occurrenceId}/filesystem-test`,
    sha256,
  });
  await store.referenceCanonical({ occurrenceId, ok: true });
  return buildP7GeneratedEvidenceSidecar({ bundle: store.bundle(), sha256 });
}

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), "tworld-p7-sidecars-"));
});

afterEach(async () => {
  if (root !== "") await rm(root, { recursive: true, force: true });
});

describe("P7 occurrence-addressed sidecar filesystem", () => {
  it("persists and reloads only the exact expected occurrence set", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    await filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: await sidecar("cclp1/001"),
    });

    const descriptors = await filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001"],
      sha256,
    });
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      occurrenceId: "cclp1/001",
      levelNumber: 1,
      indexPath: "shards/0/evidence/cclp1/001/index.json",
      payloadPath: "shards/0/evidence/cclp1/001/payload.bin",
    });

    await expect(filesystem.verifyEvidence({
      occurrenceId: "cclp1/001",
      index: (await sidecar("cclp1/001")).index,
      indexContent: descriptors[0]!.indexContent,
      sha256,
    })).resolves.toMatchObject({ payload: expect.any(Uint8Array) });
  });

  it("rejects traversal, absolute paths, and a symlinked generated parent", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    await expect(filesystem.writeCanonicalJson("../escape.json", "{}", 128))
      .rejects.toThrow("unsafe");
    await expect(filesystem.readRegularFile("/tmp/private.json", 128))
      .rejects.toThrow("unsafe");

    const other = await mkdtemp(resolve(tmpdir(), "tworld-p7-sidecars-other-"));
    await symlink(other, resolve(root, "shards"));
    await expect(filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: await sidecar("cclp1/001"),
    })).rejects.toThrow("symbolic link");
    await rm(other, { recursive: true, force: true });
  });

  it("rejects missing, extra, and duplicate occurrence sidecars", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    await filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: await sidecar("cclp1/001"),
    });

    await expect(filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001", "cclp1/001"],
      sha256,
    })).rejects.toThrow("duplicate");

    await filesystem.persistEvidence({
      occurrenceId: "cclp1/002",
      sidecar: await sidecar("cclp1/002"),
    });
    await expect(filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001"],
      sha256,
    })).rejects.toThrow("unexpected");

    await unlink(resolve(root, "shards/0/evidence/cclp1/001/payload.bin"));
    await expect(filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001", "cclp1/002"],
      sha256,
    })).rejects.toThrow("missing");
  });

  it("rejects payload substitution and unexpected files in an occurrence leaf", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    const stored = await sidecar("cclp1/001");
    await filesystem.persistEvidence({ occurrenceId: "cclp1/001", sidecar: stored });
    await writeFile(
      resolve(root, "shards/0/evidence/cclp1/001/payload.bin"),
      new Uint8Array(stored.payload.byteLength),
    );
    await expect(filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001"],
      sha256,
    })).rejects.toThrow("digest drifted");

    await filesystem.persistEvidence({ occurrenceId: "cclp1/001", sidecar: stored });
    await writeFile(resolve(root, "shards/0/evidence/cclp1/001/private-path.txt"), "/Users/private");
    await expect(filesystem.collectShardEvidence({
      occurrenceIds: ["cclp1/001"],
      sha256,
    })).rejects.toThrow("unexpected");
  });

  it("rehashes both sidecar files before the index commit marker is written", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    const stored = await sidecar("cclp1/001");
    const payloadMutation = {
      ...stored,
      payload: new Uint8Array(stored.payload.byteLength),
    };
    await expect(filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: payloadMutation,
    })).rejects.toThrow("identity drifted");

    const indexMutation = {
      ...stored,
      indexContent: { ...stored.indexContent, digest: `sha256:${"f".repeat(64)}` as const },
    };
    await expect(filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: indexMutation,
    })).rejects.toThrow("identity drifted");
  });

  it("walks the explicit trusted-root chain and rejects a symlinked artifact ancestor", async () => {
    const other = await mkdtemp(resolve(tmpdir(), "tworld-p7-sidecars-ancestor-"));
    await symlink(other, resolve(root, "linked-parent"));
    const filesystem = new P7TrainingArtifactFilesystem({
      trustedRoot: root,
      artifactRoot: resolve(root, "linked-parent/artifacts"),
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await expect(filesystem.initialize()).rejects.toThrow("symbolic link");
    await rm(other, { recursive: true, force: true });
  });

  it("rejects a symlinked occurrence leaf after its parent exists", async () => {
    const filesystem = new P7TrainingArtifactFilesystem({
      artifactRoot: root,
      packId: "cclp1",
      shardIndex: 0,
      sha256,
    });
    await filesystem.initialize();
    await mkdir(resolve(root, "shards/0/evidence/cclp1"), { recursive: true });
    const other = await mkdtemp(resolve(tmpdir(), "tworld-p7-sidecars-leaf-"));
    await symlink(other, resolve(root, "shards/0/evidence/cclp1/001"));
    await expect(filesystem.persistEvidence({
      occurrenceId: "cclp1/001",
      sidecar: await sidecar("cclp1/001"),
    })).rejects.toThrow("symbolic link");
    await rm(other, { recursive: true, force: true });
  });
});
