import type { InteractiveGameTileOverlay } from "@game-core/api/interactive";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
} from "./engineFacts";
import type {
  HybridCcV1Event,
  HybridCcV1Position,
  HybridCcV1Snapshot,
} from "./wasmBridge";

export const HYBRID_CC_V1_WALL_REVEAL_SAMPLE_COUNT = 10;

export interface HybridCcV1WallRevealTrack {
  position: HybridCcV1Position;
  startPresentationSample: number;
}

function safePresentationSample(boundary: bigint): number {
  const value = Number(boundary * 2n);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Hybrid v1 wall-reveal boundary ${boundary} cannot be presented safely.`);
  }
  return value;
}

function positionKey(position: HybridCcV1Position): string {
  return `${position.x}:${position.y}:${position.z}`;
}

function revealTrack(event: HybridCcV1Event): HybridCcV1WallRevealTrack {
  return {
    position: event.destination,
    startPresentationSample: safePresentationSample(event.logicBoundary),
  };
}

function withoutTrackAt(
  tracks: readonly HybridCcV1WallRevealTrack[],
  position: HybridCcV1Position,
): HybridCcV1WallRevealTrack[] {
  const revealedKey = positionKey(position);
  return tracks.filter((track) => positionKey(track.position) !== revealedKey);
}

/** Reconciles transient host art from semantic engine events; map state is never changed. */
export function reconcileHybridCcV1WallReveals(
  current: readonly HybridCcV1WallRevealTrack[],
  snapshot: HybridCcV1Snapshot,
): HybridCcV1WallRevealTrack[] {
  let reconciled = [...current];
  for (const event of snapshot.events) {
    if (
      event.kind !== HYBRID_CC_V1_EVENT.interaction
      || event.interaction !== HYBRID_CC_V1_INTERACTION.reveal
    ) {
      continue;
    }
    const started = revealTrack(event);
    reconciled = [...withoutTrackAt(reconciled, started.position), started];
  }
  return reconciled;
}

export function collectHybridCcV1WallReveals(
  snapshot: HybridCcV1Snapshot,
): HybridCcV1WallRevealTrack[] {
  return reconcileHybridCcV1WallReveals([], snapshot);
}

export function activeHybridCcV1WallReveals(
  tracks: readonly HybridCcV1WallRevealTrack[],
  presentationSample: number,
): HybridCcV1WallRevealTrack[] {
  return tracks.filter((track) => {
    const elapsed = presentationSample - track.startPresentationSample;
    return elapsed >= 0 && elapsed < HYBRID_CC_V1_WALL_REVEAL_SAMPLE_COUNT;
  });
}

export function projectHybridCcV1WallReveals(
  tracks: readonly HybridCcV1WallRevealTrack[],
  presentationSample: number,
  width: number,
): InteractiveGameTileOverlay[] {
  return activeHybridCcV1WallReveals(tracks, presentationSample).flatMap((track) => {
    if (track.position.z !== 0) return [];
    return [{
      z: track.position.z,
      pos: track.position.y * width + track.position.x,
      kind: "hidden-wall-reveal" as const,
      render: {
        mode: "tile" as const,
        tileId: MS_TILE.Wall,
      },
    }];
  });
}
