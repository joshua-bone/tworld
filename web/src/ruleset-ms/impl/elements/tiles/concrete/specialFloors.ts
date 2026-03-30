import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { msSpecialFloorRequiresReleaseToExit } from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";

export interface MsTileExitProbeBehaviorContext extends TileBehaviorContext<number, number> {
  readonly dir: number;
  readonly released: boolean;
  allowed: boolean;
}

export function createMsSpecialFloorTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!msSpecialFloorRequiresReleaseToExit(tileId)) {
    return undefined;
  }

  return createTileBehavior({
    testExit: (context) => {
      const behaviorContext = context as MsTileExitProbeBehaviorContext;
      if (!behaviorContext.released) {
        behaviorContext.allowed = false;
      }
    },
  });
}
