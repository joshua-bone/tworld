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

const EXPECTED_PR8_LEVELS = [
  [26, 25, "Toggle Basics", ["closed-open-closed", "open-closed-open", "global-fanout", "any-actor-press"]],
  [27, 26, "Toggle Boundaries", ["same-boundary-parity", "close-under-occupant", "closed-rejects-all", "snapshot-drives-art"]],
  [28, 27, "Tanks and Button Edges", ["blue-global-reversal", "cooldown-reversal", "terrain-owned-tanks", "actor-generic-button-edges"]],
  [29, 28, "Trap Player Release", ["starts-holding", "player-intent-and-facing", "retry-variant-guide", "release-observation"]],
  [30, 128, "Trap Player Blocked Retry", ["blocked-then-open", "support-ne", "support-sw", "support-se"]],
  [31, 29, "Trap Pushables", ["direct-push-player-first", "no-intent-facing", "ordered-variant-guide", "rejection-variant-guide"]],
  [32, 129, "Trap Direct Push Block First", ["direct-push-block-first", "support-ne", "support-sw", "support-se"]],
  [33, 130, "Trap Side Slap Player First", ["side-slap-player-first", "support-ne", "support-sw", "support-se"]],
  [34, 131, "Trap Side Slap Block First", ["side-slap-block-first", "support-ne", "support-sw", "support-se"]],
  [35, 132, "Trap Rejected Push Fallback", ["rejected-push-fallback", "support-ne", "support-sw", "support-se"]],
  [36, 30, "Trap Monster Cadence", ["monster-facing-first", "monster-ai-fallback", "slow-cooldown-gate", "slow-release-after-cooldown"]],
  [37, 31, "Trap Links and Handoffs", ["unlinked-and-linked-control", "staggered-components-and-fanout", "release-state-prerequisites", "handoff-variant-guide"]],
  [38, 133, "Trap Actor Button Links", ["actor-specific-button-edges", "support-ne", "support-sw", "support-se"]],
  [39, 134, "Trap Rehold Before Planning", ["rehold-before-planning", "support-ne", "support-sw", "support-se"]],
  [40, 135, "Trap Rehold After StartMove", ["accepted-departure-survives-rehold", "support-ne", "support-sw", "support-se"]],
  [41, 136, "Trap Reopen Fresh State", ["rehold-then-fresh-reopen", "support-ne", "support-sw", "support-se"]],
  [42, 137, "Trap Slide Player Handoff", ["player-slide-to-released-trap", "support-ne", "support-sw", "support-se"]],
  [43, 138, "Trap Slide Block Handoff", ["block-slide-to-released-trap", "support-ne", "support-sw", "support-se"]],
  [44, 139, "Trap Slide Monster Handoff", ["monster-slide-to-released-trap", "support-ne", "support-sw", "support-se"]],
  [45, 32, "Cloner Gallery", ["classic-cloner-gallery"]],
  [46, 33, "Cloner Activation", ["player-presses-red", "nonplayer-presses-red", "blocked-edge-consumption", "occupied-source-solid"]],
  [47, 34, "Cloner Destinations", ["logical-visual-continuity", "ordinary-and-ice", "force-destination", "teleport-destination"]],
  [48, 35, "Cloner Ordering", ["player-before-later-source", "source-before-player", "nonplayer-order-preserved", "unrelated-player-control"]],
  [49, 36, "Cloner Consequences", ["water-and-fire", "bomb-destination", "player-contact", "components-and-generations"]],
] as const;

