import type { EngineMapCell } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

interface GameBoardProps {
  cells: EngineMapCell[];
  snapshot: GameSnapshot;
}

const CREATURE_LABELS: Record<number, string> = {
  [MS_TILE.Ball]: "Ba",
  [MS_TILE.Blob]: "Bl",
  [MS_TILE.Block]: "[]",
  [MS_TILE.Bug]: "Bu",
  [MS_TILE.Chip]: "Ch",
  [MS_TILE.Fireball]: "Fb",
  [MS_TILE.Glider]: "Gl",
  [MS_TILE.Paramecium]: "Pa",
  [MS_TILE.Swimming_Chip]: "Sw",
  [MS_TILE.Tank]: "Tk",
  [MS_TILE.Teeth]: "Te",
  [MS_TILE.Walker]: "Wa",
};

function tileLabel(id: number): string {
  if (isMsCreature(id)) {
    return CREATURE_LABELS[msCreatureId(id)] ?? "Cr";
  }

  switch (id) {
    case MS_TILE.Beartrap:
      return "Tr";
    case MS_TILE.Block_Static:
      return "[]";
    case MS_TILE.BlueWall_Real:
    case MS_TILE.BlueWall_Fake:
    case MS_TILE.Wall:
      return "##";
    case MS_TILE.Bomb:
      return "Bm";
    case MS_TILE.Button_Blue:
      return "B";
    case MS_TILE.Button_Brown:
      return "Br";
    case MS_TILE.Button_Green:
      return "G";
    case MS_TILE.Button_Red:
      return "R";
    case MS_TILE.CloneMachine:
      return "Cl";
    case MS_TILE.Dirt:
      return "Dt";
    case MS_TILE.Exit:
      return "Ex";
    case MS_TILE.Fire:
      return "Fi";
    case MS_TILE.Gravel:
      return "Gr";
    case MS_TILE.HiddenWall_Temp:
      return "Hw";
    case MS_TILE.ICChip:
      return "IC";
    case MS_TILE.Ice:
      return "Ic";
    case MS_TILE.Socket:
      return "So";
    case MS_TILE.Slide_East:
      return ">";
    case MS_TILE.Slide_North:
      return "^";
    case MS_TILE.Slide_Random:
      return "?";
    case MS_TILE.Slide_South:
      return "v";
    case MS_TILE.Slide_West:
      return "<";
    case MS_TILE.SwitchWall_Closed:
      return "X";
    case MS_TILE.SwitchWall_Open:
      return "O";
    case MS_TILE.Teleport:
      return "Tp";
    case MS_TILE.Water:
      return "Wt";
    default:
      return "";
  }
}

function toneClass(cell: EngineMapCell, chipPos: number | null): string {
  if (cell.position.pos === chipPos) {
    return "board-cell chip";
  }

  const top = cell.top.id;
  const bottom = cell.bottom.id;
  const floor = !isMsCreature(top) ? top : bottom;

  if (isMsCreature(top)) {
    const base = msCreatureId(top);
    if (base === MS_TILE.Block) {
      return "board-cell block";
    }
    return "board-cell creature";
  }

  switch (floor) {
    case MS_TILE.Beartrap:
      return "board-cell trap";
    case MS_TILE.CloneMachine:
      return "board-cell cloner";
    case MS_TILE.Teleport:
      return "board-cell teleport";
    case MS_TILE.Water:
      return "board-cell water";
    case MS_TILE.Fire:
      return "board-cell fire";
    case MS_TILE.Wall:
    case MS_TILE.HiddenWall_Temp:
    case MS_TILE.BlueWall_Real:
    case MS_TILE.SwitchWall_Closed:
      return "board-cell wall";
    case MS_TILE.Button_Blue:
    case MS_TILE.Button_Brown:
    case MS_TILE.Button_Green:
    case MS_TILE.Button_Red:
      return "board-cell button";
    case MS_TILE.Slide_East:
    case MS_TILE.Slide_North:
    case MS_TILE.Slide_Random:
    case MS_TILE.Slide_South:
    case MS_TILE.Slide_West:
      return "board-cell slide";
    case MS_TILE.Ice:
    case MS_TILE.IceWall_Northeast:
    case MS_TILE.IceWall_Northwest:
    case MS_TILE.IceWall_Southeast:
    case MS_TILE.IceWall_Southwest:
      return "board-cell ice";
    case MS_TILE.Exit:
      return "board-cell exit";
    default:
      return "board-cell floor";
  }
}

export function GameBoard({ cells, snapshot }: GameBoardProps) {
  const chipPos = snapshot.chip?.position.pos ?? null;

  return (
    <div className="board-shell">
      <div className="board-grid" role="img" aria-label={`Board state at tick ${snapshot.currentTime}`}>
        {cells.map((cell) => {
          const label = tileLabel(cell.top.id) || tileLabel(cell.bottom.id);
          return (
            <div
              className={toneClass(cell, chipPos)}
              key={cell.position.pos}
              title={`pos ${cell.position.pos} top ${cell.top.id} bottom ${cell.bottom.id}`}
            >
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
