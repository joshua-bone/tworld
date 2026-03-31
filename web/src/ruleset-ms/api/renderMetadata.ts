import type {
  InteractiveGameActorDecoration,
  InteractiveGameTileOverlay,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import { isMsBlockActorId, MS_TILE } from "@ruleset-ms/api/tiles";

function supportFloorTileId(topId: number, bottomId: number): number | null {
  if (topId === MS_TILE.Beartrap || topId === MS_TILE.CloneMachine) {
    return topId;
  }
  if (bottomId === MS_TILE.Beartrap || bottomId === MS_TILE.CloneMachine) {
    return bottomId;
  }
  return null;
}

export function isThinWallTileId(tileId: number): boolean {
  return (
    tileId === MS_TILE.Wall_North ||
    tileId === MS_TILE.Wall_West ||
    tileId === MS_TILE.Wall_South ||
    tileId === MS_TILE.Wall_East ||
    tileId === MS_TILE.Wall_Southeast
  );
}

export function projectActorSupportDecoration(
  actorId: number,
  topId: number,
  bottomId: number,
): InteractiveGameActorDecoration | null {
  if (
    !isMsBlockActorId(actorId) &&
    actorId !== MS_TILE.Blob &&
    actorId !== MS_TILE.Ball &&
    actorId !== MS_TILE.Walker &&
    actorId !== MS_TILE.Paramecium
  ) {
    return null;
  }

  const floorTileId = supportFloorTileId(topId, bottomId);
  if (floorTileId === null) {
    return null;
  }

  return {
    kind: "support-marker",
    floorTileId,
    showBlockWindow: isMsBlockActorId(actorId),
    showDirectionArrow: true,
  };
}

export function projectThinWallActorDecoration(
  actorId: number,
  topId: number,
  bottomId: number,
): InteractiveGameActorDecoration | null {
  if (!isMsBlockActorId(actorId)) {
    return null;
  }
  if (isThinWallTileId(topId)) {
    return {
      kind: "thin-wall-overlay",
      tileId: topId,
    };
  }
  if (isThinWallTileId(bottomId)) {
    return {
      kind: "thin-wall-overlay",
      tileId: bottomId,
    };
  }
  return null;
}

export function projectTileOverlayRender(
  overlay: Pick<InteractiveGameTileOverlay, "kind" | "tileId">,
): InteractiveGameTileOverlayRender | null {
  switch (overlay.kind) {
    case "support":
      return {
        mode: "outline",
        style: "support",
      };
    case "elevator-failure":
      return {
        mode: "outline",
        style: "elevator-failure",
      };
    case "hidden-wall-reveal":
    case "blue-wall-reveal":
      return {
        mode: "tile",
        tileId: MS_TILE.Wall,
        visualEnhancementOnly: true,
      };
    case "carried-tool":
      return typeof overlay.tileId === "number"
        ? {
            mode: "tile",
            tileId: overlay.tileId,
            alpha: 0.25,
          }
        : null;
    case "push-pickup-reveal":
      return typeof overlay.tileId === "number"
        ? {
            mode: "pickup-reveal",
            tileId: overlay.tileId,
          }
        : null;
    default:
      return null;
  }
}
