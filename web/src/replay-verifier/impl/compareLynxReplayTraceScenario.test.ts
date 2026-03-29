import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NativeOracleGameEngineAdapter } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { collectTraceMismatches } from "@replay-verifier/impl/engine/comparators/traceComparison";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const runSuite = NativeOracleGameEngineAdapter.hasDefaultOracle() ? describe : describe.skip;

function lynxReplaySolutionPath(name: string): string {
  return resolve(repoRoot, "save", name.split(":")[0] ?? "");
}

async function loadLynxReplayScenario(name: string) {
  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const loadedSolution = await solutionRepository.loadSolutionFile(lynxReplaySolutionPath(name));
  return buildReplayTraceScenariosFromSolutionFile(loadedSolution, seriesCatalog).scenarios.find((entry) => entry.name === name);
}

async function expectReplayWindowToMatch(name: string, start: number, endExclusive: number) {
  const scenario = await loadLynxReplayScenario(name);

  expect(scenario).toBeDefined();

  const candidate = new LynxGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter();
  const [actual, expected] = await Promise.all([
    candidate.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
    oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
  ]);

  const actualSlice = {
    ...actual,
    steps: actual.steps.slice(start, endExclusive),
    result: expected.result,
  };
  const expectedSlice = {
    ...expected,
    steps: expected.steps.slice(start, endExclusive),
  };
  const mismatches: Array<{ path: string; expected: unknown; actual: unknown }> = [];
  collectTraceMismatches(actualSlice, expectedSlice, "$", mismatches, 25);

  expect(mismatches).toEqual([]);
}

async function expectReplayInitialStateToMatch(name: string) {
  const scenario = await loadLynxReplayScenario(name);

  expect(scenario).toBeDefined();

  const candidate = new LynxGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter();
  const [actual, expected] = await Promise.all([
    candidate.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
    oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks),
  ]);

  const mismatches: Array<{ path: string; expected: unknown; actual: unknown }> = [];
  collectTraceMismatches(
    {
      ...actual,
      steps: [],
      result: expected.result,
    },
    {
      ...expected,
      steps: [],
    },
    "$",
    mismatches,
    25,
  );

  expect(mismatches).toEqual([]);
}

