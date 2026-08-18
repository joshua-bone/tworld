import {
  type ActorIdV1,
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
import { decodeRuntimeInputCode } from "@game-core/api/command";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  createMsReplaySession,
  type MsInteractiveSessionState,
  type MsTrackedBlock,
  type MsTrackedCreature,
} from "@ruleset-ms/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  msRulesetCatalog,
  msTileHasCapability,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { isMsClonerSpecialFloor } from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";
import {
  MS_FLOOR_STATE,
  MS_GRID_WIDTH,
  MS_TILE,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureId,
  msStaticBlockActorId,
} from "@ruleset-ms/api/tiles";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";
import { digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";
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
  isMsSolverActorTrapped,
  isMsSolverBeartrapOpen,
  msSolverBlockLifecycle,
  isMsSolverButtonPressed,
  isMsSolverBrownButtonHeld,
  msSolverCreatureLifecycle,
} from "./msSolverRuntimeSemantics";

interface MsSolverToken {
  readonly mode: "manual" | "replay";
  readonly source: TworldSolverManualStartSource;
  readonly bindings: RuntimeActorBindings;
  readonly session: MsInteractiveSessionState;
  readonly lastPolledInputCode: number | null;
  readonly blockInitialCoordinates: ReadonlyMap<string, ReturnType<typeof solverCoordinate>>;
}

interface MsDormantBlockSource {
  readonly coordinate: ReturnType<typeof solverCoordinate>;
  readonly pos: number;
  readonly semanticType: string;
  readonly z: number;
}

export interface CreateTworldMsSolverRuntimeAdapterOptions {
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
    throw new Error("SHA-256 adapter must return exactly 32 bytes");
  }
  return `sha256:${hexDigest(digest)}`;
}

function msActorSemanticType(actorId: number): string {
  const code = msRulesetCatalog.getActor(actorId)?.code;
  return code ? neutralCatalogCode(code) : "cc1:unknown-actor";
}

function msTileSemanticType(tileId: number): string {
  if (tileId === MS_TILE.Empty || tileId === MS_TILE.Nothing) return "cc1:floor";
  if (isMsStaticBlockTile(tileId)) {
    return msActorSemanticType(msStaticBlockActorId(tileId) ?? MS_TILE.Block);
  }
  if (isMsCreature(tileId)) return msActorSemanticType(msCreatureId(tileId));
  const code = msRulesetCatalog.getTile(tileId)?.code;
  return code ? neutralCatalogCode(code) : "cc1:unknown-element";
}

function msTileStratum(tileId: number): PlacementStratumV1 {
  if (isMsCreature(tileId) || isMsStaticBlockTile(tileId)) return "actor";
  if (msTileHasCapability(tileId, "collect-on-entry")) return "pickup";
  if (msTileHasTag(tileId, "button")) return "overlay";
  return "terrain";
}

