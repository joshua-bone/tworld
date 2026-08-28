import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import createHybridCcV1Module from "@player-web/impl/hybridcc-v1/engine/hybridcc_v1_wasm.js";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
  type HybridCcV1EngineFactory,
} from "@player-web/impl/hybridcc-v1/HybridCcV1GameEngineAdapter";
import {
  compileHybridCcV1Run,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  decodeHybridCcV1Replay,
  verifyHybridCcV1Replay,
  type HybridCcV1WasmModule,
} from "@player-web/impl/hybridcc-v1/wasmBridge";
import {
  LEGACY_DAT_SANDBOX_ASSET_ID,
  loadLegacyDatSandbox,
  parseLegacyDatSandboxHints,
  type LegacyDatSandboxAssetSource,
} from "./legacyDatSandbox";

const SERIES_FILE = "hybrid-v1:sandbox:legacy_dat_sandbox";
const ACCEPTANCE_TIMEOUT_MS = 60_000;
const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url);
const EXPECTED_GAMEPLAY_HASHES = [
  "7c6ae9dcb65bbd38c17b2e776e982c606f8facc4a5ae64b251bb635ee9b69663",
  "e66139ee3370c94fb0c45b0c0f736b7ea22e9a81cee3a4fb5af37ca4df29f35a",
  "53a6bab579099f80730957fa62078853b46064929472d2ca4a8226bd2eb3ef6e",
  "6cf0d51eaf034605c93043580c0e6d5a72d50eadc5edb1a9bfc9817cd99942dc",
  "be5737439f9a4bcb73f2fac89d055deeb25dbcdd538a6e66157e8e68a4596c0d",
  "61fa05a5fc83286d88d7dba3f03678a2fda85088cf660c948a6d5ff4377b53ed",
  "db6684cf92ee118f40ebce5bb298ad412dd826857ba68c24e3dc2bc2d802a716",
  "d85d655d140483254a761f64408e3eeb3dc33b1166176c8b3be73cc2b8cd75dc",
  "22c4fd40f69aba84893c8a92e911737ab86a38c606d4049d8366a224e754397a",
  "4d0ba6755c098a984f1207a01c4ed2b7cca5ab0856f11db7152bb62a578635e1",
  "4a2bbe22b44eeb695dc945db63956064f492a4a739c3e424e61ad2b6d98aaa49",
  "e4bf453b7554e01ff58abaa32076f3011ba77c62ccadf221598a49be765eb7d9",
  "813ab4bf23148e2d86957ed6310e7911bcfd699a234031b4d8a1f2cb33ecc7bc",
] as const;

