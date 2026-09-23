import test from "node:test";
import assert from "node:assert/strict";
import { PlayController, parseObservation } from "./controller.mjs";
import { parsePlayDecision } from "../../web/src/player-web/ports/VisualPlayHarness.ts";
import { codexPlayerArgs, playerPrompt } from "./player.mjs";

const header = Buffer.alloc(24);
Buffer.from("89504e470d0a1a0a", "hex").copy(header); header.writeUInt32BE(640, 16); header.writeUInt32BE(472, 20);
const image = `data:image/png;base64,${header.toString("base64")}`;
const observation = (id = 1, extra = {}) => ({ sessionId: "test", id, capturedAt: Date.now(), image, ...extra });
const decision = (extra = {}) => ({ summary: "Inspect the visible corridor.", memory: "A corridor is visible.", actions: [{ direction: "east", ticks: 4 }], marks: [{ x: 4, y: 4, label: "Current position" }], explain: false, recallObservationId: null, ...extra });
function setup(player) {
  const events = [];
  const controller = new PlayController(player, (type, value) => events.push({ type, value }));
  controller.reset("test"); controller.observe(observation()); controller.start();
  return { controller, events };
}

test("observations reject hidden level data and full-board screenshots", () => {
  assert.throws(() => parseObservation(observation(1, { cells: [] })), /Only viewport/);
  assert.throws(() => parseObservation(observation(1, { inventory: [] })), /Only viewport/);
  const wide = Buffer.from(header); wide.writeUInt32BE(1536, 16);
  assert.throws(() => parseObservation(observation(1, { image: `data:image/png;base64,${wide.toString("base64")}` })), /player screen/);
  assert.deepEqual(Object.keys(parseObservation(observation())), ["sessionId", "id", "capturedAt", "image"]);
});
test("decisions cannot navigate to coordinates, run long holds, or annotate unseen cells", () => {
  assert.throws(() => parsePlayDecision(decision({ actions: [{ direction: "goto", ticks: 1 }] })), /directional/);
  assert.throws(() => parsePlayDecision(decision({ actions: [1, 2, 3].map(() => ({ direction: "east", ticks: 20 })) })), /two seconds/);
  assert.throws(() => parsePlayDecision(decision({ marks: [{ x: 9, y: 4, label: "Outside" }] })), /outside/);
  assert.throws(() => parsePlayDecision(decision({ explain: true })), /cannot include moves/);
});
test("stopping during inference discards the result and aborts the provider", async () => {
  let finish; let signal;
  const { controller, events } = setup((_context, nextSignal) => { signal = nextSignal; return new Promise((resolve) => { finish = resolve; }); });
  const pending = controller.pump(); controller.stop(); finish(decision()); await pending;
  assert.equal(signal.aborted, true);
  assert.equal(events.filter((event) => event.type === "decision").length, 0);
  assert.equal(controller.memory, "");
});
test("captured frames become recallable only when delivered to the model", async () => {
  let finish;
  const { controller, events } = setup(() => new Promise((resolve) => { finish = resolve; }));
  const pending = controller.pump(); controller.observe(observation(2));
  finish(decision({ actions: [], explain: true, recallObservationId: 2 })); await pending;
  assert.match(controller.state.message, /undiscovered/);
  assert.equal(events.filter((event) => event.type === "decision").length, 0);
});
test("inference is serialized and the next decision waits for an input receipt and fresh image", async () => {
  let calls = 0;
  const { controller } = setup(async (context) => { calls++; assert.equal(context.observations[0].image, image); return decision(); });
  await controller.pump(); await controller.pump(); assert.equal(calls, 1);
  controller.receipt({ decisionId: 1, outcome: "finished", executedTicks: 4 });
  await controller.pump(); assert.equal(calls, 1);
  controller.observe(observation(2)); await controller.pump(); assert.equal(calls, 2);
});
test("restarting clears discovered images and rejects observations from the old game", () => {
  const { controller } = setup(async () => decision());
  controller.reset("new");
  assert.throws(() => controller.observe(observation(2)), /different play session/);
  assert.equal(controller.discovered.size, 0); assert.equal(controller.journal.length, 0);
});
test("explanation pauses can recall a previously delivered image", async () => {
  const { controller, events } = setup(async () => decision({ actions: [], explain: true, recallObservationId: 1 }));
  await controller.pump();
  const event = events.find((item) => item.type === "decision").value;
  assert.equal(event.recall.id, 1); assert.equal(controller.state.running, false);
});
test("a lost input receipt stops the agent instead of waiting indefinitely", async () => {
  const { controller } = setup(async () => decision());
  await controller.pump();
  controller.now = () => controller.receiptRequestedAt + 5001;
  await controller.pump();
  assert.equal(controller.state.running, false);
  assert.match(controller.state.message, /confirmation was lost/);
});
test("Codex runs outside the repo with config, project docs, tools, and persistence disabled", () => {
  const args = codexPlayerArgs({ directory: "/tmp/isolated-player", images: ["/tmp/observed.png"], schemaPath: "/tmp/schema.json", outputPath: "/tmp/decision.json" });
  for (const value of ["--ignore-user-config", "--ephemeral", "project_doc_max_bytes=0", 'web_search="disabled"', "shell_tool", "apps", "plugins", "browser_use", "view_image", "multi_agent"]) assert.ok(args.includes(value), value);
  assert.equal(args[args.indexOf("-C") + 1], "/tmp/isolated-player");
  assert.doesNotMatch(playerPrompt({ observations: [observation()], memory: "Visible corridor", receipts: [], discoveredIds: [1] }), /mapHash|randomSeed|cells:/);
});
