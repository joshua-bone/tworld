import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import {
  createPetCarrierMobSnapshot,
  isPetCarrierCaptureEligibleFamilyId,
  type PetCarrierMobSnapshot,
} from "@game-core/impl/petCarrier";
import {
  lookupLynxActorFamilyRegistration,
  type LynxActorFamilyId,
} from "@ruleset-lynx/impl/elements/actors/registration";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  restoreLynxStatefulActorRuntimeSnapshot,
  snapshotLynxStatefulActorRuntime,
} from "@ruleset-lynx/impl/statefulActors";

export interface LynxPetCarrierCaptureTarget {
  actorId: number;
  actorSerial?: number;
  dir: number;
}

export function lynxPetCarrierActorFamilyId(actorId: number): LynxActorFamilyId | null {
  return lookupLynxActorFamilyRegistration(actorId)?.familyId ?? null;
}

export function canLynxPetCarrierCaptureActor(actorId: number): boolean {
  return isPetCarrierCaptureEligibleFamilyId(lynxPetCarrierActorFamilyId(actorId));
}

export function createLynxPetCarrierMobSnapshot(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  target: LynxPetCarrierCaptureTarget,
): PetCarrierMobSnapshot | null {
  if (!canLynxPetCarrierCaptureActor(target.actorId)) {
    return null;
  }

  const runtimeSnapshot =
    target.actorSerial === undefined
      ? null
      : snapshotLynxStatefulActorRuntime(store, target.actorSerial);

  return createPetCarrierMobSnapshot({
    actorId: target.actorId,
    dir: target.dir,
    runtimeSnapshot,
  });
}

export function restoreLynxPetCarrierMobSnapshotRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  snapshot: PetCarrierMobSnapshot | null | undefined,
): LynxStatefulActorRuntimeEntry | null {
  if (
    snapshot?.runtimeKind === undefined ||
    snapshot.runtimeState === undefined
  ) {
    return null;
  }

  return restoreLynxStatefulActorRuntimeSnapshot(store, actorSerial, {
    kind: snapshot.runtimeKind as LynxStatefulActorRuntimeEntry["kind"],
    state: snapshot.runtimeState as LynxStatefulActorRuntimeEntry["state"],
  });
}
