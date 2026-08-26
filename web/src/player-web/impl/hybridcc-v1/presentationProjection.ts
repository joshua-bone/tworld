import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
} from "./engineFacts";
import type {
  HybridCcV1Actor,
  HybridCcV1MotionTrack,
  HybridCcV1Position,
  HybridCcV1Snapshot,
} from "./wasmBridge";

export interface HybridCcV1PresentedMotion {
  active: boolean;
  frame: number;
  moving: number;
  position: HybridCcV1Position | null;
  visualOrigin?: HybridCcV1Position;
}

function safeBoundary(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Hybrid v1 presentation boundary ${value} cannot be represented safely by the browser.`);
  }
  return result;
}

function adjacentOrigin(
  destination: HybridCcV1Position,
  direction: number,
): HybridCcV1Position {
  switch (direction) {
    case HYBRID_CC_V1_DIRECTION.north: return { ...destination, y: destination.y + 1 };
    case HYBRID_CC_V1_DIRECTION.east: return { ...destination, x: destination.x - 1 };
    case HYBRID_CC_V1_DIRECTION.south: return { ...destination, y: destination.y - 1 };
    case HYBRID_CC_V1_DIRECTION.west: return { ...destination, x: destination.x + 1 };
    default: return { ...destination };
  }
}

export function hybridCcV1PresentedMotion(
  track: HybridCcV1MotionTrack | null,
  presentationSample: number,
): HybridCcV1PresentedMotion {
  if (!track) {
    return { active: false, frame: 0, moving: 0, position: null };
  }
  if (track.presentationSampleCount !== 2 && track.presentationSampleCount !== 4) {
    throw new Error(
      `Hybrid v1 motion track published unsupported ${track.presentationSampleCount}-sample motion.`,
    );
  }

  const startSample = safeBoundary(track.startBoundary) * 2;
  const elapsed = presentationSample - startSample;
  if (elapsed < 0 || elapsed >= track.presentationSampleCount) {
    return { active: false, frame: 0, moving: 0, position: track.destination };
  }

  const motion: HybridCcV1PresentedMotion = {
    active: true,
    frame: Math.max(0, 3 - Math.floor((elapsed * 4) / track.presentationSampleCount)),
    moving: 8 - Math.floor((elapsed * 8) / track.presentationSampleCount),
    position: track.destination,
  };
  if (track.discontinuous) {
    motion.visualOrigin = adjacentOrigin(track.destination, track.direction);
  }
  return motion;
}

/** Converts an actor's authoritative in-flight movement into its immutable presentation track. */
export function hybridCcV1ActorMotionTrack(
  actor: HybridCcV1Actor,
): HybridCcV1MotionTrack | null {
  if (!actor.hasMovement) return null;
  const durationBoundaries = actor.movement.completionBoundary - actor.movement.startBoundary;
  const presentationSampleCount = Number(durationBoundaries * 2n);
  if (
    !Number.isSafeInteger(presentationSampleCount)
    || (presentationSampleCount !== 2 && presentationSampleCount !== 4)
  ) {
    throw new Error(
      `Hybrid v1 actor ${actor.id} published unsupported movement duration ${durationBoundaries}.`,
    );
  }
  return {
    actorId: actor.id,
    actorKind: actor.kind,
    origin: actor.movement.origin,
    destination: actor.movement.destination,
    direction: actor.movement.direction,
    startBoundary: actor.movement.startBoundary,
    completionBoundary: actor.movement.completionBoundary,
    presentationSampleCount,
    owner: actor.movement.owner,
    movementClass: actor.movement.movementClass,
    discontinuous: actor.movement.discontinuous,
  };
}

/** Terminal motion is the same immutable track used for live camera motion. */
export function hybridCcV1TerminalCameraTrack(
  track: HybridCcV1MotionTrack | null,
  presentationSample: number,
): HybridCcV1PresentedMotion {
  return hybridCcV1PresentedMotion(track, presentationSample);
}

/**
 * Lynx presents a blocked attempt and an active player block push with the
 * pushing sprite for one 20 Hz display sample. The ordered event journal is
 * the causal fact; it does not become persistent engine state.
 */
export function hybridCcV1ChipPushing(
  snapshot: HybridCcV1Snapshot,
  presentationSample: number,
): boolean {
  return snapshot.events.some((event) => {
    if (
      event.actorKind !== HYBRID_CC_V1_ELEMENT.player
      || safeBoundary(event.logicBoundary) * 2 !== presentationSample
    ) {
      return false;
    }
    return event.kind === HYBRID_CC_V1_EVENT.moveRejected
      || (
        event.kind === HYBRID_CC_V1_EVENT.interaction
        && event.interaction === HYBRID_CC_V1_INTERACTION.push
      );
  });
}
