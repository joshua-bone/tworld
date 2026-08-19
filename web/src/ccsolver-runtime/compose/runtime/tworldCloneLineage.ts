import type { ActorIdV1 } from "@tworld/ccsolver/domain";
import {
  SolverRuntimeError,
  type Sha256Port,
} from "@tworld/ccsolver/ports";
import { MS_GRID_WIDTH } from "@ruleset-ms/api/tiles";
import type { TworldNativeCausalEvent } from "./projectTworldNativeCausalEvents";
import {
  placementForRuntimeElement,
  solverCoordinate,
  type RuntimeActorBindings,
} from "./tworldRuntimeProjectionSupport";
import type { TworldSolverManualStartSource } from "./tworldSolverRuntimeSource";
import {
  allocateTworldCausalSpawnOrdinal,
  type TworldCausalJournal,
} from "./tworldCausalJournal";

function hexDigest(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function cloneLineageActorId(input: {
  readonly source: TworldSolverManualStartSource;
  readonly parentActorId: ActorIdV1;
  readonly sourcePlacementId: string;
  readonly spawnOrdinal: number;
  readonly semanticType: string;
  readonly sha256: Sha256Port;
}): Promise<ActorIdV1> {
  const descriptor = [
    input.source.levelFacts.facts.payload.level.normalizedGameplayDigest,
    input.parentActorId,
    input.sourcePlacementId,
    input.spawnOrdinal,
    input.semanticType,
  ].join("\u0000");
  const digest = await input.sha256.digestBytes(new TextEncoder().encode(descriptor));
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new SolverRuntimeError(
      "runtime.adapter-failure",
      "advanceTick",
      "SHA-256 adapter did not return a 32-byte clone-lineage identity digest",
    );
  }
  return `actor:sha256:${hexDigest(digest)}`;
}

export async function bindTworldCloneLineage<TEvent extends TworldNativeCausalEvent>(input: {
  readonly events: readonly TEvent[];
  readonly source: TworldSolverManualStartSource;
  readonly bindings: RuntimeActorBindings;
  readonly journal: TworldCausalJournal;
  readonly sha256: Sha256Port;
  actorRuntimeKey(event: TEvent): string | null;
  actorRuntimeKeyBySerial(serial: number): string;
  actorSemanticType(actorId: number): string;
  tileSemanticType(tileId: number): string;
}): Promise<{
  readonly events: TEvent[];
  readonly bindings: RuntimeActorBindings;
}> {
  const actors = new Map(input.bindings.actors);
  const events: TEvent[] = [];
  for (const event of input.events) {
    if (
      event.kind !== "actor-spawned"
      || event.sourcePosition == null
      || event.sourceTileId == null
    ) {
      events.push(event);
      continue;
    }
    const sourcePlacement = placementForRuntimeElement(
      input.source,
      solverCoordinate(event.sourcePosition.pos, event.sourcePosition.z, MS_GRID_WIDTH),
      input.tileSemanticType(event.sourceTileId),
      event.sourceStratum ?? "terrain",
      new Set(),
    );
    const parentRuntimeKey = event.parentActorRuntimeKey
      ?? (event.parentActorSerial == null ? null : input.actorRuntimeKeyBySerial(event.parentActorSerial));
    const runtimeParent = parentRuntimeKey === null
      ? undefined
      : input.bindings.actors.get(parentRuntimeKey);
    const runtimeKey = input.actorRuntimeKey(event);
    if (sourcePlacement === null || runtimeKey === null) {
      events.push(event);
      continue;
    }
    const placements = new Map(input.source.levelFacts.facts.payload.placements.map((placement) => (
      [placement.placementId, placement] as const
    )));
    const sourceCoordinate = sourcePlacement.descriptor.coordinate;
    const parent = runtimeParent ?? input.source.levelFacts.facts.payload.actors.find((candidate) => {
      const candidateCoordinate = placements.get(candidate.descriptor.placementId)?.descriptor.coordinate;
      return candidate.disposition === "contained"
        && candidate.semanticType === input.actorSemanticType(event.actorId)
        && candidateCoordinate?.x === sourceCoordinate.x
        && candidateCoordinate.y === sourceCoordinate.y
        && candidateCoordinate.z === sourceCoordinate.z;
    });
    if (parent === undefined) {
      events.push(event);
      continue;
    }
    const spawnOrdinal = allocateTworldCausalSpawnOrdinal(
      input.journal,
      sourcePlacement.placementId,
    );
    if (spawnOrdinal === null) {
      events.push(event);
      continue;
    }
    actors.set(runtimeKey, {
      actorId: await cloneLineageActorId({
        source: input.source,
        parentActorId: parent.actorId,
        sourcePlacementId: sourcePlacement.placementId,
        spawnOrdinal,
        semanticType: input.actorSemanticType(event.actorId),
        sha256: input.sha256,
      }),
      identityProvenance: "clone-lineage",
      sourcePlacementId: sourcePlacement.placementId,
    });
    events.push({ ...event, spawnOrdinal });
  }
  return {
    events,
    bindings: { player: input.bindings.player, actors },
  };
}
