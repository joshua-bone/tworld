import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import { hybridCcV1PresentedMotion } from "./presentationProjection";
import type {
  HybridCcV1Event,
  HybridCcV1InventoryQuantity,
  HybridCcV1MotionTrack,
  HybridCcV1Position,
  HybridCcV1Snapshot,
} from "./wasmBridge";

function soundBit(sound: number): number {
  return 1 << sound;
}

function quantityDecreased(
  before: HybridCcV1InventoryQuantity,
  after: HybridCcV1InventoryQuantity,
): boolean {
  if (before.unlimited !== after.unlimited) return before.unlimited;
  return after.count < before.count;
}

function collectedPickupSound(event: HybridCcV1Event): number | null {
  if (
    event.actorKind !== HYBRID_CC_V1_ELEMENT.player
    || event.replacement.id !== HYBRID_CC_V1_ELEMENT.none
  ) {
    return null;
  }

  switch (event.subject.id) {
    case HYBRID_CC_V1_ELEMENT.chip:
      return LYNX_SOUND.IcCollected;
    case HYBRID_CC_V1_ELEMENT.key:
    case HYBRID_CC_V1_ELEMENT.forceBoots:
    case HYBRID_CC_V1_ELEMENT.iceSkates:
    case HYBRID_CC_V1_ELEMENT.flippers:
    case HYBRID_CC_V1_ELEMENT.fireBoots:
      return LYNX_SOUND.ItemCollected;
    default:
      return null;
  }
}

function cellAt(snapshot: HybridCcV1Snapshot, position: HybridCcV1Position) {
  if (position.z !== 0 || position.x < 0 || position.y < 0) return null;
  const index = position.y * snapshot.header.width + position.x;
  return snapshot.cells[index] ?? null;
}

function terminalSounds(event: HybridCcV1Event): number {
  if (event.lossCause === HYBRID_CC_V1_LOSS.none) return soundBit(LYNX_SOUND.ChipWins);
  if (event.lossCause === HYBRID_CC_V1_LOSS.clock) return 0;
  if (event.lossCause === HYBRID_CC_V1_LOSS.water) return soundBit(LYNX_SOUND.WaterSplash);
  if (event.lossCause === HYBRID_CC_V1_LOSS.bomb) return soundBit(LYNX_SOUND.BombExplodes);
  return soundBit(LYNX_SOUND.ChipLoses);
}

/** One-shot sounds are causal pulses from the current ordered event journal. */
export function projectHybridCcV1OneShotSounds(snapshot: HybridCcV1Snapshot): number {
  let sounds = 0;
  for (const event of snapshot.events) {
    if (event.kind === HYBRID_CC_V1_EVENT.terminal) {
      sounds |= terminalSounds(event);
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.actorDestroyed) {
      if (event.lossCause === HYBRID_CC_V1_LOSS.water) {
        sounds |= soundBit(LYNX_SOUND.WaterSplash);
      }
      if (event.lossCause === HYBRID_CC_V1_LOSS.bomb) {
        sounds |= soundBit(LYNX_SOUND.BombExplodes);
      }
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.moveRejected && event.actorKind === HYBRID_CC_V1_ELEMENT.player) {
      sounds |= soundBit(LYNX_SOUND.CantMove);
      continue;
    }
    if (
      event.kind === HYBRID_CC_V1_EVENT.moveStarted &&
      event.owner === HYBRID_CC_V1_MOVEMENT_OWNER.teleport &&
      event.actorKind === HYBRID_CC_V1_ELEMENT.player
    ) {
      sounds |= soundBit(LYNX_SOUND.Teleporting);
    }
    if (
      event.kind === HYBRID_CC_V1_EVENT.moveStarted &&
      cellAt(snapshot, event.destination)?.terrain.id === HYBRID_CC_V1_ELEMENT.trap
    ) {
      sounds |= soundBit(LYNX_SOUND.TrapEntered);
    }
    if (event.kind === HYBRID_CC_V1_EVENT.pickupChanged) {
      const collectedSound = collectedPickupSound(event);
      if (collectedSound !== null) sounds |= soundBit(collectedSound);
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.inventoryChanged) {
      if (
        quantityDecreased(event.inventoryBefore, event.inventoryAfter) &&
        cellAt(snapshot, event.destination)?.terrain.id === HYBRID_CC_V1_ELEMENT.thief
      ) {
        sounds |= soundBit(LYNX_SOUND.BootsStolen);
      }
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.deviceChanged) {
      if (event.subject.id === HYBRID_CC_V1_ELEMENT.door) sounds |= soundBit(LYNX_SOUND.DoorOpened);
      if (event.subject.id === HYBRID_CC_V1_ELEMENT.socket) sounds |= soundBit(LYNX_SOUND.SocketOpened);
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.terrainChanged) {
      if (
        (event.subject.id === HYBRID_CC_V1_ELEMENT.trickWall ||
          event.subject.id === HYBRID_CC_V1_ELEMENT.dirt ||
          event.subject.id === HYBRID_CC_V1_ELEMENT.steppingStone) &&
        event.replacement.id === HYBRID_CC_V1_ELEMENT.floor
      ) {
        sounds |= soundBit(LYNX_SOUND.TileEmptied);
      }
      if (
        (event.subject.id === HYBRID_CC_V1_ELEMENT.trickWall ||
          event.subject.id === HYBRID_CC_V1_ELEMENT.steppingStone) &&
        event.replacement.id === HYBRID_CC_V1_ELEMENT.wall
      ) {
        sounds |= soundBit(LYNX_SOUND.WallCreated);
      }
      continue;
    }
    if (event.kind === HYBRID_CC_V1_EVENT.interaction) {
      if (
        event.interaction === HYBRID_CC_V1_INTERACTION.activate &&
        event.subject.id === HYBRID_CC_V1_ELEMENT.button
      ) {
        sounds |= soundBit(LYNX_SOUND.ButtonPushed);
      }
      if (
        event.interaction === HYBRID_CC_V1_INTERACTION.teleport
        && event.actorKind === HYBRID_CC_V1_ELEMENT.player
      ) {
        sounds |= soundBit(LYNX_SOUND.Teleporting);
      }
      if (
        event.interaction === HYBRID_CC_V1_INTERACTION.push
        && event.actorKind === HYBRID_CC_V1_ELEMENT.player
      ) {
        sounds |= soundBit(LYNX_SOUND.BlockMoving);
      }
    }
  }
  return sounds;
}

