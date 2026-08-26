import type { InteractiveGameRenderableAnimation } from "@game-core/api/interactive";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_LOSS,
} from "./engineFacts";
import type {
  HybridCcV1Event,
  HybridCcV1Position,
  HybridCcV1Snapshot,
} from "./wasmBridge";

const HYBRID_LYNX_ANIMATION_TILE = {
  waterSplash: 0x74,
  bombExplosion: 0x75,
  entityExplosion: 0x76,
} as const;

export const HYBRID_CC_V1_LYNX_EFFECT_SAMPLE_COUNT = 12;

export interface HybridCcV1LifecycleAnimationTrack {
  position: HybridCcV1Position;
  startPresentationSample: number;
  initialFrame: number;
  tileId: number;
}

function safePresentationSample(boundary: bigint): number {
  const value = Number(boundary * 2n);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Hybrid v1 lifecycle boundary ${boundary} cannot be presented safely.`);
  }
  return value;
}

function destructionTile(lossCause: number): number {
  if (lossCause === HYBRID_CC_V1_LOSS.water) return HYBRID_LYNX_ANIMATION_TILE.waterSplash;
  if (lossCause === HYBRID_CC_V1_LOSS.bomb) return HYBRID_LYNX_ANIMATION_TILE.bombExplosion;
  return HYBRID_LYNX_ANIMATION_TILE.entityExplosion;
}

function initialFrame(startPresentationSample: number): number {
  // Tile World's Lynx presenter alternates between 10 and 11 from its 20 Hz
  // timer phase. V1 logic boundaries always start on the even member of their
  // two-sample presentation pair, so the deterministic V1 adaptation is 11.
  return ((startPresentationSample + 1) & 1) !== 0 ? 11 : 10;
}

function positionKey(position: HybridCcV1Position): string {
  return `${position.x}:${position.y}:${position.z}`;
}

function destructionTrack(event: HybridCcV1Event): HybridCcV1LifecycleAnimationTrack {
  const startPresentationSample = safePresentationSample(event.logicBoundary);
  return {
    position: event.destination,
    startPresentationSample,
    initialFrame: initialFrame(startPresentationSample),
    tileId: destructionTile(event.lossCause),
  };
}

function withoutTrackAt(
  tracks: readonly HybridCcV1LifecycleAnimationTrack[],
  position: HybridCcV1Position,
): HybridCcV1LifecycleAnimationTrack[] {
  const occupiedKey = positionKey(position);
  return tracks.filter((track) => positionKey(track.position) !== occupiedKey);
}

/**
 * Reconciles host-owned effects with the current ordered event journal.
 *
 * Effects never become gameplay occupancy. A later authoritative arrival or
 * creation merely clears stale art before the live actor is drawn in that cell.
 */
export function reconcileHybridCcV1LifecycleAnimations(
  current: readonly HybridCcV1LifecycleAnimationTrack[],
  snapshot: HybridCcV1Snapshot,
): HybridCcV1LifecycleAnimationTrack[] {
  let reconciled = [...current];

  for (const event of snapshot.events) {
    if (event.kind === HYBRID_CC_V1_EVENT.actorDestroyed) {
      // The terminal projection exclusively owns Chip's cause-specific effect.
      if (event.actorKind === HYBRID_CC_V1_ELEMENT.player) continue;
      const started = destructionTrack(event);
      reconciled = [...withoutTrackAt(reconciled, started.position), started];
      continue;
    }

    if (
      event.kind === HYBRID_CC_V1_EVENT.moveCompleted
      || event.kind === HYBRID_CC_V1_EVENT.actorCreated
    ) {
      reconciled = withoutTrackAt(reconciled, event.destination);
    }
  }

  return reconciled;
}

/** Starts host-owned effects from the current committed event journal. */
export function collectHybridCcV1LifecycleAnimations(
  snapshot: HybridCcV1Snapshot,
): HybridCcV1LifecycleAnimationTrack[] {
  return reconcileHybridCcV1LifecycleAnimations([], snapshot);
}

export function activeHybridCcV1LifecycleAnimations(
  tracks: readonly HybridCcV1LifecycleAnimationTrack[],
  presentationSample: number,
): HybridCcV1LifecycleAnimationTrack[] {
  return tracks.filter((track) => {
    const elapsed = presentationSample - track.startPresentationSample;
    return elapsed >= 0 && elapsed <= track.initialFrame;
  });
}

export function projectHybridCcV1LifecycleAnimations(
  tracks: readonly HybridCcV1LifecycleAnimationTrack[],
  presentationSample: number,
  width: number,
): InteractiveGameRenderableAnimation[] {
  return activeHybridCcV1LifecycleAnimations(tracks, presentationSample).flatMap((track) => {
    if (track.position.z !== 0) return [];
    const frame = track.initialFrame - (presentationSample - track.startPresentationSample);
    const pos = track.position.y * width + track.position.x;
    return [{
      pos,
      z: track.position.z,
      frame,
      tileId: track.tileId,
      visual: {
        kind: "creature" as const,
        tileId: track.tileId,
        dir: MS_DIRECTION.north,
        moving: 0,
        frame,
      },
    }];
  });
}

export function hybridCcV1TerminalDeathFrame(
  snapshot: HybridCcV1Snapshot,
  presentationSample: number,
  delaySamples = 0,
): number | null {
  if (snapshot.header.outcome.kind === 0 || snapshot.header.outcome.lossCause === HYBRID_CC_V1_LOSS.none) {
    return null;
  }
  const startPresentationSample = safePresentationSample(snapshot.header.outcome.logicBoundary) + delaySamples;
  const frame = initialFrame(startPresentationSample) - (presentationSample - startPresentationSample);
  return frame >= 0 ? frame : null;
}

export function hybridCcV1TerminalDeathTile(lossCause: number): number {
  return destructionTile(lossCause);
}
