import { describe, expect, it } from "vitest";
import type { ActorCollisionOutcome } from "@game-core/api/actorInteractions";
import type { EngineMapCell } from "@game-core/api/model";
import {
  findVisibleActorOnFlaggedTopCell,
  hasVisibleActorOnFlaggedTopCell,
  OCCUPANCY_TARGET_KIND,
  occupancyAllowsChipTeleportExitCollision,
} from "@game-core/impl/occupancy";

interface TestActor {
  id: number;
  pos: number;
  hidden: boolean;
}

function makeCells(): EngineMapCell[] {
  return [
    {
      position: { x: 0, y: 0, pos: 0 },
      top: { id: 10, state: 0x40 },
      bottom: { id: 20, state: 0 },
    },
    {
      position: { x: 1, y: 0, pos: 1 },
      top: { id: 11, state: 0 },
      bottom: { id: 21, state: 0 },
    },
  ];
}

describe("occupancy core helpers", () => {
  it("finds visible actors only when the target top cell carries the required flags", () => {
    const cells = makeCells();
    const actors: TestActor[] = [
      { id: 1, pos: 0, hidden: false },
      { id: 2, pos: 0, hidden: true },
      { id: 3, pos: 1, hidden: false },
    ];

    expect(findVisibleActorOnFlaggedTopCell(cells, actors, 0, 0x40)?.id).toBe(1);
    expect(findVisibleActorOnFlaggedTopCell(cells, actors, 0, 0x40, (actor) => actor.id === 2)).toBeUndefined();
    expect(findVisibleActorOnFlaggedTopCell(cells, actors, 1, 0x40)).toBeUndefined();
  });

  it("reports whether a visible actor occupies a flagged top cell", () => {
    const cells = makeCells();
    const actors: TestActor[] = [
      { id: 1, pos: 0, hidden: false },
      { id: 2, pos: 1, hidden: false },
    ];

    expect(hasVisibleActorOnFlaggedTopCell(cells, actors, 0, 0x40)).toBe(true);
    expect(hasVisibleActorOnFlaggedTopCell(cells, actors, 0, 0x40, (actor) => actor.id === 9)).toBe(false);
    expect(hasVisibleActorOnFlaggedTopCell(cells, actors, 1, 0x40)).toBe(false);
  });

  it("treats runtime-actor collisions as valid Chip teleport exits", () => {
    const collision: ActorCollisionOutcome = {
      chipFails: true,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: true,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    };

    expect(
      occupancyAllowsChipTeleportExitCollision(
        {
          kind: OCCUPANCY_TARGET_KIND.runtimeActor,
          pos: 0,
          z: 1,
          tileId: 99,
          claimed: false,
        },
        collision,
      ),
    ).toBe(true);
    expect(
      occupancyAllowsChipTeleportExitCollision(
        {
          kind: OCCUPANCY_TARGET_KIND.portableItem,
          pos: 0,
          z: 1,
          tileId: 99,
          claimed: false,
        },
        collision,
      ),
    ).toBe(false);
    expect(
      occupancyAllowsChipTeleportExitCollision(
        {
          kind: OCCUPANCY_TARGET_KIND.runtimeActor,
          pos: 0,
          z: 1,
          tileId: 99,
          claimed: false,
        },
        {
          ...collision,
          denyMove: true,
        },
      ),
    ).toBe(false);
  });
});
