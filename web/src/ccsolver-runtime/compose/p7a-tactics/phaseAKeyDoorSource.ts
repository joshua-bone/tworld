import { encodeArtifact, referenceCanonicalJson } from "@tworld/ccsolver/application";
import type {
  PlacementIdV1,
  RulesetTargetV1,
  SolverCoordinate,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  MS_DIRECTION,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import {
  P1B_PHASE_A_SYNTHETIC_SOURCES,
  type P1bSyntheticSourceV1,
} from "../p1b-curriculum/curriculumManifest";
import type {
  TworldSolverLoadedLevelSource,
  TworldSolverManualStartSource,
} from "../runtime/tworldSolverRuntimeSource";

export const PHASE_A_KEY_DOOR_SOURCE_ID = "source-phase-a-key-door" as const;
export const PHASE_A_RED_KEY_RESOURCE = "cc1:key-red" as const;

const EXPECTED_ROWS = ["P.k.D.E"] as const;
const START_COORDINATE = { x: 0, y: 0, z: 0 } as const;
const KEY_COORDINATE = { x: 2, y: 0, z: 0 } as const;
const DOOR_COORDINATE = { x: 4, y: 0, z: 0 } as const;
const AFTER_DOOR_COORDINATE = { x: 5, y: 0, z: 0 } as const;
const EXIT_COORDINATE = { x: 6, y: 0, z: 0 } as const;

export interface PhaseAKeyDoorBindingsV1 {
  readonly start: SolverCoordinate;
  readonly key: SolverCoordinate;
  readonly door: SolverCoordinate;
  readonly afterDoor: SolverCoordinate;
  readonly exit: SolverCoordinate;
  readonly keyPlacementId: PlacementIdV1;
  readonly doorPlacementId: PlacementIdV1;
  readonly resourceType: typeof PHASE_A_RED_KEY_RESOURCE;
}

export interface PhaseAKeyDoorRuntimeSourceV1 {
  readonly target: RulesetTargetV1;
  readonly definition: P1bSyntheticSourceV1;
  readonly datBytes: Uint8Array;
  readonly source: TworldSolverManualStartSource;
  readonly bindings: PhaseAKeyDoorBindingsV1;
}

export interface BuildPhaseAKeyDoorRuntimeSourceInputV1 {
  readonly target: RulesetTargetV1;
  /** A loaded standard DAT request supplies repository/engine request metadata only. */
  readonly template: TworldSolverLoadedLevelSource;
  readonly sha256: Sha256Port;
}

function phaseASourceDefinition(): P1bSyntheticSourceV1 {
  const source = P1B_PHASE_A_SYNTHETIC_SOURCES.find(({ sourceId }) => (
    sourceId === PHASE_A_KEY_DOOR_SOURCE_ID
  ));
  if (
    source === undefined
    || source.requiredCollectibles !== 0
    || source.rows.length !== EXPECTED_ROWS.length
    || source.rows.some((row, index) => row !== EXPECTED_ROWS[index])
  ) {
    throw new Error("the frozen Phase-A key-door source no longer matches P.k.D.E");
  }
  return source;
}

function uint16(value: number): readonly [number, number] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function fileCodeForTile(tileId: number): number {
  const registration = msRegisteredLevelDecodeEntries.find((entry) => entry.tileId === tileId);
  if (registration === undefined) throw new Error(`missing standard DAT registration for tile ${tileId}`);
  return registration.fileCode;
}

function encodedPlane(overrides: ReadonlyMap<number, number>): readonly number[] {
  const empty = fileCodeForTile(MS_TILE.Empty);
  const fileCodes = Array.from({ length: 1_024 }, (_, position) => (
    fileCodeForTile(overrides.get(position) ?? MS_TILE.Empty)
  ));
  const encoded: number[] = [];
  for (let start = 0; start < fileCodes.length;) {
    const code = fileCodes[start] ?? empty;
    let count = 1;
    while (count < 255 && fileCodes[start + count] === code) count += 1;
    if (count === 1) encoded.push(code);
    else encoded.push(0xff, count, code);
    start += count;
  }
  return encoded;
}

/** Exact single-level DAT bytes compiled from the frozen Phase-A `P.k.D.E` row. */
export function buildPhaseAKeyDoorDatBytes(): Uint8Array {
  phaseASourceDefinition();
  const upper = encodedPlane(new Map([
    [0, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
    [2, MS_TILE.Key_Red],
    [4, MS_TILE.Door_Red],
    [6, MS_TILE.Exit],
  ]));
  const lower = encodedPlane(new Map());
  const creaturePayload = [0, 0];
  const metadata = [10, creaturePayload.length, ...creaturePayload];
  return Uint8Array.from([
    ...uint16(1),
    ...uint16(0),
    ...uint16(0),
    0,
    0,
    ...uint16(upper.length),
    ...upper,
    ...uint16(lower.length),
    ...lower,
    ...uint16(metadata.length),
    ...metadata,
  ]);
}

function exactPlacement(
  placements: Awaited<ReturnType<typeof buildTworldMsLevelFacts>>["facts"]["payload"]["placements"],
  semanticType: string,
  coordinate: SolverCoordinate,
): PlacementIdV1 {
  const matches = placements.filter(({ descriptor }) => (
    descriptor.semanticType === semanticType
    && descriptor.coordinate.x === coordinate.x
    && descriptor.coordinate.y === coordinate.y
    && descriptor.coordinate.z === coordinate.z
  ));
  if (matches.length !== 1) {
    throw new Error(`Phase-A source expected one ${semanticType} placement at ${coordinate.x},${coordinate.y}`);
  }
  return matches[0]!.placementId;
}

/**
 * Builds one standard-only source for either real runtime adapter. The caller
 * owns loading the small template request and later owns the returned live run.
 */
export async function buildPhaseAKeyDoorRuntimeSource(
  input: BuildPhaseAKeyDoorRuntimeSourceInputV1,
): Promise<PhaseAKeyDoorRuntimeSourceV1> {
  const definition = phaseASourceDefinition();
  const datBytes = buildPhaseAKeyDoorDatBytes();
  const loaded: TworldSolverLoadedLevelSource = {
    ...input.template,
    levelData: datBytes,
    layerData: [datBytes],
  };
  const common = {
    occurrenceId: `tworld:synthetic:${PHASE_A_KEY_DOOR_SOURCE_ID}`,
    producerRevision: "ccsolver:p7a-phase-a-source-v1",
    repository: "tworld",
    repositoryRevision: "ccsolver:p7a-phase-a-source-v1",
    sourcePath: `synthetic:${PHASE_A_KEY_DOOR_SOURCE_ID}.dat`,
    adapterRevision: "ccsolver:p7a-phase-a-facts-v1",
    importProfileRevision: "ccsolver:p7a-phase-a-import-v1",
    analyzerRevision: "ccsolver:p7a-phase-a-analysis-v1",
    catalogRevision: "ccsolver:p7a-phase-a-catalog-v1",
    containerBytes: datBytes,
    loaded,
  } as const;
  const levelFacts = input.target === "ms"
    ? await buildTworldMsLevelFacts(common, input.sha256)
    : await buildTworldLynxLevelFacts(common, input.sha256);
  const source: TworldSolverManualStartSource = {
    loaded,
    levelFacts,
    levelFactsContent: await referenceCanonicalJson(encodeArtifact(levelFacts.facts), input.sha256),
    provenance: {
      adapterId: input.target === "ms" ? "tworld-ms-solver-runtime" : "tworld-lynx-solver-runtime",
      adapterRevision: "ccsolver:p7a-phase-a-runtime-v1",
      engineId: input.target === "ms" ? "tworld-ms" : "tworld-lynx",
      engineRevision: "ccsolver:p7a-phase-a-engine-v1",
    },
    manualOptions: { stepping: input.target === "ms" ? 0 : null },
  };
  return {
    target: input.target,
    definition,
    datBytes,
    source,
    bindings: {
      start: START_COORDINATE,
      key: KEY_COORDINATE,
      door: DOOR_COORDINATE,
      afterDoor: AFTER_DOOR_COORDINATE,
      exit: EXIT_COORDINATE,
      keyPlacementId: exactPlacement(
        levelFacts.facts.payload.placements,
        PHASE_A_RED_KEY_RESOURCE,
        KEY_COORDINATE,
      ),
      doorPlacementId: exactPlacement(
        levelFacts.facts.payload.placements,
        "cc1:door-red",
        DOOR_COORDINATE,
      ),
      resourceType: PHASE_A_RED_KEY_RESOURCE,
    },
  };
}
