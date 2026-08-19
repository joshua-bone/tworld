import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { SolverCausalEventV1 } from "@tworld/ccsolver/events";
import { SolverRuntimeError, type SolverRuntimePort } from "@tworld/ccsolver/ports";
import { describe, expect, it } from "vitest";
import { loadKeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import { buildKeyPyramidP5Replay } from "../p5-review/buildKeyPyramidP5Execution";
import { buildKeyPyramidP5Route } from "../p5-review/buildKeyPyramidP5Route";
import { createTworldLynxSolverRuntimeAdapter } from "./TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "./TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "./tworldSolverRuntimeSource";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const sha256 = new WebCryptoSha256();
const baselineInitialExact = {
  ms: "sha256:94c15622fb4bcf84109828466141d8a38dfc2e7dc3fba245bc2b1aa4b8725e5e",
  lynx: "sha256:1618c73b877b47295a44ef2ceb54b6f188f49cbfb2f99087b466385d89da5a5e",
} as const;

function runtimeFor(
  target: "ms" | "lynx",
  source: Awaited<ReturnType<typeof loadKeyPyramidRuntimeSource>>,
  maximumCausalEvents?: number,
): SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  const options = {
    sha256,
    adapterRevision: source.runtimeProvenance.adapterRevision,
    engineRevision: source.runtimeProvenance.engineRevision,
    maximumCausalEvents,
  };
  return target === "ms"
    ? createTworldMsSolverRuntimeAdapter(options)
    : createTworldLynxSolverRuntimeAdapter(options);
}

function withoutExactFingerprint<T extends {
  readonly fingerprints: { readonly exact: string };
}>(value: T) {
  return {
    ...value,
    fingerprints: { ...value.fingerprints, exact: "excluded" },
  };
}

function primaryRouteEvents(events: readonly SolverCausalEventV1[]) {
  return events.filter((event) => (
    event.kind === "resource-collected"
    || (event.kind === "map-mutated" && (
      event.detail.mutation === "cc1:door-opened"
      || event.detail.mutation === "cc1:socket-opened"
    ))
    || event.kind === "terminal-reached"
  ));
}

async function advanceReplay(
  runtime: SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource>,
  run: Awaited<ReturnType<typeof runtime.startReplay>>,
  target: "ms" | "lynx",
  firstTick: number,
  finalTick: number,
): Promise<void> {
  for (let tick = firstTick; tick <= finalTick; tick += 1) {
    await runtime.advanceTick(run, {
      kind: "replay-tick",
      causalContext: {
        commandId: `command:${target}:${tick}`,
        planId: "plan:key-pyramid",
      },
    });
  }
}

describe.each(["ms", "lynx"] as const)("%s P2B causal journal", (target) => {
  it("preserves the immutable default exact baseline and makes disabled capture explicit", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, target);
    const runtime = runtimeFor(target, source);
    const replay = buildKeyPyramidP5Replay(buildKeyPyramidP5Route(source.levelFacts.facts.payload));
    const run = await runtime.startReplay({ level: source.manualSource, replay });

    expect((await runtime.observe(run)).fingerprints.exact).toBe(baselineInitialExact[target]);
    expect((await runtime.captureCheckpoint(run)).causalJournal).toBeNull();
    await expect(runtime.readEvents(run, { afterSequence: null, maximumEvents: 1 }))
      .rejects.toMatchObject({
        code: "runtime.unsupported-option",
        operation: "readEvents",
      } satisfies Partial<SolverRuntimeError>);
  });

  it("records, pages, reruns, checkpoints, and restores the complete Key Pyramid route", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, target);
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const replay = buildKeyPyramidP5Replay(route);
    const runtime = runtimeFor(target, source, 1_024);
    const replaySource = { level: source.manualSource, replay };
    const first = await runtime.startReplay(replaySource);
    const finalTick = route.tileSteps.at(-1)!.stepOrder * 4 + (target === "lynx" ? 3 : 0);
    const continuationStartTick = finalTick - 15;

    await advanceReplay(runtime, first, target, 0, continuationStartTick - 1);
    const continuationCheckpoint = await runtime.captureCheckpoint(first);
    await advanceReplay(runtime, first, target, continuationStartTick, finalTick);
    const restored = await runtime.restoreCheckpoint(continuationCheckpoint.handle);
    await advanceReplay(runtime, restored, target, continuationStartTick, finalTick);
    const page = await runtime.readEvents(first, { afterSequence: null, maximumEvents: 1_024 });
    const repeated = await runtime.readEvents(first, { afterSequence: null, maximumEvents: 1_024 });
    const restoredPage = await runtime.readEvents(restored, {
      afterSequence: null,
      maximumEvents: 1_024,
    });

    expect(page).toEqual(repeated);
    expect(restoredPage).toEqual(page);
    expect(page.retention).toEqual({ status: "complete" });
    expect(page.window.status).toBe("complete");
    expect(page.events).toHaveLength(page.window.availableThroughSequence! + 1);
    expect(page.events.filter(({ kind }) => kind === "command")).toHaveLength(162);
    expect(page.events.filter(({ kind, subject }) => (
      kind === "movement-completed" && subject?.semanticType === "cc1:chip"
    ))).toHaveLength(162);
    expect(primaryRouteEvents(page.events).map((event) => event.source?.placementId)).toEqual(
      route.events.map(({ placementId }) => placementId),
    );
    expect(primaryRouteEvents(page.events)).toHaveLength(29);
    expect(page.events.at(-1)).toMatchObject({
      kind: "terminal-reached",
      detail: { result: { kind: "won" } },
    });
    expect((await runtime.captureCheckpoint(first)).causalJournal).toEqual({
      nextSequence: page.events.length,
      retainedEventCount: page.events.length,
      retention: { status: "complete" },
    });

    const firstHalf = await runtime.readEvents(first, { afterSequence: null, maximumEvents: 512 });
    const secondHalf = await runtime.readEvents(first, {
      afterSequence: firstHalf.window.nextAfterSequence,
      maximumEvents: 512,
    });
    expect([...firstHalf.events, ...secondHalf.events]).toEqual(page.events);
  }, 180_000);

  it("keeps gameplay semantic parity while reporting bounded overflow", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, target);
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const replay = buildKeyPyramidP5Replay(route);
    const replaySource = { level: source.manualSource, replay };
    const normalRuntime = runtimeFor(target, source, 512);
    const overflowRuntime = runtimeFor(target, source, 2);
    const normal = await normalRuntime.startReplay(replaySource);
    const overflow = await overflowRuntime.startReplay(replaySource);

    for (let tick = 0; tick < 16; tick += 1) {
      await normalRuntime.advanceTick(normal, { kind: "replay-tick" });
      await overflowRuntime.advanceTick(overflow, { kind: "replay-tick" });
    }
    expect(withoutExactFingerprint(await overflowRuntime.observe(overflow)))
      .toEqual(withoutExactFingerprint(await normalRuntime.observe(normal)));
    const page = await overflowRuntime.readEvents(overflow, {
      afterSequence: null,
      maximumEvents: 2,
    });
    expect(page.events).toHaveLength(2);
    expect(page.retention).toMatchObject({
      status: "overflow",
      reason: "capacity-exhausted",
      firstOmittedSequence: 2,
    });
    expect((page.retention as { omittedEventCount: number }).omittedEventCount).toBeGreaterThan(0);
    const checkpoint = await overflowRuntime.captureCheckpoint(overflow);
    expect(checkpoint.causalJournal).toMatchObject({
      retainedEventCount: 2,
      retention: page.retention,
    });
  }, 60_000);
});
