import type {
  SolverCoordinate,
  SolverObservation,
  SolverRenderProjection,
  SolverRenderRegionRequest,
  SolverResolvedRenderRegion,
} from "@tworld/ccsolver/domain";
import { SolverRuntimeError } from "@tworld/ccsolver/ports";

function invalidRequest(message: string): never {
  throw new SolverRuntimeError(
    "runtime.invalid-request",
    "projectRender",
    message,
  );
}

function validateCoordinate(
  value: unknown,
  label: "minimum" | "maximum",
): asserts value is SolverCoordinate {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidRequest(`${label} must be a coordinate object`);
  }
  const coordinate = value as Record<string, unknown>;
  for (const axis of ["x", "y", "z"] as const) {
    const component = coordinate[axis];
    if (
      typeof component !== "number"
      || !Number.isSafeInteger(component)
      || component < 0
      || Object.is(component, -0)
    ) {
      invalidRequest(`${label}.${axis} must be a nonnegative safe integer`);
    }
  }
}

function resolveRegion(
  observation: SolverObservation,
  request: SolverRenderRegionRequest,
): SolverResolvedRenderRegion {
  if (typeof request !== "object" || request === null || Array.isArray(request)) {
    invalidRequest("the render request must be an object");
  }
  const kind = (request as { readonly kind?: unknown }).kind;
  if (kind === "full-map") {
    return {
      kind: "full-map",
      minimum: { x: 0, y: 0, z: 0 },
      maximum: {
        x: observation.geometry.width - 1,
        y: observation.geometry.height - 1,
        z: observation.geometry.depth - 1,
      },
    };
  }

  if (kind !== "box") {
    invalidRequest("the render request kind must be full-map or box");
  }
  const candidate = request as unknown as {
    readonly minimum?: unknown;
    readonly maximum?: unknown;
  };

  validateCoordinate(candidate.minimum, "minimum");
  validateCoordinate(candidate.maximum, "maximum");
  const minimum = candidate.minimum;
  const maximum = candidate.maximum;
  for (const axis of ["x", "y", "z"] as const) {
    if (minimum[axis] > maximum[axis]) {
      invalidRequest(`minimum.${axis} must not exceed maximum.${axis}`);
    }
  }
  if (
    maximum.x >= observation.geometry.width
    || maximum.y >= observation.geometry.height
    || maximum.z >= observation.geometry.depth
  ) {
    invalidRequest("the requested render box must be contained by the level geometry");
  }
  return {
    kind: "box",
    minimum: structuredClone(minimum),
    maximum: structuredClone(maximum),
  };
}

function contains(region: SolverResolvedRenderRegion, coordinate: SolverCoordinate): boolean {
  return coordinate.x >= region.minimum.x
    && coordinate.x <= region.maximum.x
    && coordinate.y >= region.minimum.y
    && coordinate.y <= region.maximum.y
    && coordinate.z >= region.minimum.z
    && coordinate.z <= region.maximum.z;
}

/**
 * Builds target-neutral semantic scene data directly from one detached
 * observation. It has no engine/session access and therefore cannot advance,
 * randomize, or otherwise perturb the runtime it describes.
 */
export function projectSemanticRenderRegion(
  observation: SolverObservation,
  request: SolverRenderRegionRequest,
): SolverRenderProjection {
  const region = resolveRegion(observation, request);
  return structuredClone({
    projectionVersion: 1,
    target: observation.target,
    mode: observation.mode,
    level: observation.level,
    levelFacts: observation.levelFacts,
    provenance: observation.provenance,
    boundary: observation.boundary,
    fingerprints: observation.fingerprints,
    region,
    cellsOrder: "z-y-x",
    cells: observation.cells
      .filter((cell) => contains(region, cell.coordinate))
      .map((cell) => ({
        cellOrdinal: cell.cellOrdinal,
        coordinate: cell.coordinate,
        itemsOrder: "stratum-then-identity" as const,
        items: cell.elements.map((element, projectionOrder) => ({
          identity: element.identity,
          semanticType: element.semanticType,
          stratum: element.stratum,
          facing: element.facing,
          state: element.state,
          projectionOrder,
          source: "observation-element" as const,
        })),
      })),
    terminal: observation.terminal,
  } satisfies SolverRenderProjection);
}
