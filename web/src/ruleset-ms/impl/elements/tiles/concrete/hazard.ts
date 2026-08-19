import { createTileBehavior, type TileBehavior } from "@game-core/api/ruleset";
import { MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import { actorInventoryHasBoot } from "@game-core/impl/actorLocalInventory";
import type { MsChipEnterTileBehaviorContext } from "@ruleset-ms/impl/chipEnterBehavior";

export function createMsHazardTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  switch (tileId) {
    case MS_TILE.Water:
    case MS_TILE.Fire:
    case MS_TILE.Bomb:
      return createTileBehavior({
        "begin-enter": (context) => {
          const behaviorContext = context as MsChipEnterTileBehaviorContext;
          const statusBefore = behaviorContext.chip.chipStatus;
          switch (tileId) {
            case MS_TILE.Water:
              if (!actorInventoryHasBoot(behaviorContext.chipInventory, 3)) {
                behaviorContext.chip.chipStatus = "drowned";
              }
              break;
            case MS_TILE.Fire:
              if (!actorInventoryHasBoot(behaviorContext.chipInventory, 2)) {
                behaviorContext.chip.chipStatus = "burned";
              }
              break;
            case MS_TILE.Bomb:
              behaviorContext.chip.chipStatus = "bombed";
              behaviorContext.soundEffects |= 1 << MS_SOUND.BombExplodes;
              break;
          }
          if (statusBefore === "okay" && behaviorContext.chip.chipStatus !== "okay") {
            const z = behaviorContext.runtime.runtimeCellZ(behaviorContext.nextPos);
            behaviorContext.runtime.recordCausalEvent?.({
              kind: "player-died",
              actorId: MS_TILE.Chip,
              actorSerial: null,
              tileId,
              sourceTileId: tileId,
              sourcePosition: { pos: behaviorContext.nextPos, z },
              sourceStratum: "terrain",
              cause: `cc1:${behaviorContext.chip.chipStatus}`,
              before: { pos: behaviorContext.nextPos, z },
              after: { pos: behaviorContext.nextPos, z },
              phase: "terminal-latch",
            });
          }
        },
      });
    default:
      return undefined;
  }
}
