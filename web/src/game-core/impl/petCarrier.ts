export const PET_CARRIER_ACTION_COOLDOWN_TICKS = 4;

export const SPECIAL_ITEM_CLASS_FAMILIES = ["sandbag", "hook", "pet-carrier", "bowling-ball"] as const;
export type SpecialItemClassFamilyId = (typeof SPECIAL_ITEM_CLASS_FAMILIES)[number];

export const PET_CARRIER_COOLDOWN_KIND = {
  none: "none",
  afterSnatch: "after-snatch",
  afterRelease: "after-release",
} as const;

export type PetCarrierCooldownState =
  | {
      kind: typeof PET_CARRIER_COOLDOWN_KIND.none;
      remainingTicks: 0;
    }
  | {
      kind:
        | typeof PET_CARRIER_COOLDOWN_KIND.afterSnatch
        | typeof PET_CARRIER_COOLDOWN_KIND.afterRelease;
      remainingTicks: number;
    };

export interface PetCarrierMobRuntimeSnapshot {
  kind: string;
  state: unknown;
}

export interface PetCarrierMobSnapshot {
  actorId: number;
  dir: number;
  runtimeKind?: string;
  runtimeState?: unknown;
}

export interface PetCarrierState {
  occupant: PetCarrierMobSnapshot | null;
  cooldown: PetCarrierCooldownState;
}

export const PORTABLE_ITEM_MOB_OCCUPANCY_POLICY = {
  default: "default",
  autoCapture: "auto-capture",
  actingWall: "acting-wall",
} as const;

export type PortableItemMobOccupancyPolicy =
  (typeof PORTABLE_ITEM_MOB_OCCUPANCY_POLICY)[keyof typeof PORTABLE_ITEM_MOB_OCCUPANCY_POLICY];

export function isSpecialItemClassFamilyId(
  familyId: string | null | undefined,
): familyId is SpecialItemClassFamilyId {
  return typeof familyId === "string" && (SPECIAL_ITEM_CLASS_FAMILIES as readonly string[]).includes(familyId);
}

export function isPetCarrierCaptureEligibleFamilyId(familyId: string | null | undefined): boolean {
  return familyId !== null && familyId !== undefined && familyId !== "chip" && !isSpecialItemClassFamilyId(familyId);
}

export function createPetCarrierCooldownState(
  kind:
    | typeof PET_CARRIER_COOLDOWN_KIND.afterSnatch
    | typeof PET_CARRIER_COOLDOWN_KIND.afterRelease,
  remainingTicks = PET_CARRIER_ACTION_COOLDOWN_TICKS,
): PetCarrierCooldownState {
  return {
    kind,
    remainingTicks,
  };
}

export function clearPetCarrierCooldownState(): PetCarrierCooldownState {
  return {
    kind: PET_CARRIER_COOLDOWN_KIND.none,
    remainingTicks: 0,
  };
}

export function petCarrierCooldownActive(state: PetCarrierState | null | undefined): boolean {
  return (state?.cooldown.kind ?? PET_CARRIER_COOLDOWN_KIND.none) !== PET_CARRIER_COOLDOWN_KIND.none;
}

export function tickPetCarrierCooldownState(state: PetCarrierState): void {
  const current = state.cooldown;
  if (current.kind === PET_CARRIER_COOLDOWN_KIND.none) {
    return;
  }

  if (current.remainingTicks <= 1) {
    state.cooldown = clearPetCarrierCooldownState();
    return;
  }

  state.cooldown = {
    ...current,
    remainingTicks: current.remainingTicks - 1,
  };
}

export function clonePetCarrierMobSnapshot(
  snapshot: PetCarrierMobSnapshot | null,
): PetCarrierMobSnapshot | null {
  if (!snapshot) {
    return null;
  }

  return {
    actorId: snapshot.actorId,
    dir: snapshot.dir,
    ...(snapshot.runtimeKind === undefined
      ? {}
      : {
          runtimeKind: snapshot.runtimeKind,
        }),
    ...(snapshot.runtimeState === undefined
      ? {}
      : {
          runtimeState: structuredClone(snapshot.runtimeState),
        }),
  };
}

export function createPetCarrierMobSnapshot(args: {
  actorId: number;
  dir: number;
  runtimeSnapshot?: PetCarrierMobRuntimeSnapshot | null;
}): PetCarrierMobSnapshot {
  return clonePetCarrierMobSnapshot({
    actorId: args.actorId,
    dir: args.dir,
    ...(args.runtimeSnapshot
      ? {
          runtimeKind: args.runtimeSnapshot.kind,
          runtimeState: args.runtimeSnapshot.state,
        }
      : {}),
  })!;
}

export function clonePetCarrierCooldownState(cooldown: PetCarrierCooldownState): PetCarrierCooldownState {
  return { ...cooldown };
}

export function createPetCarrierState(args: {
  occupant?: PetCarrierMobSnapshot | null;
  cooldown?: PetCarrierCooldownState;
} = {}): PetCarrierState {
  return {
    occupant: clonePetCarrierMobSnapshot(args.occupant ?? null),
    cooldown: clonePetCarrierCooldownState(args.cooldown ?? clearPetCarrierCooldownState()),
  };
}

export function clonePetCarrierState(state: PetCarrierState): PetCarrierState {
  return {
    occupant: clonePetCarrierMobSnapshot(state.occupant),
    cooldown: clonePetCarrierCooldownState(state.cooldown),
  };
}

export function petCarrierHasOccupant(state: PetCarrierState | null | undefined): boolean {
  return state?.occupant !== null && state?.occupant !== undefined;
}

export function petCarrierMobOccupancyPolicy(
  movingFamilyId: string | null | undefined,
  occupied: boolean,
): PortableItemMobOccupancyPolicy {
  if (movingFamilyId === "chip") {
    return PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default;
  }
  if (occupied) {
    return PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.actingWall;
  }
  return isPetCarrierCaptureEligibleFamilyId(movingFamilyId)
    ? PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.autoCapture
    : PORTABLE_ITEM_MOB_OCCUPANCY_POLICY.default;
}
