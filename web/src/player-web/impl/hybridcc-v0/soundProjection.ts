import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import type { HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcActor, HybridCcSnapshot } from "./wasmBridge";

function soundBit(sound: number): number {
  return 1 << sound;
}

function chip(snapshot: HybridCcSnapshot): HybridCcActor | null {
  return snapshot.actors.find((actor) => actor.kind === 41) ?? null;
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}

function cellAt(level: HybridCcNativeLevel, snapshot: HybridCcSnapshot, actor: HybridCcActor) {
  if (actor.position.z !== 0) return null;
  return snapshot.cells[actor.position.y * level.width + actor.position.x] ?? null;
}

function cellAtPosition(
  level: HybridCcNativeLevel,
  snapshot: HybridCcSnapshot,
  position: HybridCcActor["position"],
) {
  if (position.z !== 0) return null;
  return snapshot.cells[position.y * level.width + position.x] ?? null;
}

export function projectHybridCcV0SoundEffects(
  level: HybridCcNativeLevel,
  previous: HybridCcSnapshot,
  current: HybridCcSnapshot,
  attemptedInput = 0,
): number {
  let mask = 0;
  const previousChip = chip(previous);
  const currentChip = chip(current);
  if (!previousChip || !currentChip) return mask;

  if (previous.outcome.kind === 0 && current.outcome.kind === 1) {
    mask |= soundBit(LYNX_SOUND.ChipWins);
  } else if (previous.outcome.kind === 0 && current.outcome.kind === 2) {
    mask |= soundBit(current.outcome.lossCause === 4 ? LYNX_SOUND.TimeOut : LYNX_SOUND.ChipLoses);
    if (current.outcome.lossCause === 1) mask |= soundBit(LYNX_SOUND.WaterSplash);
    if (current.outcome.lossCause === 3) mask |= soundBit(LYNX_SOUND.BombExplodes);
  }

  if (current.chipsCollected > previous.chipsCollected) {
    mask |= soundBit(LYNX_SOUND.IcCollected);
  }
  if (total(currentChip.keys) > total(previousChip.keys) || total(currentChip.tools) > total(previousChip.tools)) {
    mask |= soundBit(LYNX_SOUND.ItemCollected);
  }

  const previousCellAtCurrentPosition = cellAt(level, previous, currentChip);
  const currentCell = cellAt(level, current, currentChip);
  const previousCell = cellAt(level, previous, previousChip);
  const currentCellAtPreviousPosition = cellAtPosition(level, current, previousChip.position);
  const changedPosition = previousChip.position.x !== currentChip.position.x
    || previousChip.position.y !== currentChip.position.y
    || previousChip.position.z !== currentChip.position.z;
  if (attemptedInput !== 0 && !changedPosition && current.outcome.kind === 0) {
    mask |= soundBit(LYNX_SOUND.CantMove);
  }
  if (
    (previousCellAtCurrentPosition?.terrain.id === 6 || previousCellAtCurrentPosition?.terrain.id === 7)
    && currentCell?.terrain.id === 1
  ) {
    mask |= soundBit(LYNX_SOUND.TileEmptied);
  }
  if (
    (previousCellAtCurrentPosition?.terrain.id === 6 && currentCell?.terrain.id === 2)
    || (previousCell?.terrain.id === 14 && currentCellAtPreviousPosition?.terrain.id === 2)
  ) {
    mask |= soundBit(LYNX_SOUND.WallCreated);
  }
  if (changedPosition && currentCell?.terrain.id === 13) {
    mask |= soundBit(LYNX_SOUND.TrapEntered);
  }
  if (previousCellAtCurrentPosition?.device.id === 20 && currentCell?.device.id !== 20) {
    mask |= soundBit(LYNX_SOUND.DoorOpened);
  }
  if (previousCellAtCurrentPosition?.device.id === 21 && currentCell?.device.id !== 21) {
    mask |= soundBit(LYNX_SOUND.SocketOpened);
  }
  if (currentCell?.device.id === 18 && (
    previousChip.position.x !== currentChip.position.x || previousChip.position.y !== currentChip.position.y
  )) {
    mask |= soundBit(LYNX_SOUND.ButtonPushed);
  }
  if (currentCell?.terrain.id === 17 && (
    total(currentChip.keys) < total(previousChip.keys) || total(currentChip.tools) < total(previousChip.tools)
  )) {
    mask |= soundBit(LYNX_SOUND.BootsStolen);
  }

  const distance = Math.abs(currentChip.position.x - previousChip.position.x)
    + Math.abs(currentChip.position.y - previousChip.position.y);
  if (distance > 1 || (changedPosition && currentCell?.terrain.id === 12)) {
    mask |= soundBit(LYNX_SOUND.Teleporting);
  }

  switch (currentCell?.terrain.id) {
    case 4:
      if (currentChip.tools[0] > 0) mask |= soundBit(LYNX_SOUND.WaterWalking);
      break;
    case 5:
      if (currentChip.tools[1] > 0) mask |= soundBit(LYNX_SOUND.FireWalking);
      break;
    case 9:
      if (currentChip.tools[2] > 0) {
        mask |= soundBit(LYNX_SOUND.IceWalking);
      } else {
        mask |= soundBit(previousChip.direction === currentChip.direction
          ? LYNX_SOUND.SkatingForward
          : LYNX_SOUND.SkatingTurn);
      }
      break;
    case 10:
    case 11:
      mask |= soundBit(currentChip.tools[3] > 0 ? LYNX_SOUND.SlideWalking : LYNX_SOUND.Sliding);
      break;
    default:
      break;
  }

  const previousActors = new Map(previous.actors.map((actor) => [actor.id, actor]));
  if (current.actors.some((actor) => {
    if (actor.kind !== 30 && actor.kind !== 31) return false;
    const prior = previousActors.get(actor.id);
    return prior && (prior.position.x !== actor.position.x || prior.position.y !== actor.position.y);
  })) {
    mask |= soundBit(LYNX_SOUND.BlockMoving);
  }

  return mask;
}
