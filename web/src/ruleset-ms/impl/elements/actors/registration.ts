import type { InteractiveGameRenderSprite } from "@game-core/api/interactive";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { lookupMsActorDefinition } from "@ruleset-ms/impl/catalogActors";
import {
  MS_BOWLING_BALL_ACTOR_FAMILY,
  MS_BOWLING_BALL_ACTOR_ID,
  MS_BOWLING_BALL_ACTOR_IDS,
  projectMsBowlingBallActorRenderSprite,
} from "@ruleset-ms/impl/elements/actors/families/bowlingBall";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";

export type MsActorFamilyId = "chip" | "block" | "creature" | "bowling-ball";

export interface MsActorFamilyRegistration {
  familyId: MsActorFamilyId;
  actorIds: readonly number[];
  projectRenderSprite?: (
    actor: {
      id: number;
      dir: number;
      moving: number;
      frame: number;
    },
    runtimeEntry: MsStatefulActorRuntimeEntry | null,
  ) => InteractiveGameRenderSprite;
}

export const msActorFamilyRegistrations = [
  {
    familyId: "chip",
    actorIds: [MS_TILE.Chip, MS_TILE.Swimming_Chip, MS_TILE.Pushing_Chip],
  },
  {
    familyId: "block",
    actorIds: [MS_TILE.Block],
  },
  {
    familyId: MS_BOWLING_BALL_ACTOR_FAMILY,
    actorIds: MS_BOWLING_BALL_ACTOR_IDS,
    projectRenderSprite(actor, runtimeEntry) {
      return projectMsBowlingBallActorRenderSprite(
        actor,
        runtimeEntry?.kind === MS_BOWLING_BALL_ACTOR_FAMILY ? runtimeEntry.state : null,
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
] as const satisfies readonly MsActorFamilyRegistration[];

const msActorFamilyByActorId = new Map<number, MsActorFamilyRegistration>(
  msActorFamilyRegistrations.flatMap((registration) =>
    registration.actorIds.map((actorId) => [actorId, registration] as const),
  ),
);

export function lookupMsActorFamilyRegistration(actorId: number): MsActorFamilyRegistration | undefined {
  const definition = lookupMsActorDefinition(actorId);
  return definition ? msActorFamilyByActorId.get(definition.id) : undefined;
}

export function lookupMsActorDefinitionRegistration(actorId: number): ActorDefinition<number> | undefined {
  return lookupMsActorDefinition(actorId);
}

export function projectMsRegisteredActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: MsStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  const familyRegistration =
    runtimeEntry?.kind === MS_BOWLING_BALL_ACTOR_FAMILY
      ? msActorFamilyByActorId.get(MS_BOWLING_BALL_ACTOR_ID)
      : lookupMsActorFamilyRegistration(actor.id);
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
