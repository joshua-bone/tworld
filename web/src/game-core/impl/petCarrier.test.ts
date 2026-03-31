import { describe, expect, it } from "vitest";
import {
  PET_CARRIER_ACTION_COOLDOWN_TICKS,
  PORTABLE_ITEM_MOB_OCCUPANCY_POLICY,
  clonePetCarrierState,
  createPetCarrierMobSnapshot,
  createPetCarrierCooldownState,
  createPetCarrierState,
  isPetCarrierCaptureEligibleFamilyId,
  isSpecialItemClassFamilyId,
  petCarrierCooldownActive,
  petCarrierHasOccupant,
  petCarrierMobOccupancyPolicy,
  tickPetCarrierCooldownState,
} from "@game-core/impl/petCarrier";

describe("petCarrier helpers", () => {
  it("classifies special-item families and capture-eligible occupants", () => {
    expect(isSpecialItemClassFamilyId("sandbag")).toBe(true);
    expect(isSpecialItemClassFamilyId("hook")).toBe(true);
    expect(isSpecialItemClassFamilyId("pet-carrier")).toBe(true);
    expect(isSpecialItemClassFamilyId("bowling-ball")).toBe(true);
    expect(isSpecialItemClassFamilyId("block")).toBe(false);
    expect(isSpecialItemClassFamilyId("creature")).toBe(false);
    expect(isPetCarrierCaptureEligibleFamilyId("block")).toBe(true);
    expect(isPetCarrierCaptureEligibleFamilyId("creature")).toBe(true);
    expect(isPetCarrierCaptureEligibleFamilyId("chip")).toBe(false);
    expect(isPetCarrierCaptureEligibleFamilyId("bowling-ball")).toBe(false);
  });

  it("derives mob occupancy policy from occupancy and mover family", () => {
    expect(petCarrierMobOccupancyPolicy("creature", false)).toBe(PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.autoCapture);
    expect(petCarrierMobOccupancyPolicy("block", false)).toBe(PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.autoCapture);
    expect(petCarrierMobOccupancyPolicy("bowling-ball", false)).toBe(PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default);
    expect(petCarrierMobOccupancyPolicy("creature", true)).toBe(PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.actingWall);
    expect(petCarrierMobOccupancyPolicy("chip", true)).toBe(PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default);
  });

  it("creates and deep-clones occupant payload and cooldown state", () => {
    const state = createPetCarrierState({
      occupant: createPetCarrierMobSnapshot({
        actorId: 0x64,
        dir: 8,
        runtimeSnapshot: {
          kind: "ghost",
          state: {
            nested: {
              value: 3,
            },
          },
        },
      }),
      cooldown: createPetCarrierCooldownState("after-snatch"),
    });

    expect(petCarrierHasOccupant(state)).toBe(true);
    expect(state.cooldown).toEqual({
      kind: "after-snatch",
      remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
    });

    const cloned = clonePetCarrierState(state);
    ((cloned.occupant?.runtimeState as { nested: { value: number } }).nested).value = 9;
    cloned.cooldown = createPetCarrierCooldownState("after-release", 2);

    expect(cloned.occupant?.runtimeKind).toBe("ghost");
    expect(((state.occupant?.runtimeState as { nested: { value: number } }).nested).value).toBe(3);
    expect(state.cooldown).toEqual({
      kind: "after-snatch",
      remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
    });
  });

  it("counts cooldown down to clear over four ticks", () => {
    const state = createPetCarrierState({
      cooldown: createPetCarrierCooldownState("after-release"),
    });

    for (let tick = PET_CARRIER_ACTION_COOLDOWN_TICKS - 1; tick >= 1; tick -= 1) {
      tickPetCarrierCooldownState(state);
      expect(petCarrierCooldownActive(state)).toBe(true);
      expect(state.cooldown).toEqual({
        kind: "after-release",
        remainingTicks: tick,
      });
    }

    tickPetCarrierCooldownState(state);
    expect(petCarrierCooldownActive(state)).toBe(false);
    expect(state.cooldown).toEqual({
      kind: "none",
      remainingTicks: 0,
    });
  });
});
