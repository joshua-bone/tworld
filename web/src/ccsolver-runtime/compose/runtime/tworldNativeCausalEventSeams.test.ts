import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  advanceLynxInteractiveSession,
  createLynxReplaySession,
  type LynxNativeCausalEvent,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  advanceMsInteractiveSession,
  createMsReplaySession,
  type MsNativeCausalEvent,
} from "@ruleset-ms/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  digestLynxInteractiveSession,
  digestMsInteractiveSession,
} from "@undo-runtime/impl/sessionDigest";
import { describe, expect, it } from "vitest";
import { loadKeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import { buildKeyPyramidP5Replay } from "../p5-review/buildKeyPyramidP5Execution";
import { buildKeyPyramidP5Route } from "../p5-review/buildKeyPyramidP5Route";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function expectedEffectKinds(
  route: ReturnType<typeof buildKeyPyramidP5Route>,
): Array<MsNativeCausalEvent["kind"]> {
  return route.events.map((event) => {
    switch (event.kind) {
      case "collect-key":
      case "collect-chip":
        return "collect";
      case "open-door":
        return "open-door";
      case "open-socket":
        return "open-socket";
      case "reach-exit":
        return "complete-level";
    }
  });
}

function irreversibleKinds(
  events: ReadonlyArray<MsNativeCausalEvent | LynxNativeCausalEvent>,
): Array<MsNativeCausalEvent["kind"]> {
  return events
    .map(({ kind }) => kind)
    .filter((kind) => (
      kind !== "movement-started"
      && kind !== "movement-blocked"
      && kind !== "move-completed"
      && kind !== "teleport"
    ));
}

describe("target-native P2B causal event seams", () => {
  it("records deterministic authoritative MS effects without changing exact gameplay", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, "ms");
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const replay = buildKeyPyramidP5Replay(route);
    const level = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel(
      source.manualSource.loaded,
    );
    let unobserved = createMsReplaySession(source.manualSource.loaded.request, level, replay);
    let observedA = createMsReplaySession(source.manualSource.loaded.request, level, replay);
    let observedB = createMsReplaySession(source.manualSource.loaded.request, level, replay);
    const eventsA: MsNativeCausalEvent[] = [];
    const eventsB: MsNativeCausalEvent[] = [];
    const finalTick = route.tileSteps.at(-1)!.stepOrder * 4;

    for (let tick = 0; tick <= finalTick; tick += 1) {
      unobserved = advanceMsInteractiveSession(unobserved, 0);
      observedA = advanceMsInteractiveSession(observedA, 0, {
        causalEventSink: (event) => eventsA.push(event),
      });
      observedB = advanceMsInteractiveSession(observedB, 0, {
        causalEventSink: (event) => eventsB.push(event),
      });
    }

    expect(digestMsInteractiveSession(observedA)).toBe(digestMsInteractiveSession(unobserved));
    expect(digestMsInteractiveSession(observedB)).toBe(digestMsInteractiveSession(unobserved));
    expect(eventsB).toEqual(eventsA);
    expect(irreversibleKinds(eventsA)).toEqual(expectedEffectKinds(route));
    expect(eventsA.filter(({ kind, actorId }) => (
      kind === "move-completed" && actorId === MS_TILE.Chip
    ))).toHaveLength(162);
    expect(eventsA.every((event) => (
      Object.isFrozen(event)
      && event.actorId === MS_TILE.Chip
      && Number.isSafeInteger(event.nativeTick)
      && Number.isSafeInteger(event.withinTickOrder)
      && event.withinTickOrder >= 0
    ))).toBe(true);
  }, 30_000);

  it("records deterministic authoritative Lynx effects without changing exact gameplay", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, "lynx");
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const replay = buildKeyPyramidP5Replay(route);
    const level = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel(
      source.manualSource.loaded,
    );
    let unobserved = createLynxReplaySession(source.manualSource.loaded.request, level, replay);
    let observedA = createLynxReplaySession(source.manualSource.loaded.request, level, replay);
    let observedB = createLynxReplaySession(source.manualSource.loaded.request, level, replay);
    const eventsA: LynxNativeCausalEvent[] = [];
    const eventsB: LynxNativeCausalEvent[] = [];
    const finalTick = route.tileSteps.at(-1)!.stepOrder * 4 + 3;

    for (let tick = 0; tick <= finalTick; tick += 1) {
      unobserved = advanceLynxInteractiveSession(unobserved, 0);
      observedA = advanceLynxInteractiveSession(observedA, 0, {
        causalEventSink: (event) => eventsA.push(event),
      });
      observedB = advanceLynxInteractiveSession(observedB, 0, {
        causalEventSink: (event) => eventsB.push(event),
      });
    }

    expect(digestLynxInteractiveSession(observedA)).toBe(digestLynxInteractiveSession(unobserved));
    expect(digestLynxInteractiveSession(observedB)).toBe(digestLynxInteractiveSession(unobserved));
    expect(eventsB).toEqual(eventsA);
    expect(irreversibleKinds(eventsA)).toEqual(expectedEffectKinds(route));
    expect(eventsA.filter(({ kind, actorId }) => (
      kind === "move-completed" && actorId === MS_TILE.Chip
    ))).toHaveLength(162);
    expect(eventsA.every((event) => (
      Object.isFrozen(event)
      && event.actorId === MS_TILE.Chip
      && Number.isSafeInteger(event.nativeTick)
      && Number.isSafeInteger(event.withinTickOrder)
      && event.withinTickOrder >= 0
    ))).toBe(true);
  }, 30_000);
});
