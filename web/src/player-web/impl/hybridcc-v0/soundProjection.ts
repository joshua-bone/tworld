import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import {
  HYBRID_CC_V0_EVENT,
  HYBRID_CC_V0_INTERACTION,
} from "./engineFacts";
import type { HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcV0MotionTracks } from "./motionProjection";
import type { HybridCcActor, HybridCcEngineEvent, HybridCcSnapshot } from "./wasmBridge";

function soundBit(sound: number): number {
  return 1 << sound;
}

function actor(snapshot: HybridCcSnapshot, actorId: number): HybridCcActor | null {
  return snapshot.actors.find((candidate) => candidate.id === actorId) ?? null;
}

function chip(snapshot: HybridCcSnapshot): HybridCcActor | null {
  return snapshot.actors.find((candidate) => candidate.kind === 41) ?? null;
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function movedPlayer(events: readonly HybridCcEngineEvent[]): boolean {
  return events.some((event) => event.kind === HYBRID_CC_V0_EVENT.actorMoved && event.actorKind === 41);
}

function surfaceSound(
  terrainId: number,
  currentActor: HybridCcActor | null,
  previousActor: HybridCcActor | null,
): number | null {
  switch (terrainId) {
    case 4:
      return currentActor?.tools[0] ? LYNX_SOUND.WaterWalking : null;
    case 5:
      return currentActor?.tools[1] ? LYNX_SOUND.FireWalking : null;
    case 9:
      if (currentActor?.tools[2]) return LYNX_SOUND.IceWalking;
      return previousActor?.direction === currentActor?.direction
        ? LYNX_SOUND.SkatingForward
        : LYNX_SOUND.SkatingTurn;
    case 10:
    case 11:
      return currentActor?.tools[3] ? LYNX_SOUND.SlideWalking : LYNX_SOUND.Sliding;
    default:
      return null;
  }
}

function terminalSounds(event: HybridCcEngineEvent): number {
  if (event.lossCause === 0) return soundBit(LYNX_SOUND.ChipWins);
  let mask = soundBit(event.lossCause === 4 ? LYNX_SOUND.TimeOut : LYNX_SOUND.ChipLoses);
  if (event.lossCause === 1) mask |= soundBit(LYNX_SOUND.WaterSplash);
  if (event.lossCause === 3) mask |= soundBit(LYNX_SOUND.BombExplodes);
  return mask;
}

/**
 * Projects browser audio from ABI v2 facts. One-shots come from the ordered
 * event journal; loops exist only while a committed motion track is visible.
 * Snapshot comparison is retained solely for the thief's aggregate clear,
 * whose v0 event intentionally has no removed-item count.
 */
export function projectHybridCcV0SoundEffects(
  _level: HybridCcNativeLevel,
  previous: HybridCcSnapshot,
  current: HybridCcSnapshot,
  attemptedInput = 0,
  motionTracks: HybridCcV0MotionTracks = new Map(),
  presentationTick = current.logicStep * 2,
): number {
  let mask = 0;

  for (const event of current.events) {
    if (event.kind === HYBRID_CC_V0_EVENT.terminal) {
      mask |= terminalSounds(event);
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.actorDestroyed && event.lossCause === 3) {
      mask |= soundBit(LYNX_SOUND.BombExplodes);
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.inventoryChanged && event.amount > 0) {
      mask |= soundBit(event.subject.id === 22 ? LYNX_SOUND.IcCollected : LYNX_SOUND.ItemCollected);
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.deviceChanged) {
      if (event.subject.id === 20) mask |= soundBit(LYNX_SOUND.DoorOpened);
      if (event.subject.id === 21) mask |= soundBit(LYNX_SOUND.SocketOpened);
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.terrainChanged) {
      if ((event.subject.id === 6 || event.subject.id === 7) && event.replacement.id === 1) {
        mask |= soundBit(LYNX_SOUND.TileEmptied);
      }
      if ((event.subject.id === 6 || event.subject.id === 14) && event.replacement.id === 2) {
        mask |= soundBit(LYNX_SOUND.WallCreated);
      }
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.interaction) {
      if (event.interaction === HYBRID_CC_V0_INTERACTION.activate && event.subject.id === 18) {
        mask |= soundBit(LYNX_SOUND.ButtonPushed);
      }
      if (event.interaction === HYBRID_CC_V0_INTERACTION.teleport) {
        mask |= soundBit(LYNX_SOUND.Teleporting);
      }
      continue;
    }

    if (event.kind === HYBRID_CC_V0_EVENT.actorMoved && event.subject.id === 13) {
      mask |= soundBit(LYNX_SOUND.TrapEntered);
    }
  }

  const previousChip = chip(previous);
  const currentChip = chip(current);
  if (
    previousChip
    && currentChip
    && (total(currentChip.keys) < total(previousChip.keys) || total(currentChip.tools) < total(previousChip.tools))
    && current.events.some((event) => event.kind === HYBRID_CC_V0_EVENT.inventoryChanged && event.amount === 0)
  ) {
    mask |= soundBit(LYNX_SOUND.BootsStolen);
  }

  if (attemptedInput !== 0 && current.outcome.kind === 0 && !movedPlayer(current.events)) {
    mask |= soundBit(LYNX_SOUND.CantMove);
  }

  for (const track of motionTracks.values()) {
    const elapsed = presentationTick - track.startedAtPresentationTick;
    if (elapsed < 0 || elapsed >= track.durationPresentationTicks) continue;
    if (track.actorKind === 30 || track.actorKind === 31) {
      mask |= soundBit(LYNX_SOUND.BlockMoving);
      continue;
    }
    if (track.actorKind !== 41) continue;
    const sound = surfaceSound(
      track.surfaceId,
      actor(current, track.actorId),
      actor(previous, track.actorId),
    );
    if (sound !== null) mask |= soundBit(sound);
  }

  return mask;
}
