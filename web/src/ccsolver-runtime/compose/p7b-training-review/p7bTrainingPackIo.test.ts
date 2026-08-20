import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  P7B_SHARED_PLAYER_DIST_ENTRY,
  P7B_SHARED_PLAYER_LEVEL_HREF,
  P7B_SHARED_PLAYER_SOURCE_ENTRY,
  P7B_SHARED_PLAYER_VITE_MANIFEST_KEY,
  P7B_TRAINING_PACK_CHECKED_PARENT,
  P7B_TRAINING_PACK_DIST_PARENT,
  type P7bTrainingPackOutput,
} from "./buildP7bTrainingPackOutputs";
import { buildP7TrainingPackProofLeaf } from "./buildP7TrainingPackProofLeaf";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  buildP7SharedPlayerGraphAttestation,
  canonicalizeP7SharedPlayerGraphAttestation,
} from "./p7SharedPlayerGraphAttestation";
import {
  assertP7bTrainingPackOutputPath,
  attestCheckedP7bTrainingPack,
  installCheckedP7bTrainingPackDistTransactionally,
  loadCheckedP7bTrainingPackDistOutputs,
  resolveP7bTrainingPackTransactionTargets,
  writeP7bTrainingPackCheckedOutputsTransactionally,
} from "./p7bTrainingPackIo";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();