function inventoryHas(snapshot: HybridCcV1Snapshot, kind: number): boolean {
  const quantity = snapshot.inventory.find((entry) => entry.identity.kind === kind)?.quantity;
  return quantity?.unlimited === true || (quantity?.count ?? 0n) > 0n;
}

function previousDirection(
  snapshot: HybridCcV1Snapshot | undefined,
  actorId: bigint,
): number | null {
  return snapshot?.actors.find((actor) => actor.id === actorId)?.direction ?? null;
}

function movingSurfaceSound(
  snapshot: HybridCcV1Snapshot,
  previous: HybridCcV1Snapshot | undefined,
  track: HybridCcV1MotionTrack,
): number | null {
  const terrain = cellAt(snapshot, track.destination)?.terrain.id;
  switch (terrain) {
    case HYBRID_CC_V1_ELEMENT.water:
      return inventoryHas(snapshot, HYBRID_CC_V1_ELEMENT.flippers) ? LYNX_SOUND.WaterWalking : null;
    case HYBRID_CC_V1_ELEMENT.fire:
      return inventoryHas(snapshot, HYBRID_CC_V1_ELEMENT.fireBoots) ? LYNX_SOUND.FireWalking : null;
    case HYBRID_CC_V1_ELEMENT.ice:
      if (inventoryHas(snapshot, HYBRID_CC_V1_ELEMENT.iceSkates)) return LYNX_SOUND.IceWalking;
      return previousDirection(previous, track.actorId) !== null &&
        previousDirection(previous, track.actorId) !== track.direction
        ? LYNX_SOUND.SkatingTurn
        : LYNX_SOUND.SkatingForward;
    case HYBRID_CC_V1_ELEMENT.forceFloor:
    case HYBRID_CC_V1_ELEMENT.randomForceFloor:
      return inventoryHas(snapshot, HYBRID_CC_V1_ELEMENT.forceBoots)
        ? LYNX_SOUND.SlideWalking
        : LYNX_SOUND.Sliding;
    default:
      return null;
  }
}

/** Loop bits exist only while their corresponding motion is visibly active. */
export function projectHybridCcV1LoopSounds(
  snapshot: HybridCcV1Snapshot,
  tracks: readonly HybridCcV1MotionTrack[],
  presentationSample: number,
  previous?: HybridCcV1Snapshot,
): number {
  let sounds = 0;
  for (const track of tracks) {
    if (!hybridCcV1PresentedMotion(track, presentationSample).active) continue;
    if (track.actorKind !== HYBRID_CC_V1_ELEMENT.player) continue;
    const surface = movingSurfaceSound(snapshot, previous, track);
    if (surface !== null) sounds |= soundBit(surface);
  }
  return sounds;
}
