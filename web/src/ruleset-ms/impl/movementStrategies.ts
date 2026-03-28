import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { ActorMovementStrategyId } from "@game-core/api/actorCapabilities";
import { blockedMovement, type MovementAttemptResult } from "@game-core/api/movementOutcomes";

export interface MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext> {
  canStartMove(cells: EngineMapCell[], internal: TInternal, inventory: TInventory, dir: number): boolean;
  startMove(cells: EngineMapCell[], internal: TInternal, inventory: TInventory, dir: number): MovementAttemptResult;
  startDownMove(sourceCells: EngineMapCell[], targetCells: EngineMapCell[], internal: TInternal, inventory: TInventory): MovementAttemptResult;
  startUpMove(sourceCells: EngineMapCell[], targetCells: EngineMapCell[], internal: TInternal, inventory: TInventory): MovementAttemptResult;
  runForcedMove(context: TForcedContext, cells: EngineMapCell[]): number;
}

export interface MsCreatureMovementStrategyContext<TCreature, TInternal> {
  canStartMove(cells: EngineMapCell[], creature: TCreature, dir: number, internal: TInternal): boolean;
  startMove(cells: EngineMapCell[], creature: TCreature, dir: number, internal: TInternal): MovementAttemptResult;
  startDownMove(
    engine: EngineState,
    sourceCells: EngineMapCell[],
    targetCells: EngineMapCell[],
    layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
    creature: TCreature,
    internal: TInternal,
  ): MovementAttemptResult;
  startUpMove(
    engine: EngineState,
    sourceCells: EngineMapCell[],
    targetCells: EngineMapCell[],
    layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
    creature: TCreature,
    internal: TInternal,
  ): MovementAttemptResult;
}

export interface MsBlockMovementStrategyContext<TBlock, TInternal> {
  canStartMove(cells: EngineMapCell[], internal: TInternal, pos: number, dir: number): boolean;
  startMove(
    cells: EngineMapCell[],
    internal: TInternal,
    pos: number,
    dir: number,
    deferButtons: boolean,
    preserveSourceTile: boolean,
    occupiedOriginPos?: number,
  ): MovementAttemptResult;
  startUpMove(
    engine: EngineState,
    sourceCells: EngineMapCell[],
    targetCells: EngineMapCell[],
    layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
    block: TBlock,
    internal: TInternal,
  ): MovementAttemptResult;
}

const SUPPORTED_MS_CHIP_STRATEGY = "chip-like";
const SUPPORTED_MS_CREATURE_STRATEGY = "creature-like";
const SUPPORTED_MS_BLOCK_STRATEGY = "block-like";

export function canStartMsChipMoveByStrategy<TInternal, TInventory, TForcedContext>(
  strategyId: ActorMovementStrategyId,
  context: MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext>,
  cells: EngineMapCell[],
  internal: TInternal,
  inventory: TInventory,
  dir: number,
): boolean {
  return strategyId === SUPPORTED_MS_CHIP_STRATEGY && context.canStartMove(cells, internal, inventory, dir);
}

export function startMsChipMoveByStrategy<TInternal, TInventory, TForcedContext>(
  strategyId: ActorMovementStrategyId,
  context: MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext>,
  cells: EngineMapCell[],
  internal: TInternal,
  inventory: TInventory,
  dir: number,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CHIP_STRATEGY
    ? context.startMove(cells, internal, inventory, dir)
    : blockedMovement();
}

export function startMsChipDownMoveByStrategy<TInternal, TInventory, TForcedContext>(
  strategyId: ActorMovementStrategyId,
  context: MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext>,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: TInternal,
  inventory: TInventory,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CHIP_STRATEGY
    ? context.startDownMove(sourceCells, targetCells, internal, inventory)
    : blockedMovement();
}

export function startMsChipUpMoveByStrategy<TInternal, TInventory, TForcedContext>(
  strategyId: ActorMovementStrategyId,
  context: MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext>,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  internal: TInternal,
  inventory: TInventory,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CHIP_STRATEGY
    ? context.startUpMove(sourceCells, targetCells, internal, inventory)
    : blockedMovement();
}

export function runMsChipForcedMoveByStrategy<TInternal, TInventory, TForcedContext>(
  strategyId: ActorMovementStrategyId,
  context: MsChipMovementStrategyContext<TInternal, TInventory, TForcedContext>,
  forcedContext: TForcedContext,
  cells: EngineMapCell[],
): number {
  return strategyId === SUPPORTED_MS_CHIP_STRATEGY ? context.runForcedMove(forcedContext, cells) : 0;
}

export function canStartMsCreatureMoveByStrategy<TCreature, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsCreatureMovementStrategyContext<TCreature, TInternal>,
  cells: EngineMapCell[],
  creature: TCreature,
  dir: number,
  internal: TInternal,
): boolean {
  return strategyId === SUPPORTED_MS_CREATURE_STRATEGY && context.canStartMove(cells, creature, dir, internal);
}

export function startMsCreatureMoveByStrategy<TCreature, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsCreatureMovementStrategyContext<TCreature, TInternal>,
  cells: EngineMapCell[],
  creature: TCreature,
  dir: number,
  internal: TInternal,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CREATURE_STRATEGY
    ? context.startMove(cells, creature, dir, internal)
    : blockedMovement();
}

export function startMsCreatureDownMoveByStrategy<TCreature, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsCreatureMovementStrategyContext<TCreature, TInternal>,
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: TCreature,
  internal: TInternal,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CREATURE_STRATEGY
    ? context.startDownMove(engine, sourceCells, targetCells, layerCellsByZ, creature, internal)
    : blockedMovement();
}

export function startMsCreatureUpMoveByStrategy<TCreature, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsCreatureMovementStrategyContext<TCreature, TInternal>,
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  creature: TCreature,
  internal: TInternal,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_CREATURE_STRATEGY
    ? context.startUpMove(engine, sourceCells, targetCells, layerCellsByZ, creature, internal)
    : blockedMovement();
}

export function canStartMsBlockMoveByStrategy<TBlock, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsBlockMovementStrategyContext<TBlock, TInternal>,
  cells: EngineMapCell[],
  internal: TInternal,
  pos: number,
  dir: number,
): boolean {
  return strategyId === SUPPORTED_MS_BLOCK_STRATEGY && context.canStartMove(cells, internal, pos, dir);
}

export function startMsBlockMoveByStrategy<TBlock, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsBlockMovementStrategyContext<TBlock, TInternal>,
  cells: EngineMapCell[],
  internal: TInternal,
  pos: number,
  dir: number,
  deferButtons: boolean,
  preserveSourceTile: boolean,
  occupiedOriginPos = -1,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_BLOCK_STRATEGY
    ? context.startMove(cells, internal, pos, dir, deferButtons, preserveSourceTile, occupiedOriginPos)
    : blockedMovement();
}

export function startMsBlockUpMoveByStrategy<TBlock, TInternal>(
  strategyId: ActorMovementStrategyId,
  context: MsBlockMovementStrategyContext<TBlock, TInternal>,
  engine: EngineState,
  sourceCells: EngineMapCell[],
  targetCells: EngineMapCell[],
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>,
  block: TBlock,
  internal: TInternal,
): MovementAttemptResult {
  return strategyId === SUPPORTED_MS_BLOCK_STRATEGY
    ? context.startUpMove(engine, sourceCells, targetCells, layerCellsByZ, block, internal)
    : blockedMovement();
}
