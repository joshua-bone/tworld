import type { EngineMapCell } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";

export interface InteractiveGameRenderableChip {
  pos: number;
  z?: number;
  dir: number;
  moving: number;
  pushing: boolean;
  hidden: boolean;
  failed: boolean;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
  scale?: number;
}

export interface InteractiveGameRenderableActor {
  id: number;
  pos: number;
  z?: number;
  dir: number;
  moving: number;
  frame: number;
  hidden: boolean;
  animationReserved?: boolean;
  scale?: number;
}

export interface InteractiveGameRenderableAnimation {
  pos: number;
  z?: number;
  frame: number;
  tileId: number;
}

export interface InteractiveGameVisibleLayer {
  z: number;
  cells: EngineMapCell[];
}

export type InteractiveGameTileOverlayKind =
  | "support"
  | "elevator-failure"
  | "hidden-wall-reveal"
  | "push-pickup-reveal";

export interface InteractiveGameTileOverlay {
  z: number;
  pos: number;
  kind: InteractiveGameTileOverlayKind;
  tileId?: number;
}

export interface InteractiveGameRenderFrame {
  chip: InteractiveGameRenderableChip | null;
  actors: InteractiveGameRenderableActor[];
  animations: InteractiveGameRenderableAnimation[];
}

export interface InteractiveGameFrame {
  snapshot: GameSnapshot;
  cells: EngineMapCell[];
  currentZ: number;
  visibleLayers: InteractiveGameVisibleLayer[];
  tileOverlays: InteractiveGameTileOverlay[];
  render: InteractiveGameRenderFrame | null;
}
