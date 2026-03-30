import { describe, expect, it } from "vitest";
import {
  lynxActorAirHook,
  lynxActorBlockedMoveKind,
  lynxActorClonerFamilyHooks,
  lynxActorClonerHook,
  lynxActorCapabilityPolicy,
  lynxActorCollisionStrategyId,
  lynxActorControlMode,
  lynxActorEntryMask,
  lynxActorGlobalProgressKind,
  lynxActorHazardResponse,
  lynxActorHasTag,
  lynxActorItemCollectionKind,
  lynxActorLocalInventoryMode,
  lynxActorMovementStrategyId,
  lynxActorSupportFamilyHooks,
  lynxActorThiefHook,
  lynxActorTrapFamilyHooks,
  lynxActorTrapHook,
  lynxArrivalAnimationKind,
  lynxBlockMovementMask,
  lynxChipMoveSoundAction,
  lynxChipMovementMask,
  lynxCreatureArrivalAction,
} from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("Lynx catalog actor families", () => {
  it("provides actor tags and capability helpers for shared actor families", () => {
    expect(lynxActorHasTag(MS_TILE.Chip, "chip")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Chip, "pushes-blocks")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Glider, "water-immune")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Fireball, "fire-immune")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Block, "block")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Block, "fire-immune")).toBe(true);
    expect(lynxActorCapabilityPolicy(MS_TILE.Chip).control.mode).toBe("player-input");
    expect(lynxActorControlMode(MS_TILE.Block)).toBe("passive");
    expect(lynxActorControlMode(MS_TILE.BowlingBall)).toBe("ballistic");
    expect(lynxActorLocalInventoryMode(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(lynxActorLocalInventoryMode(MS_TILE.BowlingBall)).toBe("keys-boots");
    expect(lynxActorItemCollectionKind(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(lynxActorItemCollectionKind(MS_TILE.BowlingBall)).toBe("keys-boots");
    expect(lynxActorGlobalProgressKind(MS_TILE.Chip)).toBe("collect-chips");
    expect(lynxActorGlobalProgressKind(MS_TILE.BowlingBall)).toBe("collect-chips");
    expect(lynxActorMovementStrategyId(MS_TILE.Block)).toBe("block-like");
    expect(lynxActorMovementStrategyId(MS_TILE.BowlingBall)).toBe("ballistic-like");
    expect(lynxActorBlockedMoveKind(MS_TILE.Block)).toBe("stay");
    expect(lynxActorBlockedMoveKind(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(lynxActorTrapHook(MS_TILE.Ball)).toBe("default");
    expect(lynxActorTrapHook(MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(lynxActorClonerHook(MS_TILE.Ball)).toBe("default");
    expect(lynxActorClonerHook(MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(lynxActorThiefHook(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(lynxActorThiefHook(MS_TILE.BowlingBall)).toBe("steal-boots-tools");
    expect(lynxActorAirHook(MS_TILE.Chip)).toBe("chip-support");
    expect(lynxActorAirHook(MS_TILE.BowlingBall)).toBe("chip-support");
    expect(lynxActorTrapFamilyHooks(MS_TILE.BowlingBall).releaseBehavior).toBe("move-current-direction");
    expect(lynxActorClonerFamilyHooks(MS_TILE.BowlingBall).runtimeCloneBehavior).toBe("clone-family-runtime");
    expect(lynxActorSupportFamilyHooks(MS_TILE.BowlingBall).fallingCollisionBehavior).toBe("default");
    expect(lynxActorCollisionStrategyId(MS_TILE.Ball)).toBe("default");
    expect(lynxActorCollisionStrategyId(MS_TILE.BowlingBall)).toBe("ballistic-destroy");
  });

  it("provides actor arrival, hazard, and sound policy helpers", () => {
    expect(lynxActorEntryMask(MS_TILE.Gravel, MS_TILE.Block)).toBe(lynxBlockMovementMask(MS_TILE.Gravel));
    expect(lynxActorEntryMask(MS_TILE.Door_Blue, MS_TILE.Chip)).toBe(lynxChipMovementMask(MS_TILE.Door_Blue));
    expect(lynxActorEntryMask(MS_TILE.Door_Blue, MS_TILE.BowlingBall)).toBe(lynxChipMovementMask(MS_TILE.Door_Blue));
    expect(lynxActorEntryMask(MS_TILE.CloneMachine, MS_TILE.BowlingBall)).toBe(
      lynxChipMovementMask(MS_TILE.Empty),
    );
    expect(lynxActorHazardResponse(MS_TILE.Glider, "water")).toBe("ignore");
    expect(lynxActorHazardResponse(MS_TILE.Ball, "fire")).toBe("deny");
    expect(lynxActorHazardResponse(MS_TILE.BowlingBall, "fire")).toBe("destroy");
    expect(lynxCreatureArrivalAction(MS_TILE.Beartrap, MS_TILE.Ball)).toBe("trap");
    expect(lynxCreatureArrivalAction(MS_TILE.Button_Red, MS_TILE.Ball)).toBe("button");
    expect(lynxCreatureArrivalAction(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(lynxCreatureArrivalAction(MS_TILE.Water, MS_TILE.Glider)).toBe("none");
    expect(lynxCreatureArrivalAction(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(lynxArrivalAnimationKind(MS_TILE.Water, MS_TILE.Ball)).toBe("water-splash");
    expect(lynxArrivalAnimationKind(MS_TILE.Bomb, MS_TILE.Block)).toBe("bomb-explosion");
    expect(
      lynxChipMoveSoundAction(MS_TILE.Ice, {
        hasFireBoots: false,
        hasWaterBoots: false,
        hasIceBoots: false,
        hasSlideBoots: false,
      }),
    ).toBe("skate-forward");
    expect(
      lynxChipMoveSoundAction(MS_TILE.IceWall_Northwest, {
        hasFireBoots: false,
        hasWaterBoots: false,
        hasIceBoots: true,
        hasSlideBoots: false,
      }),
    ).toBe("ice-walk");
    expect(
      lynxChipMoveSoundAction(MS_TILE.Slide_East, {
        hasFireBoots: false,
        hasWaterBoots: false,
        hasIceBoots: false,
        hasSlideBoots: true,
      }),
    ).toBe("slide-walk");
  });
});
