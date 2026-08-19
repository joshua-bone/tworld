import type {
  SolverCausalEventParticipantV1,
  SolverCausalEventV1,
} from "@tworld/ccsolver/events";
import type {
  SolverAdvanceRequest,
} from "@tworld/ccsolver/ports";
import type {
  SolverCoordinate,
  SolverRuntimeMode,
  SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import { MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";
import type { TworldSolverManualStartSource } from "./tworldSolverRuntimeSource";
import {
  placementForRuntimeElement,
  solverCoordinate,
  solverDirection,
  type RuntimeActorBindings,
} from "./tworldRuntimeProjectionSupport";
import {
  allocateTworldCausalSpawnOrdinal,
  appendTworldCausalEvent,
  type TworldCausalCommandLink,
  type TworldCausalJournal,
} from "./tworldCausalJournal";

export interface TworldNativeCausalResourceCounter {
  readonly slot: "keys" | "boots" | "tools" | "chips-needed";
  readonly index: number | null;
  readonly beforeCount: number;
  readonly afterCount: number;
}

export interface TworldNativeCausalEvent {
  readonly kind:
    | "movement-started"
    | "movement-blocked"
    | "move-completed"
    | "teleport"
    | "collect"
    | "open-door"
    | "open-socket"
    | "inventory-changed"
    | "map-mutated"
    | "device-activated"
    | "device-state-changed"
    | "actor-spawned"
    | "actor-destroyed"
    | "player-died"
    | "terminal-failed"
    | "complete-level";
  readonly actorId: number;
  readonly actorSerial: number | null;
  readonly actorRuntimeKey?: string | null;
  readonly tileId: number | null;
  readonly resultingTileId?: number | null;
  readonly sourceTileId?: number | null;
  readonly sourcePosition?: { readonly pos: number; readonly z: number } | null;
  readonly sourceStratum?: "terrain" | "pickup" | "overlay";
  readonly targetStratum?: "terrain" | "pickup" | "overlay";
  readonly sourceActorId?: number | null;
  readonly sourceActorSerial?: number | null;
  readonly sourceActorRuntimeKey?: string | null;
  readonly direction?: number | null;
  readonly movementRole?: "self" | "push" | "forced";
  readonly decisionSource?: "current-input" | "queued-input" | "forced";
  readonly resourceCounter?: TworldNativeCausalResourceCounter | null;
  readonly action?: string | null;
  readonly beforeState?: string | null;
  readonly afterState?: string | null;
  readonly cause?: string | null;
  readonly failureReason?: string | null;
  readonly parentActorSerial?: number | null;
  readonly parentActorRuntimeKey?: string | null;
  readonly spawnOrdinal?: number | null;
  readonly before: { readonly pos: number; readonly z: number } | null;
  readonly after: { readonly pos: number; readonly z: number } | null;
  readonly nativeTick: number;
  readonly withinTickOrder: number;
  readonly phase:
    | "movement-commit"
    | "teleport-resolution"
    | "arrival-effect"
    | "device-action"
    | "actor-lifecycle"
    | "terminal-latch";
}

interface ProjectionContext {
  readonly target: "ms" | "lynx";
  readonly mode: SolverRuntimeMode;
  readonly source: TworldSolverManualStartSource;
  readonly bindings: RuntimeActorBindings;
  readonly journal: TworldCausalJournal;
  actorRuntimeKey(actorSerial: number): string;
  actorSemanticType(actorId: number): string;
  tileSemanticType(tileId: number): string;
  readonly terminal: SolverTerminalResult;
}

function coordinate(
  position: TworldNativeCausalEvent["before"],
): SolverCoordinate | null {
  return position === null ? null : solverCoordinate(position.pos, position.z, MS_GRID_WIDTH);
}

function actorParticipant(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
): SolverCausalEventParticipantV1 {
  const player = event.actorId === MS_TILE.Chip && event.actorSerial === null;
  const binding = player
    ? context.bindings.player
    : event.actorRuntimeKey != null
      ? context.bindings.actors.get(event.actorRuntimeKey) ?? null
      : event.actorSerial === null
        ? null
        : context.bindings.actors.get(context.actorRuntimeKey(event.actorSerial)) ?? null;
  return {
    semanticType: player ? "cc1:chip" : context.actorSemanticType(event.actorId),
    actorId: binding?.actorId ?? null,
    placementId: binding?.sourcePlacementId ?? null,
    deviceId: null,
  };
}

function placementParticipant(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  at: "before" | "after",
  semanticType: string,
  stratum: "terrain" | "pickup" | "overlay",
  device: boolean,
): SolverCausalEventParticipantV1 | null {
  return placementParticipantAt(event[at], context, semanticType, stratum, device);
}

function placementParticipantAt(
  position: TworldNativeCausalEvent["before"],
  context: ProjectionContext,
  semanticType: string,
  stratum: "terrain" | "pickup" | "overlay",
  device: boolean,
): SolverCausalEventParticipantV1 | null {
  const eventCoordinate = coordinate(position);
  if (eventCoordinate === null) return null;
  const placement = placementForRuntimeElement(
    context.source,
    eventCoordinate,
    semanticType,
    stratum,
    new Set(),
  );
  return {
    semanticType,
    actorId: null,
    placementId: placement?.placementId ?? null,
    deviceId: device ? placement?.placementId ?? null : null,
  };
}

function sourcePlacementParticipant(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  device: boolean,
): SolverCausalEventParticipantV1 | null {
  if (event.sourceTileId == null || event.sourcePosition == null) return null;
  return placementParticipantAt(
    event.sourcePosition,
    context,
    context.tileSemanticType(event.sourceTileId),
    event.sourceStratum ?? "terrain",
    device,
  );
}

function sourceActorParticipant(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
): SolverCausalEventParticipantV1 | null {
  if (event.sourceActorId == null) return null;
  const runtimeKey = event.sourceActorRuntimeKey
    ?? (event.sourceActorSerial == null
      ? null
      : context.actorRuntimeKey(event.sourceActorSerial));
  const binding = runtimeKey === null ? null : context.bindings.actors.get(runtimeKey) ?? null;
  return {
    semanticType: context.actorSemanticType(event.sourceActorId),
    actorId: binding?.actorId ?? null,
    placementId: binding?.sourcePlacementId ?? null,
    deviceId: null,
  };
}

function parentActorParticipant(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
): SolverCausalEventParticipantV1 | null {
  const runtimeKey = event.parentActorRuntimeKey
    ?? (event.parentActorSerial == null ? null : context.actorRuntimeKey(event.parentActorSerial));
  const binding = runtimeKey === null ? undefined : context.bindings.actors.get(runtimeKey);
  if (binding !== undefined) {
    return {
        semanticType: "cc1:unknown-actor",
        actorId: binding.actorId,
        placementId: binding.sourcePlacementId,
        deviceId: null,
      };
  }
  const source = sourcePlacementParticipant(event, context, false);
  const sourcePlacement = source?.placementId == null
    ? undefined
    : context.source.levelFacts.facts.payload.placements.find((candidate) => (
        candidate.placementId === source.placementId
      ));
  const placements = new Map(context.source.levelFacts.facts.payload.placements.map((placement) => (
    [placement.placementId, placement] as const
  )));
  const sourceCoordinate = sourcePlacement?.descriptor.coordinate;
  const fact = sourceCoordinate === undefined
    ? undefined
    : context.source.levelFacts.facts.payload.actors.find((candidate) => {
        const candidateCoordinate = placements.get(candidate.descriptor.placementId)?.descriptor.coordinate;
        return candidate.disposition === "contained"
          && candidate.semanticType === context.actorSemanticType(event.actorId)
          && candidateCoordinate?.x === sourceCoordinate.x
          && candidateCoordinate.y === sourceCoordinate.y
          && candidateCoordinate.z === sourceCoordinate.z;
      });
  return fact === undefined
    ? null
    : {
        semanticType: fact.semanticType,
        actorId: fact.actorId,
        placementId: fact.descriptor.placementId,
        deviceId: null,
      };
}

function nativeAuthority(link: TworldCausalCommandLink | null) {
  return link === null
    ? {
        basis: "native-action-hook" as const,
        evidence: "authoritative" as const,
        causality: "unattributed" as const,
      }
    : {
        basis: "native-action-hook" as const,
        evidence: "authoritative" as const,
        causality: "explicit" as const,
      };
}

function baseEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1 | null,
  source: SolverCausalEventParticipantV1 | null,
  terminal = false,
) {
  return {
    eventVersion: 1 as const,
    target: context.target,
    mode: context.mode,
    boundary: {
      nativeTick: event.nativeTick,
      phase: terminal ? "terminal" as const : "settlement" as const,
    },
    authority: nativeAuthority(link),
    subject,
    source,
    coordinates: {
      before: coordinate(event.before),
      after: coordinate(event.after),
    },
    commandId: link?.commandId ?? null,
    planId: link?.planId ?? null,
    causedBySequences: link === null ? [] : [link.sequence],
  };
}

function keyResourceSemanticType(
  context: ProjectionContext,
  index: number | null,
): string {
  const keyTileId = index === null
    ? null
    : [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green][index]
      ?? null;
  return keyTileId === null ? "cc1:key" : context.tileSemanticType(keyTileId);
}

function inventoryResourceSemanticType(
  context: ProjectionContext,
  resource: TworldNativeCausalResourceCounter,
): string {
  if (resource.slot === "keys") return keyResourceSemanticType(context, resource.index);
  if (resource.slot === "boots") {
    const tileId = resource.index === null
      ? null
      : [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water][resource.index]
        ?? null;
    return tileId === null ? "cc1:boots" : context.tileSemanticType(tileId);
  }
  return resource.slot === "chips-needed" ? "cc1:chip" : "cc1:tool";
}

function appendMapMutation(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
  source: SolverCausalEventParticipantV1 | null,
  mutation: string,
): void {
  if (event.tileId === null || event.resultingTileId == null) return;
  const beforeSemanticType = context.tileSemanticType(event.tileId);
  const afterSemanticType = context.tileSemanticType(event.resultingTileId);
  if (beforeSemanticType === afterSemanticType) return;
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind: "map-mutated",
    detail: {
      mutation,
      beforeSemanticType,
      beforeState: null,
      afterSemanticType,
      afterState: null,
    },
  });
}

function projectResourceEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
): void {
  if (event.tileId === null || event.resourceCounter == null) {
    throw new Error("a native collection hook must carry its exact resource counter");
  }
  const resource = event.resourceCounter;
  const resourceType = context.tileSemanticType(event.tileId);
  const source = placementParticipant(event, context, "before", resourceType, "pickup", false);
  const progress = resource.slot === "chips-needed";
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind: "resource-collected",
    detail: {
      resourceType,
      // The native hook is emitted for exactly one consumed pickup. Progress
      // counters may already be saturated (for example an excess IC chip), so
      // their delta is not the pickup amount.
      amount: 1,
      inventoryBefore: progress ? null : resource.beforeCount,
      inventoryAfter: progress ? null : resource.afterCount,
      remainingBefore: progress ? resource.beforeCount : null,
      remainingAfter: progress ? resource.afterCount : null,
    },
  });
  if (resource.beforeCount !== resource.afterCount) {
    appendTworldCausalEvent(context.journal, {
      ...baseEvent(event, context, link, subject, source),
      kind: progress ? "requirement-changed" : "inventory-changed",
      detail: {
        resourceType,
        beforeCount: resource.beforeCount,
        afterCount: resource.afterCount,
        reason: "cc1:resource-collected",
      },
    } as Omit<SolverCausalEventV1, "sequence" | "occurrenceOrdinal">);
  }
  appendMapMutation(event, context, link, subject, source, "cc1:pickup-consumed");
}

function projectDoorEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
): void {
  if (event.tileId === null) return;
  const doorType = context.tileSemanticType(event.tileId);
  const source = placementParticipant(event, context, "before", doorType, "terrain", true);
  const resource = event.resourceCounter;
  if (resource !== null && resource !== undefined && resource.beforeCount !== resource.afterCount) {
    appendTworldCausalEvent(context.journal, {
      ...baseEvent(event, context, link, subject, source),
      kind: "inventory-changed",
      detail: {
        resourceType: keyResourceSemanticType(context, resource.index),
        beforeCount: resource.beforeCount,
        afterCount: resource.afterCount,
        reason: "cc1:door-opened",
      },
    });
  }
  appendMapMutation(event, context, link, subject, source, "cc1:door-opened");
}

function projectDirectInventoryEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
): void {
  const resource = event.resourceCounter;
  if (resource == null || resource.beforeCount === resource.afterCount) {
    throw new Error("a native inventory mutation hook must carry an exact changed resource counter");
  }
  const source = event.tileId === null
    ? null
    : placementParticipant(
        event,
        context,
        "before",
        context.tileSemanticType(event.tileId),
        event.targetStratum ?? "terrain",
        false,
      );
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind: "inventory-changed",
    detail: {
      resourceType: inventoryResourceSemanticType(context, resource),
      beforeCount: resource.beforeCount,
      afterCount: resource.afterCount,
      reason: event.action ?? "cc1:native-inventory-change",
    },
  });
}

