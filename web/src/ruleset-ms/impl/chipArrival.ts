import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { ACTOR_INTERACTION_TARGET_KIND } from "@game-core/api/actorInteractions";
import { lookupTileBehaviorPhase } from "@game-core/api/ruleset";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msChipEnterAction, msRulesetCatalog } from "@ruleset-ms/impl/catalog";
import { msActorInteractionOutcome } from "@ruleset-ms/impl/actorInteractions";
import { projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import { type MsChipEnterTileBehaviorContext } from "@ruleset-ms/impl/chipEnterBehavior";
import { type MsPortableToolStateStore } from "@ruleset-ms/impl/portableItems";

export interface MsChipEntryState {
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
}

export interface MsChipEntryContext {
  inventory: EngineState["inventory"];
  portableTools: MsPortableToolStateStore;
  runtimeCellZ(pos: number): number;
  removeRuntimeActor(cells: EngineMapCell[], pos: number): void;
}

export interface MsChipEnteredTileResolution {
  enteredTeleport: boolean;
  soundEffects: number;
  floorTileBeforeMove: EngineMapCell["top"];
  movementFloorTile: EngineMapCell["top"];
}

export function applyMsChipEnterEffects(
  cells: EngineMapCell[],
  chip: MsChipEntryState,
  context: MsChipEntryContext,
  nextPos: number,
): MsChipEnteredTileResolution {
  const nextCell = cells[nextPos]!;
  let floorTileBeforeMove = { ...nextCell.top };
  let movementFloorTile = { ...nextCell.top };
  const chipInventory = projectMsActorInventoryOwner(MS_TILE.Chip, context.inventory);
  let enteredTeleport = false;
  let soundEffects = 0;
  for (let depth = 0; depth < 8; depth += 1) {
    floorTileBeforeMove = { ...nextCell.top };
    movementFloorTile = { ...nextCell.top };
    let continueIntoRevealedLowerTile = false;
    const floor = floorTileBeforeMove.id;
    const topIdBeforeResolution = nextCell.top.id;
    const topStateBeforeResolution = nextCell.top.state;
    const beginEnter = lookupTileBehaviorPhase(msRulesetCatalog.getTileBehavior(floor)!, "begin-enter");
    if (beginEnter !== null) {
      const behaviorContext: MsChipEnterTileBehaviorContext = {
        phase: "begin-enter",
        tileId: floor,
        actorId: MS_TILE.Chip,
        cells,
        chip,
        runtime: context,
        nextPos,
        nextCell,
        chipInventory,
        soundEffects,
        enteredTeleport,
        continueIntoRevealedLowerTile,
        floorTileBeforeMove,
      };
      beginEnter(behaviorContext);
      soundEffects = behaviorContext.soundEffects;
      enteredTeleport = behaviorContext.enteredTeleport;
      continueIntoRevealedLowerTile = behaviorContext.continueIntoRevealedLowerTile;
      floorTileBeforeMove = behaviorContext.floorTileBeforeMove;
    } else {
      switch (msChipEnterAction(floor)) {
      case "collision":
        const collisionOutcome = msActorInteractionOutcome(MS_TILE.Chip, {
          kind: ACTOR_INTERACTION_TARGET_KIND.runtimeActor,
          actorId: floor,
          tileId: floor,
        });
        if (collisionOutcome.chipFails) {
          chip.chipStatus = "collided";
        }
        if (collisionOutcome.removeTargetActor) {
          context.removeRuntimeActor(cells, nextPos);
        }
        break;
      case "none":
        break;
      case "explode-bomb":
      case "water-death":
      case "fire-death":
      case "teleport":
        break;
      }
    }

    movementFloorTile = { ...nextCell.top };
    if (
      chip.chipStatus !== "okay" ||
      enteredTeleport ||
      !continueIntoRevealedLowerTile ||
      (nextCell.top.id === topIdBeforeResolution && nextCell.top.state === topStateBeforeResolution)
    ) {
      break;
    }
  }

  return {
    enteredTeleport,
    soundEffects,
    floorTileBeforeMove,
    movementFloorTile,
  };
}
