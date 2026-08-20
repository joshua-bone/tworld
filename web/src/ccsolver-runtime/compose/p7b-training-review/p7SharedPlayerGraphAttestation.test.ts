import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  attestP7SharedPlayerGraph,
  buildP7SharedPlayerGraphAttestation,
  canonicalizeP7SharedPlayerGraphAttestation,
  parseP7SharedPlayerGraphAttestation,
} from "./p7SharedPlayerGraphAttestation";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function fixture() {
  const viteManifestBytes = encoder.encode(canonicalizeJson({
    "src/bootstrap/browser/p7bReplayPlayer.tsx": {
      file: "assets/p7b-replay-player.js",
      isEntry: true,
      src: "src/bootstrap/browser/p7bReplayPlayer.tsx",
      imports: ["_shared.js"],
      css: ["assets/p7b-replay-player.css"],
    },
    "_shared.js": {
      file: "assets/shared-a1b2.js",
      assets: ["assets/tiles-c3d4.png"],
    },
    "unrelated.ts": { file: "assets/unrelated.js", isEntry: true },
  }));
  return {
    sourceEntryBytes: encoder.encode("export const player = true;\n"),
    sourceClosureRevision: "git-tree:fixture-player-source-v1",
    toolchainRevision: "vite@fixture|typescript@fixture",
    viteManifestBytes,
    builtFiles: [{
      path: "assets/p7b-replay-player.js",
      bytes: encoder.encode("import './shared-a1b2.js';\n"),
    }, {
      path: "assets/p7b-replay-player.css",
      bytes: encoder.encode("body{}\n"),
    }, {
      path: "assets/shared-a1b2.js",
      bytes: encoder.encode("export {};\n"),
    }, {
      path: "assets/tiles-c3d4.png",
      bytes: Uint8Array.of(1, 2, 3),
    }],
    sha256,
  };
}

describe("the checked P7 shared replay-player graph", () => {
  it("hashes the exact sorted Vite dependency graph and round-trips canonically", async () => {
    const input = fixture();
    const attestation = await buildP7SharedPlayerGraphAttestation(input);
    const canonical = canonicalizeP7SharedPlayerGraphAttestation(attestation);

    expect(parseP7SharedPlayerGraphAttestation(canonical)).toEqual(attestation);
    expect(attestation.entry.path).toBe("assets/p7b-replay-player.js");
    expect(attestation.files.map(({ path }) => path)).toEqual([
      "assets/p7b-replay-player.css",
      "assets/p7b-replay-player.js",
      "assets/shared-a1b2.js",
      "assets/tiles-c3d4.png",
    ]);
    expect(attestation.files.some(({ path }) => path.endsWith("unrelated.js"))).toBe(false);
    await expect(attestP7SharedPlayerGraph({ attestation, ...input })).resolves.toEqual({
      fileCount: 4,
      byteLength: expect.any(Number),
      entryContent: attestation.entry.content,
    });
  });

  it("rejects missing, extra, reordered, and byte-substituted built material", async () => {
    const input = fixture();
    const attestation = await buildP7SharedPlayerGraphAttestation(input);
    await expect(attestP7SharedPlayerGraph({
      attestation,
      ...input,
      builtFiles: input.builtFiles.slice(1),
    })).rejects.toThrow("built file set is incomplete");
    await expect(buildP7SharedPlayerGraphAttestation({
      ...input,
      builtFiles: [...input.builtFiles, {
        path: "assets/unrelated.js",
        bytes: encoder.encode("export {};\n"),
      }],
    })).rejects.toThrow("unexpected built file");
    await expect(attestP7SharedPlayerGraph({
      attestation,
      ...input,
      builtFiles: input.builtFiles.map((file) => file.path === attestation.entry.path
        ? { ...file, bytes: encoder.encode("alert('tampered');\n") }
        : file),
    })).rejects.toThrow("content drifted");

    const reordered = structuredClone(attestation) as Mutable<typeof attestation>;
    [reordered.files[0], reordered.files[1]] = [reordered.files[1]!, reordered.files[0]!];
    expect(() => parseP7SharedPlayerGraphAttestation(
      canonicalizeJson(reordered),
    )).toThrow("file order");
  });

  it("rejects graph-shape drift and robustly rejects null input", async () => {
    const input = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(input.viteManifestBytes));
    manifest["src/bootstrap/browser/p7bReplayPlayer.tsx"].file = "assets/renamed.js";
    await expect(buildP7SharedPlayerGraphAttestation({
      ...input,
      viteManifestBytes: encoder.encode(canonicalizeJson(manifest)),
    })).rejects.toThrow("fixed entry drifted");
    expect(() => parseP7SharedPlayerGraphAttestation("null")).toThrow("must be an object");
  });
});
