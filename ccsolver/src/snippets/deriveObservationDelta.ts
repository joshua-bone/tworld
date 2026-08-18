import type {
  SolverInventoryEntry,
  SolverObservation,
  SolverRemainingRequirement,
} from "../domain/runtime/types.js";
import type { SolverObservedChangeV1 } from "./model.js";
import {
  canonicalCopy,
  canonicalEqual,
  compareCoordinate,
  compareText,
  coordinateKey,
} from "./support.js";

type ResourceValue = SolverInventoryEntry | SolverRemainingRequirement;

function aggregateResources(values: readonly ResourceValue[]): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value.resourceType, (result.get(value.resourceType) ?? 0) + value.count);
  }
  return result;
}

function resourceChanges(
  kind: "inventory-count" | "remaining-requirement-count",
  before: readonly ResourceValue[],
  after: readonly ResourceValue[],
): SolverObservedChangeV1[] {
  const beforeCounts = aggregateResources(before);
  const afterCounts = aggregateResources(after);
  return [...new Set([...beforeCounts.keys(), ...afterCounts.keys()])]
    .sort(compareText)
    .flatMap((resourceType) => {
      const beforeCount = beforeCounts.get(resourceType) ?? 0;
      const afterCount = afterCounts.get(resourceType) ?? 0;
      if (beforeCount === afterCount) return [];
      const change: SolverObservedChangeV1 = kind === "inventory-count"
        ? { kind, resourceType, before: beforeCount, after: afterCount }
        : { kind, resourceType, before: beforeCount, after: afterCount };
      return [change];
    });
}

function changedByIdentity<T>(
  before: readonly T[],
  after: readonly T[],
  identity: (value: T) => string,
): readonly { readonly id: string; readonly before: T | null; readonly after: T | null }[] {
  const beforeById = new Map(before.map((value) => [identity(value), value]));
  const afterById = new Map(after.map((value) => [identity(value), value]));
  return [...new Set([...beforeById.keys(), ...afterById.keys()])]
    .sort(compareText)
    .flatMap((id) => {
      const beforeValue = beforeById.get(id) ?? null;
      const afterValue = afterById.get(id) ?? null;
      return canonicalEqual(beforeValue, afterValue)
        ? []
        : [{ id, before: beforeValue, after: afterValue }];
    });
}

/**
 * Computes only co-observed boundary differences. A change is not evidence
 * that one element caused another change, nor that an engine event occurred.
 */
export function deriveObservationDelta(
  before: SolverObservation,
  after: SolverObservation,
): readonly SolverObservedChangeV1[] {
  const changes: SolverObservedChangeV1[] = [];

  if (!canonicalEqual(before.timing, after.timing)) {
    changes.push({
      kind: "timing-state",
      before: canonicalCopy(before.timing),
      after: canonicalCopy(after.timing),
    });
  }
  if (!canonicalEqual(before.input, after.input)) {
    changes.push({
      kind: "input-state",
      before: canonicalCopy(before.input),
      after: canonicalCopy(after.input),
    });
  }
  if (!canonicalEqual(before.randomness, after.randomness)) {
    changes.push({
      kind: "randomness-state",
      before: canonicalCopy(before.randomness),
      after: canonicalCopy(after.randomness),
    });
  }
  if (!canonicalEqual(before.player, after.player)) {
    changes.push({
      kind: "player-state",
      before: canonicalCopy(before.player),
      after: canonicalCopy(after.player),
    });
  }

  const inventoryChanges = resourceChanges(
    "inventory-count",
    before.inventory,
    after.inventory,
  );
  changes.push(...inventoryChanges);
  if (
    inventoryChanges.length === 0
    && !canonicalEqual(before.inventory, after.inventory)
  ) {
    changes.push({
      kind: "inventory-order",
      before: canonicalCopy(before.inventory),
      after: canonicalCopy(after.inventory),
    });
  }
  changes.push(...resourceChanges(
    "remaining-requirement-count",
    before.remainingRequirements,
    after.remainingRequirements,
  ));

  for (const change of changedByIdentity(before.actors, after.actors, ({ actorId }) => actorId)) {
    changes.push({
      kind: "actor-state",
      actorId: change.id as SolverObservation["actors"][number]["actorId"],
      before: canonicalCopy(change.before),
      after: canonicalCopy(change.after),
    });
  }
  const beforeActorOrder = before.actors.map(({ actorId }) => actorId);
  const afterActorOrder = after.actors.map(({ actorId }) => actorId);
  if (!canonicalEqual(beforeActorOrder, afterActorOrder)) {
    changes.push({
      kind: "actor-order",
      before: canonicalCopy(beforeActorOrder),
      after: canonicalCopy(afterActorOrder),
    });
  }

  for (const change of changedByIdentity(
    before.devices,
    after.devices,
    ({ placementId }) => placementId,
  )) {
    changes.push({
      kind: "device-state",
      placementId: change.id as SolverObservation["devices"][number]["placementId"],
      before: canonicalCopy(change.before),
      after: canonicalCopy(change.after),
    });
  }

  const beforeCells = new Map(before.cells.map((cell) => [coordinateKey(cell.coordinate), cell]));
  const afterCells = new Map(after.cells.map((cell) => [coordinateKey(cell.coordinate), cell]));
  const coordinates = [...before.cells, ...after.cells]
    .map(({ coordinate }) => coordinate)
    .filter((coordinate, index, all) => (
      all.findIndex((candidate) => coordinateKey(candidate) === coordinateKey(coordinate)) === index
    ))
    .sort(compareCoordinate);
  for (const coordinate of coordinates) {
    const beforeElements = beforeCells.get(coordinateKey(coordinate))?.elements ?? [];
    const afterElements = afterCells.get(coordinateKey(coordinate))?.elements ?? [];
    if (canonicalEqual(beforeElements, afterElements)) continue;
    changes.push({
      kind: "cell-elements",
      coordinate: canonicalCopy(coordinate),
      before: canonicalCopy(beforeElements),
      after: canonicalCopy(afterElements),
    });
  }

  if (!canonicalEqual(before.terminal, after.terminal)) {
    changes.push({
      kind: "terminal-state",
      before: canonicalCopy(before.terminal),
      after: canonicalCopy(after.terminal),
    });
  }

  return changes;
}
