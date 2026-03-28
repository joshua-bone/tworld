import { describe, it } from "vitest";
import { expectActorCapabilityMatrix, expectActorEntryMatrix } from "@game-core/impl/statefulElementTestSupport";
import { lynxActorCapabilityPolicy, lynxActorEntryMask } from "@ruleset-lynx/impl/catalog";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

const FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

describe("Lynx extensibility characterization", () => {
  it("keeps representative actor capability profiles stable", () => {
    expectActorCapabilityMatrix(lynxActorCapabilityPolicy, [
      {
        label: "Chip remains the input-driven inventory-carrying archetype",
        actorId: MS_TILE.Chip,
        expected: {
          controlMode: "player-input",
          localInventoryMode: "keys-boots-tools",
          itemCollectionKind: "keys-boots-tools",
          globalProgressKind: "collect-chips",
          traversalKind: "chip",
          blockedMoveKind: "stay",
          thiefHook: "steal-boots-tools",
          airHook: "chip-support",
          collisionHook: "default",
        },
      },
      {
        label: "Blocks remain the passive transforming hazard archetype",
        actorId: MS_TILE.Block,
        expected: {
          controlMode: "passive",
          localInventoryMode: "none",
          itemCollectionKind: "none",
          traversalKind: "block",
          hazards: {
            water: "transform",
            fire: "ignore",
            bomb: "transform",
          },
        },
      },
      {
        label: "Gliders remain the water-immune creature archetype",
        actorId: MS_TILE.Glider,
        expected: {
          controlMode: "ai",
          traversalKind: "creature",
          hazards: {
            water: "ignore",
            fire: "deny",
            bomb: "destroy",
          },
        },
      },
      {
        label: "Fireballs remain the fire-immune creature archetype",
        actorId: MS_TILE.Fireball,
        expected: {
          controlMode: "ai",
          traversalKind: "creature",
          hazards: {
            water: "destroy",
            fire: "ignore",
            bomb: "destroy",
          },
        },
      },
    ]);
  });

  it("keeps representative terrain-entry masks stable for future actor families", () => {
    expectActorEntryMatrix(lynxActorEntryMask, [
      {
        label: "Chip can enter portable-item pickups",
        actorId: MS_TILE.Chip,
        tileId: MS_TILE.Sandbag,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Creatures treat portable-item pickups as walls",
        actorId: MS_TILE.Ball,
        tileId: MS_TILE.Sandbag,
        expectedMask: 0,
      },
      {
        label: "Creatures can still enter red keys in Lynx",
        actorId: MS_TILE.Ball,
        tileId: MS_TILE.Key_Red,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Creatures still cannot enter yellow keys in Lynx",
        actorId: MS_TILE.Ball,
        tileId: MS_TILE.Key_Yellow,
        expectedMask: 0,
      },
      {
        label: "Blocks can still enter gravel in Lynx",
        actorId: MS_TILE.Block,
        tileId: MS_TILE.Gravel,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Creatures still cannot enter dirt",
        actorId: MS_TILE.Ball,
        tileId: MS_TILE.Dirt,
        expectedMask: 0,
      },
    ]);
  });
});
