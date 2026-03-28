import { describe, expect, it } from "vitest";
import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import {
  expectStatefulActorArchetypes,
  summarizeStatefulActorArchetype,
} from "@game-core/impl/statefulElementTestSupport";

const INPUT_DRIVEN_ARCHETYPE = {
  controlMode: "player-input",
  localInventoryMode: "keys-boots-tools",
  itemCollectionKind: "keys-boots-tools",
  globalProgressKind: "collect-chips",
  traversalKind: "chip",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "steal-boots-tools",
  airHook: "chip-support",
  collisionHook: "default",
  hazards: {
    water: "destroy",
    fire: "destroy",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const INVENTORY_CARRYING_ARCHETYPE = {
  controlMode: "ai",
  localInventoryMode: "keys-boots",
  itemCollectionKind: "keys-boots",
  globalProgressKind: "none",
  traversalKind: "creature",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "steal-boots-tools",
  airHook: "non-chip-support",
  collisionHook: "default",
  hazards: {
    water: "ignore",
    fire: "deny",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const BALLISTIC_ARCHETYPE = {
  controlMode: "ballistic",
  localInventoryMode: "keys-boots",
  itemCollectionKind: "keys-boots",
  globalProgressKind: "none",
  traversalKind: "creature",
  blockedMoveKind: "revert-portable",
  trapHook: "hold-direction",
  clonerHook: "default",
  thiefHook: "steal-boots-tools",
  airHook: "chip-support",
  collisionHook: "default",
  hazards: {
    water: "destroy",
    fire: "destroy",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const ORDINARY_CREATURE_ARCHETYPE = {
  controlMode: "ai",
  localInventoryMode: "none",
  itemCollectionKind: "none",
  globalProgressKind: "none",
  traversalKind: "creature",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "none",
  airHook: "non-chip-support",
  collisionHook: "default",
  hazards: {
    water: "destroy",
    fire: "deny",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const PHASING_ARCHETYPE = {
  ...ORDINARY_CREATURE_ARCHETYPE,
} as const satisfies ActorCapabilityPolicy;

describe("stateful actor archetype characterization", () => {
  it("classifies representative future actor archetypes through the current policy seam", () => {
    expectStatefulActorArchetypes([
      {
        label: "input-driven actors stay chip-like and inventory-carrying",
        policy: INPUT_DRIVEN_ARCHETYPE,
        expected: {
          controlMode: "player-input",
          traversalKind: "chip",
          localInventoryMode: "keys-boots-tools",
          collectibleSlots: ["keys", "boots", "tools"],
          collectsChips: true,
          usesChipSupport: true,
          thiefStealsBootsAndTools: true,
        },
      },
      {
        label: "inventory-carrying non-chip actors can keep keys and boots without global chip progress",
        policy: INVENTORY_CARRYING_ARCHETYPE,
        expected: {
          controlMode: "ai",
          traversalKind: "creature",
          localInventoryMode: "keys-boots",
          collectibleSlots: ["keys", "boots"],
          collectsChips: false,
          usesChipSupport: false,
          thiefStealsBootsAndTools: true,
        },
      },
      {
        label: "ballistic actors can keep direction-sensitive blocked-move semantics and chip-style support",
        policy: BALLISTIC_ARCHETYPE,
        expected: {
          controlMode: "ballistic",
          traversalKind: "creature",
          localInventoryMode: "keys-boots",
          collectibleSlots: ["keys", "boots"],
          keepsDirectionOnBlockedMove: false,
          revertsPortableOnBlockedMove: true,
          usesChipSupport: true,
        },
      },
      {
        label: "phasing actors currently collapse to an ordinary creature-shaped capability summary",
        policy: PHASING_ARCHETYPE,
        expected: {
          controlMode: "ai",
          traversalKind: "creature",
          localInventoryMode: "none",
          collectibleSlots: [],
          collectsChips: false,
          usesChipSupport: false,
        },
      },
    ]);
  });

  it("makes the current phasing gap explicit", () => {
    expect(summarizeStatefulActorArchetype(PHASING_ARCHETYPE)).toEqual(
      summarizeStatefulActorArchetype(ORDINARY_CREATURE_ARCHETYPE),
    );
  });
});