function projectDirectMapMutation(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  source: SolverCausalEventParticipantV1,
): void {
  if (event.tileId === null) return;
  const subject = placementParticipant(
    event,
    context,
    "before",
    context.tileSemanticType(event.tileId),
    event.targetStratum ?? "terrain",
    false,
  );
  if (subject === null) return;
  appendMapMutation(
    event,
    context,
    link,
    subject,
    source,
    event.action ?? "cc1:native-map-mutation",
  );
}

function projectTeleportEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
): void {
  const teleportType = event.tileId === null
    ? "cc1:teleport"
    : context.tileSemanticType(event.tileId);
  const entry = placementParticipant(event, context, "before", teleportType, "terrain", true);
  const exit = placementParticipant(event, context, "after", teleportType, "terrain", true);
  if (entry?.placementId == null || exit?.placementId == null) {
    throw new Error("a native teleport hook could not bind its entry and exit placement authority");
  }
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, entry),
    kind: "teleport-relocated",
    detail: {
      networkId: "cc1:teleport-network",
      entryPlacementId: entry.placementId,
      exitPlacementId: exit.placementId,
    },
  });
}

function projectDeviceEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
): void {
  const kind = event.kind === "device-activated" || event.kind === "device-state-changed"
    ? event.kind
    : null;
  if (kind === null) throw new Error("a non-device native hook reached device projection");
  if (event.tileId == null || event.action == null) {
    throw new Error("a native device hook must carry its target and action");
  }
  if (
    kind === "device-state-changed"
    && (
      event.beforeState == null
      || event.afterState == null
      || event.beforeState === event.afterState
    )
  ) {
    throw new Error("a native device-state hook must carry a real state transition");
  }
  const semanticType = context.tileSemanticType(event.tileId);
  const subject = placementParticipant(
    event,
    context,
    "before",
    semanticType,
    event.targetStratum ?? "terrain",
    true,
  );
  const source = sourcePlacementParticipant(event, context, true);
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind,
    detail: {
      action: event.action,
      beforeState: event.beforeState ?? null,
      afterState: event.afterState ?? null,
    },
  });
  if (kind === "device-state-changed" && event.resultingTileId != null) {
    appendTworldCausalEvent(context.journal, {
      ...baseEvent(event, context, link, subject, source),
      kind: "map-mutated",
      detail: {
        mutation: event.action,
        beforeSemanticType: context.tileSemanticType(event.tileId),
        beforeState: event.beforeState ?? null,
        afterSemanticType: context.tileSemanticType(event.resultingTileId),
        afterState: event.afterState ?? null,
      },
    });
  }
}

function projectActorLifecycleEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  kind: "actor-spawned" | "actor-destroyed",
): void {
  const subject = actorParticipant(event, context);
  const source = sourcePlacementParticipant(event, context, true);
  const spawnOrdinal = kind === "actor-spawned" && source?.placementId != null
    ? event.spawnOrdinal
      ?? allocateTworldCausalSpawnOrdinal(context.journal, source.placementId)
    : null;
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind,
    detail: kind === "actor-spawned"
      ? {
          before: null,
          after: "active",
          parentActorId: parentActorParticipant(event, context)?.actorId ?? null,
          spawnOrdinal,
          reason: event.cause ?? "cc1:native-spawn",
        }
      : {
          before: "active",
          after: "destroyed",
          parentActorId: null,
          spawnOrdinal: null,
          reason: event.cause ?? "cc1:native-destruction",
        },
  });
}

function projectPlayerDeathEvent(
  event: TworldNativeCausalEvent,
  context: ProjectionContext,
  link: TworldCausalCommandLink | null,
  subject: SolverCausalEventParticipantV1,
): void {
  const source = sourceActorParticipant(event, context)
    ?? sourcePlacementParticipant(event, context, false);
  const cause = event.cause ?? "cc1:unknown-loss";
  const deathSequence = appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source),
    kind: "player-died",
    detail: {
      cause,
      hazardPlacementId: source?.placementId ?? null,
    },
  });
  if (context.terminal.kind === "running") {
    throw new Error("a native player-death hook must project a terminal result");
  }
  const terminalResult = context.terminal.kind === "lost"
    ? { ...context.terminal, cause }
    : context.terminal;
  appendTworldCausalEvent(context.journal, {
    ...baseEvent(event, context, link, subject, source, true),
    authority: {
      basis: "terminal-latch",
      evidence: "authoritative",
      causality: "explicit",
    },
    causedBySequences: [
      ...(link === null ? [] : [link.sequence]),
      deathSequence,
    ],
    kind: "terminal-reached",
    detail: {
      result: { ...terminalResult, nativeTick: event.nativeTick },
    },
  });
}

export function appendTworldAppliedCommand(input: {
  readonly context: ProjectionContext;
  readonly request: SolverAdvanceRequest;
  readonly appliedInputCode: number;
  readonly nativeTick: number;
  readonly playerCoordinateBefore: SolverCoordinate;
  readonly influence: "applied" | "held" | "blocked" | "ignored";
  readonly failureReason?: string | null;
}): TworldCausalCommandLink | null {
  const { context, request } = input;
  if (
    request.kind === "replay-tick"
    && (
      input.appliedInputCode === 0
      || input.influence === "held"
      || input.influence === "ignored"
    )
  ) return null;
  const commandId = request.causalContext?.commandId
    ?? `runtime-command:${context.target}:${context.mode}:${context.journal.nextSequence}`;
  const planId = request.causalContext?.planId ?? null;
  const sequence = appendTworldCausalEvent(context.journal, {
    eventVersion: 1,
    target: context.target,
    mode: context.mode,
    boundary: { nativeTick: input.nativeTick, phase: "command" },
    authority: {
      basis: "runtime-command",
      evidence: "authoritative",
      causality: "explicit",
    },
    subject: {
      semanticType: "cc1:chip",
      actorId: context.bindings.player.actorId,
      placementId: context.bindings.player.sourcePlacementId,
      deviceId: null,
    },
    source: null,
    coordinates: { before: input.playerCoordinateBefore, after: null },
    commandId,
    planId,
    causedBySequences: [],
    kind: "command",
    detail: {
      requestKind: request.kind,
      inputCode: request.kind === "manual-poll" ? request.inputCode : null,
      influence: input.influence,
      failureReason: input.failureReason ?? null,
    },
  });
  return { sequence, commandId, planId };
}