runSuite("TS Lynx engine replay trace differential", () => {
  it("matches the fire-walking replay window from CCLP1:3", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:3", 116, 119);
  }, 30_000);

  it("matches the repeated CantMove suppression window from CCLP1:3", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:3", 269, 272);
  }, 30_000);

  it("matches the repeated held-open beartrap CantMove window from CCLP5:1", async () => {
    await expectReplayWindowToMatch("CCLP5-lynx.dac.tws:1", 797, 806);
  }, 30_000);

  it("matches the blocked-exit teleport window from CCLP5:68", async () => {
    await expectReplayWindowToMatch("CCLP5-lynx.dac.tws:68", 2471, 2474);
  }, 30_000);

  it("matches the claimed-teleport same-tick window from CCLP5:91", async () => {
    await expectReplayWindowToMatch("CCLP5-lynx.dac.tws:91", 1910, 1914);
  }, 30_000);

  it("matches the beartrap push-sound cleanup window from CCLP5:30", async () => {
    await expectReplayWindowToMatch("CCLP5-lynx.dac.tws:30", 2566, 2570);
  }, 30_000);

  it("matches the splash-animation replay window from CCLP1:4", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:4", 19, 34);
  }, 30_000);

  it("matches the forced-slide blue-wall push window from CCLP4:4", async () => {
    await expectReplayWindowToMatch("CCLP4-lynx.dac.tws:4", 10, 13);
  }, 30_000);

  it("matches the diagonal side-leg block push window from CCLP1:7", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:7", 16, 19);
  }, 30_000);

  it("matches the brown-button block-arrival window from CCLP1:7", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:7", 20, 25);
  }, 30_000);

  it("matches the held-open beartrap window from CCLP1:7", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:7", 40, 46);
  }, 30_000);

  it("matches the pushed-block-on-ice window from CCLP1:21", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:21", 0, 12);
  }, 30_000);

  it("matches the ice-boots movement window from CCLP1:21", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:21", 12, 16);
  }, 30_000);

  it("matches the ice-boots turn window from CCLP1:21", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:21", 20, 25);
  }, 30_000);

  it("matches the slide-token replay window from CCLP1:2", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:2", 28, 36);
  }, 30_000);

  it("matches the opening slide-token replay window from CCLP1:31", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:31", 0, 9);
  }, 30_000);

  it("matches the held-open beartrap replay-input window from CCLP1:27", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:27", 296, 302);
  }, 30_000);

  it("matches the random-slide popup-wall window from CCLP1:16", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:16", 53, 59);
  }, 30_000);

  it("matches the opening random-slide chain from CCLP1:145", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:145", 6, 9);
  }, 30_000);

  it("matches the pending-push follow-through window from CCLP1:113", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:113", 20, 24);
  }, 30_000);

  it("matches the forced teleport-exit push window from CCLP1:113", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:113", 23, 26);
  }, 30_000);

  it("matches the late teleport-reroute window from CCLP1:113", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:113", 110, 117);
  }, 30_000);

  it("matches the claimed-teleport chain window from CCLP3:146", async () => {
    await expectReplayWindowToMatch("CCLP3-lynx.dac.tws:146", 5586, 5591);
  }, 30_000);

  it("matches the occupied-teleport reroute window from CCLP3:122", async () => {
    await expectReplayWindowToMatch("CCLP3-lynx.dac.tws:122", 1371, 1377);
  }, 30_000);

  it("matches the held-open trap push timing window from CCLP5Voting-Razor-Lynx:8", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Razor-Lynx.tws:8", 1819, 1824);
  }, 30_000);

  it("matches the push-into-fire window from CCLP1:17", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:17", 77, 83);
  }, 30_000);

  it("matches the post-exit replay-input window from CCLP1:26", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:26", 565, 568);
  }, 30_000);

  it("matches the negative endgame timeOffset window from CCLP1:119", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:119", 3019, 3022);
  }, 30_000);

  it("matches the blocked-ice turnaround window from CCLP1:24", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:24", 240, 246);
  }, 30_000);

  it("matches the moving-block push gate window from CCLP1:42", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:42", 1484, 1488);
  }, 30_000);

  it("matches the same-tick green-button wall-toggle window from CCLP1:72", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:72", 155, 163);
  }, 30_000);

  it("matches the cloned-ball trap-button timing window from CCLP1:81", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:81", 1715, 1724);
  }, 30_000);

  it("matches the opening slide replay-input window from CCLXP2:75", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:75", 0, 2);
  }, 30_000);

  it("matches the opening ice replay-input window from CCLXP2:130", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:130", 0, 2);
  }, 30_000);

  it("matches the opening left-edge fallback window from CCLXP2:73", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:73", 0, 2);
  }, 30_000);

  it("matches the normalized special-tile initial state from CCLXP2:56", async () => {
    await expectReplayInitialStateToMatch("CCLXP2.dac.tws:56");
  }, 30_000);

  it("matches the early blue-key creature-arrival window from CCLXP2:21", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:21", 3, 5);
  }, 30_000);

  it("matches the diagonal blue-wall push rejection window from CCLXP2:15", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:15", 76, 79);
  }, 30_000);

  it("matches the random-slide force-direction window from CCLXP2:59", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:59", 113, 116);
  }, 30_000);

  it("matches the teleport-claim reroute window from CCLXP2:59", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:59", 132, 134);
  }, 30_000);

  it("matches the pre-movement diagonal choice window from CCLXP2:136", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:136", 447, 450);
  }, 30_000);

  it("matches the late slide push-sound drop window from CCLXP2:77", async () => {
    await expectReplayWindowToMatch("CCLXP2.dac.tws:77", 430, 447);
  }, 30_000);

  it("matches the held-open west-release window from CCLP1:81", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:81", 2173, 2180);
  }, 30_000);

  it("matches the blue-button moving-tank window from CCLP1:83", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:83", 330, 338);
  }, 30_000);

  it("matches the hidden-slot side-leg block push window from CCLP1:62", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:62", 2951, 2954);
  }, 30_000);

  it("matches the cloner fireball timing window from CCLP1:69", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:69", 98, 103);
  }, 30_000);

  it("matches the initial hint-button snapshot from CCLP1:70", async () => {
    await expectReplayInitialStateToMatch("CCLP1-lynx.dac.tws:70");
  }, 30_000);

  it("matches the early beartrap timing window from CCLP1:30", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:30", 4, 7);
  }, 30_000);

  it("matches the later trap-return replay window from CCLP1:30", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:30", 470, 475);
  }, 30_000);

  it("matches the opening corridor replay window from CCLP1:23", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:23", 0, 12);
  }, 30_000);

  it("matches the teleport continuation window from CCLP1:27", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:27", 7, 13);
  }, 30_000);

  it("matches the burglar boot-strip replay window from CCLP1:9", async () => {
    await expectReplayWindowToMatch("CCLP1-lynx.dac.tws:9", 66, 69);
  }, 30_000);

  it("matches the blocked ice-push window from CC1:63", async () => {
    await expectReplayWindowToMatch("CC1-lynx.dac.tws:63", 48, 53);
  }, 30_000);

  it("matches the blocked ice-push window from public_CHIPS:63", async () => {
    await expectReplayWindowToMatch("public_CHIPS-lynx.dac.tws:63", 48, 53);
  }, 30_000);

  it("matches the straight-input non-prequeued block window from CC1:45", async () => {
    await expectReplayWindowToMatch("CC1-lynx.dac.tws:45", 100, 103);
  }, 30_000);

  it("matches the key-block push window from CC1:99", async () => {
    await expectReplayWindowToMatch("CC1-lynx.dac.tws:99", 355, 359);
  }, 30_000);

  it("matches the held-open trap arrival window from CCLP5 Voting Acrylic:19", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Acrylic-Lynx.tws:19", 458, 461);
  }, 30_000);

  it("matches the claimed-teleport window from CCLP5 Voting Broadcast:31", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Broadcast-Lynx.tws:31", 508, 513);
  }, 30_000);

  it("matches the claimed-teleport window from CCLP5 Voting Chocolate:13", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Chocolate-Lynx.tws:13", 111, 116);
  }, 30_000);

  it("matches the claimed-exit teleport window from CCLP5 Voting Chocolate:37", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Chocolate-Lynx.tws:37", 615, 619);
  }, 30_000);

  it("matches the held-trap release CantMove window from CCLP5 Voting Qualification:48", async () => {
    await expectReplayWindowToMatch("CCLP5Voting-Qualification-Lynx.tws:48", 6615, 6618);
  }, 30_000);
});
