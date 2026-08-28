import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { HybridCcV1WasmModule } from "@player-web/impl/hybridcc-v1/wasmBridge";
import engineManifest from "../engine/engine-manifest.json";
import assetManifest from "./assets/assets-manifest.json";
import {
  LEGACY_DAT_SANDBOX_ASSET_ID,
  LEGACY_DAT_SANDBOX_DAT_SHA256,
  LEGACY_DAT_SANDBOX_HINTS_SHA256,
  LEGACY_DAT_SANDBOX_REPLAY_INDEX_SHA256,
  loadLegacyDatSandbox,
  parseLegacyDatSandboxHints,
  parseLegacyDatSandboxReplayIndex,
  type LegacyDatSandboxAssetSource,
} from "./legacyDatSandbox";

const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url);

describe("Legacy DAT Sandbox sidecars", () => {
  it("pins browser assets to the same reviewed source commit as the Wasm engine", () => {
    expect(assetManifest).toMatchObject({
      schema: "hybridcc.legacy-dat-sandbox.browser-assets.v1",
      sourceRepository: engineManifest.sourceRepository,
      sourceCommit: engineManifest.sourceCommit,
    });
    expect(Object.fromEntries(assetManifest.files.map((file) => [file.path, file.sha256]))).toMatchObject({
      "legacy_dat_sandbox.dat": LEGACY_DAT_SANDBOX_DAT_SHA256,
      "legacy_dat_sandbox.hints.json": LEGACY_DAT_SANDBOX_HINTS_SHA256,
      "replay-index.json": LEGACY_DAT_SANDBOX_REPLAY_INDEX_SHA256,
    });
  });

  it("publishes one room-specific Hint message for every PR1 scenario room", async () => {
    const hints = parseLegacyDatSandboxHints(
      new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json"))),
    );

    expect(hints.datSha256).toBe(LEGACY_DAT_SANDBOX_DAT_SHA256);
    expect(hints.levelCount).toBe(2);
    expect(hints.levels.map((level) => level.rooms.length)).toEqual([4, 4]);
    expect(hints.levels.flatMap((level) => level.rooms).map((room) => room.roomId)).toEqual([
      "failed-wall-facing",
      "dirt-and-gravel",
      "red-key-and-door",
      "hint-lifecycle",
      "successful-push",
      "blocked-push",
      "side-slap",
      "block-into-water",
    ]);
  });

  it("indexes both SHA-bound HCR1 tour replays against enriched native levels", async () => {
    const index = parseLegacyDatSandboxReplayIndex(
      new Uint8Array(await readFile(asset("replay-index.json"))),
    );

    expect(index).toMatchObject({
      datSha256: LEGACY_DAT_SANDBOX_DAT_SHA256,
      hintSupplementSha256: LEGACY_DAT_SANDBOX_HINTS_SHA256,
      ruleset: "1.0.12",
    });
    expect(index.replays.map((replay) => [replay.id, replay.levelNumber, replay.expectedOutcome])).toEqual([
      ["foundation-tour", 1, "win"],
      ["block-tour", 2, "win"],
    ]);
  });

  it("rejects altered DAT bytes before invoking the native hint-overlay API", async () => {
    const [datBytes, hintBytes, indexBytes] = await Promise.all([
      readFile(asset("legacy_dat_sandbox.dat")),
      readFile(asset("legacy_dat_sandbox.hints.json")),
      readFile(asset("replay-index.json")),
    ]);
    const changedDat = new Uint8Array(datBytes);
    changedDat[changedDat.length - 1] ^= 1;
    const source: LegacyDatSandboxAssetSource = {
      assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
      async loadDatBytes() { return new Uint8Array(datBytes); },
      async loadHintBytes() { return new Uint8Array(hintBytes); },
      async loadReplayIndexBytes() { return new Uint8Array(indexBytes); },
      async loadReplayBytes() { throw new Error("must not load a replay for a mismatched DAT"); },
    };

    await expect(loadLegacyDatSandbox(
      {} as HybridCcV1WasmModule,
      source,
      changedDat,
      [],
    )).rejects.toThrow("do not match their pinned SHA-256 identities");
  });

  it("pins all three built-in supplement identities, including the replay index itself", async () => {
    const [datBytes, hintBytes, indexBytes] = await Promise.all([
      readFile(asset("legacy_dat_sandbox.dat")),
      readFile(asset("legacy_dat_sandbox.hints.json")),
      readFile(asset("replay-index.json")),
    ]);
    const changedIndex = new Uint8Array([...indexBytes, 0x0a]);
    const source: LegacyDatSandboxAssetSource = {
      assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
      async loadDatBytes() { return new Uint8Array(datBytes); },
      async loadHintBytes() { return new Uint8Array(hintBytes); },
      async loadReplayIndexBytes() { return changedIndex; },
      async loadReplayBytes() { throw new Error("must not load a replay for a mismatched index"); },
    };

    expect(LEGACY_DAT_SANDBOX_REPLAY_INDEX_SHA256).toHaveLength(64);
    await expect(loadLegacyDatSandbox(
      {} as HybridCcV1WasmModule,
      source,
      new Uint8Array(datBytes),
      [],
    )).rejects.toThrow("do not match their pinned SHA-256 identities");
  });

  it("rejects altered room-hint bytes before invoking the native overlay API", async () => {
    const [datBytes, hintBytes, indexBytes] = await Promise.all([
      readFile(asset("legacy_dat_sandbox.dat")),
      readFile(asset("legacy_dat_sandbox.hints.json")),
      readFile(asset("replay-index.json")),
    ]);
    const changedHints = new Uint8Array([...hintBytes, 0x0a]);
    const source: LegacyDatSandboxAssetSource = {
      assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
      async loadDatBytes() { return new Uint8Array(datBytes); },
      async loadHintBytes() { return changedHints; },
      async loadReplayIndexBytes() { return new Uint8Array(indexBytes); },
      async loadReplayBytes() { throw new Error("must not load a replay for mismatched hints"); },
    };

    await expect(loadLegacyDatSandbox(
      {} as HybridCcV1WasmModule,
      source,
      new Uint8Array(datBytes),
      [],
    )).rejects.toThrow("do not match their pinned SHA-256 identities");
  });
});
