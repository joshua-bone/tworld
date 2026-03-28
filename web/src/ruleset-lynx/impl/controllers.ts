import { lynxActorControlMode, lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import { lynxActorHeldFloorOutcome } from "@ruleset-lynx/impl/actorInteractions";
import { MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxCreatureControllerActor {
  id: number;
  pos: number;
  z?: number;
  dir: number;
  intentDir: number;
  forcedDir: number;
  teleported: boolean;
}

export interface LynxCreatureControllerContext {
  chipPos: number;
  currentTime: number;
  stepping: number;
  withLayer<T>(z: number, run: () => T): T;
  floorAt(pos: number): number;
  canStart(actor: LynxCreatureControllerActor, dir: number): boolean;
  chooseBlobDirection(): number;
  chooseWalkerRandomDirection(dir: number): number;
  slideDirection(floorId: number): number;
}

function left(dir: number): number {
  switch (dir) {
    case 1:
      return 2;
    case 2:
      return 4;
    case 4:
      return 8;
    case 8:
      return 1;
    default:
      return 0;
  }
}

function right(dir: number): number {
  switch (dir) {
    case 1:
      return 8;
    case 2:
      return 1;
    case 4:
      return 2;
    case 8:
      return 4;
    default:
      return 0;
  }
}

function back(dir: number): number {
  switch (dir) {
    case 1:
      return 4;
    case 2:
      return 8;
    case 4:
      return 1;
    case 8:
      return 2;
    default:
      return 0;
  }
}

function isLynxSlide(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "slide";
}

function isLynxIce(tileId: number): boolean {
  return lynxTileForcedFloorKind(tileId) === "ice";
}

function chooseLynxCreatureFirstDirection(
  context: Pick<LynxCreatureControllerContext, "chipPos" | "currentTime" | "stepping" | "chooseBlobDirection">,
  actor: LynxCreatureControllerActor,
): number {
  const dir = actor.dir;

  switch (actor.id) {
    case MS_TILE.Tank:
    case MS_TILE.Ball:
    case MS_TILE.Glider:
    case MS_TILE.Fireball:
      return dir;
    case MS_TILE.Bug:
      return left(dir);
    case MS_TILE.Paramecium:
      return right(dir);
    case MS_TILE.Walker:
      return dir;
    case MS_TILE.Blob:
      return context.chooseBlobDirection();
    case MS_TILE.Teeth: {
      if (((context.currentTime + context.stepping) & 4) !== 0) {
        return 0;
      }
      const dy = Math.floor(context.chipPos / MS_GRID_WIDTH) - Math.floor(actor.pos / MS_GRID_WIDTH);
      const dx = (context.chipPos % MS_GRID_WIDTH) - (actor.pos % MS_GRID_WIDTH);
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx < 0 ? 2 : dx > 0 ? 8 : 0;
      }
      return dy < 0 ? 1 : dy > 0 ? 4 : 0;
    }
    default:
      return 0;
  }
}

function chooseLynxCreatureFallbackDirections(actor: LynxCreatureControllerActor, firstChoice: number): number[] {
  switch (actor.id) {
    case MS_TILE.Tank:
      return firstChoice ? [firstChoice] : [];
    case MS_TILE.Ball:
      return [firstChoice, back(actor.dir)].filter((dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index);
    case MS_TILE.Glider:
      return [firstChoice, left(actor.dir), right(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Fireball:
      return [firstChoice, right(actor.dir), left(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Bug:
      return [firstChoice, actor.dir, right(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    case MS_TILE.Paramecium:
      return [firstChoice, actor.dir, left(actor.dir), back(actor.dir)].filter(
        (dir, index, dirs) => dir !== 0 && dirs.indexOf(dir) === index,
      );
    default:
      return firstChoice ? [firstChoice] : [];
  }
}

function chooseTeethFallbackDirections(chipPos: number, actorPos: number): number[] {
  const dy = Math.floor(chipPos / MS_GRID_WIDTH) - Math.floor(actorPos / MS_GRID_WIDTH);
  const dx = (chipPos % MS_GRID_WIDTH) - (actorPos % MS_GRID_WIDTH);
  const vertical = dy < 0 ? 1 : dy > 0 ? 4 : 0;
  const horizontal = dx < 0 ? 2 : dx > 0 ? 8 : 0;
  return Math.abs(dx) > Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
}

export function chooseLynxCreatureMoveForTick(
  context: LynxCreatureControllerContext,
  actor: LynxCreatureControllerActor,
): void {
  context.withLayer(actor.z ?? 1, () => {
    actor.intentDir = 0;
    actor.forcedDir = 0;

    if (actor.teleported) {
      actor.forcedDir = actor.dir;
      actor.teleported = false;
      return;
    }

    const floor = context.floorAt(actor.pos);
    if (context.currentTime !== 0 && isLynxSlide(floor)) {
      actor.forcedDir = context.slideDirection(floor);
      return;
    }
    if (context.currentTime !== 0 && isLynxIce(floor)) {
      actor.forcedDir = actor.dir;
      return;
    }

    if (lynxActorControlMode(actor.id) === "passive") {
      return;
    }

    if (lynxActorControlMode(actor.id) === "ballistic") {
      actor.intentDir = actor.dir;
      return;
    }

    if (lynxActorHeldFloorOutcome(floor, actor.id) === "hold-direction") {
      actor.intentDir = actor.dir;
      return;
    }

    if (actor.id === MS_TILE.Teeth) {
      if (((context.currentTime + context.stepping) & 4) !== 0) {
        return;
      }
      const fallbackDirs = chooseTeethFallbackDirections(context.chipPos, actor.pos);
      for (const dir of fallbackDirs) {
        if (dir === 0) {
          continue;
        }
        actor.intentDir = dir;
        if (context.canStart(actor, dir)) {
          return;
        }
      }
      actor.intentDir = fallbackDirs[0] ?? 0;
      return;
    }

    const firstChoice = chooseLynxCreatureFirstDirection(context, actor);

    if (actor.id === MS_TILE.Walker) {
      if (firstChoice !== 0) {
        actor.intentDir = firstChoice;
        if (context.canStart(actor, firstChoice)) {
          return;
        }
      }

      const randomDir = context.chooseWalkerRandomDirection(actor.dir);
      if (randomDir !== 0) {
        actor.intentDir = randomDir;
      }
      return;
    }

    const fallbackDirs = chooseLynxCreatureFallbackDirections(actor, firstChoice);
    for (const dir of fallbackDirs) {
      actor.intentDir = dir;
      if (context.canStart(actor, dir)) {
        return;
      }
    }
  });
}
