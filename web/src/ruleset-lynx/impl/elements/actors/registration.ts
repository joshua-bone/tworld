import type { InteractiveGameRenderSprite } from "@game-core/api/interactive";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { lookupLynxActorDefinition } from "@ruleset-lynx/impl/catalogActors";
import {
  LYNX_BOWLING_BALL_ACTOR_FAMILY,
  LYNX_BOWLING_BALL_ACTOR_ID,
  LYNX_BOWLING_BALL_ACTOR_IDS,
  projectLynxBowlingBallActorRenderSprite,
} from "@ruleset-lynx/impl/elements/actors/families/bowlingBall";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";

export type LynxActorFamilyId = "chip" | "block" | "creature" | "bowling-ball";

export interface LynxActorFamilyRegistration {
  familyId: LynxActorFamilyId;
  actorIds: readonly number[];
  projectRenderSprite?: (
    actor: {
      id: number;
      dir: number;
      moving: number;
      frame: number;
    },
    runtimeEntry: LynxStatefulActorRuntimeEntry | null,
  ) => InteractiveGameRenderSprite;
}

export const lynxActorFamilyRegistrations = [
  {
    familyId: "chip",
    actorIds: [MS_TILE.Chip, MS_TILE.Swimming_Chip, MS_TILE.Pushing_Chip],
  },
  {
    familyId: "block",
    actorIds: [MS_TILE.Block],
  },
  {
    familyId: LYNX_BOWLING_BALL_ACTOR_FAMILY,
    actorIds: LYNX_BOWLING_BALL_ACTOR_IDS,
    projectRenderSprite(actor, runtimeEntry) {
      return projectLynxBowlingBallActorRenderSprite(
        actor,
        runtimeEntry?.kind === LYNX_BOWLING_BALL_ACTOR_FAMILY ? runtimeEntry.state : null,
      );
    },
  },
  {
    familyId: "creature",
    actorIds: [
      MS_TILE.Tank,
      MS_TILE.Ball,
      MS_TILE.Glider,
      MS_TILE.Fireball,
      MS_TILE.Walker,
      MS_TILE.Blob,
      MS_TILE.Teeth,
      MS_TILE.Bug,
      MS_TILE.Paramecium,
    ],
  },
] as const satisfies readonly LynxActorFamilyRegistration[];

const lynxActorFamilyByActorId = new Map<number, LynxActorFamilyRegistration>(
  lynxActorFamilyRegistrations.flatMap((registration) =>
    registration.actorIds.map((actorId) => [actorId, registration] as const),
  ),
);

export function lookupLynxActorFamilyRegistration(actorId: number): LynxActorFamilyRegistration | undefined {
  const definition = lookupLynxActorDefinition(actorId);
  return definition ? lynxActorFamilyByActorId.get(definition.id) : undefined;
}

export function lookupLynxActorDefinitionRegistration(actorId: number): ActorDefinition<number> | undefined {
  return lookupLynxActorDefinition(actorId);
}

export function projectLynxRegisteredActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: LynxStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  const familyRegistration =
    runtimeEntry?.kind === LYNX_BOWLING_BALL_ACTOR_FAMILY
      ? lynxActorFamilyByActorId.get(LYNX_BOWLING_BALL_ACTOR_ID)
      : lookupLynxActorFamilyRegistration(actor.id);
  const familyRender = familyRegistration?.projectRenderSprite;
  if (familyRender) {
    return familyRender(actor, runtimeEntry);
  }

  return {
    kind: "creature",
    tileId: actor.id,
    dir: actor.dir ?? MS_DIRECTION.none,
    moving: actor.moving,
    frame: actor.frame,
  };
}
