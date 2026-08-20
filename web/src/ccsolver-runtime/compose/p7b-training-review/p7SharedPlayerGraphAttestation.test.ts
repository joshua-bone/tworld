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

  it("ignores manifest entries outside the reachable replay-player graph", async () => {
    const input = fixture();
    const first = await buildP7SharedPlayerGraphAttestation(input);
    const manifest = JSON.parse(new TextDecoder().decode(input.viteManifestBytes));
    manifest["unrelated.ts"] = {
      file: "assets/unrelated-renamed.js",
      isEntry: true,
      src: "unrelated.ts",
    };
    const second = await buildP7SharedPlayerGraphAttestation({
      ...input,
      viteManifestBytes: encoder.encode(canonicalizeJson(manifest)),
    });

    expect(canonicalizeP7SharedPlayerGraphAttestation(second))
      .toBe(canonicalizeP7SharedPlayerGraphAttestation(first));
  });

  it("accepts traversal-shaped Vite lookup keys while keeping emitted paths confined", async () => {
    const input = fixture();
    const manifest = JSON.parse(new TextDecoder().decode(input.viteManifestBytes));
    manifest["src/bootstrap/browser/p7bReplayPlayer.tsx"].imports.push(
      "../data/CCLP1.dat?url",
    );
    manifest["../data/CCLP1.dat?url"] = {
      file: "assets/CCLP1-a1b2.js",
      assets: ["assets/CCLP1-c3d4.dat"],
    };
    const withRealViteKey = {
      ...input,
      viteManifestBytes: encoder.encode(canonicalizeJson(manifest)),
      builtFiles: [...input.builtFiles, {
        path: "assets/CCLP1-a1b2.js",
        bytes: encoder.encode("export default '/assets/CCLP1-c3d4.dat';\n"),
      }, {
        path: "assets/CCLP1-c3d4.dat",
        bytes: Uint8Array.of(4, 5, 6),
      }],
    };

    await expect(buildP7SharedPlayerGraphAttestation(withRealViteKey))
      .resolves.toMatchObject({ totals: { fileCount: 6 } });

    for (const unsafeDescriptor of [
      { file: "../outside.js" },
      { file: "assets/CCLP1-a1b2.js", assets: ["../outside.dat"] },
    ]) {
      const hostile = structuredClone(manifest);
      hostile["../data/CCLP1.dat?url"] = unsafeDescriptor;
      await expect(buildP7SharedPlayerGraphAttestation({
        ...withRealViteKey,
        viteManifestBytes: encoder.encode(canonicalizeJson(hostile)),
      })).rejects.toThrow("unsafe");
    }
  });

  it("rejects missing and unbounded fake Vite lookup keys", async () => {
    const input = fixture();
    for (const fakeKey of ["../data/not-in-the-manifest.dat?url", `../data/${"x".repeat(2_048)}.dat?url`]) {
      const manifest = JSON.parse(new TextDecoder().decode(input.viteManifestBytes));
      manifest["src/bootstrap/browser/p7bReplayPlayer.tsx"].imports.push(fakeKey);
      if (fakeKey.length > 2_048) manifest[fakeKey] = { file: "assets/fake.js" };
      await expect(buildP7SharedPlayerGraphAttestation({
        ...input,
        viteManifestBytes: encoder.encode(JSON.stringify(manifest)),
      })).rejects.toThrow(fakeKey.length > 2_048 ? "invalid" : "missing");
    }
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
