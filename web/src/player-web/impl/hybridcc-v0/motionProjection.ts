import type { HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcActor, HybridCcPosition, HybridCcSnapshot } from "./wasmBridge";

export interface HybridCcV0MotionTrack {
  actorId: number;
  direction: number;
  durationPresentationTicks: 2 | 4;
  from: HybridCcPosition;
  startedAtPresentationTick: number;
  to: HybridCcPosition;
}

export type HybridCcV0MotionTracks = ReadonlyMap<number, HybridCcV0MotionTrack>;

function samePosition(left: HybridCcPosition, right: HybridCcPosition): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function cellTerrain(level: HybridCcNativeLevel, snapshot: HybridCcSnapshot, position: HybridCcPosition): number {
  if (position.z !== 0) return 0;
  return snapshot.cells[position.y * level.width + position.x]?.terrain.id ?? 0;
}

function isFastTerrain(id: number): boolean {
  return id === 9 || id === 10 || id === 11 || id === 12;
}

function impliedFrom(actor: HybridCcActor): HybridCcPosition {
  const from = { ...actor.position };
  if (actor.direction === 0) from.y += 1;
  if (actor.direction === 1) from.x -= 1;
  if (actor.direction === 2) from.y -= 1;
  if (actor.direction === 3) from.x += 1;
  return from;
}

export function advanceHybridCcV0MotionTracks(
  level: HybridCcNativeLevel,
  previous: HybridCcSnapshot,
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

  const previousActors = new Map(previous.actors.map((value) => [value.id, value]));
  for (const actor of current.actors) {
    const prior = previousActors.get(actor.id);
    if (!prior || samePosition(prior.position, actor.position)) continue;
    const fast = isFastTerrain(cellTerrain(level, previous, prior.position))
      || isFastTerrain(cellTerrain(level, current, actor.position));
    const adjacentDistance = Math.abs(actor.position.x - prior.position.x)
      + Math.abs(actor.position.y - prior.position.y)
      + Math.abs(actor.position.z - prior.position.z);
    next.set(actor.id, {
      actorId: actor.id,
      direction: actor.direction,
      durationPresentationTicks: fast ? 2 : 4,
      from: adjacentDistance > 1 ? impliedFrom(actor) : prior.position,
      startedAtPresentationTick: presentationTick,
      to: actor.position,
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
    frame: Math.min(3, Math.floor((elapsed * 4) / track.durationPresentationTicks)),
    moving,
  };
}
