import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { lynxSpecialFloorRequiresReleaseToExit } from "@ruleset-lynx/impl/elements/tiles/specialFloorRegistration";

export interface LynxTileExitProbeBehaviorContext extends TileBehaviorContext<number, number> {
  readonly dir: number;
  readonly released: boolean;
  allowed: boolean;
}

export function createLynxSpecialFloorTileBehavior(tileId: number): TileBehavior<number, number> | undefined {
  if (!lynxSpecialFloorRequiresReleaseToExit(tileId)) {
    return undefined;
  }

  return createTileBehavior({
    testExit: (context) => {
      const behaviorContext = context as LynxTileExitProbeBehaviorContext;
      if (!behaviorContext.released) {
        behaviorContext.allowed = false;
      }
    },
  });
}
