import type { HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcPosition, HybridCcSnapshot } from "./wasmBridge";
import {
  HYBRID_CC_V0_ACTOR_STATE,
  HYBRID_CC_V0_EVENT,
  hybridCcV0ActorHasState,
} from "./engineFacts";

export interface HybridCcV0MotionTrack {
  actorId: number;
  actorKind: number;
  direction: number;
  durationPresentationTicks: 2 | 4;
  from: HybridCcPosition;
  startedAtPresentationTick: number;
  surfaceId: number;
  to: HybridCcPosition;
}

export type HybridCcV0MotionTracks = ReadonlyMap<number, HybridCcV0MotionTrack>;

function samePosition(left: HybridCcPosition, right: HybridCcPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function isFastMovement(stateFlags: number): boolean {
  return [
    HYBRID_CC_V0_ACTOR_STATE.slidingIce,
    HYBRID_CC_V0_ACTOR_STATE.slidingForce,
    HYBRID_CC_V0_ACTOR_STATE.slidingTeleport,
    HYBRID_CC_V0_ACTOR_STATE.forced,
    HYBRID_CC_V0_ACTOR_STATE.speedBoost,
  ].some((flag) => hybridCcV0ActorHasState(stateFlags, flag));
}

function impliedFrom(position: HybridCcPosition, direction: number): HybridCcPosition {
  const from = { ...position };
  if (direction === 0) from.y += 1;
  if (direction === 1) from.x -= 1;
  if (direction === 2) from.y -= 1;
  if (direction === 3) from.x += 1;
  return from;
}

export function advanceHybridCcV0MotionTracks(
  _level: HybridCcNativeLevel,
  _previous: HybridCcSnapshot,
  current: HybridCcSnapshot,
  presentationTick: number,
  existing: HybridCcV0MotionTracks,
): HybridCcV0MotionTracks {
  const next = new Map<number, HybridCcV0MotionTrack>();
  for (const [actorId, track] of existing) {
    if (presentationTick - track.startedAtPresentationTick < track.durationPresentationTicks) {
      next.set(actorId, track);
    }
  }

  for (const event of current.events) {
    if (event.kind !== HYBRID_CC_V0_EVENT.actorMoved || samePosition(event.origin, event.position)) continue;
    const adjacentDistance = Math.abs(event.position.x - event.origin.x)
      + Math.abs(event.position.y - event.origin.y)
      + Math.abs(event.position.z - event.origin.z);
    next.set(event.actorId, {
      actorId: event.actorId,
      actorKind: event.actorKind,
      direction: event.direction,
      durationPresentationTicks: isFastMovement(event.actorStateFlags) ? 2 : 4,
      from: adjacentDistance > 1 ? impliedFrom(event.position, event.direction) : event.origin,
      startedAtPresentationTick: presentationTick,
      surfaceId: event.subject.id,
      to: event.position,
    });
  }
  return next;
}

export function hybridCcV0ActorMotion(
  tracks: HybridCcV0MotionTracks,
  actorId: number,
  presentationTick: number,
): { frame: number; moving: number } {
  const track = tracks.get(actorId);
  if (!track) return { frame: 0, moving: 0 };
  const elapsed = presentationTick - track.startedAtPresentationTick;
  if (elapsed < 0 || elapsed >= track.durationPresentationTicks) return { frame: 0, moving: 0 };
  const moving = 8 - Math.floor((elapsed * 8) / track.durationPresentationTicks);
  return {
    frame: Math.max(0, 3 - Math.floor((elapsed * 4) / track.durationPresentationTicks)),
    moving,
  };
}
