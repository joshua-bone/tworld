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
  [17, ["initial-player-on-ice", "initial-monsters-on-ice", "initial-block-on-ice", "first-arrivals-are-fast"]],
  [18, ["skates-make-ice-ordinary", "straight-ice-owns-forward", "blocked-forward-reverses", "fully-blocked-ice-retries"]],
  [19, ["north-corners", "corner-reverse-fallbacks", "south-corners", "fully-blocked-corner"]],
  [20, ["eight-cell-continuous-slide", "ice-to-floor-readiness", "block-autoslide-is-not-pushing", "slow-mobs-and-sliding-tank"]],
  [21, ["initial-player-force-owner", "initial-hostile-force-owners", "initial-block-force-owner", "force-arrivals-and-boots"]],
  [22, ["open-arrow-wins", "blocked-arrow-fallbacks", "blocked-arrival-retry", "constructed-force-has-no-arrival-offer"]],
  [23, ["boost-destination-matrix", "hostiles-never-player-override", "tunnel-clearance", "boost-to-floor-continuity"]],
  [24, ["random-fixed-permutations", "random-automatic-before-input", "random-all-blocked-retry", "mixed-tracks-and-destinations"]],
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
force.arrival-all-blocked
force.automatic-push-wins
force.blocked-backward-boost
force.blocked-sideways-boost
force.boost-destination-matrix
force.boots-make-ordinary
force.constructed-no-arrival-offer
force.exit-to-floor-continuity
force.first-monster-arrival-fast
force.first-player-arrival-fast
force.initial-block-owned
force.initial-monster-owned
force.initial-player-owned
force.mob-never-player-overrides
force.open-auto-beats-input
force.random-all-blocked-retry
force.random-fixed-permutation
force.random-open-beats-input
force.tunnel-clearance
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
ice.block-silent-autoslide
ice.blocked-reverse
ice.corner-fully-blocked
ice.corner-ne
ice.corner-nw
ice.corner-reverse-fallback
ice.corner-se
ice.corner-sw
ice.exit-to-floor-continuity
ice.first-block-arrival-fast
ice.first-monster-arrival-fast
ice.first-player-arrival-fast
ice.fully-blocked-retry
ice.initial-block-stationary
ice.initial-monster-ordinary
ice.initial-player-ordinary
ice.long-slide-continuity
ice.skates-arrival-ordinary
ice.slow-mob-terrain-control
ice.straight-owned-forward
ice.tank-reversal-suppressed-while-sliding
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
sliding.boot-pickup-on-terrain
sliding.hazard-destination-cross-section
sliding.ice-force-handoff
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

  it("publishes one room-specific Hint message for every PR4 scenario room", async () => {
    const hints = parseLegacyDatSandboxHints(
      new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json"))),
    );

    expect(hints.datSha256).toBe(LEGACY_DAT_SANDBOX_DAT_SHA256);
    expect(hints.levelCount).toBe(25);
    expect(hints.levels.map((level) => [
      level.expectedNumber,
      level.rooms.map((room) => room.roomId),
    ])).toEqual(EXPECTED_ROOMS);
    expect(hints.levels.flatMap((level) => level.rooms)).toHaveLength(100);

    const trickWalls = hints.levels.find((level) => level.expectedNumber === 11)!;
    expect(trickWalls.rooms.find((room) => room.roomId === "ordinary-and-invisible"))
      .toEqual({
        roomId: "ordinary-and-invisible",
        message: "The ball in the small enclosure intentionally presses the ordinary wall to its right; it causes no reveal. Below, Player can press the visible ordinary wall on the left or a hidden permanent wall on the right. Both block; only the hidden wall flashes.",
        targets: [{ kind: "tile", x: 8, y: 11 }],
      });
  });

  it("indexes terminal HCR1 proofs and metadata-only bounded evidence", async () => {
    const index = parseLegacyDatSandboxReplayIndex(
      new Uint8Array(await readFile(asset("replay-index.json"))),
    );

    expect(index).toMatchObject({
      datSha256: LEGACY_DAT_SANDBOX_DAT_SHA256,
      hintSupplementSha256: LEGACY_DAT_SANDBOX_HINTS_SHA256,
      ruleset: "1.0.15",
    });
    expect(index.replays).toHaveLength(126);
    expect(new Set(index.replays.map((replay) => replay.id)).size).toBe(126);
    expect(new Set(index.replays.map((replay) => replay.levelNumber))).toEqual(
      new Set(EXPECTED_ROOMS.map(([number]) => number)),
    );
    expect(index.replays.filter((replay) => replay.expectedOutcome === "win")).toHaveLength(118);
    expect(index.replays.filter((replay) => replay.expectedOutcome === "loss")).toHaveLength(8);
    expect(index.replays.every((replay) => replay.path.startsWith("replays/1.0.15/"))).toBe(true);

    const terminalScenarioIds = index.replays.flatMap((replay) => replay.scenarioIds);
    expect(terminalScenarioIds).toHaveLength(144);
    expect(new Set(terminalScenarioIds).size).toBe(134);
    expect(terminalScenarioIds).not.toContain("force.random-all-blocked-retry");

    expect(index.boundedProofs).toEqual([expect.objectContaining({
      id: "random-all-blocked-retry",
      entryId: "random-force-and-mixed-tracks",
      entryOrdinal: 25,
      levelNumber: 24,
      seed: 24005,
      verifiedThroughBoundary: 52,
      expectedOutcome: "unfinished",
      scenarioIds: ["force.random-all-blocked-retry"],
    })]);
    expect(new Set([
      ...index.replays.map((replay) => replay.id),
      ...index.boundedProofs.map((proof) => proof.id),
    ]).size).toBe(127);
    const coveredScenarioIds = [
      ...terminalScenarioIds,
      ...index.boundedProofs.flatMap((proof) => proof.scenarioIds),
    ];
    expect(new Set(coveredScenarioIds).size).toBe(135);
    expect([...new Set(coveredScenarioIds)].sort()).toEqual(EXPECTED_SCENARIO_IDS);
  });

  it("allows scenario matrix coverage across runs but rejects duplicates within one proof", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).not.toThrow();

    index.replays[0].scenarioIds.push(index.replays[0].scenarioIds[0]);

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("Legacy DAT Sandbox replay 0 contains duplicate scenario IDs");
  });

  it("rejects proof IDs duplicated between terminal and bounded evidence", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));
    index.boundedProofs[0].id = index.replays[0].id;

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("duplicate proof IDs");
  });

  it("rejects duplicate terminal HCR1 paths", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));
    index.replays[1].path = index.replays[0].path;

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("duplicate replay paths");
  });

  it("rejects any HCR1 path attached to bounded evidence", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));
    index.boundedProofs[0].path = "replays/1.0.15/random-all-blocked-retry.hcr1";

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("must not name an HCR1 path");
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
