import type { EngineMapCell } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";

export interface InteractiveGameRenderSprite {
  kind: "tile" | "creature";
  tileId: number;
  artworkSpriteId?: string;
  dir?: number;
  moving?: number;
  frame?: number;
  alpha?: number;
  petCarrierRender?: InteractiveGamePetCarrierRender;
}

export interface InteractiveGamePetCarrierRender {
  baseTileId: number;
  occupant: InteractiveGameRenderSprite;
}

export type InteractiveGameActorDecoration =
  | {
      kind: "support-marker";
      floorTileId: number;
      showBlockWindow: boolean;
      showDirectionArrow: boolean;
    }
  | {
      kind: "thin-wall-overlay";
      tileId: number;
    };

export type InteractiveGameTileOverlayRender =
  | {
      mode: "tile";
      tileId: number;
      artworkSpriteId?: string;
      alpha?: number;
      visualEnhancementOnly?: boolean;
      petCarrierRender?: InteractiveGamePetCarrierRender;
    }
  | {
      mode: "outline";
      style: "support" | "elevator-failure";
    }
  | {
      mode: "pickup-reveal";
      tileId: number;
      artworkSpriteId?: string;
    };

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
  visual?: InteractiveGameRenderSprite | null;
}

export interface InteractiveGameRenderableActor {
  serial?: number;
  id: number;
  pos: number;
  z?: number;
  dir: number;
  moving: number;
  frame: number;
  hidden: boolean;
  animationReserved?: boolean;
  scale?: number;
  visual?: InteractiveGameRenderSprite | null;
  decorations?: InteractiveGameActorDecoration[];
}

export interface InteractiveGameRenderableAnimation {
  pos: number;
  z?: number;
  frame: number;
  tileId: number;
  visual?: InteractiveGameRenderSprite | null;
}

export interface InteractiveGameVisibleLayer {
  z: number;
  cells: EngineMapCell[];
}

export type InteractiveGameTileOverlayKind =
  | "support"
  | "elevator-failure"
  | "hidden-wall-reveal"
  | "blue-wall-reveal"
  | "push-pickup-reveal"
  | "carried-tool"
  | "portable-item-state";

export interface InteractiveGameTileOverlay {
  z: number;
  pos: number;
  kind: InteractiveGameTileOverlayKind;
  tileId?: number;
  render?: InteractiveGameTileOverlayRender;
}

export interface InteractiveGameRenderFrame {
  chip: InteractiveGameRenderableChip | null;
  actors: InteractiveGameRenderableActor[];
  animations: InteractiveGameRenderableAnimation[];
}

export interface InteractiveGameInventoryRender {
  tools?: Array<InteractiveGameTileOverlayRender | null>;
}

export interface InteractiveGameFrame {
  snapshot: GameSnapshot;
  cells: EngineMapCell[];
  currentZ: number;
  visibleLayers: InteractiveGameVisibleLayer[];
  tileOverlays: InteractiveGameTileOverlay[];
  render: InteractiveGameRenderFrame | null;
  inventoryRender?: InteractiveGameInventoryRender;
}
