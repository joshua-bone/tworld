import {
  type DirectionV1,
  type PlacementIdV1,
  type PlacementStratumV1,
  type SolverActorObservation,
  type SolverDeviceObservation,
  type SolverInventoryEntry,
  type SolverObservation,
  type SolverObservedCell,
  type SolverPlayerObservation,
  type SolverRemainingRequirement,
  type SolverRuntimeProvenance,
  type SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import {
  SolverRuntimeError,
  type Sha256Port,
  type SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import type { EngineMapCell } from "@game-core/api/model";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  createLynxReplaySession,
  type LynxInteractiveSessionState,
  type LynxRuntimeActor,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  lynxRulesetCatalog,
  lynxTileForcedFloorKind,
  lynxTileHasCapability,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  MS_GRID_WIDTH,
  MS_TILE,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureId,
  msStaticBlockActorId,
} from "@ruleset-ms/api/tiles";
import {
  captureLynxUndoCheckpoint,
  restoreLynxUndoCheckpoint,
} from "@undo-runtime/impl/lynxCheckpoint";
import { digestLynxInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import {
  createSolverRuntimeKernel,
  type SolverRuntimeDriver,
} from "../../impl/runtime/createSolverRuntimeKernel";
import {
  identifyTworldSolverObservationSemantic,
  projectTworldSolverObservation,
} from "./projectTworldSolverObservation";
import {
  assertTworldRuntimeSource,
  buildRuntimeActorBindings,
  neutralCatalogCode,
  observedRuntimeElement,
  placementForRuntimeElement,
  runtimeElementMatchesPlacementType,
  runtimeElementIdentity,
  solverCoordinate,
  solverDirection,
  type RuntimeActorBinding,
  type RuntimeActorBindings,
  type RuntimeActorSeed,
} from "./tworldRuntimeProjectionSupport";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "./tworldSolverRuntimeSource";
import {
  isLynxSolverActorContained,
  isLynxSolverActorTrapped,
  isLynxSolverBeartrapOpen,
  isLynxSolverButtonPressed,
  isLynxSolverBrownButtonHeld,
} from "./lynxSolverRuntimeSemantics";

interface LynxSolverToken {
  readonly mode: "manual" | "replay";
  readonly source: TworldSolverManualStartSource;
  readonly bindings: RuntimeActorBindings;
  readonly session: LynxInteractiveSessionState;
  readonly lastPolledInputCode: number | null;
}

export interface CreateTworldLynxSolverRuntimeAdapterOptions {
  readonly sha256: Sha256Port;
  readonly adapterRevision: string;
  readonly engineRevision: string;
  readonly maximumLiveRuns?: number;
  readonly maximumLiveCheckpoints?: number;
}

const STRATUM_RANK: Record<PlacementStratumV1, number> = {
  terrain: 0,
  overlay: 1,
  pickup: 2,
  actor: 3,
  side: 4,
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hexDigest(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function hashText(value: string, sha256: Sha256Port): Promise<`sha256:${string}`> {
  const digest = await sha256.digestBytes(new TextEncoder().encode(value));
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new SolverRuntimeError(
      "runtime.adapter-failure",
      "observe",
      "SHA-256 adapter must return exactly 32 bytes",
    );
  }
  return `sha256:${hexDigest(digest)}`;
}

function lynxActorSemanticType(actorId: number): string {
  const code = lynxRulesetCatalog.getActor(actorId)?.code;
  return code ? neutralCatalogCode(code) : "cc1:unknown-actor";
}

function lynxTileSemanticType(tileId: number): string {
  if (tileId === MS_TILE.Empty || tileId === MS_TILE.Nothing) return "cc1:floor";
  if (isMsStaticBlockTile(tileId)) {
    return lynxActorSemanticType(msStaticBlockActorId(tileId) ?? MS_TILE.Block);
  }
  if (isMsCreature(tileId)) return lynxActorSemanticType(msCreatureId(tileId));
  const code = lynxRulesetCatalog.getTile(tileId)?.code;
  return code ? neutralCatalogCode(code) : "cc1:unknown-element";
}

function lynxTileStratum(tileId: number): PlacementStratumV1 {
  if (isMsCreature(tileId) || isMsStaticBlockTile(tileId)) return "actor";
  if (lynxTileHasCapability(tileId, "collect-on-entry")) return "pickup";
  if (lynxTileHasTag(tileId, "button")) return "overlay";
  return "terrain";
}

function lynxTileState(tileId: number, state: number): string | null {
  if (tileId === MS_TILE.Beartrap && (state & LYNX_CELL_FLAG.TrapOpen) !== 0) return "open";
  if (tileId === MS_TILE.CloneMachine && (state & LYNX_CELL_FLAG.Animated) !== 0) return "active";
  if ((state & LYNX_CELL_FLAG.Claimed) !== 0) return "occupied";
  if ((state & LYNX_CELL_FLAG.Animated) !== 0) return "animated";
  return state === 0 ? null : "stateful";
}

function randomSlideDirection(value: string): DirectionV1 | null {
  switch (value.toLowerCase()) {
    case "north": return "north";
    case "east": return "east";
    case "south": return "south";
    case "west": return "west";
    default: return null;
  }
}

function actorSeed(actor: LynxRuntimeActor): RuntimeActorSeed {
  return {
    runtimeKey: `lynx-actor:${actor.serial}`,
    semanticType: lynxActorSemanticType(actor.id),
    coordinate: solverCoordinate(actor.pos, actor.z, MS_GRID_WIDTH),
    facing: solverDirection(actor.dir),
  };
}

async function startLynxToken(
  source: TworldSolverManualStartSource,
  mode: "manual" | "replay",
  sha256: Sha256Port,
  expectedProvenance: SolverRuntimeProvenance,
  replaySource?: TworldSolverReplayStartSource,
): Promise<LynxSolverToken> {
  const operation = mode === "manual" ? "startManual" : "startReplay";
  await assertTworldRuntimeSource(source, "lynx", sha256, operation, expectedProvenance);
  if (mode === "manual" && source.manualOptions.stepping !== null) {
    throw new SolverRuntimeError(
      "runtime.unsupported-option",
      "startManual",
      "Lynx manual execution does not accept a stepping override",
    );
  }
  const detachedSource = structuredClone(source);
  const level = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel(detachedSource.loaded);
  const replay = replaySource ? structuredClone(replaySource.replay) : undefined;
  const session = mode === "replay"
    ? createLynxReplaySession(detachedSource.loaded.request, level, replay!)
    : createLynxInteractiveSession(detachedSource.loaded.request, level);
  const playerSeed: RuntimeActorSeed = {
    runtimeKey: "lynx-player",
    semanticType: "cc1:chip",
    coordinate: solverCoordinate(session.chipPos, session.chipZ, MS_GRID_WIDTH),
    facing: solverDirection(session.chipDir),
  };
  const actorSeeds = session.actors.map(actorSeed);
  return {
    mode,
    source: detachedSource,
    session,
    lastPolledInputCode: null,
    bindings: await buildRuntimeActorBindings(
      detachedSource,
      "lynx",
      playerSeed,
      actorSeeds,
      sha256,
      operation,
    ),
  };
}

async function refreshLynxBindings(
  token: Pick<LynxSolverToken, "source" | "session" | "bindings">,
  sha256: Sha256Port,
): Promise<RuntimeActorBindings> {
  return buildRuntimeActorBindings(
    token.source,
    "lynx",
    {
      runtimeKey: "lynx-player",
      semanticType: "cc1:chip",
      coordinate: solverCoordinate(token.session.chipPos, token.session.chipZ, MS_GRID_WIDTH),
      facing: solverDirection(token.session.chipDir),
    },
    token.session.actors.map(actorSeed),
    sha256,
    "advanceTick",
    token.bindings,
  );
}

function cloneBindings(bindings: RuntimeActorBindings): RuntimeActorBindings {
  return {
    player: { ...bindings.player },
    actors: new Map([...bindings.actors].map(([key, value]) => [key, { ...value }])),
  };
}

function actorMovement(
  actor: LynxRuntimeActor,
  session: LynxInteractiveSessionState,
): SolverActorObservation["movement"] {
  if (actor.teleported) return "teleporting";
  if (actor.moving <= 0) {
    return isLynxSolverActorTrapped(session, actor) ? "trapped" : "stationary";
  }
  if (actor.moveKind === "air" || actor.moveKind === "elevator") return "forced";
  const floor = cellAtEngineCoordinate(session.state.map, actor.pos, actor.z ?? 1)?.top.id;
  const forced = floor === undefined ? "none" : lynxTileForcedFloorKind(floor);
  if (forced === "teleport") return "teleporting";
  if (forced === "ice") return "sliding";
  if (forced === "slide") return "forced";
  return "moving";
}

function actorObservation(
  seed: RuntimeActorSeed,
  binding: RuntimeActorBinding,
  actor: LynxRuntimeActor,
  observationOrder: number,
  nativePosition: SolverActorObservation["nativePosition"],
  session: LynxInteractiveSessionState,
): SolverActorObservation {
  return {
    observationOrder,
    nativePosition,
    actorId: binding.actorId,
    identityProvenance: binding.identityProvenance,
    sourcePlacementId: binding.sourcePlacementId,
    semanticType: seed.semanticType,
    coordinate: seed.coordinate,
    facing: seed.facing,
    lifecycle: actor.hidden
      ? "destroyed"
      : isLynxSolverActorContained(session, actor)
          ? "contained"
        : actor.dormant
          ? "dormant"
          : "active",
    movement: actorMovement(actor, session),
  };
}

function projectLynxActors(token: LynxSolverToken): SolverActorObservation[] {
  return token.session.actors.map((actor, index) => {
    const seed = actorSeed(actor);
    const binding = token.bindings.actors.get(seed.runtimeKey);
    if (!binding) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        "observe",
        "a Lynx runtime actor has no stable binding",
        { runtimeKey: seed.runtimeKey },
      );
    }
    return actorObservation(
      seed,
      binding,
      actor,
      index,
      { collectionId: "lynx:actors", index },
      token.session,
    );
  });
}

function projectLynxTerminal(token: LynxSolverToken): SolverTerminalResult {
  const session = token.session;
  if (session.endGameResult === null) return { kind: "running" };
  const coordinate = solverCoordinate(session.chipPos, session.chipZ, MS_GRID_WIDTH);
  const tick = session.state.timer.currentTime;
  if (session.endGameResult === "completed") {
    const placement = token.source.levelFacts.facts.payload.exits
      .map((id) => token.source.levelFacts.facts.payload.placements.find((entry) => entry.placementId === id))
      .find((entry) => entry?.descriptor.coordinate.x === coordinate.x
        && entry.descriptor.coordinate.y === coordinate.y
        && entry.descriptor.coordinate.z === coordinate.z);
    return {
      kind: "won",
      nativeTick: tick,
      coordinate,
      exitPlacementId: placement?.placementId ?? null,
    };
  }
  if (
    session.state.timer.timeLimit > 0
    && session.state.timer.currentTime >= session.state.timer.timeLimit
  ) {
    return { kind: "timed-out", nativeTick: tick, coordinate };
  }
  return {
    kind: "lost",
    nativeTick: tick,
    coordinate,
    cause: "cc1:unknown-loss",
  };
}

function playerMovement(session: LynxInteractiveSessionState): SolverPlayerObservation["movement"] {
  if (session.chipMoving <= 0) {
    return isLynxSolverActorTrapped(session, {
      pos: session.chipPos,
      z: session.chipZ,
      moving: session.chipMoving,
    }) ? "trapped" : "stationary";
  }
  if (session.chipMoveKind === "air" || session.chipMoveKind === "elevator") return "forced";
  const floor = cellAtEngineCoordinate(session.state.map, session.chipPos, session.chipZ ?? 1)?.top.id;
  const forced = floor === undefined ? "none" : lynxTileForcedFloorKind(floor);
  if (forced === "teleport") return "teleporting";
  if (forced === "ice") return "sliding";
  if (forced === "slide") return "forced";
  return "moving";
}

function projectLynxPlayer(
  token: LynxSolverToken,
  terminal: SolverTerminalResult,
): SolverPlayerObservation {
  const movement = playerMovement(token.session);
  return {
    actorId: token.bindings.player.actorId,
    identityProvenance: token.bindings.player.identityProvenance,
    sourcePlacementId: token.bindings.player.sourcePlacementId,
    semanticType: "cc1:chip",
    coordinate: solverCoordinate(token.session.chipPos, token.session.chipZ, MS_GRID_WIDTH),
    facing: solverDirection(token.session.chipDir),
    lifecycle: token.session.endGameResult === "failed" ? "destroyed" : "active",
    movement,
    control: terminal.kind === "running"
      ? movement === "stationary" ? "available" : "unavailable"
      : "terminal",
    inputInfluence: terminal.kind !== "running"
      ? "terminal"
      : token.mode === "replay"
        ? "replay-owned"
        : movement === "trapped"
          ? "blocked"
        : movement === "stationary"
          ? "eligible"
          : "in-transit",
  };
}

function identityKey(identity: {
  readonly placementId?: string;
  readonly actorId?: string;
  readonly semanticId?: string;
  readonly kind: string;
}): string {
  return identity.placementId ?? identity.actorId ?? identity.semanticId ?? identity.kind;
}

function cellAtEngineCoordinate(
  map: LynxInteractiveSessionState["state"]["map"],
  pos: number,
  engineZ: number,
): EngineMapCell | null {
  const cells = map.layers?.find((layer) => layer.z === engineZ)?.cells
    ?? (engineZ === 1 ? map.cells : null);
  return cells?.[pos] ?? null;
}

function projectLynxCells(
  token: LynxSolverToken,
  player: SolverPlayerObservation,
  actors: readonly SolverActorObservation[],
): SolverObservedCell[] {
  const { map } = token.session.state;
  const { width, height } = token.source.levelFacts.facts.payload.geometry;
  const layers = (map.layers ?? [{ z: 1, cells: map.cells }])
    .slice()
    .sort((left, right) => left.z - right.z);
  const actorByCoordinate = new Map<string, SolverActorObservation[]>();
  for (const actor of actors) {
    if (!actor.coordinate || actor.lifecycle === "destroyed") continue;
    const key = `${actor.coordinate.z}:${actor.coordinate.y}:${actor.coordinate.x}`;
    const list = actorByCoordinate.get(key) ?? [];
    list.push(actor);
    actorByCoordinate.set(key, list);
  }
  const cells: SolverObservedCell[] = [];
  for (const layer of layers) {
    const z = Math.max(0, layer.z - 1);
    for (let pos = 0; pos < layer.cells.length; pos += 1) {
      const cell = layer.cells[pos]!;
      const coordinate = solverCoordinate(pos, layer.z, width);
      const usedPlacements = new Set<PlacementIdV1>();
      const elements = [] as SolverObservedCell["elements"][number][];
      const rawElements = [cell.bottom, cell.top] as const;
      rawElements.forEach((element, planeIndex) => {
        if (isMsCreature(element.id) || isMsStaticBlockTile(element.id)) return;
        const other = rawElements[planeIndex === 0 ? 1 : 0];
        const semanticType = lynxTileSemanticType(element.id);
        const isEmpty = element.id === MS_TILE.Empty || element.id === MS_TILE.Nothing;
        const otherIsEmpty = other.id === MS_TILE.Empty || other.id === MS_TILE.Nothing;
        if (isEmpty && !otherIsEmpty) return;
        if (planeIndex === 1 && isEmpty && otherIsEmpty) return;
        const stratum = lynxTileStratum(element.id);
        const placement = placementForRuntimeElement(
          token.source,
          coordinate,
          semanticType,
          stratum,
          usedPlacements,
        );
        elements.push(observedRuntimeElement({
          identity: runtimeElementIdentity(
            placement,
            `runtime:cell:${z}:${pos}:${planeIndex}:${semanticType}`,
          ),
          stratum,
          semanticType,
          state: element.id === MS_TILE.Beartrap
            ? isLynxSolverBeartrapOpen(token.session, pos, layer.z) ? "open" : "closed"
            : /^cc1:button-/u.test(semanticType)
              ? isLynxSolverButtonPressed(token.session, pos, element.id, layer.z) ? "pressed" : "released"
              : lynxTileState(element.id, element.state),
        }));
      });
      if (
        player.lifecycle !== "destroyed"
        && player.coordinate?.x === coordinate.x
        && player.coordinate.y === coordinate.y
        && player.coordinate.z === coordinate.z
      ) {
        elements.push(observedRuntimeElement({
          identity: { kind: "actor", actorId: player.actorId },
          stratum: "actor",
          semanticType: player.semanticType,
          facing: player.facing,
          state: player.movement,
        }));
      }
      for (const actor of actorByCoordinate.get(`${z}:${coordinate.y}:${coordinate.x}`) ?? []) {
        elements.push(observedRuntimeElement({
          identity: { kind: "actor", actorId: actor.actorId },
          stratum: "actor",
          semanticType: actor.semanticType,
          facing: actor.facing,
          state: actor.movement,
        }));
      }
      elements.sort((left, right) => {
        const rank = STRATUM_RANK[left.stratum] - STRATUM_RANK[right.stratum];
        return rank !== 0 ? rank : compareText(identityKey(left.identity), identityKey(right.identity));
      });
      cells.push({
        cellOrdinal: z * width * height + pos,
        coordinate,
        elementsOrder: "stratum-then-identity",
        elements,
      });
    }
  }
  return cells;
}

function projectLynxInventory(token: LynxSolverToken): SolverInventoryEntry[] {
  const inventory = token.session.state.inventory;
  const entries: SolverInventoryEntry[] = [];
  inventory.keys.forEach((count, index) => {
    if (count > 0) {
      entries.push({
        slotOrder: entries.length,
        resourceType: lynxTileSemanticType(MS_TILE.Key_Red + index),
        count,
      });
    }
  });
  inventory.boots.forEach((count, index) => {
    if (count > 0) {
      entries.push({
        slotOrder: entries.length,
        resourceType: lynxTileSemanticType(MS_TILE.Boots_Ice + index),
        count,
      });
    }
  });
  for (const tool of inventory.tools) {
    if (tool > 0) {
      entries.push({
        slotOrder: entries.length,
        resourceType: lynxTileSemanticType(tool),
        count: 1,
      });
    }
  }
  return entries;
}

function projectLynxRequirements(token: LynxSolverToken): SolverRemainingRequirement[] {
  const count = token.session.state.inventory.chipsNeeded;
  return count > 0 ? [{ resourceType: "cc1:icchip", count }] : [];
}

function projectLynxDevices(
  token: LynxSolverToken,
): SolverDeviceObservation[] {
  return token.source.levelFacts.facts.payload.placements.flatMap((placement) => {
    const semanticType = placement.descriptor.semanticType;
    if (!/(?:button-|beartrap|clonemachine|clone-machine|switchwall|switch-wall|togglewall|toggle-wall|teleport)/u.test(semanticType)) {
      return [];
    }
    const { x, y, z } = placement.descriptor.coordinate;
    const cell = cellAtEngineCoordinate(token.session.state.map, y * MS_GRID_WIDTH + x, z + 1);
    const raw = cell && [cell.top, cell.bottom].find((element) => (
      runtimeElementMatchesPlacementType(lynxTileSemanticType(element.id), semanticType)
    ));
    let state = "observed";
    if (/button-brown/u.test(semanticType)) state = isLynxSolverBrownButtonHeld(token.session, y * MS_GRID_WIDTH + x, z + 1) ? "pressed" : "released";
    else if (/button-/u.test(semanticType)) state = raw && isLynxSolverButtonPressed(token.session, y * MS_GRID_WIDTH + x, raw.id, z + 1) ? "pressed" : "released";
    else if (/beartrap/u.test(semanticType)) state = isLynxSolverBeartrapOpen(token.session, y * MS_GRID_WIDTH + x, z + 1) ? "open" : "closed";
    else if (/(?:clonemachine|clone-machine)/u.test(semanticType)) state = raw && (raw.state & LYNX_CELL_FLAG.Animated) !== 0 ? "active" : "idle";
    else if (/(?:switchwall|switch-wall|togglewall|toggle-wall)-open/u.test(raw ? lynxTileSemanticType(raw.id) : semanticType)) state = "open";
    else if (/(?:switchwall|switch-wall|togglewall|toggle-wall)-closed/u.test(raw ? lynxTileSemanticType(raw.id) : semanticType)) state = "closed";
    return [{
      placementId: placement.placementId,
      semanticType,
      state,
      attributesOrder: "name" as const,
      attributes: [],
    }];
  });
}

async function exactLynxFingerprint(
  token: LynxSolverToken,
  sha256: Sha256Port,
): Promise<string> {
  return hashText(JSON.stringify({
    exactStateVersion: 1,
    session: digestLynxInteractiveSession(token.session),
    mode: token.mode,
    lastPolledInputCode: token.lastPolledInputCode,
    source: [
      token.source.levelFactsContent.digest,
      token.source.levelFactsContent.byteLength,
      token.source.provenance.adapterId,
      token.source.provenance.adapterRevision,
      token.source.provenance.engineId,
      token.source.provenance.engineRevision,
    ],
    bindings: {
      player: [
        token.bindings.player.actorId,
        token.bindings.player.identityProvenance,
        token.bindings.player.sourcePlacementId,
      ],
      actors: [...token.bindings.actors]
        .sort(([left], [right]) => compareText(left, right))
        .map(([runtimeKey, binding]) => [
          runtimeKey,
          binding.actorId,
          binding.identityProvenance,
          binding.sourcePlacementId,
        ]),
    },
  }), sha256);
}

async function projectLynxObservation(
  token: LynxSolverToken,
  sha256: Sha256Port,
): Promise<SolverObservation> {
  const { state } = token.session;
  const terminal = projectLynxTerminal(token);
  const actors = projectLynxActors(token);
  const player = projectLynxPlayer(token, terminal);
  const timer = state.timer;
  return projectTworldSolverObservation({
    target: "lynx",
    mode: token.mode,
    source: token.source,
    nativeTick: timer.currentTime,
    timing: {
      currentTime: timer.currentTime,
      timeOffset: timer.timeOffset,
      secondsPlayed: timer.secondsPlayed,
      timeLimit: timer.timeLimit,
      remainingNativeTicks: timer.timeLimit > 0
        ? Math.max(0, timer.timeLimit - timer.currentTime)
        : null,
    },
    lastPolledInputCode: token.lastPolledInputCode,
    lastAppliedInputCode: timer.currentTime < 0 ? null : token.session.lastInput.inputCode,
    replayCursor: token.mode === "replay" ? state.replay.cursor : null,
    replayMoveCount: token.mode === "replay" ? state.replay.moveCount : null,
    replayBestTimeTicks: token.mode === "replay" ? state.replay.bestTimeTicks : null,
    stepping: state.replay.stepping,
    initialRandomSlideDirection: randomSlideDirection(state.replay.initialRandomSlideDirection),
    nativeStateFingerprints: [
      {
        stateId: "cc1:main-rng",
        fingerprint: await hashText(
          `${state.replay.randomState.main.initial}:${state.replay.randomState.main.value}`,
          sha256,
        ),
      },
      {
        stateId: "cc1:lynx-prng",
        fingerprint: await hashText(
          `${state.replay.randomState.lynx.prng1}:${state.replay.randomState.lynx.prng2}`,
          sha256,
        ),
      },
    ],
    cells: projectLynxCells(token, player, actors),
    player,
    actors,
    inventory: projectLynxInventory(token),
    remainingRequirements: projectLynxRequirements(token),
    devices: projectLynxDevices(token),
    exactFingerprint: await exactLynxFingerprint(token, sha256),
    terminal,
  }, sha256);
}

function createLynxDriver(
  sha256: Sha256Port,
  expectedProvenance: SolverRuntimeProvenance,
): SolverRuntimeDriver<LynxSolverToken, TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  return {
    startManual: (source) => startLynxToken(source, "manual", sha256, expectedProvenance),
    startReplay: (source) => startLynxToken(
      source.level,
      "replay",
      sha256,
      expectedProvenance,
      source,
    ),
    cloneToken(token) {
      const checkpoint = captureLynxUndoCheckpoint(token.session, "ccsolver-p2a", {
        lazySnapshot: false,
      });
      return {
        mode: token.mode,
        source: token.source,
        bindings: cloneBindings(token.bindings),
        session: restoreLynxUndoCheckpoint(checkpoint),
        lastPolledInputCode: token.lastPolledInputCode,
      };
    },
    async advanceTick(token, request) {
      const advanced = {
        ...token,
        session: advanceLynxInteractiveSession(
          token.session,
          request.kind === "manual-poll" ? request.inputCode : 0,
        ),
        lastPolledInputCode: request.kind === "manual-poll" ? request.inputCode : null,
      };
      return {
        ...advanced,
        bindings: await refreshLynxBindings(advanced, sha256),
      };
    },
    observe: (token) => projectLynxObservation(token, sha256),
    semanticFingerprint: (observation) => (
      identifyTworldSolverObservationSemantic(observation, sha256)
    ),
    exactRestoreDigest: (token) => exactLynxFingerprint(token, sha256),
  };
}

export function createTworldLynxSolverRuntimeAdapter(
  options: CreateTworldLynxSolverRuntimeAdapterOptions,
): SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  const provenance: SolverRuntimeProvenance = {
    adapterId: "tworld-lynx-solver-runtime",
    adapterRevision: options.adapterRevision,
    engineId: "tworld-lynx",
    engineRevision: options.engineRevision,
  };
  return createSolverRuntimeKernel({
    driver: createLynxDriver(options.sha256, provenance),
    ownerId: "tworld-lynx-solver-runtime",
    target: "lynx",
    maximumLiveRuns: options.maximumLiveRuns ?? 64,
    maximumLiveCheckpoints: options.maximumLiveCheckpoints ?? 256,
  });
}
