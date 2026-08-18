import {
  canonicalizeJson,
  type BlobReferenceV1,
  type RulesetTargetV1,
  type SolverActorObservation,
  type SolverCoordinate,
  type SolverDeviceObservation,
  type SolverInventoryEntry,
  type SolverObservation,
  type SolverObservedCell,
  type SolverObservedElement,
  type SolverPlayerObservation,
  type SolverRemainingRequirement,
  type SolverRenderProjection,
  type SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import type {
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";

export type P2aRuntimeEvidenceRole =
  | "runtime-characterization"
  | "donor-runtime-characterization";

export type P2aRuntimeReviewSource = {
  readonly repositoryRevision: string;
  readonly mapPath: string;
  readonly mapContent: BlobReferenceV1;
  readonly seriesFile: string;
  readonly seriesContent: BlobReferenceV1;
  readonly levelNumber: number;
  readonly randomSeed: number;
  readonly randomSeedSemantics:
    | "manual-source-fixed-characterization"
    | "manual-source-derived-from-donor-replay-uint31";
};

export type P2aDonorSource = {
  readonly repositoryPath: string;
  /** Exact whole TWS source blob. */
  readonly fileContent: {
    readonly digest: `sha256:${string}`;
    readonly byteLength: number;
  };
  /** Exact level-entry bytes from which the expanded replay was decoded. */
  readonly entryContent: {
    readonly digest: `sha256:${string}`;
    readonly byteLength: number;
  };
  readonly bestTimeNativeTicks: number;
  readonly replayRandomSeed: number;
  readonly replayRandomSeedSemantics: "exact-donor-replay-uint32";
};

export type P2aRuntimeChangeCategory =
  | "actor"
  | "cell"
  | "device"
  | "input"
  | "inventory"
  | "player"
  | "requirement"
  | "terminal"
  | "timing";

export type P2aResourceChange = {
  readonly resourceType: string;
  readonly before: number;
  readonly after: number;
};

export type P2aActorChange = {
  readonly actorId: string;
  readonly before: SolverActorObservation | null;
  readonly after: SolverActorObservation | null;
};

export type P2aDeviceChange = {
  readonly placementId: string;
  readonly before: SolverDeviceObservation | null;
  readonly after: SolverDeviceObservation | null;
};

export type P2aCellChange = {
  readonly coordinate: SolverCoordinate;
  readonly beforeElements: readonly SolverObservedElement[] | null;
  readonly afterElements: readonly SolverObservedElement[] | null;
};

export type P2aRuntimeSemanticDelta = {
  readonly fromReviewPointId: string;
  readonly nativeTickDelta: number;
  readonly changedCategories: readonly P2aRuntimeChangeCategory[];
  readonly timing: {
    readonly before: SolverObservation["timing"];
    readonly after: SolverObservation["timing"];
  } | null;
  readonly input: {
    readonly before: SolverObservation["input"];
    readonly after: SolverObservation["input"];
  } | null;
  readonly player: {
    readonly before: SolverPlayerObservation;
    readonly after: SolverPlayerObservation;
  } | null;
  readonly inventoryChanges: readonly P2aResourceChange[];
  readonly remainingRequirementChanges: readonly P2aResourceChange[];
  readonly actorChanges: readonly P2aActorChange[];
  readonly deviceChanges: readonly P2aDeviceChange[];
  readonly changedCells: readonly P2aCellChange[];
  readonly terminal: {
    readonly before: SolverTerminalResult;
    readonly after: SolverTerminalResult;
  } | null;
};

export type P2aRuntimeReviewTrigger =
  | {
      readonly kind: "manual-start";
    }
  | {
      readonly kind: "donor-replay-start";
    }
  | {
      readonly kind: "replay-tick";
      readonly advanceTicks: number;
      readonly observedChange: "first-resource-change";
    }
  | {
      readonly kind: "manual-poll";
      readonly inputCode: number;
      readonly observedPlayerOutcome: "stationary" | "relocated" | "unavailable";
      readonly interpretation: "blocked-movement-observation-not-button-evidence";
    }
  | {
      readonly kind: "manual-poll";
      readonly inputCode: number;
      readonly followupAdvanceTicks: number;
      readonly observedChange:
        | "first-no-input-semantic-change"
        | "second-east-poll-semantic-change";
    };

export type P2aRuntimeReviewPoint = {
  readonly reviewPointId: string;
  readonly evidenceRole: P2aRuntimeEvidenceRole;
  readonly trigger: P2aRuntimeReviewTrigger;
  readonly observation: SolverObservation;
  readonly render: SolverRenderProjection;
  readonly deltaFromPrevious: P2aRuntimeSemanticDelta | null;
};

type P2aKeyPyramidSearchBounds = {
  readonly resourceChangeMaximumAdvanceTicks: number;
  readonly resourceChangeObservedAfterAdvanceTicks: number;
};

type P2aIntro8SearchBounds = {
  readonly followupMaximumAdvanceTicks: number;
  readonly followupObservedAfterAdvanceTicks: number;
};

export type P2aRuntimeReviewPacket = {
  readonly previewType: "p2a-runtime-review";
  readonly previewVersion: 1;
  readonly caseId: "cclp1-001" | "intro-008";
  readonly displayName: "Key Pyramid" | "Intro 8";
  readonly target: RulesetTargetV1;
  readonly classification:
    | "contains-donor-runtime-characterization"
    | "runtime-characterization";
  readonly source: P2aRuntimeReviewSource;
  readonly donor: P2aDonorSource | null;
  readonly levelFacts: SolverObservation["levelFacts"];
  readonly searchBounds: P2aKeyPyramidSearchBounds | P2aIntro8SearchBounds;
  readonly reviewPoints: readonly P2aRuntimeReviewPoint[];
};

type Runtime<TManualSource, TReplaySource> = SolverRuntimePort<TManualSource, TReplaySource>;

function compareCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function assertPositiveBound(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function compareCoordinates(left: SolverCoordinate, right: SolverCoordinate): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function coordinateKey(coordinate: SolverCoordinate): string {
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
}

function aggregateResources(
  values: readonly (SolverInventoryEntry | SolverRemainingRequirement)[],
): ReadonlyMap<string, number> {
  const resources = new Map<string, number>();
  for (const value of values) {
    resources.set(value.resourceType, (resources.get(value.resourceType) ?? 0) + value.count);
  }
  return resources;
}

function resourceChanges(
  before: readonly (SolverInventoryEntry | SolverRemainingRequirement)[],
  after: readonly (SolverInventoryEntry | SolverRemainingRequirement)[],
): readonly P2aResourceChange[] {
  const beforeByType = aggregateResources(before);
  const afterByType = aggregateResources(after);
  return [...new Set([...beforeByType.keys(), ...afterByType.keys()])]
    .sort()
    .flatMap((resourceType) => {
      const beforeCount = beforeByType.get(resourceType) ?? 0;
      const afterCount = afterByType.get(resourceType) ?? 0;
      return beforeCount === afterCount
        ? []
        : [{ resourceType, before: beforeCount, after: afterCount }];
    });
}

function changesByIdentity<T>(
  before: readonly T[],
  after: readonly T[],
  identity: (value: T) => string,
): readonly { readonly identity: string; readonly before: T | null; readonly after: T | null }[] {
  const beforeByIdentity = new Map(before.map((value) => [identity(value), value]));
  const afterByIdentity = new Map(after.map((value) => [identity(value), value]));
  return [...new Set([...beforeByIdentity.keys(), ...afterByIdentity.keys()])]
    .sort()
    .flatMap((id) => {
      const beforeValue = beforeByIdentity.get(id) ?? null;
      const afterValue = afterByIdentity.get(id) ?? null;
      return compareCanonical(beforeValue, afterValue)
        ? []
        : [{ identity: id, before: beforeValue, after: afterValue }];
    });
}

function cellChanges(
  before: readonly SolverObservedCell[],
  after: readonly SolverObservedCell[],
): readonly P2aCellChange[] {
  const beforeByCoordinate = new Map(before.map((cell) => [coordinateKey(cell.coordinate), cell]));
  const afterByCoordinate = new Map(after.map((cell) => [coordinateKey(cell.coordinate), cell]));
  const coordinates = [...before, ...after]
    .map(({ coordinate }) => coordinate)
    .filter((coordinate, index, all) => (
      all.findIndex((candidate) => coordinateKey(candidate) === coordinateKey(coordinate)) === index
    ))
    .sort(compareCoordinates);

  return coordinates.flatMap((coordinate) => {
    const beforeCell = beforeByCoordinate.get(coordinateKey(coordinate));
    const afterCell = afterByCoordinate.get(coordinateKey(coordinate));
    const beforeElements = beforeCell?.elements ?? null;
    const afterElements = afterCell?.elements ?? null;
    return compareCanonical(beforeElements, afterElements)
      ? []
      : [{ coordinate, beforeElements, afterElements }];
  });
}

export function deriveRuntimeSemanticDelta(
  fromReviewPointId: string,
  before: SolverObservation,
  after: SolverObservation,
): P2aRuntimeSemanticDelta {
  const timing = compareCanonical(before.timing, after.timing)
    ? null
    : { before: before.timing, after: after.timing };
  const input = compareCanonical(before.input, after.input)
    ? null
    : { before: before.input, after: after.input };
  const player = compareCanonical(before.player, after.player)
    ? null
    : { before: before.player, after: after.player };
  const inventoryChanges = resourceChanges(before.inventory, after.inventory);
  const remainingRequirementChanges = resourceChanges(
    before.remainingRequirements,
    after.remainingRequirements,
  );
  const actorChanges = changesByIdentity(before.actors, after.actors, ({ actorId }) => actorId)
    .map((change) => ({
      actorId: change.identity,
      before: change.before,
      after: change.after,
    }));
  const deviceChanges = changesByIdentity(
    before.devices,
    after.devices,
    ({ placementId }) => placementId,
  ).map((change) => ({
    placementId: change.identity,
    before: change.before,
    after: change.after,
  }));
  const changedCells = cellChanges(before.cells, after.cells);
  const terminal = compareCanonical(before.terminal, after.terminal)
    ? null
    : { before: before.terminal, after: after.terminal };
  const changedCategories: P2aRuntimeChangeCategory[] = [];

  if (actorChanges.length > 0) changedCategories.push("actor");
  if (changedCells.length > 0) changedCategories.push("cell");
  if (deviceChanges.length > 0) changedCategories.push("device");
  if (input !== null) changedCategories.push("input");
  if (inventoryChanges.length > 0) changedCategories.push("inventory");
  if (player !== null) changedCategories.push("player");
  if (remainingRequirementChanges.length > 0) changedCategories.push("requirement");
  if (terminal !== null) changedCategories.push("terminal");
  if (timing !== null) changedCategories.push("timing");
  changedCategories.sort();

  return structuredClone({
    fromReviewPointId,
    nativeTickDelta: after.boundary.nativeTick - before.boundary.nativeTick,
    changedCategories,
    timing,
    input,
    player,
    inventoryChanges,
    remainingRequirementChanges,
    actorChanges,
    deviceChanges,
    changedCells,
    terminal,
  });
}

function assertPointCoherence(
  target: RulesetTargetV1,
  mode: "manual" | "replay",
  observation: SolverObservation,
  render: SolverRenderProjection,
): void {
  if (observation.target !== target || render.target !== target) {
    throw new Error(`runtime review target mismatch: expected ${target}`);
  }
  if (observation.mode !== mode || render.mode !== mode) {
    throw new Error(`runtime review mode mismatch: expected ${mode}`);
  }
  if (
    observation.boundary.nativeTick !== render.boundary.nativeTick
    || !compareCanonical(observation.level, render.level)
    || !compareCanonical(observation.levelFacts, render.levelFacts)
    || !compareCanonical(observation.fingerprints, render.fingerprints)
  ) {
    throw new Error("runtime observation and render projection do not describe the same state");
  }
}

async function captureObservedPoint<TManualSource, TReplaySource>(
  runtime: Runtime<TManualSource, TReplaySource>,
  run: SolverRunHandle,
  target: RulesetTargetV1,
  mode: "manual" | "replay",
  reviewPointId: string,
  evidenceRole: P2aRuntimeEvidenceRole,
  trigger: P2aRuntimeReviewTrigger,
  previous: P2aRuntimeReviewPoint | null,
  observation: SolverObservation,
): Promise<P2aRuntimeReviewPoint> {
  const render = await runtime.projectRender(run, { kind: "full-map" });
  assertPointCoherence(target, mode, observation, render);
  return structuredClone({
    reviewPointId,
    evidenceRole,
    trigger,
    observation,
    render,
    deltaFromPrevious: previous === null
      ? null
      : deriveRuntimeSemanticDelta(previous.reviewPointId, previous.observation, observation),
  });
}

async function capturePoint<TManualSource, TReplaySource>(
  runtime: Runtime<TManualSource, TReplaySource>,
  run: SolverRunHandle,
  target: RulesetTargetV1,
  mode: "manual" | "replay",
  reviewPointId: string,
  evidenceRole: P2aRuntimeEvidenceRole,
  trigger: P2aRuntimeReviewTrigger,
  previous: P2aRuntimeReviewPoint | null,
): Promise<P2aRuntimeReviewPoint> {
  return captureObservedPoint(
    runtime,
    run,
    target,
    mode,
    reviewPointId,
    evidenceRole,
    trigger,
    previous,
    await runtime.observe(run),
  );
}

function resourcesChanged(before: SolverObservation, after: SolverObservation): boolean {
  return !compareCanonical(before.inventory, after.inventory)
    || !compareCanonical(before.remainingRequirements, after.remainingRequirements);
}

function usefulSemanticChange(delta: P2aRuntimeSemanticDelta): boolean {
  return delta.changedCategories.some((category) => category !== "input" && category !== "timing");
}

export async function buildKeyPyramidRuntimeReviewPacket<TManualSource, TReplaySource>(input: {
  readonly target: RulesetTargetV1;
  readonly runtime: Runtime<TManualSource, TReplaySource>;
  readonly manualSource: TManualSource;
  readonly replaySource: TReplaySource;
  readonly source: P2aRuntimeReviewSource;
  readonly donor: P2aDonorSource;
  readonly maximumResourceSearchTicks: number;
}): Promise<P2aRuntimeReviewPacket> {
  assertPositiveBound(input.maximumResourceSearchTicks, "maximumResourceSearchTicks");

  const manualRun = await input.runtime.startManual(input.manualSource);
  let manualStart: P2aRuntimeReviewPoint;
  try {
    manualStart = await capturePoint(
      input.runtime,
      manualRun,
      input.target,
      "manual",
      "manual-start",
      "runtime-characterization",
      { kind: "manual-start" },
      null,
    );
  } finally {
    await input.runtime.disposeRun(manualRun);
  }

  const replayRun = await input.runtime.startReplay(input.replaySource);
  let replayStart: P2aRuntimeReviewPoint;
  let resourceChange: P2aRuntimeReviewPoint | null = null;
  let observedAfterAdvanceTicks = 0;
  try {
    replayStart = await capturePoint(
      input.runtime,
      replayRun,
      input.target,
      "replay",
      "donor-replay-start",
      "donor-runtime-characterization",
      { kind: "donor-replay-start" },
      null,
    );
    for (
      observedAfterAdvanceTicks = 1;
      observedAfterAdvanceTicks <= input.maximumResourceSearchTicks;
      observedAfterAdvanceTicks += 1
    ) {
      await input.runtime.advanceTick(replayRun, { kind: "replay-tick" });
      const observation = await input.runtime.observe(replayRun);
      if (!resourcesChanged(replayStart.observation, observation)) continue;
      resourceChange = await captureObservedPoint(
        input.runtime,
        replayRun,
        input.target,
        "replay",
        "first-donor-resource-change",
        "donor-runtime-characterization",
        {
          kind: "replay-tick",
          advanceTicks: observedAfterAdvanceTicks,
          observedChange: "first-resource-change",
        },
        replayStart,
        observation,
      );
      break;
    }
  } finally {
    await input.runtime.disposeRun(replayRun);
  }

  if (resourceChange === null) {
    throw new Error(
      `resource change was not observed within ${input.maximumResourceSearchTicks} replay ticks`,
    );
  }

  return structuredClone({
    previewType: "p2a-runtime-review",
    previewVersion: 1,
    caseId: "cclp1-001",
    displayName: "Key Pyramid",
    target: input.target,
    classification: "contains-donor-runtime-characterization",
    source: input.source,
    donor: input.donor,
    levelFacts: manualStart.observation.levelFacts,
    searchBounds: {
      resourceChangeMaximumAdvanceTicks: input.maximumResourceSearchTicks,
      resourceChangeObservedAfterAdvanceTicks: observedAfterAdvanceTicks,
    },
    reviewPoints: [manualStart, replayStart, resourceChange],
  });
}

function observedPlayerOutcome(
  before: SolverObservation,
  after: SolverObservation,
): "stationary" | "relocated" | "unavailable" {
  if (before.player.coordinate === null || after.player.coordinate === null) return "unavailable";
  return compareCanonical(before.player.coordinate, after.player.coordinate) ? "stationary" : "relocated";
}

export async function buildIntro8RuntimeReviewPacket<TManualSource, TReplaySource>(input: {
  readonly target: RulesetTargetV1;
  readonly runtime: Runtime<TManualSource, TReplaySource>;
  readonly manualSource: TManualSource;
  readonly source: P2aRuntimeReviewSource;
  readonly eastInputCode: number;
  readonly noInputCode: number;
  readonly maximumFollowupTicks: number;
}): Promise<P2aRuntimeReviewPacket> {
  assertPositiveBound(input.maximumFollowupTicks, "maximumFollowupTicks");
  const run = await input.runtime.startManual(input.manualSource);
  let manualStart: P2aRuntimeReviewPoint;
  let blockedEast: P2aRuntimeReviewPoint;
  let followup: P2aRuntimeReviewPoint | null = null;
  let observedAfterAdvanceTicks = 0;
  try {
    manualStart = await capturePoint(
      input.runtime,
      run,
      input.target,
      "manual",
      "manual-start",
      "runtime-characterization",
      { kind: "manual-start" },
      null,
    );
    await input.runtime.advanceTick(run, {
      kind: "manual-poll",
      inputCode: input.eastInputCode,
    });
    const eastObservation = await input.runtime.observe(run);
    const eastOutcome = observedPlayerOutcome(manualStart.observation, eastObservation);
    if (eastOutcome !== "stationary") {
      throw new Error(`Intro 8 east poll was not blocked: observed ${eastOutcome}`);
    }
    blockedEast = await captureObservedPoint(
      input.runtime,
      run,
      input.target,
      "manual",
      "blocked-east-poll",
      "runtime-characterization",
      {
        kind: "manual-poll",
        inputCode: input.eastInputCode,
        observedPlayerOutcome: eastOutcome,
        interpretation: "blocked-movement-observation-not-button-evidence",
      },
      manualStart,
      eastObservation,
    );

    for (
      observedAfterAdvanceTicks = 1;
      observedAfterAdvanceTicks <= input.maximumFollowupTicks;
      observedAfterAdvanceTicks += 1
    ) {
      const inputCode = observedAfterAdvanceTicks === input.maximumFollowupTicks
        ? input.eastInputCode
        : input.noInputCode;
      await input.runtime.advanceTick(run, { kind: "manual-poll", inputCode });
      const observation = await input.runtime.observe(run);
      const delta = deriveRuntimeSemanticDelta(
        blockedEast.reviewPointId,
        blockedEast.observation,
        observation,
      );
      if (!usefulSemanticChange(delta)) continue;
      const observedChange = inputCode === input.noInputCode
        ? "first-no-input-semantic-change"
        : "second-east-poll-semantic-change";
      followup = await captureObservedPoint(
        input.runtime,
        run,
        input.target,
        "manual",
        observedChange,
        "runtime-characterization",
        {
          kind: "manual-poll",
          inputCode,
          followupAdvanceTicks: observedAfterAdvanceTicks,
          observedChange,
        },
        blockedEast,
        observation,
      );
      break;
    }
  } finally {
    await input.runtime.disposeRun(run);
  }

  if (followup === null) {
    throw new Error(
      `semantic change was not observed within ${input.maximumFollowupTicks} followup ticks`,
    );
  }

  return structuredClone({
    previewType: "p2a-runtime-review",
    previewVersion: 1,
    caseId: "intro-008",
    displayName: "Intro 8",
    target: input.target,
    classification: "runtime-characterization",
    source: input.source,
    donor: null,
    levelFacts: manualStart.observation.levelFacts,
    searchBounds: {
      followupMaximumAdvanceTicks: input.maximumFollowupTicks,
      followupObservedAfterAdvanceTicks: observedAfterAdvanceTicks,
    },
    reviewPoints: [manualStart, blockedEast, followup],
  });
}

function markdownCoordinate(coordinate: SolverCoordinate | null): string {
  return coordinate === null ? "unavailable" : `(${coordinate.x}, ${coordinate.y}, ${coordinate.z})`;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function markdownOptionalNumber(value: number | null): string {
  return value === null ? "none" : String(value);
}

function terminalState(terminal: SolverTerminalResult): string {
  switch (terminal.kind) {
    case "running":
      return "running";
    case "won":
      return `won at native tick ${terminal.nativeTick}, ${markdownCoordinate(terminal.coordinate)}, exit ${terminal.exitPlacementId ?? "unavailable"}`;
    case "lost":
      return `lost at native tick ${terminal.nativeTick}, ${markdownCoordinate(terminal.coordinate)}, cause ${terminal.cause}`;
    case "timed-out":
      return `timed-out at native tick ${terminal.nativeTick}, ${markdownCoordinate(terminal.coordinate)}`;
  }
}

function resourceState(
  resources: readonly (SolverInventoryEntry | SolverRemainingRequirement)[],
): string {
  return [...aggregateResources(resources)]
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([resourceType, count]) => `\`${resourceType}\`: ${count}`)
    .join("; ") || "none";
}

function groupedState(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([value, count]) => `\`${value}\` × ${count}`)
    .join("; ") || "none";
}

function baselineState(observation: SolverObservation): readonly string[] {
  const { input } = observation;
  return [
    "- Baseline state (no preceding delta):",
    `  - Runtime: mode \`${observation.mode}\`; terminal \`${terminalState(observation.terminal)}\`; input last-polled=${markdownOptionalNumber(input.lastPolledInputCode)}, last-applied=${markdownOptionalNumber(input.lastAppliedInputCode)}, replay-cursor=${markdownOptionalNumber(input.replayCursor)}, replay-move-count=${markdownOptionalNumber(input.replayMoveCount)}, replay-best-time-ticks=${markdownOptionalNumber(input.replayBestTimeTicks)}.`,
    `  - Inventory: ${resourceState(observation.inventory)}.`,
    `  - Remaining requirements: ${resourceState(observation.remainingRequirements)}.`,
    `  - Actors (semanticType + lifecycle): ${groupedState(observation.actors.map((actor) => `${actor.semanticType} + ${actor.lifecycle}`))}.`,
    `  - Devices (semanticType + state): ${groupedState(observation.devices.map((device) => `${device.semanticType} + ${device.state}`))}.`,
  ];
}

function semanticElementState(elements: readonly SolverObservedElement[] | null): string {
  if (elements === null) return "absent cell";
  if (elements.length === 0) return "empty";
  const grouped = new Map<string, { readonly element: SolverObservedElement; count: number }>();
  for (const element of elements) {
    const key = [
      element.semanticType,
      element.stratum,
      element.state ?? "",
      element.facing ?? "",
    ].join("\u0000");
    const entry = grouped.get(key);
    if (entry === undefined) {
      grouped.set(key, { element, count: 1 });
    } else {
      entry.count += 1;
    }
  }
  return [...grouped]
    .sort(([left], [right]) => compareOrdinal(left, right))
    .map(([, { element, count }]) => (
      `\`${element.semanticType}\` (${element.stratum}; state=${element.state ?? "none"}; facing=${element.facing ?? "none"})${count === 1 ? "" : ` × ${count}`}`
    ))
    .join("; ");
}

function actorState(actor: SolverActorObservation | null): string {
  return actor === null
    ? "absent"
    : `${markdownCoordinate(actor.coordinate)} ${actor.facing ?? "no-facing"} ${actor.movement}`;
}

function playerState(player: SolverPlayerObservation): string {
  return `${markdownCoordinate(player.coordinate)} ${player.facing ?? "no-facing"} ${player.movement}`;
}

function markdownDelta(
  delta: P2aRuntimeSemanticDelta | null,
  observation: SolverObservation,
): readonly string[] {
  if (delta === null) return baselineState(observation);
  const lines = [
    `- Native tick delta: ${delta.nativeTickDelta}`,
    `- Changed categories: ${delta.changedCategories.join(", ") || "none"}`,
    `- Player: ${delta.player === null ? "unchanged" : `${playerState(delta.player.before)} → ${playerState(delta.player.after)}`}`,
    `- Inventory: ${delta.inventoryChanges.map((change) => `${change.resourceType} ${change.before} → ${change.after}`).join("; ") || "unchanged"}`,
    `- Remaining requirements: ${delta.remainingRequirementChanges.map((change) => `${change.resourceType} ${change.before} → ${change.after}`).join("; ") || "unchanged"}`,
    `- Actor changes: ${delta.actorChanges.length}${delta.actorChanges.length === 0 ? "" : ` — ${delta.actorChanges.map((change) => `${change.actorId}: ${actorState(change.before)} → ${actorState(change.after)}`).join("; ")}`}`,
    `- Device changes: ${delta.deviceChanges.length}${delta.deviceChanges.length === 0 ? "" : ` — ${delta.deviceChanges.map((change) => `${change.placementId}: ${change.before?.state ?? "absent"} → ${change.after?.state ?? "absent"}`).join("; ")}`}`,
    `- Changed cells: ${delta.changedCells.length}${delta.changedCells.length === 0 ? "" : ` — ${delta.changedCells.map(({ coordinate, beforeElements, afterElements }) => `${markdownCoordinate(coordinate)}: ${semanticElementState(beforeElements)} → ${semanticElementState(afterElements)}`).join("; ")}`}`,
  ];
  return lines;
}

export function renderP2aRuntimeReviewMarkdown(
  packets: readonly P2aRuntimeReviewPacket[],
): string {
  const targetOrder: Readonly<Record<RulesetTargetV1, number>> = { ms: 0, lynx: 1 };
  const ordered = [...packets].sort((left, right) => (
    targetOrder[left.target] - targetOrder[right.target]
  ));
  if (ordered.length === 0) return "# P2A runtime review\n";
  const { displayName, caseId } = ordered[0]!;
  const lines = [
    `# ${displayName} (${caseId}) runtime review`,
    "",
    "Derived, non-authoritative human review of the checked canonical JSON packets.",
    "",
  ];

  for (const packet of ordered) {
    lines.push(
      `## ${packet.target.toUpperCase()}`,
      "",
      `Canonical JSON: [\`./${packet.target}/runtime-review.json\`](./${packet.target}/runtime-review.json).`,
      "",
    );
    if (packet.donor !== null) {
      lines.push(
        `Donor replay evidence is explicitly **donor-runtime-characterization** from \`${packet.donor.repositoryPath}\` (${packet.donor.fileContent.digest}); it is not a target-neutral solution claim.`,
        "",
      );
    }
    lines.push(
      `Source: \`${packet.source.seriesFile}\` level ${packet.source.levelNumber}; manual seed ${packet.source.randomSeed} (\`${packet.source.randomSeedSemantics}\`).`,
      "",
      `Source provenance: repository revision \`${packet.source.repositoryRevision}\`; map \`${packet.source.mapPath}\` (${packet.source.mapContent.digest}, ${packet.source.mapContent.byteLength} bytes); series \`sets/${packet.source.seriesFile}\` (${packet.source.seriesContent.digest}, ${packet.source.seriesContent.byteLength} bytes).`,
      "",
    );
    if (
      packet.source.randomSeedSemantics
      === "manual-source-derived-from-donor-replay-uint31"
    ) {
      lines.push(
        "Seed provenance: this manual-source characterization is not replay-executed; its seed is derived from donor replay metadata, so it is not donor-independent.",
        "",
      );
    }
    if ("resourceChangeMaximumAdvanceTicks" in packet.searchBounds) {
      lines.push(
        `Bound: first resource change within ${packet.searchBounds.resourceChangeMaximumAdvanceTicks} replay ticks; observed after ${packet.searchBounds.resourceChangeObservedAfterAdvanceTicks}.`,
        "",
      );
    } else {
      lines.push(
        `Bound: followup semantic change within ${packet.searchBounds.followupMaximumAdvanceTicks} polls; observed after ${packet.searchBounds.followupObservedAfterAdvanceTicks}.`,
        "",
      );
    }
    if (packet.donor !== null) {
      lines.push(
        `Exact donor replay seed: ${packet.donor.replayRandomSeed} (\`${packet.donor.replayRandomSeedSemantics}\`).`,
        "",
      );
    }
    for (const point of packet.reviewPoints) {
      lines.push(
        `### ${point.reviewPointId}`,
        "",
        `Role: \`${point.evidenceRole}\`; native tick: ${point.observation.boundary.nativeTick}; player: ${markdownCoordinate(point.observation.player.coordinate)}.`,
        "",
        `Provenance: adapter \`${point.observation.provenance.adapterId}\` revision \`${point.observation.provenance.adapterRevision}\`; engine \`${point.observation.provenance.engineId}\` revision \`${point.observation.provenance.engineRevision}\`.`,
        "",
      );
      if (
        point.trigger.kind === "manual-poll"
        && "interpretation" in point.trigger
      ) {
        lines.push(
          `Interpretation: blocked movement observation; not button evidence (input code ${point.trigger.inputCode}).`,
          "",
        );
      } else if (
        point.trigger.kind === "manual-poll"
        && "observedChange" in point.trigger
      ) {
        lines.push(
          `Trigger: \`${point.trigger.observedChange}\`; input code ${point.trigger.inputCode} after ${point.trigger.followupAdvanceTicks} followup polls.`,
          "",
        );
      }
      lines.push(...markdownDelta(point.deltaFromPrevious, point.observation), "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