async function outputFixture(playerSource: Uint8Array): Promise<readonly P7bTrainingPackOutput[]> {
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/fixture-pack`;
  const mapBytes = Uint8Array.of(7, 42, 9);
  const levelBytes = Uint8Array.of(42);
  const eligibilityBytes = encoder.encode(canonicalizeJson({ eligible: true, levelNumber: 1 }));
  const [levelContent, eligibilityContent] = await Promise.all([
    referenceSourceBytes(levelBytes, sha256),
    referenceSourceBytes(eligibilityBytes, sha256),
  ]);
  const contract = {
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "fixture-pack",
      levelNumber: 1,
      title: "Pending fixture",
      normalizedGameplaySha256: "1".repeat(64),
      levelContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: "fixture-standard-only-v1",
        evidence: eligibilityContent,
      },
    },
    donorCoverage: {
      ms: { status: "not-assessed", rawDonorId: null, detail: "processing has not started" },
      lynx: { status: "not-assessed", rawDonorId: null, detail: "processing has not started" },
    },
    rawDonors: [],
    variants: [],
    processing: { status: "pending", detail: "processing has not started" },
    viewableVariantId: null,
  };
  const payloads = [
    {
      path: `${root}/browser.json`,
      mediaType: "application/json" as const,
      content: encoder.encode(canonicalizeJson({ artifact: "fixture-browser", levels: 1 })),
    },
    {
      path: `${root}/index.html`,
      mediaType: "text/html" as const,
      content: encoder.encode("<!doctype html><title>Fixture</title>"),
    },
    {
      path: `${root}/levels/001/contract.json`,
      mediaType: "application/json" as const,
      content: encoder.encode(canonicalizeJson(contract)),
    },
    {
      path: `${root}/levels/001/index.html`,
      mediaType: "text/html" as const,
      content: encoder.encode("<!doctype html><title>Pending fixture</title>"),
    },
    {
      path: `${root}/pack-summary.json`,
      mediaType: "application/json" as const,
      content: encoder.encode(canonicalizeJson({ artifact: "fixture-summary" })),
    },
  ];
  const proof = await buildP7TrainingPackProofLeaf({
    root,
    pack: {
      packId: "fixture-pack",
      expectedLevelCount: 1,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: "fixture-producer-v1",
    },
    levels: [contract as any],
    baseOutputs: payloads,
    externalInputs: [{
      path: "sets/fixture.dat",
      kind: "official-map",
      content: await referenceSourceBytes(mapBytes, sha256),
    }],
    derivedSources: [{
      kind: "official-level-source",
      content: levelContent,
      sourceContent: await referenceSourceBytes(mapBytes, sha256),
      sourcePath: "sets/fixture.dat",
      locator: { kind: "byte-range", byteOffset: 1, byteLength: 1 },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber: 1,
      variantId: null,
      target: null,
    }],
    generatedEvidence: {
      pack: {
        artifact: "ccsolver-p7-generated-evidence-bundle",
        version: 1,
        scopeId: "fixture-pack/shared",
        limits: {
          maximumBlobCount: 20_000,
          maximumBlobBytes: 16 * 1024 * 1024,
          maximumTotalBytes: 512 * 1024 * 1024,
        },
        totals: { blobCount: 0, byteLength: 0 },
        blobs: [],
      },
      levels: [{
        occurrenceId: "fixture-001",
        levelNumber: 1,
        bundle: {
          artifact: "ccsolver-p7-generated-evidence-bundle",
          version: 1,
          scopeId: "fixture-001/evidence",
          limits: {
            maximumBlobCount: 20_000,
            maximumBlobBytes: 16 * 1024 * 1024,
            maximumTotalBytes: 512 * 1024 * 1024,
          },
          totals: { blobCount: 1, byteLength: eligibilityBytes.byteLength },
          blobs: [{
            content: eligibilityContent,
            mediaType: "application/json",
            bytes: eligibilityBytes,
          }],
        },
      }],
    },
    sha256,
  });
  const allPayloads = [...payloads, ...proof.evidenceOutputs, proof.proofOutput];
  const files = await Promise.all(allPayloads.map(async (output) => ({
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(output.content, sha256),
  })));
  const playerBuild = await sharedPlayerBuildFixture(playerSource);
  const manifest = {
    artifact: "ccsolver-p7b-training-pack-manifest",
    version: 1,
    producerRevision: "ccsolver-p7b-training-pack-output-v1",
    pack: { packId: "fixture-pack", title: "Fixture", expectedLevelCount: 1 },
    sharedPlayer: {
      graphAttestation: {
        path: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
        content: await referenceSourceBytes(playerBuild.attestationBytes, sha256),
      },
      entry: playerBuild.attestation.entry,
      levelPageHref: `${P7B_SHARED_PLAYER_LEVEL_HREF}?v=${
        playerBuild.attestation.entry.content.digest.slice("sha256:".length)
      }`,
    },
    portableProfile: null,
    proofIndex: {
      path: proof.proofOutput.path,
      content: files.find(({ path }) => path === proof.proofOutput.path)!.content,
    },
    summary: {
      path: `${root}/pack-summary.json`,
      content: files.find(({ path }) => path.endsWith("/pack-summary.json"))!.content,
    },
    levels: [{
      levelNumber: 1,
      status: "unprocessed",
      rawDonorFileCount: 0,
      replayFileCount: 0,
      variantPayloadFileCount: 0,
    }],
    filesOrder: "path",
    files: [...files].sort((left, right) => left.path.localeCompare(right.path)),
  };
  return [...allPayloads, {
    path: `${root}/manifest.json`,
    mediaType: "application/json" as const,
    content: encoder.encode(canonicalizeJson(manifest)),
  }].sort((left, right) => left.path.localeCompare(right.path));
}

async function sharedPlayerBuildFixture(source: Uint8Array) {
  const viteManifest = {
    [P7B_SHARED_PLAYER_VITE_MANIFEST_KEY]: {
      file: P7B_SHARED_PLAYER_DIST_ENTRY,
      name: "p7b-replay-player",
      src: P7B_SHARED_PLAYER_VITE_MANIFEST_KEY,
      isEntry: true,
      imports: ["_shared-player-chunk.js"],
      css: ["assets/p7b-replay-player.css"],
    },
    "_shared-player-chunk.js": {
      file: "assets/shared-player-chunk.js",
    },
  };
  const viteManifestBytes = encoder.encode(canonicalizeJson(viteManifest));
  const builtFiles = [{
    path: P7B_SHARED_PLAYER_DIST_ENTRY,
    bytes: encoder.encode("export {};\n"),
  }, {
    path: "assets/shared-player-chunk.js",
    bytes: encoder.encode("export {};\n"),
  }, {
    path: "assets/p7b-replay-player.css",
    bytes: encoder.encode("body{}\n"),
  }];
  const attestation = await buildP7SharedPlayerGraphAttestation({
    sourceEntryBytes: source,
    sourceClosureRevision: "git-tree:fixture-player-v1",
    toolchainRevision: "vite@fixture|typescript@fixture",
    viteManifestBytes,
    builtFiles,
    sha256,
  });
  return {
    viteManifestBytes,
    builtFiles,
    attestation,
    attestationBytes: encoder.encode(canonicalizeP7SharedPlayerGraphAttestation(attestation)),
  };
}

async function installSharedPlayerBuild(root: string, source: Uint8Array): Promise<void> {
  const sourcePath = resolve(root, P7B_SHARED_PLAYER_SOURCE_ENTRY);
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, source);
  const fixture = await sharedPlayerBuildFixture(source);
  await mkdir(resolve(root, "web/dist/.vite"), { recursive: true });
  await mkdir(resolve(root, "web/dist/assets"), { recursive: true });
  await writeFile(resolve(root, "web/dist/.vite/manifest.json"), fixture.viteManifestBytes);
  for (const file of fixture.builtFiles) {
    const path = resolve(root, "web/dist", file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.bytes);
  }
  const attestationPath = resolve(root, P7_SHARED_PLAYER_GRAPH_CHECKED_PATH);
  await mkdir(dirname(attestationPath), { recursive: true });
  await writeFile(attestationPath, fixture.attestationBytes);
}

async function installProofSources(root: string): Promise<void> {
  const path = resolve(root, "sets/fixture.dat");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Uint8Array.of(7, 42, 9));
}

describe("P7B training pack attestation and transactional IO", () => {
  it("pins checked and dist replacement to one safe pack leaf", () => {
    const root = "/workspace/tworld";
    const targets = resolveP7bTrainingPackTransactionTargets(root, "cclp1");
    expect(targets.checkedRoot).toBe(resolve(
      root,
      P7B_TRAINING_PACK_CHECKED_PARENT,
      "cclp1",
    ));
    expect(targets.distRoot).toBe(resolve(root, "web/dist", P7B_TRAINING_PACK_DIST_PARENT, "cclp1"));
    expect(targets.checkedRoot).not.toBe(targets.ccssolverRoot);
    expect(targets.distRoot).not.toBe(resolve(root, "web/dist"));

    for (const unsafe of ["../cclp1", "cclp1/other", "CCLP1", "cclp1\\other"]) {
      expect(() => resolveP7bTrainingPackTransactionTargets(root, unsafe)).toThrow();
    }
  });

  it("attests the exact content-addressed checked tree without importing engines", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export const player = true;\n");
    try {
      await installProofSources(root);
      const outputs = await outputFixture(player);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);
      const attested = await attestCheckedP7bTrainingPack(root, "fixture-pack");
      expect(attested.outputs).toHaveLength(outputs.length);
      expect(attested.manifest.pack.expectedLevelCount).toBe(1);

      await writeFile(
        resolve(root, `${P7B_TRAINING_PACK_CHECKED_PARENT}/fixture-pack/browser.json`),
        encoder.encode(canonicalizeJson({ artifact: "mutated" })),
      );
      await expect(attestCheckedP7bTrainingPack(root, "fixture-pack")).rejects.toThrow(
        "manifest payload drifted",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects undeclared files and unsafe output paths", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export {};\n");
    try {
      await installProofSources(root);
      const outputs = await outputFixture(player);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);
      const extra = resolve(
        root,
        `${P7B_TRAINING_PACK_CHECKED_PARENT}/fixture-pack/undeclared.json`,
      );
      await writeFile(extra, "{}", "utf8");
      await expect(attestCheckedP7bTrainingPack(root, "fixture-pack")).rejects.toThrow(
        "checked file set drifted",
      );

      expect(() => assertP7bTrainingPackOutputPath(
        root,
        "fixture-pack",
        `${P7B_TRAINING_PACK_CHECKED_PARENT}/fixture-pack/../other/manifest.json`,
      )).toThrow("unsafe output path");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("always parses the exact level contract even when a substituted manifest rehashes it", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export {}\n");
    try {
      await installProofSources(root);
      const outputs = [...await outputFixture(player)];
      const contract = outputs.find(({ path }) => path.endsWith("/levels/001/contract.json"))!;
      const substituted = encoder.encode(canonicalizeJson({ artifact: "substituted-contract" }));
      const contractIndex = outputs.indexOf(contract);
      outputs[contractIndex] = { ...contract, content: substituted };
      const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"))!;
      const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
      const contractDeclaration = manifest.files.find((file: { path: string }) => (
        file.path === contract.path
      ));
      contractDeclaration.content = await referenceSourceBytes(substituted, sha256);
      outputs[outputs.indexOf(manifestOutput)] = {
        ...manifestOutput,
        content: encoder.encode(canonicalizeJson(manifest)),
      };

      await expect(writeP7bTrainingPackCheckedOutputsTransactionally(
        root,
        "fixture-pack",
        outputs,
      )).rejects.toThrow("training replay level");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a substituted evidence container even when its pack manifest is rehashed", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export {}\n");
    try {
      await installProofSources(root);
      const outputs = [...await outputFixture(player)];
      const payload = outputs.find(({ path }) => path.endsWith("/evidence/payload.bin"))!;
      const substituted = Uint8Array.from(
        payload.content,
        (byte, index) => index === 0 ? byte ^ 1 : byte,
      );
      outputs[outputs.indexOf(payload)] = { ...payload, content: substituted };
      const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"))!;
      const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
      manifest.files.find((file: { path: string }) => file.path === payload.path).content =
        await referenceSourceBytes(substituted, sha256);
      outputs[outputs.indexOf(manifestOutput)] = {
        ...manifestOutput,
        content: encoder.encode(canonicalizeJson(manifest)),
      };

      await expect(writeP7bTrainingPackCheckedOutputsTransactionally(
        root,
        "fixture-pack",
        outputs,
      )).rejects.toThrow("proof content digest or length drifted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("emits only pack files after attesting the one shared built player dependency graph", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export const player = true;\n");
    try {
      await installProofSources(root);
      const outputs = await outputFixture(player);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);
      await installSharedPlayerBuild(root, player);

      const dist = await loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack");
      expect(dist.map(({ path }) => path)).toContain(
        `${P7B_TRAINING_PACK_DIST_PARENT}/fixture-pack/index.html`,
      );
      expect(dist.some(({ path }) => path === P7B_SHARED_PLAYER_DIST_ENTRY)).toBe(false);

      await rm(resolve(root, "web/dist/assets/shared-player-chunk.js"));
      await expect(loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack"))
        .rejects.toThrow("shared player dependency is missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects drift in the checked graph receipt, source, Vite manifest, and reachable assets", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export const player = true;\n");
    try {
      await installProofSources(root);
      await writeP7bTrainingPackCheckedOutputsTransactionally(
        root,
        "fixture-pack",
        await outputFixture(player),
      );
      await installSharedPlayerBuild(root, player);

      await writeFile(resolve(root, P7B_SHARED_PLAYER_SOURCE_ENTRY), "export const drift = true;\n");
      await expect(loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack"))
        .rejects.toThrow("source entry content drifted");

      await installSharedPlayerBuild(root, player);
      await writeFile(resolve(root, "web/dist/.vite/manifest.json"), "{}", "utf8");
      await expect(loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack"))
        .rejects.toThrow("shared player Vite");

      await installSharedPlayerBuild(root, player);
      await writeFile(resolve(root, "web/dist", P7B_SHARED_PLAYER_DIST_ENTRY), "alert('drift');\n");
      await expect(loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack"))
        .rejects.toThrow("built file content drifted");

      await installSharedPlayerBuild(root, player);
      await writeFile(resolve(root, P7_SHARED_PLAYER_GRAPH_CHECKED_PATH), "{}", "utf8");
      await expect(loadCheckedP7bTrainingPackDistOutputs(root, "fixture-pack"))
        .rejects.toThrow("graph attestation drifted");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("transactionally replaces only the selected leaf and preserves siblings", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const player = encoder.encode("export {};\n");
    try {
      await installProofSources(root);
      const sibling = resolve(root, P7B_TRAINING_PACK_CHECKED_PARENT, "cclp4", "keep.txt");
      await mkdir(dirname(sibling), { recursive: true });
      await writeFile(sibling, "keep", "utf8");
      const outputs = await outputFixture(player);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);

      expect(await readFile(sibling, "utf8")).toBe("keep");
      expect(await readFile(resolve(
        root,
        P7B_TRAINING_PACK_CHECKED_PARENT,
        "fixture-pack/manifest.json",
      ), "utf8")).toContain("ccsolver-p7b-training-pack-manifest");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked fixed ancestors for checked and dist transactions", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7b-pack-"));
    const outside = await mkdtemp(resolve(tmpdir(), "tworld-p7b-outside-"));
    const player = encoder.encode("export {}\n");
    try {
      await installProofSources(root);
      const checkedParent = resolve(root, "ccsolver/fixtures/golden/p7b");
      await mkdir(checkedParent, { recursive: true });
      await symlink(outside, resolve(checkedParent, "training-packs"), "dir");
      await expect(writeP7bTrainingPackCheckedOutputsTransactionally(
        root,
        "fixture-pack",
        await outputFixture(player),
      )).rejects.toThrow("fixed ancestor is a symlink");

      await rm(resolve(checkedParent, "training-packs"));
      const outputs = await outputFixture(player);
      await writeP7bTrainingPackCheckedOutputsTransactionally(root, "fixture-pack", outputs);
      await installSharedPlayerBuild(root, player);
      const distParent = resolve(root, "web/dist/dev/ccsolver");
      await mkdir(distParent, { recursive: true });
      await symlink(outside, resolve(distParent, "training-replays"), "dir");
      await expect(installCheckedP7bTrainingPackDistTransactionally(
        root,
        "fixture-pack",
      )).rejects.toThrow("fixed ancestor is a symlink");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});
