import { describe, it } from "vitest";
import { expectActorCapabilityMatrix, expectActorEntryMatrix } from "@game-core/impl/statefulElementTestSupport";
import { msActorCapabilityPolicy, msActorEntryMask } from "@ruleset-ms/impl/catalog";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

const FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

describe("MS extensibility characterization", () => {
  it("keeps representative actor capability profiles stable", () => {
    expectActorCapabilityMatrix(msActorCapabilityPolicy, [
      {
        label: "Chip remains the input-driven inventory-carrying archetype",
        actorId: MS_TILE.Chip,
        expected: {
          control: {
            mode: "player-input",
          },
          inventory: {
            localInventoryMode: "keys-boots-tools",
            itemCollectionKind: "keys-boots-tools",
            globalProgressKind: "collect-chips",
          },
          movement: {
            strategyId: "chip-like",
            blockedMoveKind: "stay",
            airHook: "chip-support",
          },
          interaction: {
            thiefHook: "steal-boots-tools",
            collisionStrategyId: "default",
          },
        },
      },
      {
        label: "Blocks remain the passive transforming hazard archetype",
        actorId: MS_TILE.Block,
        expected: {
          control: {
            mode: "passive",
          },
          inventory: {
            localInventoryMode: "none",
            itemCollectionKind: "none",
          },
          movement: {
            strategyId: "block-like",
          },
          hazards: {
            responses: {
              water: "transform",
              fire: "ignore",
              bomb: "transform",
            },
          },
        },
      },
      {
        label: "Gliders remain the water-immune creature archetype",
        actorId: MS_TILE.Glider,
        expected: {
          control: {
            mode: "ai",
          },
          movement: {
            strategyId: "creature-like",
          },
          hazards: {
            responses: {
              water: "ignore",
              fire: "destroy",
              bomb: "destroy",
            },
          },
        },
      },
      {
        label: "Fireballs remain the fire-immune creature archetype",
        actorId: MS_TILE.Fireball,
        expected: {
          control: {
            mode: "ai",
          },
          movement: {
            strategyId: "creature-like",
          },
          hazards: {
            responses: {
              water: "destroy",
              fire: "ignore",
              bomb: "destroy",
            },
          },
        },
      },
    ]);
  });

  it("keeps representative terrain-entry masks stable for future actor families", () => {
    expectActorEntryMatrix(msActorEntryMask, [
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
        label: "Blocks treat portable-item pickups as walls",
        actorId: MS_TILE.Block,
        tileId: MS_TILE.Sandbag,
        expectedMask: 0,
      },
      {
        label: "Chip can clear dirt",
        actorId: MS_TILE.Chip,
        tileId: MS_TILE.Dirt,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Creatures still cannot enter dirt",
        actorId: MS_TILE.Ball,
        tileId: MS_TILE.Dirt,
        expectedMask: 0,
      },
      {
        label: "Blocks can still enter water before arrival effects resolve",
        actorId: MS_TILE.Block,
        tileId: MS_TILE.Water,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Ice blocks can pass over IC chips",
        actorId: MS_TILE.IceBlock,
        tileId: MS_TILE.ICChip,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Ice blocks can pass over portable pickups",
        actorId: MS_TILE.IceBlock,
        tileId: MS_TILE.Sandbag,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Ice blocks can clear dirt",
        actorId: MS_TILE.IceBlock,
        tileId: MS_TILE.Dirt,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Ice blocks can enter popup walls and sockets",
        actorId: MS_TILE.IceBlock,
        tileId: MS_TILE.PopupWall,
        expectedMask: FULL_MOVEMENT_MASK,
      },
      {
        label: "Ice blocks can attempt socket entry when chips are satisfied",
        actorId: MS_TILE.IceBlock,
        tileId: MS_TILE.Socket,
        expectedMask: FULL_MOVEMENT_MASK,
      },
    ]);
  });
});
