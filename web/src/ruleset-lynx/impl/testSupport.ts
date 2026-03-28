import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { createEmptyTestBoard, createTestCell, boardPos } from "@game-core/impl/testBoards";
import { createTestEngineState } from "@game-core/impl/testEngineState";
import type { StatefulActorRuntimeEntry, StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { advanceLynxInteractiveSession, createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

type LynxPortableItem = {
  serial: number;
  tileId: number;
  state:
    | { mode: "map"; pos: number; z: number }
    | { mode: "carried" }
    | { mode: "primed"; pos: number; z: number };
};

type LynxPortableToolRuntime = {
  portableItems: Array<{
    serial: number;
    tileId: number;
    inventorySlot: "tools";
    state: { mode: "map"; pos: number; z: number } | { mode: "carried" } | { mode: "primed"; pos: number; z: number };
  }>;
  nextPortableItemSerial: number;
};

type LynxRuntimeOverlay = {
  z: number;
  pos: number;
  kind: string;
  ttl: number;
};

type LynxRuntimeAnimation = {
  pos: number;
  frame: number;
  tileId: number;
};

export function createCell(pos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return createTestCell(pos, topId, bottomId, 1, MS_GRID_WIDTH);
}

export function createCellAtZ(pos: number, z: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return createTestCell(pos, topId, bottomId, z, MS_GRID_WIDTH);
}

export function createBoardAtZ(z: number): EngineMapCell[] {
  return createEmptyTestBoard(MS_GRID_WIDTH, MS_GRID_HEIGHT, MS_TILE.Empty, z);
}

export function pos(x: number, y: number): number {
  return boardPos(x, y, MS_GRID_WIDTH);
}

export function createLevel(
  cells: EngineMapCell[],
  creaturePositions?: number[],
  overrides: Partial<Pick<LynxLevel, "traps" | "cloners">> = {},
): LynxLevel {
  const board = createEmptyTestBoard(MS_GRID_WIDTH, MS_GRID_HEIGHT, MS_TILE.Empty);
  for (const cell of cells) {
    board[cell.position.pos] = cell;
  }

  return {
    number: 1,
    timeLimitTicks: 4000,
    chipsNeeded: 0,
    hintText: "",
    cells: board,
    traps: overrides.traps?.map((connection) => ({ ...connection })) ?? [],
    cloners: overrides.cloners?.map((connection) => ({ ...connection })) ?? [],
    creaturePositions:
      creaturePositions ??
      cells.filter((cell) => cell.top.id !== MS_TILE.Empty || cell.bottom.id !== MS_TILE.Empty).map((cell) => cell.position.pos),
    statusFlags: 0,
  };
}

export function createTwoLayerLevel(
  lowerCells: EngineMapCell[],
  upperCells: EngineMapCell[],
  options: {
    lowerCreaturePositions?: number[];
    upperCreaturePositions?: number[];
    lowerTraps?: LynxLevel["traps"];
    upperTraps?: LynxLevel["traps"];
    lowerCloners?: LynxLevel["cloners"];
    upperCloners?: LynxLevel["cloners"];
  } = {},
): LynxLevel {
  return {
    ...createLevel([]),
    cells: lowerCells,
    layers: [
      {
        z: 1,
        cells: lowerCells,
        traps: options.lowerTraps?.map((connection) => ({ ...connection })) ?? [],
        cloners: options.lowerCloners?.map((connection) => ({ ...connection })) ?? [],
        creaturePositions: options.lowerCreaturePositions ?? [],
        hintText: "",
      },
      {
        z: 2,
        cells: upperCells,
        traps: options.upperTraps?.map((connection) => ({ ...connection })) ?? [],
        cloners: options.upperCloners?.map((connection) => ({ ...connection })) ?? [],
        creaturePositions: options.upperCreaturePositions ?? [],
        hintText: "",
      },
    ],
  };
}

export function createRequest() {
  return { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" as const };
}

export function advanceLynxTicks(
  session: ReturnType<typeof createLynxInteractiveSession>,
  ticks: number,
  firstInputCode = 0,
) {
  let current = session;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = advanceLynxInteractiveSession(current, tick === 0 ? firstInputCode : 0);
  }
  return current;
}

export function createEngineState(cells: EngineMapCell[]): EngineState {
  return createTestEngineState(cells, "Lynx");
}

export function lynxPortableItems(state: EngineState): LynxPortableItem[] {
  return (
    (state as EngineState & {
      lynxRuntimeState?: {
        portableTools?: {
          portableItems?: LynxPortableItem[];
        };
      };
    }).lynxRuntimeState?.portableTools?.portableItems ?? []
  );
}

export function lynxRuntimeStateForTest(state: EngineState): {
  portableTools: LynxPortableToolRuntime;
  statefulActors: StatefulActorRuntimeStore<StatefulActorRuntimeEntry>;
  nextActorSerial: number;
} {
  return (
    state as EngineState & {
      lynxRuntimeState: {
        portableTools: LynxPortableToolRuntime;
        statefulActors: StatefulActorRuntimeStore<StatefulActorRuntimeEntry>;
        nextActorSerial: number;
      };
    }
  ).lynxRuntimeState;
}

export function lynxTileOverlays(state: EngineState): LynxRuntimeOverlay[] {
  return (
    (state as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          tileOverlays?: LynxRuntimeOverlay[];
        };
      };
    }).lynxRuntimeState?.visuals?.tileOverlays ?? []
  );
}

export function lynxAnimations(state: EngineState): LynxRuntimeAnimation[] {
  return (
    (state as EngineState & {
      lynxRuntimeState?: {
        visuals?: {
          animations?: LynxRuntimeAnimation[];
        };
      };
    }).lynxRuntimeState?.visuals?.animations ?? []
  );
}

export function lynxChipTeleported(state: EngineState): boolean {
  return (
    (state as EngineState & {
      lynxRuntimeState?: {
        chipRuntime?: {
          chipTeleported?: boolean;
        };
      };
    }).lynxRuntimeState?.chipRuntime?.chipTeleported ?? false
  );
}
