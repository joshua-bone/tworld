import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexPlayerArgs } from "./player.mjs";

// Inspects the real CLI's outbound request against a loopback mock provider.
// No model request is sent to OpenAI and no auth headers are printed or retained.
test("installed Codex exposes no level-reading tools under the player configuration", { skip: process.env.TWORLD_TEST_CODEX_ISOLATION !== "1", timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "tworld-player-isolation-"));
  let child;
  let finish;
  const received = new Promise((resolve) => { finish = resolve; });
  const server = http.createServer(async (req, res) => {
    if (!req.url.includes("responses")) { res.setHeader("Content-Type", "application/json"); res.end('{"models":[]}'); return; }
    let body = "";
    for await (const chunk of req) body += chunk;
    finish(JSON.parse(body));
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end('{"error":{"message":"Isolation probe complete","type":"invalid_request_error"}}');
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const schemaPath = join(directory, "schema.json");
    await writeFile(schemaPath, JSON.stringify({ type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false }));
    const args = codexPlayerArgs({ directory, images: [], schemaPath, outputPath: join(directory, "out.json") });
    args.splice(args.length - 1, 0, "-c", 'model_provider="isolation"', "-c",
      `model_providers.isolation={name="isolation",base_url="http://127.0.0.1:${server.address().port}/v1",wire_api="responses",requires_openai_auth=false}`);
    child = spawn(process.env.TWORLD_CODEX_BIN || "codex", args, { cwd: directory, stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.end("Return the required JSON without using tools.");
    child.stdin.on("error", () => {});
    const request = await Promise.race([received, new Promise((_, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => reject(new Error(`Isolation probe exited before a request (${code}).`)));
      setTimeout(() => reject(new Error("Isolation probe timed out.")), 15000).unref();
    })]);
    const names = request.tools?.map((tool) => tool.name || tool.type) || [];
    assert.deepEqual(names.filter((name) => name !== "request_user_input"), []);
    assert.ok(!JSON.stringify(request.input).includes("/git/tworld"), "Repository context leaked into the player request");
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGKILL"); await new Promise((resolve) => child.once("close", resolve));
    }
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
