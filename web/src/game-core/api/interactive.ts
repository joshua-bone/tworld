import type { EngineMapCell } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";

export interface InteractiveGameRenderableChip {
  pos: number;
  dir: number;
  moving: number;
  pushing: boolean;
  hidden: boolean;
  failed: boolean;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
}

export interface InteractiveGameRenderableActor {
  id: number;
  pos: number;
  dir: number;
  moving: number;
  frame: number;
  hidden: boolean;
  animationReserved?: boolean;
}

export interface InteractiveGameRenderableAnimation {
  pos: number;
  frame: number;
  tileId: number;
}

export interface InteractiveGameRenderFrame {
  chip: InteractiveGameRenderableChip | null;
  actors: InteractiveGameRenderableActor[];
  animations: InteractiveGameRenderableAnimation[];
}

export interface InteractiveGameFrame {
  snapshot: GameSnapshot;
  cells: EngineMapCell[];
  render: InteractiveGameRenderFrame | null;
}
