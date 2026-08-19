import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import type { SolverCausalEventPageV1, SolverCausalEventV1 } from "@tworld/ccsolver/events";
import type {
  SolverCheckpoint,
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import { loadKeyPyramidRuntimeSource, type KeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import {
  buildKeyPyramidP5Replay,
} from "../p5-review/buildKeyPyramidP5Execution";
import type {
  KeyPyramidP5RouteEventV1,
  KeyPyramidP5RouteV1,
} from "../p5-review/buildKeyPyramidP5Route";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "../runtime/tworldSolverRuntimeSource";

export const P6A_CAUSAL_EVENT_CAPACITY = 1_024 as const;
const PAGE_SIZE = 257;
const SHARED_PLAN_ID = "plan:key-pyramid:checked-shared-route" as const;

function progress(target: string, stage: string): void {
  if (process.env.TWORLD_P6A_PROGRESS === "1") {
    process.stderr.write(`[p6a:${target}] ${stage}\n`);
  }
}

type Runtime = SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource>;

export type KeyPyramidP6aTargetJournal = {
  readonly journalType: "p2b-key-pyramid-causal-journal";
  readonly journalVersion: 1;
  readonly caseId: "cclp1-001";
  readonly target: "ms" | "lynx";
  readonly mode: "replay";
  readonly capture: {
    readonly kind: "explicit-opt-in";
    readonly maximumEvents: typeof P6A_CAUSAL_EVENT_CAPACITY;
    readonly pageSize: typeof PAGE_SIZE;
    readonly pagesRead: number;
  };
  readonly integrity: {
    readonly kind: "complete";
    readonly retainedEventCount: number;
    readonly firstSequence: 0;
    readonly lastSequence: number;
    readonly overflow: null;
  };
  readonly proof: {
    readonly routeSource: "checked-p5-route-json";
    readonly replaySource: "fresh-replay-from-route-steps";
    readonly donorReplayRead: false;
    readonly routeCommandContext: "shared-plan-and-step-order";
    readonly observerParitySource: "checked-p5-final-boundary-observation";
    readonly checkpointAfterNativeTick: number;
  };
  readonly deterministicRerunEqual: true;
  readonly checkpointRestoreSuffixEqual: true;
  readonly observerGameplayParity: true;
  readonly terminal: Exclude<Awaited<ReturnType<Runtime["terminal"]>>, { readonly kind: "running" }>;
  readonly eventsOrder: "sequence";
  readonly events: readonly SolverCausalEventV1[];
};

export type KeyPyramidP6aTargetEvidence = {
  readonly page: SolverCausalEventPageV1;
  readonly journal: KeyPyramidP6aTargetJournal;
};

function createRuntime(
  source: KeyPyramidRuntimeSource,
  sha256: WebCryptoSha256,
): Runtime {
  const common = {
    sha256,
    adapterRevision: source.runtimeProvenance.adapterRevision,
    engineRevision: source.runtimeProvenance.engineRevision,
    maximumLiveRuns: 3,
    maximumLiveCheckpoints: 2,
    maximumCausalEvents: P6A_CAUSAL_EVENT_CAPACITY,
  };
  return source.target === "ms"
    ? createTworldMsSolverRuntimeAdapter(common)
    : createTworldLynxSolverRuntimeAdapter(common);
}

function commandId(stepOrder: number): string {
  return `command:key-pyramid:route-step:${String(stepOrder).padStart(3, "0")}`;
}

function requestForTick(route: KeyPyramidP5RouteV1, nativeTick: number) {
  const step = nativeTick % 4 === 0
    ? route.tileSteps[nativeTick / 4]
    : undefined;
  return step === undefined
    ? { kind: "replay-tick" as const }
    : {
        kind: "replay-tick" as const,
        causalContext: {
          commandId: commandId(step.stepOrder),
          planId: SHARED_PLAN_ID,
        },
      };
}

async function advanceTicks(
  runtime: Runtime,
  run: SolverRunHandle,
  route: KeyPyramidP5RouteV1,
  firstTick: number,
  lastTick: number,
): Promise<void> {
  for (let nativeTick = firstTick; nativeTick <= lastTick; nativeTick += 1) {
    await runtime.advanceTick(run, requestForTick(route, nativeTick));
  }
}

function finalExpectedTick(target: "ms" | "lynx", route: KeyPyramidP5RouteV1): number {
  const inputTick = route.tileSteps.at(-1)!.stepOrder * 4;
  return target === "ms" ? inputTick : inputTick + 3;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as CanonicalJsonValue)
    === canonicalizeJson(right as CanonicalJsonValue);
}

function assertCompletePage(page: SolverCausalEventPageV1, label: string): void {
  if (
    page.requested.afterSequence !== null
    || page.requested.maximumEvents !== P6A_CAUSAL_EVENT_CAPACITY
    || page.window.status !== "complete"
    || page.retention.status !== "complete"
    || page.events.length === 0
    || page.events[0]?.sequence !== 0
    || page.events.at(-1)?.sequence !== page.events.length - 1
  ) {
    throw new Error(`${label} did not return one complete nonoverflow causal journal`);
  }
}

async function readPaged(
  runtime: Runtime,
  run: SolverRunHandle,
): Promise<{ readonly events: readonly SolverCausalEventV1[]; readonly pagesRead: number }> {
  const events: SolverCausalEventV1[] = [];
  let afterSequence: number | null = null;
  let pagesRead = 0;
  while (true) {
    const page = await runtime.readEvents(run, {
      afterSequence,
      maximumEvents: PAGE_SIZE,
    });
    pagesRead += 1;
    if (page.retention.status !== "complete") {
      throw new Error(`${page.target} causal journal overflowed its explicit capacity`);
    }
    events.push(...page.events);
    if (page.window.status === "complete") break;
    const next = page.window.nextAfterSequence;
    if (next === null || next === afterSequence) {
      throw new Error(`${page.target} causal journal pagination did not advance`);
    }
    afterSequence = next;
    if (pagesRead > 16) throw new Error("causal journal pagination exceeded its fixed page bound");
  }
  return { events, pagesRead };
}

async function readComplete(
  runtime: Runtime,
  run: SolverRunHandle,
  label: string,
): Promise<{ readonly page: SolverCausalEventPageV1; readonly pagesRead: number }> {
  const [page, paged] = await Promise.all([
    runtime.readEvents(run, {
      afterSequence: null,
      maximumEvents: P6A_CAUSAL_EVENT_CAPACITY,
    }),
    readPaged(runtime, run),
  ]);
  assertCompletePage(page, label);
  if (!sameCanonical(page.events, paged.events)) {
    throw new Error(`${label} paginated and one-page journal reads disagree`);
  }
  return { page, pagesRead: paged.pagesRead };
}

async function disposeProofAuthorities(
  runtime: Runtime,
  runs: readonly SolverRunHandle[],
  checkpoint: SolverCheckpoint | null,
): Promise<void> {
  for (const run of runs) {
    await runtime.disposeRun(run);
  }
  if (checkpoint !== null) await runtime.disposeCheckpoint(checkpoint.handle);
}

function assertWinningTerminal(
  terminal: Awaited<ReturnType<Runtime["terminal"]>>,
  source: KeyPyramidRuntimeSource,
  route: KeyPyramidP5RouteV1,
): asserts terminal is Exclude<typeof terminal, { readonly kind: "running" }> {
  const expected = route.finalState.coordinate;
  if (
    terminal.kind !== "won"
    || terminal.nativeTick !== finalExpectedTick(source.target, route)
    || terminal.coordinate?.x !== expected.x
    || terminal.coordinate.y !== expected.y
    || terminal.coordinate.z !== expected.z
  ) {
    throw new Error(`${source.target} fresh P6A replay did not win at the checked route boundary`);
  }
}

export async function buildKeyPyramidP6aTargetEvidence(input: {
  readonly repositoryRoot: string;
  readonly target: "ms" | "lynx";
  readonly route: KeyPyramidP5RouteV1;
  readonly observerDisabledBaseline: {
    readonly source: "checked-p5-final-boundary-observation";
    readonly semanticFingerprint: string;
    readonly terminal: Exclude<Awaited<ReturnType<Runtime["terminal"]>>, { readonly kind: "running" }>;
  };
  readonly sha256?: WebCryptoSha256;
}): Promise<KeyPyramidP6aTargetEvidence> {
  const sha256 = input.sha256 ?? new WebCryptoSha256();
  const source = await loadKeyPyramidRuntimeSource(input.repositoryRoot, input.target, sha256);
  progress(input.target, "runtime source loaded");
  const { route } = input;
  if (
    route.target !== input.target
    || route.level.normalizedGameplayDigest
      !== source.levelFacts.facts.payload.level.normalizedGameplayDigest
  ) {
    throw new Error(`${input.target} checked P5 route is not bound to its runtime source`);
  }
  const runtime = createRuntime(source, sha256);
  const replay = buildKeyPyramidP5Replay(route);
  const primary = await runtime.startReplay({ level: source.manualSource, replay });
  // This boundary is immediately before the socket/exit tail. It exercises
  // journal continuation through two irreversible map/terminal effects while
  // avoiding a redundant half-level replay in every checked build.
  const checkpointAfterNativeTick = 639;
  let checkpoint: SolverCheckpoint | null = null;
  let restored: SolverRunHandle | null = null;
  let fresh: SolverRunHandle | null = null;
  try {
    await advanceTicks(runtime, primary, route, 0, checkpointAfterNativeTick);
    progress(input.target, "primary reached terminal-tail checkpoint");
    checkpoint = await runtime.captureCheckpoint(primary);
    if (
      checkpoint.causalJournal === null
      || checkpoint.causalJournal.retention.status !== "complete"
    ) {
      throw new Error(`${input.target} P6A checkpoint lacks complete causal continuation state`);
    }
    restored = await runtime.restoreCheckpoint(checkpoint.handle);
    await Promise.all([
      advanceTicks(
        runtime,
        primary,
        route,
        checkpointAfterNativeTick + 1,
        finalExpectedTick(input.target, route),
      ),
      advanceTicks(
        runtime,
        restored,
        route,
        checkpointAfterNativeTick + 1,
        finalExpectedTick(input.target, route),
      ),
    ]);
    progress(input.target, "primary and restored terminal tails completed");
    const [
      primaryRead,
      primaryObservation,
      terminal,
      restoredPage,
      restoredTerminal,
    ] = await Promise.all([
      readComplete(runtime, primary, `${input.target} primary`),
      runtime.observe(primary),
      runtime.terminal(primary),
      runtime.readEvents(restored, {
        afterSequence: null,
        maximumEvents: P6A_CAUSAL_EVENT_CAPACITY,
      }),
      runtime.terminal(restored),
    ]);
    assertWinningTerminal(terminal, source, route);
    assertWinningTerminal(restoredTerminal, source, route);
    assertCompletePage(restoredPage, `${input.target} restored`);
    const suffixStart = checkpoint.causalJournal.nextSequence;
    const checkpointRestoreSuffixEqual = sameCanonical(
      primaryRead.page.events.slice(suffixStart),
      restoredPage.events.slice(suffixStart),
    );
    if (!checkpointRestoreSuffixEqual || !sameCanonical(terminal, restoredTerminal)) {
      throw new Error(`${input.target} checkpoint-restored causal suffix diverged`);
    }

    fresh = await runtime.startReplay({ level: source.manualSource, replay });
    await advanceTicks(runtime, fresh, route, 0, finalExpectedTick(input.target, route));
    const [freshPage, freshTerminal] = await Promise.all([
      runtime.readEvents(fresh, {
        afterSequence: null,
        maximumEvents: P6A_CAUSAL_EVENT_CAPACITY,
      }),
      runtime.terminal(fresh),
    ]);
    progress(input.target, "fresh rerun completed");
    assertCompletePage(freshPage, `${input.target} deterministic rerun`);
    assertWinningTerminal(freshTerminal, source, route);
    const deterministicRerunEqual = sameCanonical(primaryRead.page.events, freshPage.events);
    if (!deterministicRerunEqual || !sameCanonical(terminal, freshTerminal)) {
      throw new Error(`${input.target} fresh causal rerun was not deterministic`);
    }
    const observerGameplayParity = primaryObservation.fingerprints.semantic
        === input.observerDisabledBaseline.semanticFingerprint
      && sameCanonical(terminal, input.observerDisabledBaseline.terminal);
    if (!observerGameplayParity) {
      throw new Error(`${input.target} causal observer changed gameplay semantics or terminal state`);
    }

    return {
      page: primaryRead.page,
      journal: {
        journalType: "p2b-key-pyramid-causal-journal",
        journalVersion: 1,
        caseId: "cclp1-001",
        target: input.target,
        mode: "replay",
        capture: {
          kind: "explicit-opt-in",
          maximumEvents: P6A_CAUSAL_EVENT_CAPACITY,
          pageSize: PAGE_SIZE,
          pagesRead: primaryRead.pagesRead,
        },
        integrity: {
          kind: "complete",
          retainedEventCount: primaryRead.page.events.length,
          firstSequence: 0,
          lastSequence: primaryRead.page.events.length - 1,
          overflow: null,
        },
        proof: {
          routeSource: "checked-p5-route-json",
          replaySource: "fresh-replay-from-route-steps",
          donorReplayRead: false,
          routeCommandContext: "shared-plan-and-step-order",
          observerParitySource: input.observerDisabledBaseline.source,
          checkpointAfterNativeTick,
        },
        deterministicRerunEqual: true,
        checkpointRestoreSuffixEqual: true,
        observerGameplayParity: true,
        terminal,
        eventsOrder: "sequence",
        events: primaryRead.page.events,
      },
    };
  } finally {
    await disposeProofAuthorities(
      runtime,
      [primary, ...(restored === null ? [] : [restored]), ...(fresh === null ? [] : [fresh])],
      checkpoint,
    );
  }
}

export function primaryCausalEventForRouteEvent(
  events: readonly SolverCausalEventV1[],
  routeEvent: KeyPyramidP5RouteEventV1,
): SolverCausalEventV1 {
  const kind = routeEvent.kind === "collect-key" || routeEvent.kind === "collect-chip"
    ? "resource-collected"
    : routeEvent.kind === "reach-exit"
      ? "terminal-reached"
      : "map-mutated";
  const matches = events.filter((event) => (
    event.kind === kind && event.source?.placementId === routeEvent.placementId
  ));
  if (matches.length !== 1) {
    throw new Error(
      `expected one authoritative ${kind} event for route milestone ${routeEvent.eventOrder}, found ${matches.length}`,
    );
  }
  const event = matches[0]!;
  if (
    event.authority.basis !== "native-action-hook"
    || event.authority.evidence !== "authoritative"
    || event.planId !== SHARED_PLAN_ID
    || event.commandId !== commandId(routeEvent.afterStepOrder)
  ) {
    throw new Error(`route milestone ${routeEvent.eventOrder} lacks exact native route-step authority`);
  }
  return event;
}
