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
const EXPECTED_ROOMS = [
  [1, ["failed-wall-facing", "dirt-and-gravel", "red-key-and-door", "hint-lifecycle"]],
  [2, ["successful-push", "blocked-push", "side-slap", "block-into-water"]],
  [3, ["ordinary-n-plus-two", "immediate-vacancy", "gravel-containment", "exit-player-only"]],
  [4, ["red-door", "blue-door", "yellow-door", "green-reusable"]],
  [5, ["wrong-color-door", "multiple-finite-keys", "blue-key-fragility", "nonplayer-key-rules"]],
  [6, ["header-field-override", "socket-short", "socket-exact", "multiple-sockets"]],
  [76, ["socket-zero", "north-east-support", "south-west-support", "south-east-support"]],
  [7, ["water-and-fire-tools", "ice-and-force-tools", "duplicate-tools", "thief-sequence"]],
  [8, ["player-water", "player-fire", "block-water", "block-fire"]],
  [9, ["glider-water-loop", "non-glider-water-lanes", "fireball-fire-loop", "other-mobs-fire-lanes"]],
  [10, ["nonplayer-bombs", "player-bomb-losses", "water-layer-order", "collision-before-contact"]],
  [11, ["ordinary-and-invisible", "invisible-nonplayer-and-slap", "blue-wall-identities", "appearing-wall"]],
  [12, ["static-art-gallery", "panel-edges", "popup-departure-counts", "recessed-blue-and-admission"]],
  [13, ["direct-north-east", "direct-south-west", "failed-four-directions", "occupied-destinations"]],
  [14, ["ordered-east-south", "ordered-south-east", "four-slap-orientations", "slap-rejections-and-reveal"]],
  [15, ["ordinary-dependent-follow", "count-one-recessed-source", "count-two-popup-source", "rejected-departure-is-atomic"]],
  [16, ["ordinary-and-ice-destinations", "force-and-gravel-destinations", "external-push-overrides", "terrain-contact-and-push-audio"]],
] as const;

const EXPECTED_SCENARIO_IDS = `
blocks.blocked-primary-no-slap
blocks.blocked-push
blocks.blocked-slap-keeps-primary
blocks.dependent-follow-normal
blocks.dependent-popup-one
blocks.dependent-popup-two
blocks.direct-four-directions
blocks.direct-push
blocks.external-push-off-force
blocks.external-push-off-ice
blocks.failed-four-directions
blocks.monster-destination-rejects
blocks.ordered-slap-es
blocks.ordered-slap-se
blocks.push-audio-boundary
blocks.push-onto-force
blocks.push-onto-gravel
blocks.push-onto-ice
blocks.push-onto-ordinary
blocks.rejected-departure-no-start-exit
blocks.second-block-rejects
blocks.side-slap
blocks.slap-all-quadrants
blocks.slap-reveal
blocks.terrain-driven-contact
blocks.water-fill
foundation.dirt-and-gravel
foundation.exit-player-only
foundation.failed-wall-facing
foundation.gravel-containment
foundation.immediate-vacancy
foundation.ordinary-n-plus-two
foundation.red-key-door
foundation.room-specific-hint
hazards.block-bomb
hazards.block-fire
hazards.block-water
hazards.blocking-before-hostile
hazards.exit-plus-bomb
hazards.fire-boots-fire
hazards.fireball-fire
hazards.flippers-water
hazards.glider-water
hazards.hostiles-do-not-annihilate
hazards.loss-order
hazards.monster-bomb
hazards.non-glider-water
hazards.other-mobs-fire
hazards.player-bomb
hazards.player-fire
hazards.player-water
hazards.water-plus-key
inventory.blue-door
inventory.blue-key-fragile-block
inventory.blue-key-fragile-monster
inventory.dat-thief-tools-only
inventory.duplicate-tools
inventory.fire-boots-pickup
inventory.flippers-pickup
inventory.force-boots-pickup
inventory.green-key-acting-dirt
inventory.green-reusable
inventory.ice-skates-pickup
inventory.multiple-finite-keys
inventory.red-door
inventory.red-key-passive-nonplayer
inventory.thief-door-same-cell
inventory.thief-empty-repeat
inventory.wrong-color-door
inventory.yellow-door
inventory.yellow-key-acting-dirt
objectives.header-field-override
objectives.multiple-sockets
objectives.socket-exact
objectives.socket-short
objectives.socket-zero
panels.cardinal-entry-exit
panels.southeast-corner
walls.block-blue-real-count-one
walls.blue-fake
walls.blue-real
walls.invisible-appearing
walls.ordinary
walls.permanent-invisible-54-56
walls.permanent-invisible-monster
walls.permanent-invisible-player
walls.permanent-invisible-slap
walls.popup-admission
walls.popup-block-count-two
walls.popup-player
walls.static-art-51-53-57-59
walls.static-art-60-63
`.trim().split(/\s+/u);

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

  it("publishes one room-specific Hint message for every PR3 scenario room", async () => {
    const hints = parseLegacyDatSandboxHints(
      new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json"))),
    );

    expect(hints.datSha256).toBe(LEGACY_DAT_SANDBOX_DAT_SHA256);
    expect(hints.levelCount).toBe(17);
    expect(hints.levels.map((level) => [
      level.expectedNumber,
      level.rooms.map((room) => room.roomId),
    ])).toEqual(EXPECTED_ROOMS);
    expect(hints.levels.flatMap((level) => level.rooms)).toHaveLength(68);
  });

  it("indexes every SHA-bound HCR1 proof against enriched native levels", async () => {
    const index = parseLegacyDatSandboxReplayIndex(
      new Uint8Array(await readFile(asset("replay-index.json"))),
    );

    expect(index).toMatchObject({
      datSha256: LEGACY_DAT_SANDBOX_DAT_SHA256,
      hintSupplementSha256: LEGACY_DAT_SANDBOX_HINTS_SHA256,
      ruleset: "1.0.13",
    });
    expect(index.replays).toHaveLength(74);
    expect(new Set(index.replays.map((replay) => replay.id)).size).toBe(74);
    expect(new Set(index.replays.map((replay) => replay.levelNumber))).toEqual(
      new Set(EXPECTED_ROOMS.map(([number]) => number)),
    );
    expect(index.replays.filter((replay) => replay.expectedOutcome === "win")).toHaveLength(67);
    expect(index.replays.filter((replay) => replay.expectedOutcome === "loss")).toHaveLength(7);
    expect(index.replays.every((replay) => replay.path.startsWith("replays/1.0.13/"))).toBe(true);
    const scenarioIds = index.replays.flatMap((replay) => replay.scenarioIds);
    expect(scenarioIds).toHaveLength(92);
    expect(new Set(scenarioIds).size).toBe(92);
    expect([...scenarioIds].sort()).toEqual(EXPECTED_SCENARIO_IDS);
  });

  it("rejects duplicate scenario coverage instead of silently shrinking the corpus", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));
    index.replays[1].scenarioIds[0] = index.replays[0].scenarioIds[0];

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("duplicate scenario IDs");
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
