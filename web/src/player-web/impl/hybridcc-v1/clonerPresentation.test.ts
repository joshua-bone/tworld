import { describe, expect, it } from "vitest";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import { hybridCcV1ClonerSourceOccupant } from "./clonerPresentation";
import { testActor } from "./testFacts";

const CLASSIC_CLONED_ACTORS = [
  HYBRID_CC_V1_ELEMENT.dirtBlock,
  HYBRID_CC_V1_ELEMENT.ant,
  HYBRID_CC_V1_ELEMENT.centipede,
  HYBRID_CC_V1_ELEMENT.glider,
  HYBRID_CC_V1_ELEMENT.fireball,
  HYBRID_CC_V1_ELEMENT.blob,
  HYBRID_CC_V1_ELEMENT.teeth,
  HYBRID_CC_V1_ELEMENT.ball,
  HYBRID_CC_V1_ELEMENT.walker,
  HYBRID_CC_V1_ELEMENT.tank,
] as const;

describe("Hybrid v1 cloner presentation", () => {
  it.each(CLASSIC_CLONED_ACTORS)(
    "keeps classic cloned actor %i visible at its source during launch",
    (kind) => {
      const actor = testActor({
        kind,
        logicalPosition: { x: 5, y: 4, z: 0 },
        hasMovement: true,
        movement: {
          ...testActor().movement,
          origin: { x: 4, y: 4, z: 0 },
          destination: { x: 5, y: 4, z: 0 },
          startBoundary: 1n,
          completionBoundary: 3n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.cloner,
        },
      });

      expect(hybridCcV1ClonerSourceOccupant(actor, 4)).toEqual({
        actorKind: kind,
        direction: actor.movement.direction,
        position: actor.movement.origin,
      });
    },
  );

  it("does not invent an occupant for ordinary motion or after launch completion", () => {
    const actor = testActor({
      hasMovement: true,
      movement: {
        ...testActor().movement,
        origin: { x: 0, y: 0, z: 0 },
        destination: { x: 1, y: 0, z: 0 },
        startBoundary: 1n,
        completionBoundary: 3n,
        owner: HYBRID_CC_V1_MOVEMENT_OWNER.actorAi,
      },
    });
    expect(hybridCcV1ClonerSourceOccupant(actor, 4)).toBeNull();
    expect(hybridCcV1ClonerSourceOccupant({
      ...actor,
      movement: { ...actor.movement, owner: HYBRID_CC_V1_MOVEMENT_OWNER.cloner },
    }, 6)).toBeNull();
  });
});