function msTileState(tileId: number, state: number): string | null {
  if (tileId === MS_TILE.Beartrap && (state & MS_FLOOR_STATE.TrapOpen) !== 0) return "open";
  if (tileId === MS_TILE.CloneMachine && (state & MS_FLOOR_STATE.Cloning) !== 0) return "active";
  if ((state & MS_FLOOR_STATE.ButtonDown) !== 0) return "pressed";
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

function creatureSeed(creature: MsTrackedCreature): RuntimeActorSeed {
  return {
    runtimeKey: `ms-creature:${creature.serial}`,
    semanticType: msActorSemanticType(creature.id),
    coordinate: solverCoordinate(creature.pos, creature.z, MS_GRID_WIDTH),
    facing: solverDirection(creature.dir),
  };
}

function blockSeed(
  block: MsTrackedBlock,
  index: number,
  initialCoordinate?: ReturnType<typeof solverCoordinate>,
): RuntimeActorSeed {
  return {
    runtimeKey: `ms-block-slot:${index}`,
    semanticType: msActorSemanticType(block.id ?? MS_TILE.Block),
    coordinate: solverCoordinate(block.pos, block.z, MS_GRID_WIDTH),
    initialCoordinateHint: initialCoordinate,
    facing: solverDirection(block.dir),
  };
}

function msLayerCells(
  session: MsInteractiveSessionState,
  z: number,
): readonly EngineMapCell[] | null {
  return session.state.engine.map.layers?.find((layer) => layer.z === z)?.cells
    ?? (z === 1 ? session.state.engine.map.cells : null);
}

function unboundStaticBlockSources(token: MsSolverToken): MsDormantBlockSource[] {
  const boundPlacements = new Set(
    [...token.bindings.actors.values()].flatMap((binding) => (
      binding.sourcePlacementId === null ? [] : [binding.sourcePlacementId]
    )),
  );
  const placements = new Map(token.source.levelFacts.facts.payload.placements.map((placement) => (
    [placement.placementId, placement] as const
  )));
  return token.source.levelFacts.facts.payload.actors.flatMap((actor) => {
    if (actor.disposition === "contained" || boundPlacements.has(actor.descriptor.placementId)) return [];
    const placement = placements.get(actor.descriptor.placementId);
    if (!placement) return [];
    const coordinate = placement.descriptor.coordinate;
    const z = coordinate.z + 1;
    const pos = coordinate.y * MS_GRID_WIDTH + coordinate.x;
    const raw = msLayerCells(token.session, z)?.[pos]?.top.id;
    if (raw === undefined || !isMsStaticBlockTile(raw) || msTileSemanticType(raw) !== actor.semanticType) {
      return [];
    }
    return [{ coordinate, pos, semanticType: actor.semanticType, z }];
  });
}

function splitPreservedClonerBlockRuntimeKeys(token: MsSolverToken): Set<string> {
  const actorFacts = token.source.levelFacts.facts.payload.actors;
  const placements = new Map(token.source.levelFacts.facts.payload.placements.map((placement) => (
    [placement.placementId, placement] as const
  )));
  const splitRuntimeKeys = new Set<string>();
  token.session.state.internal.blocks.forEach((block, index) => {
    const seed = blockSeed(
      block,
      index,
      token.blockInitialCoordinates.get(`ms-block-slot:${index}`),
    );
    const binding = token.bindings.actors.get(seed.runtimeKey);
    if (!binding || binding.sourcePlacementId === null) return;
    const actorFact = actorFacts.find((actor) => (
      actor.actorId === binding.actorId
      && actor.descriptor.placementId === binding.sourcePlacementId
      && actor.disposition === "contained"
      && actor.semanticType === seed.semanticType
    ));
    const placement = placements.get(binding.sourcePlacementId);
    if (!actorFact || !placement) return;
    const coordinate = placement.descriptor.coordinate;
    const sourceZ = coordinate.z + 1;
    const sourcePos = coordinate.y * MS_GRID_WIDTH + coordinate.x;
    const cell = msLayerCells(token.session, sourceZ)?.[sourcePos];
    if (
      !cell
      || !isMsClonerSpecialFloor(cell.bottom.id)
      || ![cell.bottom, cell.top].some((element) => msTileSemanticType(element.id) === seed.semanticType)
      || !block.hidden
        && block.pos === sourcePos
        && (block.z ?? 1) === sourceZ
    ) {
      return;
    }
    splitRuntimeKeys.add(seed.runtimeKey);
  });
  return splitRuntimeKeys;
}

function withoutRuntimeActorBindings(
  bindings: RuntimeActorBindings,
  runtimeKeys: ReadonlySet<string>,
): RuntimeActorBindings {
  return {
    player: bindings.player,
    actors: new Map([...bindings.actors].filter(([runtimeKey]) => !runtimeKeys.has(runtimeKey))),
  };
}

function movementDelta(direction: number): number | null {
  switch (direction) {
    case 1: return -MS_GRID_WIDTH;
    case 2: return -1;
    case 4: return MS_GRID_WIDTH;
    case 8: return 1;
    default: return null;
  }
}

function sourceForNewBlock(
  previousChip: { readonly pos: number; readonly z: number },
  nextSession: MsInteractiveSessionState,
  block: MsTrackedBlock,
  candidates: readonly MsDormantBlockSource[],
  alreadyAssigned: ReadonlySet<string>,
): MsDormantBlockSource | null {
  const semanticType = msActorSemanticType(block.id ?? MS_TILE.Block);
  const available = candidates.filter((candidate) => (
    candidate.semanticType === semanticType
    && !alreadyAssigned.has(`${candidate.z}:${candidate.pos}`)
  ));
  const unique = (matches: readonly MsDormantBlockSource[]): MsDormantBlockSource | null => (
    matches.length === 1 ? matches[0]! : null
  );
  const sourceChanged = (candidate: MsDormantBlockSource): boolean => {
    const raw = msLayerCells(nextSession, candidate.z)?.[candidate.pos]?.top.id;
    return raw === undefined || !isMsStaticBlockTile(raw) || msTileSemanticType(raw) !== semanticType;
  };

  // Failed pushes still materialize a tracked block at its exact source.
  const stationary = unique(available.filter((candidate) => (
    candidate.z === (block.z ?? 1) && candidate.pos === block.pos
  )));
  if (stationary) return stationary;

  const delta = movementDelta(block.dir);
  if (delta !== null) {
    // The applied Chip input is known only after the engine advances, but the
    // Chip coordinate and dormant map actor are captured from the pre-tick
    // session. This remains exact even when the first push teleports the block.
    const { baseCode } = decodeRuntimeInputCode(nextSession.lastInput.inputCode);
    const chipPushed = unique(available.filter((candidate) => (
      candidate.z === previousChip.z
      && candidate.pos === previousChip.pos + delta
      && baseCode === block.dir
      && sourceChanged(candidate)
    )));
    if (chipPushed) return chipPushed;

    const direct = unique(available.filter((candidate) => (
      candidate.z === (block.z ?? 1)
      && candidate.pos + delta === block.pos
      && sourceChanged(candidate)
    )));
    if (direct) return direct;
  }

  // Destructive landings and non-Chip pushes can erase the source. Bind only
  // when the pre-tick facts leave one unambiguous changed source of this type.
  return unique(available.filter(sourceChanged));
}

async function startMsToken(
  source: TworldSolverManualStartSource,
  mode: "manual" | "replay",
  sha256: Sha256Port,
  expectedProvenance: SolverRuntimeProvenance,
  replaySource?: TworldSolverReplayStartSource,
): Promise<MsSolverToken> {
  const operation = mode === "manual" ? "startManual" : "startReplay";
  await assertTworldRuntimeSource(source, "ms", sha256, operation, expectedProvenance);
  if (source.manualOptions.stepping !== null && source.manualOptions.stepping !== 0 && source.manualOptions.stepping !== 4) {
    throw new SolverRuntimeError(
      "runtime.unsupported-option",
      operation,
      "MS stepping must be 0 or 4",
    );
  }
  // Own a detached source snapshot. Mutating a start DTO after this call must
  // not be able to change later observations or restored branches.
  const detachedSource = structuredClone(source);
  const level = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel(detachedSource.loaded);
  const replay = replaySource?.replay;
  const session = mode === "replay"
    ? createMsReplaySession(detachedSource.loaded.request, level, replay!)
    : createMsInteractiveSession(detachedSource.loaded.request, level, {
        stepping: detachedSource.manualOptions.stepping ?? 0,
      });
  const internal = session.state.internal;
  const playerSeed: RuntimeActorSeed = {
    runtimeKey: "ms-player",
    semanticType: "cc1:chip",
    coordinate: solverCoordinate(internal.chipPos, internal.chipZ, MS_GRID_WIDTH),
    facing: solverDirection(internal.chipDir),
  };
  const actorSeeds = [
    ...internal.creatures.map(creatureSeed),
    ...internal.blocks.map((block, index) => blockSeed(block, index)),
  ];
  return {
    mode,
    source: detachedSource,
    session,
    lastPolledInputCode: null,
    blockInitialCoordinates: new Map(),
    bindings: await buildRuntimeActorBindings(detachedSource, "ms", playerSeed, actorSeeds, sha256, operation),
  };
}

async function refreshMsBindings(
  token: Pick<MsSolverToken, "source" | "session" | "bindings" | "blockInitialCoordinates">,
  sha256: Sha256Port,
): Promise<RuntimeActorBindings> {
  const internal = token.session.state.internal;
  return buildRuntimeActorBindings(
    token.source,
    "ms",
    {
      runtimeKey: "ms-player",
      semanticType: "cc1:chip",
      coordinate: solverCoordinate(internal.chipPos, internal.chipZ, MS_GRID_WIDTH),
      facing: solverDirection(internal.chipDir),
    },
    [
      ...internal.creatures.map(creatureSeed),
      ...internal.blocks.map((block, index) => blockSeed(
        block,
        index,
        token.blockInitialCoordinates.get(`ms-block-slot:${index}`),
      )),
    ],
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

function actorObservation(
  seed: RuntimeActorSeed,
  binding: RuntimeActorBinding,
  observationOrder: number,
  nativePosition: SolverActorObservation["nativePosition"],
  lifecycle: SolverActorObservation["lifecycle"],
  movement: SolverActorObservation["movement"],
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
    lifecycle,
    movement,
  };
}

function projectMsActors(token: MsSolverToken): SolverActorObservation[] {
  const observations: SolverActorObservation[] = [];
  token.session.state.internal.creatures.forEach((creature, index) => {
    const seed = creatureSeed(creature);
    const binding = token.bindings.actors.get(seed.runtimeKey)!;
    observations.push(actorObservation(
      seed,
      binding,
      index,
      { collectionId: "ms:creatures", index },
      msSolverCreatureLifecycle(token.session, creature),
      creature.floorMovement === "teleport"
        ? "teleporting"
        : creature.floorMovement === "ice"
          ? "sliding"
          : creature.floorMovement !== "none"
            ? "forced"
            : creature.moving > 0
              ? "moving"
              : isMsSolverActorTrapped(token.session, {
                  pos: creature.pos,
                  z: creature.z,
                  moving: false,
                  released: creature.released,
                })
                ? "trapped"
                : "stationary",
    ));
  });
  const offset = observations.length;
  token.session.state.internal.blocks.forEach((block, index) => {
    const seed = blockSeed(
      block,
      index,
      token.blockInitialCoordinates.get(`ms-block-slot:${index}`),
    );
    const binding = token.bindings.actors.get(seed.runtimeKey)!;
    observations.push(actorObservation(
      seed,
      binding,
      offset + index,
      { collectionId: "ms:blocks", index },
      msSolverBlockLifecycle(token.session, block),
      block.floorMovement === "teleport"
        ? "teleporting"
        : block.floorMovement === "ice"
          ? "sliding"
          : block.floorMovement !== "none"
            ? "forced"
            : isMsSolverActorTrapped(token.session, {
                pos: block.pos,
                z: block.z,
                moving: false,
                released: block.released,
              })
              ? "trapped"
              : "stationary",
    ));
  });
  const representedActorIds = new Set<ActorIdV1>([
    token.bindings.player.actorId,
    ...observations.map((actor) => actor.actorId),
  ]);
  const placementsById = new Map(
    token.source.levelFacts.facts.payload.placements
      .map((placement) => [placement.placementId, placement] as const),
  );
  for (const fact of token.source.levelFacts.facts.payload.actors) {
    if (representedActorIds.has(fact.actorId)) continue;
    const placement = placementsById.get(fact.descriptor.placementId);
    if (!placement) continue;
    const coordinate = placement.descriptor.coordinate;
    const cell = cellAtCoordinate(token, coordinate.x, coordinate.y, coordinate.z);
    if (!cell || ![cell.bottom, cell.top].some((element) => (
      msTileSemanticType(element.id) === fact.semanticType
    ))) {
      continue;
    }
    observations.push({
      observationOrder: observations.length,
      nativePosition: null,
      actorId: fact.actorId,
      identityProvenance: "initial-placement",
      sourcePlacementId: fact.descriptor.placementId,
      semanticType: fact.semanticType,
      coordinate,
      facing: fact.facing,
      lifecycle: fact.disposition,
      movement: "stationary",
    });
    representedActorIds.add(fact.actorId);
  }
  return observations;
}

function projectMsPlayer(token: MsSolverToken, terminal: SolverTerminalResult): SolverPlayerObservation {
  const internal = token.session.state.internal;
  const moving = internal.chipWait > 0 || internal.floorMovement !== "none";
  const trapped = isMsSolverActorTrapped(token.session, {
    pos: internal.chipPos,
    z: internal.chipZ,
    moving,
    released: internal.chipReleased,
  });
  const movement: SolverPlayerObservation["movement"] = internal.floorMovement === "teleport"
    ? "teleporting"
    : internal.floorMovement === "ice"
      ? "sliding"
      : internal.floorMovement !== "none"
        ? "forced"
        : moving
          ? "moving"
          : trapped
            ? "trapped"
            : "stationary";
  return {
    actorId: token.bindings.player.actorId,
    identityProvenance: token.bindings.player.identityProvenance,
    sourcePlacementId: token.bindings.player.sourcePlacementId,
    semanticType: "cc1:chip",
    coordinate: solverCoordinate(internal.chipPos, internal.chipZ, MS_GRID_WIDTH),
    facing: solverDirection(internal.chipDir),
    lifecycle: internal.chipStatus === "okay" ? "active" : "destroyed",
    movement,
    control: terminal.kind === "running" ? (moving || trapped ? "unavailable" : "available") : "terminal",
    inputInfluence: terminal.kind !== "running"
      ? "terminal"
      : token.mode === "replay"
        ? "replay-owned"
        : trapped
          ? "blocked"
        : moving
          ? "in-transit"
          : "eligible",
  };
}

function placementIdentityKey(identity: { kind: string; placementId?: string; actorId?: string; semanticId?: string }): string {
  return identity.placementId ?? identity.actorId ?? identity.semanticId ?? identity.kind;
}

function projectMsCells(
  token: MsSolverToken,
  player: SolverPlayerObservation,
  actors: readonly SolverActorObservation[],
): SolverObservedCell[] {
  const map = token.session.state.engine.map;
  const layers = (map.layers ?? [{ z: 1, cells: map.cells }]).slice().sort((left, right) => left.z - right.z);
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
      const coordinate = solverCoordinate(pos, layer.z, MS_GRID_WIDTH);
      const usedPlacements = new Set<PlacementIdV1>();
      const elements = [] as SolverObservedCell["elements"][number][];
      const rawElements = [cell.bottom, cell.top] as const;
      rawElements.forEach((element, planeIndex) => {
        if (isMsCreature(element.id) || isMsStaticBlockTile(element.id)) return;
        const other = rawElements[planeIndex === 0 ? 1 : 0];
        const semanticType = msTileSemanticType(element.id);
        const isEmpty = element.id === MS_TILE.Empty || element.id === MS_TILE.Nothing;
        const otherIsEmpty = other.id === MS_TILE.Empty || other.id === MS_TILE.Nothing;
        if (isEmpty && !otherIsEmpty) return;
        if (planeIndex === 1 && isEmpty && otherIsEmpty) return;
        const stratum = msTileStratum(element.id);
        const placement = placementForRuntimeElement(
          token.source,
          coordinate,
          semanticType,
          stratum,
          usedPlacements,
        );
        elements.push(observedRuntimeElement({
          identity: runtimeElementIdentity(placement, `runtime:cell:${z}:${pos}:${planeIndex}:${semanticType}`),
          stratum,
          semanticType,
          state: element.id === MS_TILE.Beartrap
            ? isMsSolverBeartrapOpen(token.session, pos, layer.z) ? "open" : "closed"
            : /^cc1:button-/u.test(semanticType)
              ? isMsSolverButtonPressed(token.session, pos, element.id, layer.z) ? "pressed" : "released"
              : msTileState(element.id, element.state),
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
        if (rank !== 0) return rank;
        const leftIdentity = placementIdentityKey(left.identity);
        const rightIdentity = placementIdentityKey(right.identity);
        return leftIdentity < rightIdentity ? -1 : leftIdentity > rightIdentity ? 1 : 0;
      });
      cells.push({
        cellOrdinal: z * MS_GRID_WIDTH * 32 + pos,
        coordinate,
        elementsOrder: "stratum-then-identity",
        elements,
      });
    }
  }
  return cells;
}

function semanticInventoryType(tileId: number): string {
  return msTileSemanticType(tileId);
}

function projectMsInventory(token: MsSolverToken): SolverInventoryEntry[] {
  const inventory = token.session.state.engine.inventory;
  const entries: SolverInventoryEntry[] = [];
  inventory.keys.forEach((count, index) => {
    if (count > 0) entries.push({ slotOrder: entries.length, resourceType: semanticInventoryType(MS_TILE.Key_Red + index), count });
  });
  inventory.boots.forEach((count, index) => {
    if (count > 0) entries.push({ slotOrder: entries.length, resourceType: semanticInventoryType(MS_TILE.Boots_Ice + index), count });
  });
  for (const tool of inventory.tools) {
    if (tool > 0) entries.push({ slotOrder: entries.length, resourceType: semanticInventoryType(tool), count: 1 });
  }
  return entries;
}

function projectMsRequirements(token: MsSolverToken): SolverRemainingRequirement[] {
  const count = token.session.state.engine.inventory.chipsNeeded;
  return count > 0 ? [{ resourceType: "cc1:icchip", count }] : [];
}

function cellAtCoordinate(token: MsSolverToken, x: number, y: number, z: number): EngineMapCell | null {
  const engineZ = z + 1;
  const map = token.session.state.engine.map;
  const cells = map.layers?.find((layer) => layer.z === engineZ)?.cells ?? (engineZ === 1 ? map.cells : null);
  return cells?.[y * MS_GRID_WIDTH + x] ?? null;
}

function projectMsDevices(
  token: MsSolverToken,
): SolverDeviceObservation[] {
  return token.source.levelFacts.facts.payload.placements.flatMap((placement) => {
    const semanticType = placement.descriptor.semanticType;
    if (!/(?:button-|beartrap|clonemachine|clone-machine|switchwall|switch-wall|togglewall|toggle-wall|teleport)/u.test(semanticType)) return [];
    const { x, y, z } = placement.descriptor.coordinate;
    const cell = cellAtCoordinate(token, x, y, z);
    const raw = cell && [cell.top, cell.bottom].find((element) => (
      runtimeElementMatchesPlacementType(msTileSemanticType(element.id), semanticType)
    ));
    let state = "observed";
    if (/button-brown/u.test(semanticType)) state = isMsSolverBrownButtonHeld(token.session, y * MS_GRID_WIDTH + x, z + 1) ? "pressed" : "released";
    else if (/button-/u.test(semanticType)) state = raw && isMsSolverButtonPressed(token.session, y * MS_GRID_WIDTH + x, raw.id, z + 1) ? "pressed" : "released";
    else if (/beartrap/u.test(semanticType)) state = isMsSolverBeartrapOpen(token.session, y * MS_GRID_WIDTH + x, z + 1) ? "open" : "closed";
    else if (/(?:clonemachine|clone-machine)/u.test(semanticType)) state = raw && (raw.state & MS_FLOOR_STATE.Cloning) !== 0 ? "active" : "idle";
    else if (/(?:switchwall|switch-wall|togglewall|toggle-wall)-open/u.test(raw ? msTileSemanticType(raw.id) : semanticType)) state = "open";
    else if (/(?:switchwall|switch-wall|togglewall|toggle-wall)-closed/u.test(raw ? msTileSemanticType(raw.id) : semanticType)) state = "closed";
    return [{
      placementId: placement.placementId,
      semanticType,
      state,
      attributesOrder: "name" as const,
      attributes: [],
    }];
  });
}

function projectMsTerminal(token: MsSolverToken): SolverTerminalResult {
  const state = token.session.state;
  const coordinate = solverCoordinate(state.internal.chipPos, state.internal.chipZ, MS_GRID_WIDTH);
  const tick = state.engine.timer.currentTime;
  if (state.engine.status === "playing") return { kind: "running" };
  if (state.engine.status === "completed" || state.internal.completed) {
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
  if (state.internal.replayDeadlineFailed) {
    return {
      kind: "lost",
      nativeTick: tick,
      coordinate,
      cause: "cc1:replay-deadline",
    };
  }
  if (state.internal.chipStatus === "outoftime") {
    return { kind: "timed-out", nativeTick: tick, coordinate };
  }
  return {
    kind: "lost",
    nativeTick: tick,
    coordinate,
    cause: `cc1:${state.internal.chipStatus}`,
  };
}

async function exactMsFingerprint(token: MsSolverToken, sha256: Sha256Port): Promise<string> {
  const bindings = (value: RuntimeActorBindings) => ({
    player: [
      value.player.actorId,
      value.player.identityProvenance,
      value.player.sourcePlacementId,
    ],
    actors: [...value.actors]
      .sort(([left], [right]) => compareText(left, right))
      .map(([runtimeKey, binding]) => [
        runtimeKey,
        binding.actorId,
        binding.identityProvenance,
        binding.sourcePlacementId,
      ]),
  });
  return hashText(JSON.stringify({
    exactStateVersion: 1,
    session: digestMsInteractiveSession(token.session),
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
    bindings: bindings(token.bindings),
    blockInitialCoordinates: [...token.blockInitialCoordinates]
      .sort(([left], [right]) => compareText(left, right))
      .map(([runtimeKey, coordinate]) => [
        runtimeKey,
        coordinate.x,
        coordinate.y,
        coordinate.z,
      ]),
  }), sha256);
}

async function projectMsObservation(token: MsSolverToken, sha256: Sha256Port): Promise<SolverObservation> {
  const state = token.session.state;
  const terminal = projectMsTerminal(token);
  const actors = projectMsActors(token);
  const player = projectMsPlayer(token, terminal);
  const timer = state.engine.timer;
  const rng = state.internal.randomState;
  return projectTworldSolverObservation({
    target: "ms",
    mode: token.mode,
    source: token.source,
    nativeTick: timer.currentTime,
    timing: {
      currentTime: timer.currentTime,
      timeOffset: timer.timeOffset,
      // Math.trunc(-1 / ticksPerSecond) produces -0 at the MS pre-tick.
      // Canonical preview DTOs forbid negative zero.
      secondsPlayed: Object.is(timer.secondsPlayed, -0) ? 0 : timer.secondsPlayed,
      timeLimit: timer.timeLimit,
      remainingNativeTicks: timer.timeLimit > 0 ? Math.max(0, timer.timeLimit - timer.currentTime) : null,
    },
    lastPolledInputCode: token.lastPolledInputCode,
    lastAppliedInputCode: timer.currentTime < 0 ? null : token.session.lastInput.inputCode,
    replayCursor: token.mode === "replay" ? state.engine.replay.cursor : null,
    replayMoveCount: token.mode === "replay" ? state.engine.replay.moveCount : null,
    replayBestTimeTicks: token.mode === "replay" ? state.engine.replay.bestTimeTicks : null,
    stepping: state.engine.replay.stepping,
    initialRandomSlideDirection: randomSlideDirection(state.engine.replay.initialRandomSlideDirection),
    nativeStateFingerprints: [{
      stateId: "cc1:main-rng",
      fingerprint: await hashText(`${rng.initial}:${rng.value}`, sha256),
    }],
    cells: projectMsCells(token, player, actors),
    player,
    actors,
    inventory: projectMsInventory(token),
    remainingRequirements: projectMsRequirements(token),
    devices: projectMsDevices(token),
    exactFingerprint: await exactMsFingerprint(token, sha256),
    terminal,
  }, sha256);
}

function createMsDriver(
  sha256: Sha256Port,
  expectedProvenance: SolverRuntimeProvenance,
): SolverRuntimeDriver<MsSolverToken, TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  return {
    startManual: (source) => startMsToken(source, "manual", sha256, expectedProvenance),
    startReplay: (source) => startMsToken(
      source.level,
      "replay",
      sha256,
      expectedProvenance,
      source,
    ),
    cloneToken(token) {
      const checkpoint = captureMsUndoCheckpoint(token.session, "ccsolver-p2a");
      return {
        mode: token.mode,
        source: token.source,
        bindings: cloneBindings(token.bindings),
        session: restoreMsUndoCheckpoint(checkpoint),
        lastPolledInputCode: token.lastPolledInputCode,
        blockInitialCoordinates: new Map(token.blockInitialCoordinates),
      };
    },
    async advanceTick(token, request) {
      const previousBlockCount = token.session.state.internal.blocks.length;
      const candidates = unboundStaticBlockSources(token);
      const previousChip = {
        pos: token.session.state.internal.chipPos,
        z: token.session.state.internal.chipZ ?? 1,
      };
      const session = advanceMsInteractiveSession(
        token.session,
        request.kind === "manual-poll" ? request.inputCode : 0,
      );
      const blockInitialCoordinates = new Map(token.blockInitialCoordinates);
      const assignedSources = new Set(
        [...blockInitialCoordinates.values()].map((coordinate) => (
          `${coordinate.z + 1}:${coordinate.y * MS_GRID_WIDTH + coordinate.x}`
        )),
      );
      session.state.internal.blocks.forEach((block, index) => {
        if (index < previousBlockCount || blockInitialCoordinates.has(`ms-block-slot:${index}`)) return;
        const source = sourceForNewBlock(previousChip, session, block, candidates, assignedSources);
        if (!source) return;
        blockInitialCoordinates.set(`ms-block-slot:${index}`, source.coordinate);
        assignedSources.add(`${source.z}:${source.pos}`);
      });
      const advanced = {
        ...token,
        session,
        blockInitialCoordinates,
        lastPolledInputCode: request.kind === "manual-poll" ? request.inputCode : null,
      };
      const refreshedBindings = await refreshMsBindings(advanced, sha256);
      const splitRuntimeKeys = splitPreservedClonerBlockRuntimeKeys({
        ...advanced,
        bindings: refreshedBindings,
      });
      const bindings = splitRuntimeKeys.size === 0
        ? refreshedBindings
        : await refreshMsBindings({
            ...advanced,
            bindings: withoutRuntimeActorBindings(refreshedBindings, splitRuntimeKeys),
          }, sha256);
      return {
        ...advanced,
        // Cloner activation can grow the runtime actor collections. Refresh
        // bindings before the next observation so new actors always have a
        // deterministic semantic identity.
        bindings,
      };
    },
    observe: (token) => projectMsObservation(token, sha256),
    semanticFingerprint: (observation) => (
      identifyTworldSolverObservationSemantic(observation, sha256)
    ),
    exactRestoreDigest: (token) => exactMsFingerprint(token, sha256),
  };
}

export function createTworldMsSolverRuntimeAdapter(
  options: CreateTworldMsSolverRuntimeAdapterOptions,
): SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  const provenance: SolverRuntimeProvenance = {
    adapterId: "tworld-ms-solver-runtime",
    adapterRevision: options.adapterRevision,
    engineId: "tworld-ms",
    engineRevision: options.engineRevision,
  };
  return createSolverRuntimeKernel({
    driver: createMsDriver(options.sha256, provenance),
    ownerId: "tworld-ms-solver-runtime",
    target: "ms",
    maximumLiveRuns: options.maximumLiveRuns ?? 64,
    maximumLiveCheckpoints: options.maximumLiveCheckpoints ?? 256,
  });
}
