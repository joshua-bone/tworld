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
        },
      });
    default:
      return undefined;
  }
}
