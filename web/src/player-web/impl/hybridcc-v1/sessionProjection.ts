import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  buildCompletedRunState,
  buildFailedRunState,
  buildInteractiveFailureCause,
  buildLiveRunState,
} from "@game-runtime/impl/interactiveSessionRun";
import { MS_STATUS_FLAG, MS_TILE } from "@ruleset-ms/api/tiles";
import { HybridCcV1ActorSerialRegistry } from "./actorSerialRegistry";
import { hybridCcV1ClonerSourceOccupant } from "./clonerPresentation";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_OUTCOME,
} from "./engineFacts";
import {
  hybridCcV1TerminalDeathFrame,
  hybridCcV1TerminalDeathTile,
  projectHybridCcV1LifecycleAnimations,
  type HybridCcV1LifecycleAnimationTrack,
} from "./lifecycleAnimationProjection";
import {
  hybridCcV1ActorMotionTrack,
  hybridCcV1ChipPushing,
  hybridCcV1PresentedMotion,
  hybridCcV1TerminalCameraTrack,
} from "./presentationProjection";
import {
  hybridCcV1ActorTile,
  hybridCcV1Direction,
  projectHybridCcV1Cell,
  projectHybridCcV1Inventory,
} from "./renderProjection";
import {
  projectHybridCcV1WallReveals,
  type HybridCcV1WallRevealTrack,
} from "./wallRevealProjection";
import type {
  HybridCcV1Actor,
  HybridCcV1ConvertedLevel,
  HybridCcV1MotionTrack,
  HybridCcV1Position,
  HybridCcV1Snapshot,
} from "./wasmBridge";

export interface HybridCcV1SessionProjectionOptions {
  level: HybridCcV1ConvertedLevel;
  snapshot: HybridCcV1Snapshot;
  presentationSample: number;
  soundEffects: number;
  recordedBoundaryCount: number;
  replayAvailable: boolean;
  exposeTerminal: boolean;
  mode: "manual" | "replay";
  lastInput: number;
  actorSerials: HybridCcV1ActorSerialRegistry;
  lifecycleAnimations: readonly HybridCcV1LifecycleAnimationTrack[];
  wallReveals: readonly HybridCcV1WallRevealTrack[];
}

