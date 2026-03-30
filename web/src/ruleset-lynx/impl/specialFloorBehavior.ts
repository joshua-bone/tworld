import { lookupLynxTileLifecyclePhase } from "@ruleset-lynx/impl/tileLifecycleRegistration";
import type { LynxTileExitProbeBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/concrete/specialFloors";

export function probeLynxTileExitByBehavior(tileId: number, dir: number, released: boolean): boolean | null {
  const probeExit = lookupLynxTileLifecyclePhase(tileId, "probe-exit");
  if (probeExit === null) {
    return null;
  }

  const behaviorContext: LynxTileExitProbeBehaviorContext = {
    phase: "probe-exit",
    tileId,
    dir,
    released,
    allowed: true,
  };
  probeExit(behaviorContext);
  return behaviorContext.allowed;
}
