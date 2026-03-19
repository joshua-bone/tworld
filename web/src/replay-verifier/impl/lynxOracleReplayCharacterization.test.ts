import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import { NativeOracleGameEngineAdapter } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { buildReplayTraceScenariosFromSolutionFile } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { MS_TILE } from "@ruleset-ms/api/tiles";

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

runSuite("native Lynx replay characterization", () => {
  it("keeps fire-walking active while Chip moves across fire with boots in CCLP1:3", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:3");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 116, 119);
    const fireWalkingStep = trace.steps[1];
    const fireWalkingPhase = fireWalkingStep?.phases.find((entry) => entry.phase === "final");
    const chip = fireWalkingPhase?.activeCreatures[0];

    expect(fireWalkingStep?.soundEffects).toBe(1 << 25);
    expect(fireWalkingStep?.view).toEqual({ x: 168, y: 114 });
    expect(fireWalkingStep?.inventory.boots).toEqual([0, 0, 1, 1]);
    expect(chip?.position.pos).toBe(501);
    expect(chip?.moving).toBe(6);
    expect(chip?.floor.id).toBe(15);
  }, 30_000);

  it("suppresses repeated CantMove while the same replay input stays blocked in CCLP1:3", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:3");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 269, 272);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 5);
    expect(trace.steps[1]?.soundEffects).toBe(0);
    expect(trace.steps[2]?.soundEffects).toBe(0);
  }, 30_000);

  it("replays CantMove on each blocked held-open beartrap release tick in CCLP5:1", async () => {
    const scenario = await loadLynxReplayScenario("CCLP5-lynx.dac.tws:1");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 797, 801);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 5, 1 << 5, 1 << 5, 1 << 5]);
    expect(trace.steps.map((step) => step?.chip?.position.pos)).toEqual([405, 405, 405, 405]);
    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([1, 1, 1, 1]);
  }, 30_000);

  it("keeps the pushed block on the nearer teleport while a pending wall toggle makes the exit legal in CCLP5:68", async () => {
    const scenario = await loadLynxReplayScenario("CCLP5-lynx.dac.tws:68");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 2471, 2472);
    const movementPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const teleportPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-teleport-resolution");
    const queuedBlock = movementPhase?.blocks.find((actor) => actor.position.pos === 956);
    const teleportedBlock = teleportPhase?.blocks.find((actor) => actor.position.pos === 758);

    expect(queuedBlock?.stateFlags).toContain("defer-push");
    expect(queuedBlock?.dir).toBe("south");
    expect(teleportedBlock?.position.pos).toBe(758);
    expect(teleportedBlock?.stateFlags).toEqual(expect.arrayContaining(["defer-push", "mutant"]));
    expect(teleportPhase?.map.cells[790]?.top.id).toBe(MS_TILE.SwitchWall_Closed);
  }, 30_000);

  it("keeps a pushed block flagged through the beartrap landing tick before clearing BlockMoving in CCLP5:30", async () => {
    const scenario = await loadLynxReplayScenario("CCLP5-lynx.dac.tws:30");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 2566, 2568);
    const landedBlock = trace.steps[0]?.phases.find((entry) => entry.phase === "final")?.blocks.find((actor) => actor.position.pos === 655);
    const clearedBlock = trace.steps[1]?.phases.find((entry) => entry.phase === "final")?.blocks.find((actor) => actor.position.pos === 655);

    expect(trace.steps[0]?.soundEffects).toBe((1 << 18) | (1 << 15) | (1 << 5));
    expect(landedBlock?.stateFlags).toContain("defer-push");
    expect(landedBlock?.moving).toBe(0);
    expect(trace.steps[1]?.soundEffects).toBe(0);
    expect(clearedBlock?.stateFlags).toEqual([]);
  }, 30_000);

  it("turns a splashed pushed block into animated dirt and blocks Chip on the next tick in CCLP1:4", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:4");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 19, 21);
    const splashStep = trace.steps[0];
    const blockedStep = trace.steps[1];
    const splashPhase = splashStep?.phases.find((entry) => entry.phase === "final");
    const blockedPhase = blockedStep?.phases.find((entry) => entry.phase === "final");
    const splashAnimation = splashPhase?.activeCreatures[1];
    const splashCell = splashPhase?.map.cells[742];
    const blockedCell = blockedPhase?.map.cells[742];

    expect(splashStep?.soundEffects).toBe(1 << 17);
    expect(splashCell?.top).toEqual({ id: 13, state: 0x20 });
    expect(splashAnimation?.id).toBe(124);
    expect(splashAnimation?.position.pos).toBe(742);
    expect(splashAnimation?.floor.id).toBe(13);
    expect(splashAnimation?.floor.state).toBe(0x20);

    expect(blockedStep?.soundEffects).toBe(1 << 5);
    expect(blockedCell?.top).toEqual({ id: 13, state: 0x20 });
    expect(blockedPhase?.activeCreatures[0]?.position.pos).toBe(743);
  }, 30_000);

  it("clears the splash animation in time for the next west move in CCLP1:4", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:4");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 29, 34);
    const restartStep = trace.steps[1];
    const arrivalStep = trace.steps[4];
    const restartPhase = restartStep?.phases.find((entry) => entry.phase === "final");
    const arrivalPhase = arrivalStep?.phases.find((entry) => entry.phase === "final");

    expect(restartStep?.mapHash).toBe("3c37414ab86c4481");
    expect(restartStep?.view).toEqual({ x: 54, y: 184 });
    expect(restartPhase?.activeCreatures[0]?.moving).toBe(6);
    expect(arrivalStep?.soundEffects).toBe(1 << 13);
    expect(arrivalPhase?.activeCreatures[0]?.position.pos).toBe(742);
  }, 30_000);

  it("wakes the blue-wall block during forced slide carry in CCLP4:4", async () => {
    const scenario = await loadLynxReplayScenario("CCLP4-lynx.dac.tws:4");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 10, 12);
    const pushPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const movingBlock = pushPhase?.blocks.find((block) => block.position.pos === 235);

    expect(trace.steps[0]?.soundEffects).toBe((1 << 21) | (1 << 18) | (1 << 5));
    expect(pushPhase?.activeCreatures[0]?.position.pos).toBe(237);
    expect(pushPhase?.map.cells[236]?.top.id).toBe(MS_TILE.Wall);
    expect(movingBlock?.moving).toBe(4);
    expect(trace.steps[1]?.soundEffects).toBe(1 << 18);
  }, 30_000);

  it("starts the diagonal side-leg block push while Chip keeps moving east in CCLP1:7", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:7");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 16, 17);
    const pushStep = trace.steps[0];
    const pushPhase = pushStep?.phases.find((entry) => entry.phase === "final");
    const movingBlock = pushPhase?.blocks[0];

    expect(pushStep?.soundEffects).toBe(1 << 18);
    expect(pushStep?.lastMoveCode).toBe(12);
    expect(pushStep?.chip?.position.pos).toBe(430);
    expect(movingBlock?.position.pos).toBe(494);
    expect(movingBlock?.moving).toBe(6);
  }, 30_000);

  it("plays ButtonPushed when the side-leg block settles on a brown button in CCLP1:7", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:7");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 23, 24);

    expect(trace.steps[0]?.soundEffects).toBe((1 << 12) | (1 << 18));
    expect(trace.steps[0]?.chip?.position.pos).toBe(432);
  }, 30_000);

  it("enters the held-open beartrap and is released south on the next tick in CCLP1:7", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:7");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 42, 44);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 15);
    expect(trace.steps[0]?.chip?.position.pos).toBe(559);
    expect(trace.steps[1]?.chip?.position.pos).toBe(591);
  }, 30_000);

  it("keeps the pushed block sliding on ice until it explodes on a bomb in CCLP1:21", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:21");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 2, 6);

    expect(trace.steps[0]?.mapHash).toBe("a727da978909d199");
    expect(trace.steps[3]?.soundEffects).toBe(1 << 16);
  }, 30_000);

  it("moves across ice at normal speed after collecting ice boots in CCLP1:21", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:21");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 12, 16);

    expect(trace.steps.map((step) => step?.view.y)).toEqual([126, 124, 122, 120]);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 23, 1 << 23, 1 << 23, 1 << 23]);
    expect(trace.steps[0]?.inventory.boots).toEqual([1, 0, 0, 0]);
  }, 30_000);

  it("lets the next west input override ice after collecting ice boots in CCLP1:21", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:21");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 20, 25);

    expect(trace.steps[3]?.view).toEqual({ x: 136, y: 120 });
    expect(trace.steps[4]?.lastMoveCode).toBe(2);
    expect(trace.steps[4]?.soundEffects).toBe(1 << 23);
    expect(trace.steps[4]?.view).toEqual({ x: 134, y: 120 });
  }, 30_000);

  it("lets the next south replay input take over from slide motion on the tokened turn in CCLP1:2", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:2");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 28, 36);

    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([8, 8, 8, 8, 4, 4, 4, 4]);
    expect(trace.steps.map((step) => step?.view)).toEqual([
      { x: 140, y: 64 },
      { x: 144, y: 64 },
      { x: 148, y: 64 },
      { x: 152, y: 64 },
      { x: 152, y: 66 },
      { x: 152, y: 68 },
      { x: 152, y: 70 },
      { x: 152, y: 72 },
    ]);
    expect(trace.steps[4]?.inputCode).toBe(4);
    expect(trace.steps[4]?.replayCursor).toBe(7);
    expect(trace.steps[5]?.chip?.position.pos).toBe(307);
  }, 30_000);

  it("updates lastMove on the first tokened turn while Chip keeps the replay path in CCLP1:31", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:31");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 9);

    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([2, 2, 2, 2, 4, 4, 4, 4, 2]);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 21, 1 << 21, 1 << 21, 1 << 21, 0, 0, 0, 1 << 6, 1 << 21]);
    expect(trace.steps[4]?.view).toEqual({ x: 112, y: 50 });
    expect(trace.steps[7]?.chipsNeeded).toBe(61);
    expect(trace.steps[8]?.replayCursor).toBe(3);
  }, 30_000);

  it("updates lastMove before a held-open beartrap release keeps Chip moving east in CCLP1:27", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:27");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 296, 302);

    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([8, 8, 8, 2, 2, 2]);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([154, 158, 160, 164, 166, 168]);
    expect(trace.steps[2]?.soundEffects).toBe(1 << 15);
    expect(trace.steps[5]?.inventory.boots).toEqual([0, 1, 1, 0]);
  }, 30_000);

  it("forces Chip west off the random slide and into the popup wall in CCLP1:16", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:16");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 53, 59);

    expect(trace.steps.map((step) => step?.view.x)).toEqual([128, 126, 124, 122, 120, 118]);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 21, 0, 0, 0, 1 << 14, 0]);
    expect(trace.steps[3]?.chip?.position.pos).toBe(79);
    expect(trace.steps[4]?.mapHash).toBe("be7ebc8503cd5b5e");
  }, 30_000);

  it("uses each random-slide direction exactly once across the opening chain in CCLP1:145", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:145");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 6, 7);
    const finalPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "final");
    const openingBall = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball && actor.position.pos === 760);
    const openingBlock = finalPhase?.blocks.find((actor) => actor.position.pos === 814);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 22);
    expect(openingBall?.dir).toBe("east");
    expect(openingBall?.moving).toBe(6);
    expect(openingBlock?.dir).toBe("north");
    expect(openingBlock?.moving).toBe(4);
  }, 30_000);

  it("keeps BlockMoving live while Chip follows the pending push in CCLP1:113", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:113");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 20, 24);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 18, 1 << 18, 1 << 18, (1 << 18) | (1 << 9)]);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([162, 164, 166, 168]);
    expect(trace.steps.map((step) => step?.chip?.position.pos)).toEqual([436, 437, 437, 437]);
    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([8, 8, 8, 8]);
  }, 30_000);

  it("forces the post-teleport exit push before Chip follows in CCLP1:113", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:113");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 23, 25);
    const postTeleportPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-teleport-resolution");
    const forcedExitPhase = trace.steps[1]?.phases.find((entry) => entry.phase === "post-creature-movement");

    expect((postTeleportPhase?.soundEffects ?? 0) & (1 << 9)).toBe(1 << 9);
    expect(forcedExitPhase?.blocks.some((actor) => actor.position.pos === 439 && actor.moving === 6)).toBe(true);
    expect(forcedExitPhase?.activeCreatures[0]?.position.pos).toBe(438);
  }, 30_000);

  it("reroutes the later north teleport around the blocked exit in CCLP1:113", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:113");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 110, 116);
    const reroutePhase = trace.steps[1]?.phases.find((entry) => entry.phase === "post-teleport-resolution");

    expect((reroutePhase?.soundEffects ?? 0) & (1 << 9)).toBe(1 << 9);
    expect(reroutePhase?.activeCreatures[0]?.position.pos).toBe(967);
    expect(trace.steps[5]?.chipsNeeded).toBe(17);
  }, 30_000);

  it("keeps a pushed block moving onto fire while Chip follows in CCLP1:17", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:17");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 77, 83);
    const finalPhases = trace.steps.map((step) => step?.phases.find((entry) => entry.phase === "final"));
    const pushingBlock = finalPhases[0]?.blocks[0];

    expect(trace.steps.map((step) => step?.view.x)).toEqual([34, 36, 38, 40, 42, 44]);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([
      1 << 18,
      1 << 18,
      1 << 18,
      1 << 18,
      (1 << 18) | (1 << 25),
      (1 << 18) | (1 << 25),
    ]);
    expect(pushingBlock?.position.pos).toBe(166);
    expect(pushingBlock?.floor.id).toBe(MS_TILE.Fire);
    expect(trace.steps[5]?.chip?.position.pos).toBe(166);
  }, 30_000);

  it("ignores the queued replay input after Chip reaches the exit in CCLP1:26", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:26");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 565, 568);

    expect(trace.steps.map((step) => step?.inputCode)).toEqual([2, 0, 0]);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 1, 0, 0]);
    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([2, 2, 2]);
    expect(trace.steps[1]?.timeOffset).toBe(0);
    expect(trace.steps[2]?.timeOffset).toBe(-1);
  }, 30_000);

  it("holds secondsPlayed steady on the first negative endgame timeOffset tick in CCLP1:119", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:119");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 3019, 3022);

    expect(trace.steps.map((step) => step?.timeOffset)).toEqual([0, -1, -2]);
    expect(trace.steps.map((step) => step?.secondsPlayed)).toEqual([150, 150, 150]);
  }, 30_000);

  it("turns Chip around on the blocked ice move and resumes east in CCLP1:24", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:24");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 240, 246);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([524320, 0, 0, 0, 4096, 524288]);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([56, 58, 60, 62, 64, 68]);
    expect(trace.steps[4]?.chip?.position.pos).toBe(520);
    expect(trace.steps[5]?.lastMoveCode).toBe(8);
    expect(trace.steps[5]?.chip?.position.pos).toBe(521);
  }, 30_000);

  it("blocks the first west push until the moving block settles in CCLP1:42", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:42");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 1484, 1488);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([4096, 32, 0, 262144]);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([128, 128, 128, 126]);
    expect(trace.steps[0]?.chip?.position.pos).toBe(80);
    expect(trace.steps[2]?.chip?.position.pos).toBe(80);
    expect(trace.steps[3]?.chip?.position.pos).toBe(80);
  }, 30_000);

  it("uses the same-tick green-button wall toggle before Chip collects the boots in CCLP1:72", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:72");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 155, 163);

    expect(trace.steps.map((step) => step?.view.x)).toEqual([110, 108, 106, 104, 102, 100, 98, 96]);
    expect(trace.steps[0]?.soundEffects).toBe(1 << 12);
    expect(trace.steps[0]?.chip?.position.pos).toBe(398);
    expect(trace.steps[7]?.soundEffects).toBe(1 << 7);
    expect(trace.steps[7]?.inventory.boots).toEqual([1, 0, 0, 0]);
  }, 30_000);

  it("releases the cloned ball early enough to reach the trap button on time in CCLP1:81", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:81");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 1715, 1724);
    const releasePhase = trace.steps[0]?.phases.find((entry) => entry.phase === "final");
    const releasedBall = releasePhase?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Ball && actor.position.pos === 780,
    );
    const trapButtonPhase = trace.steps[6]?.phases.find((entry) => entry.phase === "final");
    const trapButtonBall = trapButtonPhase?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Ball && actor.position.pos === 812,
    );

    expect(releasedBall?.moving).toBe(4);
    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([266240, 262144, 262144, 294912, 32, 0, 4096, 0, 0]);
    expect(trapButtonBall?.moving).toBe(0);
    expect(trace.steps[6]?.view).toEqual({ x: 120, y: 214 });
    expect(trace.steps[8]?.chip?.position.pos).toBe(847);
  }, 30_000);

  it("uses the queued west input when the held-open trap keeps releasing Chip in CCLP1:81", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:81");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 2173, 2180);

    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([104, 100, 98, 96, 94, 92, 90]);
    expect(trace.steps[1]?.soundEffects).toBe(0);
    expect(trace.steps[2]?.chip?.position.pos).toBe(684);
    expect(trace.steps[6]?.chip?.position.pos).toBe(683);
  }, 30_000);

  it("drops a queued tank reversal if the tank is still moving when the blue button pulse lands in CCLP1:83", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:83");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 330, 338);
    const corridorTank = trace.steps.map((step) =>
      step?.phases
        .find((entry) => entry.phase === "final")
        ?.activeCreatures.find(
          (actor) => actor.id === MS_TILE.Tank && actor.position.y === 4 && actor.position.x >= 24 && actor.position.x <= 26,
        ),
    );

    expect(trace.steps[1]?.soundEffects).toBe(1 << 12);
    expect(corridorTank.map((actor) => actor?.position.pos)).toEqual([152, 153, 153, 153, 153, 154, 154, 154]);
    expect(corridorTank.map((actor) => actor?.dir)).toEqual([
      "east",
      "east",
      "east",
      "east",
      "east",
      "east",
      "east",
      "east",
    ]);
    expect(corridorTank.map((actor) => actor?.moving)).toEqual([0, 6, 4, 2, 0, 6, 4, 2]);
  }, 30_000);

  it("keeps the visible block queued for the northwest side-leg push in CCLP1:62", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:62");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 2951, 2952);
    const movementPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const pushedBlock = movementPhase?.blocks.find((actor) => actor.position.pos === 284);

    expect(trace.steps[0]?.inputCode).toBe(3);
    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(pushedBlock?.dir).toBe("west");
    expect(pushedBlock?.moving).toBe(6);
    expect(movementPhase?.map.cells[284]?.top).toEqual({ id: MS_TILE.Button_Blue, state: 0x40 });
  }, 30_000);

  it("returns the opening trap ball and keeps the board flags aligned in CCLP1:30", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:30");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 470, 475);
    const finalBall = trace.steps.map((step) =>
      step?.phases
        .find((entry) => entry.phase === "final")
        ?.activeCreatures.find(
          (actor) => actor.id === MS_TILE.Ball && (actor.position.pos === 375 || actor.position.pos === 407),
        ),
    );
    const intentBall = trace.steps[4]?.phases
      .find((entry) => entry.phase === "post-creature-intent")
      ?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball && actor.position.pos === 407);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([0, 4096, 0, 32768, 393216]);
    expect(finalBall.map((actor) => actor?.position.pos)).toEqual([375, 375, 407, 407, 407]);
    expect(finalBall.map((actor) => actor?.dir)).toEqual(["north", "north", "south", "south", "south"]);
    expect(intentBall?.tdir).toBe("south");
    expect(trace.steps[4]?.phases.find((entry) => entry.phase === "final")?.map.cells[407]?.top).toEqual({
      id: MS_TILE.Beartrap,
      state: 65,
    });
  }, 30_000);

  it("keeps the cloner fireball chain on the expected tiles until the next tick in CCLP1:69", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:69");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 98, 103);
    const postInputLatch = trace.steps[4]?.phases.find((entry) => entry.phase === "post-input-latch");
    const northColumnFireballs = postInputLatch?.activeCreatures
      .filter((actor) => actor.id === MS_TILE.Fireball && actor.position.x === 15 && actor.position.y >= 14 && actor.position.y <= 19)
      .map((actor) => ({ pos: actor.position.pos, moving: actor.moving }));

    expect(trace.steps.map((step) => step?.mapHash)).toEqual([
      "7ac9d39537f17882",
      "0c0b4b8a357acb2c",
      "d8d91d0291a6d90c",
      "d8d91d0291a6d90c",
      "d8d91d0291a6d90c",
    ]);
    expect(northColumnFireballs).toEqual([
      { pos: 463, moving: 2 },
      { pos: 527, moving: 2 },
      { pos: 591, moving: 2 },
      { pos: 623, moving: 0 },
    ]);
  }, 30_000);

  it("shows Hint in the initial snapshot when Chip starts on the hint button in CCLP1:70", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:70");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTrace(scenario!.request, scenario!.replay, scenario!.maxTicks);

    expect(trace.initialState.statusFlags).toBe(0x0008);
    expect(trace.initialState.chip?.position.pos).toBe(47);
    expect(trace.initialState.view).toEqual({ x: 120, y: 8 });
  }, 30_000);

  it("keeps the ball on the beartrap until the next tick in CCLP1:30", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:30");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 4, 7);
    const ballAtEntry = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement")?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);
    const ballNextTick = trace.steps[1]?.phases.find((entry) => entry.phase === "post-creature-movement")?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);

    expect(ballAtEntry?.position.pos).toBe(407);
    expect(ballAtEntry?.moving).toBe(4);
    expect(ballAtEntry?.floor.id).toBe(MS_TILE.Beartrap);
    expect(trace.steps[1]?.soundEffects).toBe(1 << 15);
    expect(ballNextTick?.position.pos).toBe(407);
    expect(ballNextTick?.moving).toBe(0);
  }, 30_000);

  it("keeps the opening creature turns and PRNG in sync through the first corridor in CCLP1:23", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:23");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 11);

    expect(trace.steps.map((step) => step?.mapHash)).toEqual([
      "2318c97e27b812a3",
      "ea87612a89530823",
      "ea87612a89530823",
      "ea87612a89530823",
      "3d86375cabb26ca3",
      "6ac727e033acf523",
      "6ac727e033acf523",
      "6ac727e033acf523",
      "1387a910bb58a423",
      "8b8e2a2b64028ea3",
      "8b8e2a2b64028ea3",
    ]);
    expect(trace.steps.map((step) => step?.randomState.lynx)).toEqual([
      { prng1: 0, prng2: 3 },
      { prng1: 0, prng2: 7 },
      { prng1: 0, prng2: 7 },
      { prng1: 0, prng2: 7 },
      { prng1: 0, prng2: 255 },
      { prng1: 224, prng2: 255 },
      { prng1: 224, prng2: 255 },
      { prng1: 224, prng2: 255 },
      { prng1: 224, prng2: 255 },
      { prng1: 252, prng2: 255 },
      { prng1: 252, prng2: 255 },
    ]);
    expect(trace.steps[10]?.chip?.position.pos).toBe(110);
  }, 30_000);

  it("teleports Chip and forces the north exit on the next tick in CCLP1:27", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:27");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 7, 13);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 9);
    expect(trace.steps[0]?.chip?.position.pos).toBe(590);
    expect(trace.steps[3]?.chip?.position.pos).toBe(558);
    expect(trace.steps.map((step) => step?.view)).toEqual([
      { x: 112, y: 144 },
      { x: 112, y: 142 },
      { x: 112, y: 140 },
      { x: 112, y: 138 },
      { x: 112, y: 136 },
      { x: 112, y: 138 },
    ]);
  }, 30_000);

  it("strips Chip's boots and plays BootsStolen on burglar arrival in CCLP1:9", async () => {
    const scenario = await loadLynxReplayScenario("CCLP1-lynx.dac.tws:9");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 66, 69);
    const beforeBurglar = trace.steps[0];
    const burglarStep = trace.steps[1];

    expect(beforeBurglar?.inventory.boots).toEqual([0, 0, 1, 0]);
    expect(burglarStep?.soundEffects).toBe(1 << 8);
    expect(burglarStep?.inventory.boots).toEqual([0, 0, 0, 0]);
    expect(burglarStep?.view).toEqual({ x: 96, y: 104 });
  }, 30_000);

  it("accepts the opening slide replay input before slide forcing in CCLXP2:75", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:75");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 2);
    const step = trace.steps[0];
    const postIntent = step?.phases.find((entry) => entry.phase === "post-creature-intent");
    const postMovement = step?.phases.find((entry) => entry.phase === "post-creature-movement");

    expect(step?.lastMoveCode).toBe(2);
    expect(step?.view).toEqual({ x: 28, y: 40 });
    expect(postIntent?.lastMoveCode).toBe(2);
    expect(postMovement?.activeCreatures[0]?.position.pos).toBe(163);
    expect(postMovement?.activeCreatures[0]?.moving).toBe(4);
  }, 30_000);

  it("accepts the opening ice replay input before ice forcing in CCLXP2:130", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:130");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 2);
    const step = trace.steps[0];
    const postIntent = step?.phases.find((entry) => entry.phase === "post-creature-intent");
    const postMovement = step?.phases.find((entry) => entry.phase === "post-creature-movement");

    expect(step?.lastMoveCode).toBe(4);
    expect(step?.view).toEqual({ x: 128, y: 154 });
    expect(postIntent?.lastMoveCode).toBe(4);
    expect(postMovement?.activeCreatures[0]?.position.pos).toBe(656);
    expect(postMovement?.activeCreatures[0]?.moving).toBe(6);
  }, 30_000);

  it("falls back north instead of wrapping west on the opening bug move in CCLXP2:73", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:73");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 2);
    const step = trace.steps[0];
    const postMovement = step?.phases.find((entry) => entry.phase === "post-creature-movement");
    const edgeBug = postMovement?.activeCreatures.find((actor) => actor.position.pos === 64);

    expect(step?.lastMoveCode).toBe(4);
    expect(step?.view).toEqual({ x: 128, y: 122 });
    expect(edgeBug?.id).toBe(MS_TILE.Bug);
    expect(edgeBug?.dir).toBe("north");
    expect(edgeBug?.moving).toBe(6);
  }, 30_000);

  it("normalizes legacy special tiles to walls in the initial state of CCLXP2:56", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:56");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 0, 1);

    expect(trace.initialDebugState.map.cells[120]?.top.id).toBe(MS_TILE.Wall);
    expect(trace.initialDebugState.map.cells[216]?.top.id).toBe(MS_TILE.Wall);
    expect(trace.initialState.mapHash).toBe("3376faecb5a98410");
  }, 30_000);

  it("clears blue keys under creatures in the early movement window of CCLXP2:21", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:21");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 3, 4);
    const finalPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "final");

    expect(finalPhase?.map.cells[795]?.top.id).toBe(MS_TILE.Empty);
    expect(finalPhase?.map.cells[795]?.top.state).toBe(0x40);
    expect(finalPhase?.map.cells[859]?.top.id).toBe(MS_TILE.Empty);
    expect(finalPhase?.map.cells[859]?.top.state).toBe(0x40);
  }, 30_000);

  it("rejects the illegal blue-wall block push during the diagonal turn in CCLXP2:15", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:15");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 76, 79);
    const postInput = trace.steps[0]?.phases.find((entry) => entry.phase === "post-input-latch");

    expect(trace.steps[0]?.lastMoveCode).toBe(3);
    expect(trace.steps[0]?.view).toEqual({ x: 160, y: 78 });
    expect(postInput?.activeCreatures[0]?.tdir).toBe("none");
    expect(trace.steps[2]?.chip?.position.pos).toBe(308);
  }, 30_000);

  it("keeps the random-slide glider pinned after later slide rotations in CCLXP2:59", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:59");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 113, 115);
    const postMovement = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const glider = postMovement?.activeCreatures.find((actor) => actor.id === MS_TILE.Glider && actor.position.pos === 238);

    expect(glider?.dir).toBe("west");
    expect(glider?.moving).toBe(0);
    expect(postMovement?.map.cells[237]?.top.state).toBe(0);
    expect(postMovement?.map.cells[238]?.top.id).toBe(MS_TILE.Slide_Random);
    expect(postMovement?.map.cells[238]?.top.state).toBe(0x40);
  }, 30_000);

  it("drops BlockMoving once the pushed slide block has cleared in CCLXP2:77", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:77");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 430, 434);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([
      (1 << 18) | (1 << 21),
      (1 << 18) | (1 << 21),
      1 << 21,
      1 << 21,
    ]);
  }, 30_000);

  it("clears the skipped teleport claim while another glider reroutes in CCLXP2:59", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:59");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 132, 133);
    const postMovement = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const postTeleport = trace.steps[0]?.phases.find((entry) => entry.phase === "post-teleport-resolution");
    const movingGlider = postTeleport?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Glider && actor.position.pos === 400 && actor.dir === "east",
    );
    const reroutedGlider = postTeleport?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Glider && actor.position.pos === 398 && actor.dir === "north",
    );

    expect(postMovement?.map.cells[400]?.top.state).toBe(0x42);
    expect(postTeleport?.map.cells[400]?.top.state).toBe(0x02);
    expect(movingGlider?.moving).toBe(4);
    expect(reroutedGlider?.state).toBe(0x80);
  }, 30_000);

  it("locks Chip's diagonal choice before the north block finishes moving in CCLXP2:136", async () => {
    const scenario = await loadLynxReplayScenario("CCLXP2.dac.tws:136");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 447, 448);
    const step = trace.steps[0];
    const postIntent = step?.phases.find((entry) => entry.phase === "post-creature-intent");
    const postMovement = step?.phases.find((entry) => entry.phase === "post-creature-movement");
    const northBlock = postIntent?.blocks.find((actor) => actor.position.pos === 528);

    expect(step?.lastMoveCode).toBe(9);
    expect(postIntent?.lastMoveCode).toBe(9);
    expect(northBlock?.moving).toBe(2);
    expect(postMovement?.activeCreatures[0]?.position.pos).toBe(561);
    expect(postMovement?.activeCreatures[0]?.moving).toBe(6);
    expect(step?.view).toEqual({ x: 130, y: 136 });
  }, 30_000);

  it("keeps the blocked ice-push block facing south until the next forced move in CC1:63", async () => {
    const scenario = await loadLynxReplayScenario("CC1-lynx.dac.tws:63");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 48, 50);
    const failedPushPhase = trace.steps[0]?.phases.find((entry) => entry.phase === "final");
    const nextMovementPhase = trace.steps[1]?.phases.find((entry) => entry.phase === "post-creature-movement");
    const failedPushBlock = failedPushPhase?.blocks.find((actor) => actor.position.pos === 133);
    const nextMovementBlock = nextMovementPhase?.blocks.find((actor) => actor.position.pos === 133);

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(failedPushBlock?.dir).toBe("south");
    expect(failedPushBlock?.moving).toBe(0);
    expect(nextMovementBlock?.dir).toBe("north");
    expect(nextMovementBlock?.moving).toBe(0);
  }, 30_000);

  it("keeps the straight-input block idle through creature intent in CC1:45", async () => {
    const scenario = await loadLynxReplayScenario("CC1-lynx.dac.tws:45");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 100, 102);
    const postIntent = trace.steps[1]?.phases.find((entry) => entry.phase === "post-creature-intent");
    const block = postIntent?.blocks.find((actor) => actor.position.pos === 873);

    expect(postIntent?.soundEffects).toBe(0);
    expect(block?.dir).toBe("west");
    expect(block?.tdir).toBe("none");
    expect(block?.moving).toBe(0);
    expect(trace.steps[1]?.soundEffects).toBe(4128);
  }, 30_000);

  it("pushes the red-key block west and collects the exposed key in CC1:99", async () => {
    const scenario = await loadLynxReplayScenario("CC1-lynx.dac.tws:99");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 355, 359);
    const postIntent = trace.steps[0]?.phases.find((entry) => entry.phase === "post-creature-intent");
    const keyBlock = postIntent?.blocks.find((actor) => actor.position.pos === 622);

    expect(keyBlock?.tdir).toBe("west");
    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[2]?.chip?.position.pos).toBe(622);
    expect(trace.steps[3]?.inventory.keys[0]).toBe(1);
  }, 30_000);

  it("keeps the held-open trap arrival tick free of CantMove in CCLP5 Voting Acrylic:19", async () => {
    const scenario = await loadLynxReplayScenario("CCLP5Voting-Acrylic-Lynx.tws:19");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 458, 461);
    const arrivalPhase = trace.steps[1]?.phases.find((entry) => entry.phase === "post-creature-movement");

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([1 << 12, 1 << 15, 0]);
    expect(arrivalPhase?.soundEffects).toBe(1 << 15);
    expect(trace.steps.map((step) => step?.view.x)).toEqual([90, 88, 84]);
    expect(trace.steps[1]?.chip?.position.pos).toBe(587);
  }, 30_000);

  it("preserves the held-trap release CantMove after the arrival tick in CCLP5 Voting Qualification:48", async () => {
    const scenario = await loadLynxReplayScenario("CCLP5Voting-Qualification-Lynx.tws:48");
    const oracle = new NativeOracleGameEngineAdapter();

    expect(scenario).toBeDefined();

    const trace = await oracle.runReplayTraceDebugWindow(scenario!.request, scenario!.replay, scenario!.maxTicks, 6615, 6618);

    expect(trace.steps.map((step) => step?.soundEffects)).toEqual([36864, 4128, 4096]);
    expect(trace.steps.map((step) => step?.lastMoveCode)).toEqual([4, 4, 4]);
    expect(trace.steps[1]?.chip?.position.pos).toBe(614);
  }, 30_000);
});