const EXPECTED_PR9_LEVELS = [
  [50, 37, "Teleport Player Activation", ["player-activation-boundaries"]],
  [51, 140, "Teleport Initial Monsters", ["initial-monster-gallery"]],
  [52, 141, "Teleport Initial Block", ["initial-block-loop"]],
  [53, 38, "Teleport Local Departure", ["player-source-last-open"]],
  [54, 142, "Teleport Local Monster", ["mob-source-last-open"]],
  [55, 143, "Teleport Blocked Player", ["blocked-source-player-intent"]],
  [56, 144, "Teleport Blocked Monster AI", ["blocked-source-ai-fallback"]],
  [57, 39, "Teleport Dormancy", ["failure-then-topology-opening"]],
  [58, 145, "Teleport Exit and Reentry", ["exit-and-fresh-entry"]],
  [59, 146, "Teleport Per-Actor Dormancy", ["same-pad-two-actors"]],
  [60, 40, "Teleport Remote Departure", ["two-pad-remote-normal"]],
  [61, 147, "Teleport Source Last", ["remote-blocked-source-open"]],
  [62, 148, "Teleport Cyclic Y-X Order", ["four-pad-cyclic-network"]],
  [63, 41, "Teleport Partial Posting", ["one-blocked-candidate", "many-blocked-candidates", "closed-device-candidates", "panel-edge-candidates"]],
  [64, 42, "Teleport Remote Trick Walls", ["remote-trick-wall-transactions"]],
  [65, 149, "Teleport Source Trick Walls", ["source-local-trick-walls"]],
  [66, 43, "Teleport Key Personalities", ["remote-key-matrix"]],
  [67, 150, "Teleport Gravel Personalities", ["remote-gravel-matrix"]],
  [68, 151, "Teleport Hazard Personalities", ["remote-hazard-matrix"]],
  [69, 162, "Teleport Remote Push", ["remote-block-push"]],
  [70, 152, "Teleport Push Rollback", ["dependent-push-rejection"]],
  [71, 153, "Teleport Source Push", ["source-block-push"]],
  [72, 44, "Teleport Occupancy", ["occupied-remote-exits"]],
  [73, 154, "Teleport Atomic Rejections", ["all-rejections-atomic"]],
  [74, 163, "Teleport Into Player", ["remote-exit-player-contact"]],
  [75, 45, "Teleport Self Return Actors", ["player-self-return", "block-self-return", "monster-self-return", "support-se"]],
  [76, 46, "Teleport Self Return Lifecycle", ["self-return-lifecycle", "support-ne", "support-sw", "support-se"]],
  [77, 155, "Teleport Self Return Toggle", ["self-return-blocked-later", "support-ne", "support-sw", "support-se"]],
  [78, 47, "Teleport Race Order A", ["order-a-and-next-pad"]],
  [79, 156, "Teleport Race Order B", ["order-b"]],
  [80, 157, "Teleport Race Loser Failure", ["loser-total-failure"]],
  [81, 48, "Teleport Dynamic Toggle", ["dynamic-toggle-exits"]],
  [82, 158, "Teleport Dynamic Occupancy", ["dynamic-occupancy"]],
  [83, 49, "Teleport Destination Handoffs", ["ordinary-destination", "ice-destination", "force-destination", "matching-boots-destinations"]],
  [84, 50, "Teleport Trap Destinations", ["holding-trap-arrivals", "releasing-trap-arrivals", "holding-block-target", "releasing-monster-target"]],
  [85, 159, "Teleport Button Destinations", ["four-button-finish-enter-matrix", "green-button-branch", "blue-button-branch", "brown-button-branch"]],
  [86, 160, "Teleport Terminal Destinations", ["exit-and-loss-dominance", "bomb-finish-enter", "water-finish-enter", "fire-finish-enter"]],
  [87, 51, "Teleport Actor Gallery", ["classic-actor-teleport-gallery"]],
  [88, 161, "Teleport Dormant Block", ["dormant-block-reentry"]],
  [89, 52, "Teleport Motion Lab", ["live-motion-and-camera"]],
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
blocks.sliding-push-settlement
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
force.forced-ice-bridge-run-override
force.ice-arrival-no-run-override
force.initial-block-owned
force.initial-monster-owned
force.initial-player-owned
force.mob-never-player-overrides
force.open-auto-beats-input
force.player-ice-bridge-clears-run-override
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

const EXPECTED_PR8_SCENARIO_IDS = `
buttons.destroyed-occupant-releases
buttons.press-release-audio
cloners.adjacent-player-claim-earlier-source
cloners.adjacent-player-claim-later-source
cloners.block-four-directions
cloners.block-into-player-fatal
cloners.blocked-launch-consumes-edge
cloners.classic-mob-gallery
cloners.facing-preserved-over-generations
cloners.hazard-destination-bomb
cloners.hazard-destination-fire
cloners.hazard-destination-water
cloners.hostile-into-player-fatal
cloners.launch-to-force
cloners.launch-to-ice
cloners.launch-to-ordinary
cloners.launch-to-teleport
cloners.multiple-links-and-edges
cloners.nonplayer-order-preserved
cloners.nonplayer-presses-red
cloners.player-noop
cloners.player-presses-red
cloners.player-unrelated-input-not-deferred
cloners.source-logical-visual-continuity
cloners.source-solid-to-entry
tank.blue-reverses-all
tank.nonplayer-blue-press
tank.reverse-in-cooldown
tank.toggle-suppressed-on-ice-force
tank.two-presses-restore
toggle.any-actor-press
toggle.close-under-occupant
toggle.closed-open-closed
toggle.closed-rejects-all
toggle.global-fanout
toggle.open-closed-open
toggle.same-boundary-parity
toggle.snapshot-drives-art
traps.block-and-mob-press-links
traps.block-direct-push-first
traps.block-no-intent-facing
traps.block-rejected-push-fallback
traps.block-side-slap-first
traps.dat-starts-holding
traps.monster-ai-fallback
traps.monster-facing-first
traps.multiple-linked-pairs
traps.player-all-blocked-retries
traps.player-facing-fallback
traps.player-presses-own-link
traps.player-release-intent-first
traps.rehold-before-departure
traps.release-after-cooldown
traps.release-art-state
traps.released-slide-direction-change
traps.reopen-fresh-state
traps.teeth-blob-cooldown-gate
traps.unlinked-never-releases
`.trim().split(/\s+/u);

const EXPECTED_PR9_SCENARIO_IDS = `
teleports.actor-matrix
teleports.adjacent-self-return-block
teleports.adjacent-self-return-monster
teleports.adjacent-self-return-player
teleports.all-rejections-atomic
teleports.block-external-push-from-dormant
teleports.camera-remote-jump
teleports.cyclic-order-yx
teleports.cyclic-wraparound
teleports.destination-boots-ordinary
teleports.destination-button
teleports.destination-exit-hazard
teleports.destination-floor-normal
teleports.destination-force-fast
teleports.destination-ice-fast
teleports.destination-trap-held
teleports.destination-trap-releasing
teleports.dormancy-is-per-actor
teleports.dormancy-survives-opening
teleports.entry-arms-only-at-finish
teleports.exit-claimed-earlier-same-boundary
teleports.exit-closes-by-button-completion
teleports.exit-opens-by-button-completion
teleports.exit-reentry-rearms
teleports.exit-vacated-earlier-same-boundary
teleports.initial-block-ordinary
teleports.initial-monster-ordinary
teleports.initial-player-ordinary
teleports.network-sound-and-motion
teleports.partial-post-many-blocked
teleports.partial-post-one-blocked
teleports.player-only-sound
teleports.race-loser-next-pad
teleports.race-loser-total-failure
teleports.race-same-exit-order-a
teleports.race-same-exit-order-b
teleports.remote-block-push-dependent-reject
teleports.remote-block-push-success
teleports.remote-exit-closed-device
teleports.remote-exit-panel-edge
teleports.remote-fake-blue-wall-commits
teleports.remote-fire-water-personality
teleports.remote-gravel-personality
teleports.remote-invisible-wall-no-reveal
teleports.remote-key-personality
teleports.remote-occupied-by-hostile
teleports.remote-occupied-by-nonplayer
teleports.remote-occupied-by-player
teleports.remote-real-blue-wall-no-mutation
teleports.self-return-blocked-later
teleports.self-return-lifecycle-once
teleports.self-return-presentation
teleports.self-return-repeats-iteratively
teleports.single-pad-local-blocked-ai
teleports.single-pad-local-blocked-intent
teleports.single-pad-local-open
teleports.single-pad-local-open-mob
teleports.slow-mob-ownership-cadence
teleports.source-block-push
teleports.source-blue-wall-mutates
teleports.source-invisible-wall-reveals
teleports.total-failure-no-intent
teleports.two-pad-remote-normal
teleports.two-pad-source-last
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

  it("pins all 89 physical entries and publishes every room-specific Hint message", async () => {
    const hints = parseLegacyDatSandboxHints(
      new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json"))),
    );

    expect(hints.datSha256).toBe(LEGACY_DAT_SANDBOX_DAT_SHA256);
    expect(hints.levelCount).toBe(89);
    expect(hints.levels.slice(0, EXPECTED_ROOMS.length).map((level) => [
      level.expectedNumber,
      level.rooms.map((room) => room.roomId),
    ])).toEqual(EXPECTED_ROOMS);
    expect(hints.levels.slice(
      EXPECTED_ROOMS.length,
      EXPECTED_ROOMS.length + EXPECTED_PR8_LEVELS.length,
    ).map((level) => [
      level.entryOrdinal,
      level.expectedNumber,
      level.expectedTitle,
      level.rooms.map((room) => room.roomId),
    ])).toEqual(EXPECTED_PR8_LEVELS);
    expect(hints.levels.slice(
      EXPECTED_ROOMS.length + EXPECTED_PR8_LEVELS.length,
    ).map((level) => [
      level.entryOrdinal,
      level.expectedNumber,
      level.expectedTitle,
      level.rooms.map((room) => room.roomId),
    ])).toEqual(EXPECTED_PR9_LEVELS);
    expect(hints.levels.flatMap((level) => level.rooms)).toHaveLength(257);

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
      ruleset: "1.0.16",
      proofPolicy: {
        strictCausalScenarioPlacements: 127,
        legacyExecutableScenarioPlacements: 139,
      },
    });
    expect(index.replays).toHaveLength(134);
    expect(new Set(index.replays.map((replay) => replay.id)).size).toBe(134);
    expect(new Set(index.replays.map((replay) => replay.levelNumber))).toEqual(
      new Set([
        ...EXPECTED_ROOMS.map(([number]) => number),
        36,
        44,
        151,
        160,
        163,
      ]),
    );
    expect(index.replays.filter((replay) => replay.expectedOutcome === "win")).toHaveLength(120);
    expect(index.replays.filter((replay) => replay.expectedOutcome === "loss")).toHaveLength(14);
    expect(index.replays.every((replay) => replay.path.startsWith("replays/1.0.16/"))).toBe(true);

    const terminalScenarioIds = index.replays.flatMap((replay) => replay.scenarioIds);
    expect(terminalScenarioIds).toHaveLength(154);
    expect(new Set(terminalScenarioIds).size).toBe(144);
    expect(terminalScenarioIds).not.toContain("force.random-all-blocked-retry");

    expect(index.replays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "initial-block-stationary",
        entryOrdinal: 18,
        levelNumber: 17,
        finalBoundary: 104,
        expectedOutcome: "win",
        scenarioIds: [
          "ice.initial-block-stationary",
          "blocks.sliding-push-settlement",
        ],
      }),
      expect.objectContaining({
        id: "ice-arrival-no-run-override",
        entryOrdinal: 25,
        levelNumber: 24,
        finalBoundary: 113,
        expectedOutcome: "win",
        scenarioIds: ["force.ice-arrival-no-run-override"],
      }),
      expect.objectContaining({
        id: "ice-force-handoff",
        entryOrdinal: 25,
        levelNumber: 24,
        finalBoundary: 88,
        expectedOutcome: "win",
        scenarioIds: [
          "sliding.ice-force-handoff",
          "force.forced-ice-bridge-run-override",
        ],
      }),
      expect.objectContaining({
        id: "player-ice-bridge-clears-run-override",
        entryOrdinal: 25,
        levelNumber: 24,
        finalBoundary: 120,
        expectedOutcome: "win",
        scenarioIds: ["force.player-ice-bridge-clears-run-override"],
      }),
    ]));

    expect(index.replays).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "block-contact-and-consequences",
        entryOrdinal: 49,
        levelNumber: 36,
        expectedOutcome: "loss",
        scenarioIds: ["cloners.block-into-player-fatal"],
      }),
      expect.objectContaining({
        id: "hostile-contact",
        entryOrdinal: 49,
        levelNumber: 36,
        expectedOutcome: "loss",
        scenarioIds: ["cloners.hostile-into-player-fatal"],
      }),
      expect.objectContaining({
        id: "teleport-hostile-occupancy",
        entryOrdinal: 72,
        levelNumber: 44,
        expectedOutcome: "loss",
        scenarioIds: ["teleports.remote-occupied-by-hostile"],
      }),
      expect.objectContaining({
        id: "teleport-hazard-personalities",
        entryOrdinal: 68,
        levelNumber: 151,
        expectedOutcome: "loss",
        scenarioIds: ["teleports.remote-fire-water-personality"],
      }),
      expect.objectContaining({
        id: "teleport-exit-bomb",
        entryOrdinal: 86,
        levelNumber: 160,
        expectedOutcome: "loss",
        scenarioIds: ["teleports.destination-exit-hazard"],
      }),
      expect.objectContaining({
        id: "teleport-player-occupancy",
        entryOrdinal: 74,
        levelNumber: 163,
        expectedOutcome: "loss",
        scenarioIds: ["teleports.remote-occupied-by-player"],
      }),
    ]));

    expect(index.boundedProofs).toHaveLength(100);
    expect(index.boundedProofs).toContainEqual(expect.objectContaining({
      id: "random-all-blocked-retry",
      entryId: "random-force-and-mixed-tracks",
      entryOrdinal: 25,
      levelNumber: 24,
      seed: 24005,
      verifiedThroughBoundary: 52,
      expectedOutcome: "unfinished",
      scenarioIds: ["force.random-all-blocked-retry"],
    }));
    expect(index.boundedProofs).toContainEqual(expect.objectContaining({
      id: "toggle-cycles",
      entryOrdinal: 26,
      levelNumber: 25,
      expectedOutcome: "unfinished",
      scenarioIds: ["toggle.closed-open-closed"],
    }));
    expect(new Set([
      ...index.replays.map((replay) => replay.id),
      ...index.boundedProofs.map((proof) => proof.id),
    ]).size).toBe(234);
    const coveredScenarioIds = [
      ...terminalScenarioIds,
      ...index.boundedProofs.flatMap((proof) => proof.scenarioIds),
    ];
    expect(coveredScenarioIds).toHaveLength(290);
    expect(new Set(coveredScenarioIds).size).toBe(261);
    expect([...new Set(coveredScenarioIds)].sort()).toEqual([
      ...EXPECTED_SCENARIO_IDS,
      ...EXPECTED_PR8_SCENARIO_IDS,
      ...EXPECTED_PR9_SCENARIO_IDS,
    ].sort());

    const evidencedEntries = new Set([
      ...index.replays.map((replay) => replay.entryOrdinal),
      ...index.boundedProofs.map((proof) => proof.entryOrdinal),
    ]);
    expect(evidencedEntries).toEqual(new Set(Array.from({ length: 89 }, (_, index) => index + 1)));
    expect(index.replays.some((replay) => replay.entryOrdinal === 26)).toBe(false);
    expect(index.boundedProofs.some((proof) => proof.entryOrdinal === 26)).toBe(true);
  });

  it("rejects a replay index without positive strict and legacy proof-policy counts", async () => {
    const index = JSON.parse(await readFile(asset("replay-index.json"), "utf8"));
    index.proofPolicy.strictCausalScenarioPlacements = 0;

    expect(() => parseLegacyDatSandboxReplayIndex(
      new TextEncoder().encode(JSON.stringify(index)),
    )).toThrow("strict causal scenario placements");
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
    index.boundedProofs[0].path = "replays/1.0.16/random-all-blocked-retry.hcr1";

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