export function projectTworldNativeCausalEvents(
  events: readonly TworldNativeCausalEvent[],
  context: ProjectionContext,
  commandLink: TworldCausalCommandLink | null,
): void {
  for (const event of events) {
    const subject = actorParticipant(event, context);
    const playerLink = event.actorId === MS_TILE.Chip && event.actorSerial === null
      ? commandLink
      : null;
    switch (event.kind) {
      case "movement-started":
        // The native start hook is retained as command-link authority by the
        // adapter. P2B publishes completed movement and first failure, not a
        // second high-volume movement envelope for every successful step.
        break;
      case "movement-blocked":
        if (event.movementRole === undefined) {
          throw new Error("a native movement-decision hook must carry its exact movement role");
        }
        appendTworldCausalEvent(context.journal, {
          ...baseEvent(event, context, playerLink, subject, null),
          kind: event.kind,
          detail: {
            direction: event.direction == null ? null : solverDirection(event.direction),
            movementRole: event.movementRole,
            attemptedCoordinate: coordinate(event.after),
            failureReason: event.kind === "movement-blocked"
              ? event.failureReason ?? "cc1:blocked"
              : null,
          },
        });
        break;
      case "move-completed":
        if (
          event.before === null
          || event.after === null
          || (event.before.pos === event.after.pos && event.before.z === event.after.z)
        ) {
          break;
        }
        if (event.movementRole === undefined) {
          throw new Error("a native completed-movement hook must carry its exact movement role");
        }
        appendTworldCausalEvent(context.journal, {
          ...baseEvent(event, context, playerLink, subject, null),
          kind: "movement-completed",
          detail: {
            direction: event.direction == null ? null : solverDirection(event.direction),
            movementRole: event.movementRole,
            attemptedCoordinate: coordinate(event.after),
            failureReason: null,
          },
        });
        break;
      case "teleport":
        projectTeleportEvent(event, context, playerLink, subject);
        break;
      case "collect":
        projectResourceEvent(event, context, playerLink, subject);
        break;
      case "open-door":
        projectDoorEvent(event, context, playerLink, subject);
        break;
      case "open-socket": {
        const socketType = event.tileId === null
          ? "cc1:socket"
          : context.tileSemanticType(event.tileId);
        const source = placementParticipant(event, context, "before", socketType, "terrain", true);
        appendMapMutation(event, context, playerLink, subject, source, "cc1:socket-opened");
        break;
      }
      case "inventory-changed":
        projectDirectInventoryEvent(event, context, playerLink, subject);
        break;
      case "map-mutated":
        projectDirectMapMutation(event, context, playerLink, subject);
        break;
      case "device-activated":
      case "device-state-changed":
        projectDeviceEvent(event, context, playerLink);
        break;
      case "actor-spawned":
      case "actor-destroyed":
        projectActorLifecycleEvent(event, context, playerLink, event.kind);
        break;
      case "player-died":
        projectPlayerDeathEvent(event, context, playerLink, subject);
        break;
      case "terminal-failed":
        if (context.terminal.kind === "running") {
          throw new Error("a native terminal-failure hook must project a terminal result");
        }
        appendTworldCausalEvent(context.journal, {
          ...baseEvent(event, context, playerLink, subject, null, true),
          authority: {
            basis: "terminal-latch",
            evidence: "authoritative",
            causality: playerLink === null ? "unattributed" : "explicit",
          },
          kind: "terminal-reached",
          detail: {
            result: { ...context.terminal, nativeTick: event.nativeTick },
          },
        });
        break;
      case "complete-level": {
        if (context.terminal.kind === "running") {
          throw new Error("a native completion hook must project a terminal result");
        }
        const exitType = event.tileId === null
          ? "cc1:exit"
          : context.tileSemanticType(event.tileId);
        const source = placementParticipant(event, context, "before", exitType, "terrain", false);
        appendTworldCausalEvent(context.journal, {
          ...baseEvent(event, context, playerLink, subject, source, true),
          kind: "terminal-reached",
          detail: {
            result: { ...context.terminal, nativeTick: event.nativeTick },
          },
        });
        break;
      }
    }
  }
}
