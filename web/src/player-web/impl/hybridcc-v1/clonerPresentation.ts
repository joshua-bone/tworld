import { HYBRID_CC_V1_MOVEMENT_OWNER } from "./engineFacts";
import {
  hybridCcV1ActorMotionTrack,
  hybridCcV1PresentedMotion,
} from "./presentationProjection";
import type { HybridCcV1Actor, HybridCcV1Position } from "./wasmBridge";

export interface HybridCcV1ClonerSourceOccupant {
  actorKind: number;
  direction: number;
  position: HybridCcV1Position;
}

/**
 * A cloner launch vacates its logical source immediately, then creates the
 * replacement actor at FinishExit. Lynx presentation keeps that source looking
 * occupied throughout the interval. This projection is a visual duplicate
 * only; it is never inserted into the engine actor or occupancy collections.
 */
export function hybridCcV1ClonerSourceOccupant(
  actor: HybridCcV1Actor,
  presentationSample: number,
): HybridCcV1ClonerSourceOccupant | null {
  const track = hybridCcV1ActorMotionTrack(actor);
  if (!track || track.owner !== HYBRID_CC_V1_MOVEMENT_OWNER.cloner) return null;
  if (!hybridCcV1PresentedMotion(track, presentationSample).active) return null;
  return {
    actorKind: track.actorKind,
    direction: track.direction,
    position: track.origin,
  };
}
