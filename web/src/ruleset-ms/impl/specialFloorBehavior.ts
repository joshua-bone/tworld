import { lookupMsTileLifecyclePhase } from "@ruleset-ms/impl/tileLifecycleRegistration";
import type { MsTileExitProbeBehaviorContext } from "@ruleset-ms/impl/elements/tiles/concrete/specialFloors";

export function probeMsTileExitByBehavior(tileId: number, dir: number, released: boolean): boolean | null {
  const probeExit = lookupMsTileLifecyclePhase(tileId, "probe-exit");
  if (probeExit === null) {
    return null;
  }

  const behaviorContext: MsTileExitProbeBehaviorContext = {
    phase: "probe-exit",
    tileId,
    dir,
    released,
    allowed: true,
  };
  probeExit(behaviorContext);
  return behaviorContext.allowed;
}
