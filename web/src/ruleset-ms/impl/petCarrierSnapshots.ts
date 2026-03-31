import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import {
  createPetCarrierMobSnapshot,
  isPetCarrierCaptureEligibleFamilyId,
  type PetCarrierMobSnapshot,
} from "@game-core/impl/petCarrier";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  restoreMsStatefulActorRuntimeSnapshot,
  snapshotMsStatefulActorRuntime,
} from "@ruleset-ms/impl/statefulActors";
import {
  lookupMsActorFamilyRegistration,
  type MsActorFamilyId,
} from "@ruleset-ms/impl/elements/actors/registration";

export interface MsPetCarrierCaptureTarget {
  actorId: number;
  actorSerial?: number;
  dir: number;
}

export function msPetCarrierActorFamilyId(actorId: number): MsActorFamilyId | null {
  return lookupMsActorFamilyRegistration(actorId)?.familyId ?? null;
}

export function canMsPetCarrierCaptureActor(actorId: number): boolean {
  return isPetCarrierCaptureEligibleFamilyId(msPetCarrierActorFamilyId(actorId));
}

export function createMsPetCarrierMobSnapshot(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  target: MsPetCarrierCaptureTarget,
): PetCarrierMobSnapshot | null {
  if (!canMsPetCarrierCaptureActor(target.actorId)) {
    return null;
  }

  const runtimeSnapshot =
    target.actorSerial === undefined
      ? null
      : snapshotMsStatefulActorRuntime(store, target.actorSerial);

  return createPetCarrierMobSnapshot({
    actorId: target.actorId,
    dir: target.dir,
    runtimeSnapshot,
  });
}

export function restoreMsPetCarrierMobSnapshotRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  snapshot: PetCarrierMobSnapshot | null | undefined,
): MsStatefulActorRuntimeEntry | null {
  if (
    snapshot?.runtimeKind === undefined ||
    snapshot.runtimeState === undefined
  ) {
    return null;
  }

  return restoreMsStatefulActorRuntimeSnapshot(store, actorSerial, {
    kind: snapshot.runtimeKind as MsStatefulActorRuntimeEntry["kind"],
    state: snapshot.runtimeState as MsStatefulActorRuntimeEntry["state"],
  });
}
