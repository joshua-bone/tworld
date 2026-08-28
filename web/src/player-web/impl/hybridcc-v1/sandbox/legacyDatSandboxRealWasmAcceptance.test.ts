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
const ACCEPTANCE_TIMEOUT_MS = 30_000;
const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url);

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
  it("converts DAT, applies every room hint, verifies HCR1, and plays each reference to a win", async () => {
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

    expect(loaded.gameplayHashes).toEqual([
      "7c6ae9dcb65bbd38c17b2e776e982c606f8facc4a5ae64b251bb635ee9b69663",
      "e66139ee3370c94fb0c45b0c0f736b7ea22e9a81cee3a4fb5af37ca4df29f35a",
    ]);
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
      expect(session.frame.snapshot.status, replay.id).toBe("completed");
      expect(session.run.result?.outcome, replay.id).toBe("completed-clean");
      const expectedMessages = hints.levels
        .find((level) => level.expectedNumber === replay.levelNumber)!
        .rooms.map((room) => room.message);
      const shownMessages = hintTransitions.filter((text): text is string => text !== null);
      expect(new Set(shownMessages), `${replay.id} displayed room hints`).toEqual(new Set(expectedMessages));
      for (const message of expectedMessages) {
        const shownAt = hintTransitions.indexOf(message);
        expect(shownAt, `${replay.id} showed ${message}`).toBeGreaterThanOrEqual(0);
        expect(hintTransitions.slice(shownAt + 1), `${replay.id} cleared ${message}`).toContain(null);
      }
      const lifecycleMessage = hints.levels[0]!.rooms
        .find((room) => room.roomId === "hint-lifecycle")?.message;
      if (replay.levelNumber === 1 && lifecycleMessage) {
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