async function loadModule(): Promise<HybridCcV1WasmModule> {
  const wasmUrl = new URL("../engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

function filesystemAssetSource(): LegacyDatSandboxAssetSource {
  return {
    assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
    async loadDatBytes() {
      return new Uint8Array(await readFile(asset("legacy_dat_sandbox.dat")));
    },
    async loadHintBytes() {
      return new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json")));
    },
    async loadReplayIndexBytes() {
      return new Uint8Array(await readFile(asset("replay-index.json")));
    },
    async loadReplayBytes(path) {
      return new Uint8Array(await readFile(asset(path)));
    },
  };
}

function factory(module: HybridCcV1WasmModule): HybridCcV1EngineFactory {
  return {
    create: (level, seed) => createHybridCcV1Engine(module, level.nativeLevel, seed),
    decodeReplay: (bytes) => decodeHybridCcV1Replay(module, bytes),
    verifyReplay: (level, bytes) => verifyHybridCcV1Replay(module, level.nativeLevel, bytes),
    compileRun: (level, seed, inputs, checkpointMode) => (
      compileHybridCcV1Run(module, level.nativeLevel, seed, inputs, checkpointMode)
    ),
  };
}

describe("Legacy DAT Sandbox real-Wasm browser acceptance", () => {
  it("converts DAT, applies every room hint, and plays all HCR1 proofs to their declared outcomes", async () => {
    const module = await loadModule();
    const source = filesystemAssetSource();
    const [datBytes, hintBytes] = await Promise.all([
      source.loadDatBytes(),
      source.loadHintBytes(),
    ]);
    const conversion = convertHybridCcV1Dat(module, datBytes);
    const converted = conversion.entries.filter((entry) => entry.status === 0);
    const loaded = await loadLegacyDatSandbox(module, source, datBytes, converted);
    const hints = parseLegacyDatSandboxHints(hintBytes);

    expect(conversion.fileStatus).toBe(0);
    expect(converted).toHaveLength(13);
    expect(conversion.entries.every((entry) => entry.status === 0)).toBe(true);
    expect(conversion.diagnostics).toHaveLength(4);
    expect(conversion.diagnostics).toEqual(expect.arrayContaining(
      [60, 61, 62, 63].map((tileCode) => expect.objectContaining({
        severity: 0,
        entryOrdinal: 13,
        levelNumber: 12,
        tileCode,
        code: "dat.sanitized_swimming_player_art",
      })),
    ));
    expect(loaded.gameplayHashes).toEqual(EXPECTED_GAMEPLAY_HASHES);
    expect(loaded.referenceReplays).toHaveLength(52);
    expect(loaded.referenceReplays.filter((replay) => replay.expectedOutcome === "win"))
      .toHaveLength(46);
    expect(loaded.referenceReplays.filter((replay) => replay.expectedOutcome === "loss"))
      .toHaveLength(6);
    for (const [index, level] of loaded.levels.entries()) {
      const expectedMessages = hints.levels[index]!.rooms.map((room) => room.message);
      expect(level.nativeLevel.texts).toEqual(expectedMessages);
    }

    const registry = new HybridCcV1LevelRegistry();
    registry.register(SERIES_FILE, loaded.levels);
    for (const replay of loaded.referenceReplays) {
      const adapter = new HybridCcV1GameEngineAdapter(registry, factory(module));
      let session = await adapter.startOpaqueReplaySession(
        {
          seriesFile: SERIES_FILE,
          levelNumber: replay.levelNumber,
          ruleset: "Hybrid",
        },
        { format: "hcr1", bytes: replay.bytes },
      );
      const hintTransitions: Array<string | null> = [session.hintText];
      for (let sample = 0; sample < 2_000 && session.frame.snapshot.status === "playing"; sample += 1) {
        session = await adapter.advanceSession(session, "none");
        const hintText = session.hintText;
        if (hintTransitions.at(-1) !== hintText) hintTransitions.push(hintText);
      }
      const expectedStatus = replay.expectedOutcome === "win" ? "completed" : "failed";
      const expectedRunOutcome = replay.expectedOutcome === "win" ? "completed-clean" : "failed";
      expect(session.frame.snapshot.status, replay.id).toBe(expectedStatus);
      expect(session.run.result?.outcome, replay.id).toBe(expectedRunOutcome);
      const expectedMessages = hints.levels
        .find((level) => level.expectedNumber === replay.levelNumber)!
        .rooms.map((room) => room.message);
      const shownMessages = hintTransitions.filter((text): text is string => text !== null);
      expect(
        shownMessages.every((message) => expectedMessages.includes(message)),
        `${replay.id} displayed only hints from its own level`,
      ).toBe(true);
      const lifecycleMessage = hints.levels[0]!.rooms
        .find((room) => room.roomId === "hint-lifecycle")?.message;
      if (replay.id === "foundation-tour" && lifecycleMessage) {
        expect(new Set(shownMessages), "foundation-tour displayed all four room hints")
          .toEqual(new Set(expectedMessages));
        expect(shownMessages.filter((message) => message === lifecycleMessage)).toHaveLength(2);
      }
      await adapter.disposeSession(session);
    }
  }, ACCEPTANCE_TIMEOUT_MS);

  it("rejects an altered bundled HCR1 before publishing any references", async () => {
    const module = await loadModule();
    const files = filesystemAssetSource();
    const datBytes = await files.loadDatBytes();
    const conversion = convertHybridCcV1Dat(module, datBytes);
    const converted = conversion.entries.filter((entry) => entry.status === 0);
    const source: LegacyDatSandboxAssetSource = {
      ...files,
      async loadReplayBytes(path) {
        const bytes = await files.loadReplayBytes(path);
        if (path.endsWith("1-foundation-tour.hcr1")) bytes[bytes.length - 1] ^= 1;
        return bytes;
      },
    };

    await expect(loadLegacyDatSandbox(module, source, datBytes, converted))
      .rejects.toThrow("failed its byte identity check");
  }, ACCEPTANCE_TIMEOUT_MS);
});