function safeBoundary(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Hybrid v1 logic boundary ${value} cannot be represented safely by the browser.`);
  }
  return result;
}

function mapPosition(position: HybridCcV1Position, width: number): number {
  return position.y * width + position.x;
}

function gridPosition(position: HybridCcV1Position) {
  return { x: position.x + 1, y: position.y + 1, z: position.z + 1 };
}

function actorName(lossCause: number): string | null {
  switch (lossCause) {
    case HYBRID_CC_V1_LOSS.ant: return "bug";
    case HYBRID_CC_V1_LOSS.centipede: return "paramecium";
    case HYBRID_CC_V1_LOSS.glider: return "glider";
    case HYBRID_CC_V1_LOSS.fireball: return "fireball";
    case HYBRID_CC_V1_LOSS.blob: return "blob";
    case HYBRID_CC_V1_LOSS.teeth: return "teeth";
    case HYBRID_CC_V1_LOSS.ball: return "ball";
    case HYBRID_CC_V1_LOSS.walker: return "walker";
    case HYBRID_CC_V1_LOSS.tank: return "tank";
    case HYBRID_CC_V1_LOSS.dirtBlock: return "block";
    default: return null;
  }
}

function actorKindForLoss(lossCause: number): number | null {
  switch (lossCause) {
    case HYBRID_CC_V1_LOSS.ant: return HYBRID_CC_V1_ELEMENT.ant;
    case HYBRID_CC_V1_LOSS.centipede: return HYBRID_CC_V1_ELEMENT.centipede;
    case HYBRID_CC_V1_LOSS.glider: return HYBRID_CC_V1_ELEMENT.glider;
    case HYBRID_CC_V1_LOSS.fireball: return HYBRID_CC_V1_ELEMENT.fireball;
    case HYBRID_CC_V1_LOSS.blob: return HYBRID_CC_V1_ELEMENT.blob;
    case HYBRID_CC_V1_LOSS.teeth: return HYBRID_CC_V1_ELEMENT.teeth;
    case HYBRID_CC_V1_LOSS.ball: return HYBRID_CC_V1_ELEMENT.ball;
    case HYBRID_CC_V1_LOSS.walker: return HYBRID_CC_V1_ELEMENT.walker;
    case HYBRID_CC_V1_LOSS.tank: return HYBRID_CC_V1_ELEMENT.tank;
    case HYBRID_CC_V1_LOSS.dirtBlock: return HYBRID_CC_V1_ELEMENT.dirtBlock;
    default: return null;
  }
}

function failureCause(snapshot: HybridCcV1Snapshot) {
  const outcome = snapshot.header.outcome;
  const position = gridPosition(outcome.position);
  const coordinate = `(${position.x}, ${position.y})`;
  switch (outcome.lossCause) {
    case HYBRID_CC_V1_LOSS.water:
      return buildInteractiveFailureCause({ kind: "water", message: `Drowned at ${coordinate}`, position });
    case HYBRID_CC_V1_LOSS.fire:
      return buildInteractiveFailureCause({ kind: "fire", message: `Stepped in fire at ${coordinate}`, position });
    case HYBRID_CC_V1_LOSS.bomb:
      return buildInteractiveFailureCause({ kind: "bomb", message: `Hit a bomb at ${coordinate}`, position });
    case HYBRID_CC_V1_LOSS.clock:
      return buildInteractiveFailureCause({
        kind: "timeout",
        message: `Ran out of time at ${(safeBoundary(outcome.logicBoundary) / 10).toFixed(1)}s`,
        position,
      });
    default: {
      const name = actorName(outcome.lossCause);
      const kind = actorKindForLoss(outcome.lossCause);
      return buildInteractiveFailureCause({
        actorName: name,
        kind: name ? "monster" : "other",
        message: name ? `Killed by ${name} at ${coordinate}` : `Failed at ${coordinate}`,
        position,
        tileId: kind === null ? null : hybridCcV1ActorTile(kind),
      });
    }
  }
}

function inputName(input: number): string {
  switch (input) {
    case 0: return "none";
    case 1: return "north";
    case 2: return "east";
    case 3: return "south";
    case 4: return "west";
    default: return `hybrid-${input}`;
  }
}

function actorTrack(actor: HybridCcV1Actor): HybridCcV1MotionTrack | null {
  return hybridCcV1ActorMotionTrack(actor);
}

function playerVisualDirection(
  player: HybridCcV1Actor | null,
  cameraTrack: HybridCcV1MotionTrack | null,
  snapshot: HybridCcV1Snapshot,
  engineLoss: boolean,
): number {
  if (engineLoss) return cameraTrack?.direction ?? player?.direction ?? 0;

  // A completed motion track remains published so the camera can finish its
  // interpolation. It must not override the player's newer live facing.
  return snapshot.presentation.playerPush?.direction
    ?? (player?.hasMovement ? player.movement.direction : player?.direction)
    ?? 0;
}

function renderPosition(
  actor: HybridCcV1Actor,
  motion: ReturnType<typeof hybridCcV1PresentedMotion>,
): HybridCcV1Position {
  return motion.position ?? actor.logicalPosition;
}

function projectActor(
  actor: HybridCcV1Actor,
  width: number,
  presentationSample: number,
  actorSerials: HybridCcV1ActorSerialRegistry,
) {
  const motion = hybridCcV1PresentedMotion(actorTrack(actor), presentationSample);
  const position = renderPosition(actor, motion);
  const tileId = hybridCcV1ActorTile(actor.kind);
  const direction = hybridCcV1Direction(actor.hasMovement ? actor.movement.direction : actor.direction);
  return {
    serial: actorSerials.serial(actor.id),
    id: tileId,
    pos: mapPosition(position, width),
    z: position.z,
    dir: direction,
    moving: motion.moving,
    frame: motion.frame,
    hidden: false,
    visual: {
      kind: "creature" as const,
      tileId,
      dir: direction,
      moving: motion.moving,
      frame: motion.frame,
    },
  };
}

function projectClonerSourceOccupant(
  actor: HybridCcV1Actor,
  width: number,
  presentationSample: number,
) {
  const occupant = hybridCcV1ClonerSourceOccupant(actor, presentationSample);
  if (!occupant) return null;
  const tileId = hybridCcV1ActorTile(occupant.actorKind);
  const direction = hybridCcV1Direction(occupant.direction);
  return {
    id: tileId,
    pos: mapPosition(occupant.position, width),
    z: occupant.position.z,
    dir: direction,
    moving: 0,
    frame: 0,
    hidden: false,
    visual: {
      kind: "creature" as const,
      tileId,
      dir: direction,
      moving: 0,
      frame: 0,
    },
  };
}

function activeHintText(level: HybridCcV1ConvertedLevel, snapshot: HybridCcV1Snapshot): string | null {
  const activeHint = snapshot.presentation.activeHint;
  if (!activeHint) return null;
  return level.nativeLevel.texts[activeHint.textIndex] ?? (level.nativeLevel.hint || null);
}

export function projectHybridCcV1Session(
  options: HybridCcV1SessionProjectionOptions,
): Omit<InteractiveGameSession, "request" | "handle"> {
  const {
    actorSerials,
    exposeTerminal,
    lastInput,
    level,
    lifecycleAnimations,
    mode,
    presentationSample,
    recordedBoundaryCount,
    replayAvailable,
    snapshot,
    soundEffects,
    wallReveals,
  } = options;
  const { nativeLevel } = level;
  const cells = snapshot.cells.map((cell, position) => (
    projectHybridCcV1Cell(cell, position, nativeLevel.width)
  ));
  const actors = snapshot.actors.filter((actor) => actor.alive && actor.logicalPosition.z === 0);
  const player = actors.find((actor) => actor.kind === HYBRID_CC_V1_ELEMENT.player) ?? null;
  const nonPlayers = actors.filter((actor) => actor.kind !== HYBRID_CC_V1_ELEMENT.player);
  const terminal = exposeTerminal && snapshot.header.outcome.kind !== HYBRID_CC_V1_OUTCOME.unfinished;
  const status = terminal
    ? snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.win ? "completed" : "failed"
    : "playing";
  const boundary = safeBoundary(snapshot.header.logicBoundary);
  const gameplayBoundary = snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.unfinished
    ? boundary
    : safeBoundary(snapshot.header.outcome.logicBoundary);
  const gameplayPresentationSample = snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.unfinished
    ? presentationSample
    : gameplayBoundary * 2;
  const endPosition = terminal ? gridPosition(snapshot.header.outcome.position) : null;
  const run = status === "completed"
    ? buildCompletedRunState(
        nativeLevel.number,
        nativeLevel.timeLimitSeconds * 20,
        gameplayPresentationSample,
        0,
        endPosition,
        replayAvailable,
      )
    : status === "failed"
      ? {
          ...buildFailedRunState(0, failureCause(snapshot), endPosition, replayAvailable),
          continuesAfterResult: true,
        }
      : buildLiveRunState(0, false);

  const playerTrack = player
    ? snapshot.presentation.playerMotion ?? actorTrack(player)
    : snapshot.presentation.terminalMotion;
  const playerMotion = player
    ? hybridCcV1PresentedMotion(playerTrack, presentationSample)
    : hybridCcV1TerminalCameraTrack(playerTrack, presentationSample);
  const playerPosition = playerMotion.position
    ?? player?.logicalPosition
    ?? snapshot.header.outcome.position;
  const engineLoss = snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.loss;
  const playerDirection = playerVisualDirection(player, playerTrack, snapshot, engineLoss);
  const terminalMotionActive = engineLoss && playerMotion.active;
  const terminalDeathFrame = engineLoss && !terminalMotionActive
    ? hybridCcV1TerminalDeathFrame(
        snapshot,
        presentationSample,
        playerTrack?.presentationSampleCount ?? 0,
      )
    : null;
  const terminalDeathTile = hybridCcV1TerminalDeathTile(snapshot.header.outcome.lossCause);
  const chipFailed = engineLoss && !terminalMotionActive;
  const chipPushing = !engineLoss && hybridCcV1ChipPushing(snapshot);
  const playerTile = chipFailed ? terminalDeathTile : MS_TILE.Chip;
  const chipRender = player || playerTrack || engineLoss ? {
    pos: mapPosition(playerPosition, nativeLevel.width),
    z: playerPosition.z,
    dir: hybridCcV1Direction(playerDirection),
    moving: terminalMotionActive || !engineLoss ? playerMotion.moving : 0,
    pushing: chipPushing,
    hidden: false,
    failed: chipFailed,
    endGameAnimationTileId: chipFailed ? terminalDeathTile : null,
    endGameAnimationFrame: chipFailed ? terminalDeathFrame : null,
    visual: chipFailed
      ? terminalDeathFrame === null ? null : {
          kind: "creature" as const,
          tileId: terminalDeathTile,
          dir: hybridCcV1Direction(playerDirection),
          moving: 0,
          frame: terminalDeathFrame,
        }
      : {
          kind: "creature" as const,
          tileId: chipPushing ? MS_TILE.Pushing_Chip : playerTile,
          dir: hybridCcV1Direction(playerDirection),
          moving: playerMotion.moving,
          frame: playerMotion.frame,
        },
  } : null;
  const inventory = projectHybridCcV1Inventory(snapshot.inventory, level.requiredChips);
  const hintText = activeHintText(level, snapshot);
  const statusFlags = (hintText ? MS_STATUS_FLAG.ShowHint : 0)
    | (boundary === 0 ? MS_STATUS_FLAG.NoAnimation : 0);
  const stateHash = snapshot.header.stateHash.toString(16);
  const chipPosition = player?.logicalPosition ?? snapshot.header.outcome.position;

  return {
    mode,
    hintText,
    frame: {
      snapshot: {
        phase: status,
        input: inputName(lastInput),
        inputCode: lastInput,
        status,
        tick: gameplayPresentationSample,
        currentTime: gameplayPresentationSample,
        timeOffset: 0,
        secondsPlayed: Math.floor(gameplayBoundary / 10),
        timelimit: nativeLevel.timeLimitSeconds * 20,
        chipsNeeded: inventory.chipsNeeded,
        statusFlags,
        lastMoveCode: lastInput,
        lastMove: inputName(lastInput),
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: gameplayBoundary,
        randomState: {
          main: {
            initial: String(snapshot.header.randomSeed),
            value: stateHash,
            shared: false,
          },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects,
        view: { x: playerPosition.x * 8, y: playerPosition.y * 8 },
        inventory: { keys: inventory.keys, boots: inventory.boots, tools: inventory.tools },
        chip: player ? {
          id: MS_TILE.Chip,
          layer: 0,
          dir: String(hybridCcV1Direction(player.direction)),
          position: {
            ...chipPosition,
            pos: mapPosition(chipPosition, nativeLevel.width),
          },
          state: 0,
        } : null,
        creatureCount: nonPlayers.length,
        creaturesHash: stateHash,
        mapHash: stateHash,
        creatures: nonPlayers.map((actor) => ({
          id: hybridCcV1ActorTile(actor.kind),
          layer: 0,
          dir: String(hybridCcV1Direction(actor.direction)),
          position: {
            ...actor.logicalPosition,
            pos: mapPosition(actor.logicalPosition, nativeLevel.width),
          },
          state: 0,
        })),
      },
      cells,
      currentZ: 0,
      visibleLayers: [{ z: 0, cells }],
      tileOverlays: projectHybridCcV1WallReveals(
        wallReveals,
        presentationSample,
        nativeLevel.width,
      ),
      render: {
        chip: chipRender,
        actors: nonPlayers.flatMap((actor) => {
          const sourceOccupant = projectClonerSourceOccupant(
            actor,
            nativeLevel.width,
            presentationSample,
          );
          const movingActor = projectActor(
            actor,
            nativeLevel.width,
            presentationSample,
            actorSerials,
          );
          return sourceOccupant ? [sourceOccupant, movingActor] : [movingActor];
        }),
        animations: projectHybridCcV1LifecycleAnimations(
          lifecycleAnimations,
          presentationSample,
          nativeLevel.width,
        ),
      },
    },
    history: {
      enabled: false,
      initialTick: 0,
      currentTick: gameplayPresentationSample,
      latestTick: gameplayPresentationSample,
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "hybridcc-v1",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run,
    recordedMoveCount: recordedBoundaryCount,
  };
}
