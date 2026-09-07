import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLAY_DECISION_SCHEMA, parsePlayDecision } from "../../web/src/player-web/ports/VisualPlayHarness.ts";

export const PLAYER_INSTRUCTIONS = `You are playing Tile World through screenshots, as a human player would.
Your ONLY level knowledge comes from the supplied screenshots and your previous observation-based notes.
Never use remembered solutions or knowledge of a named level. You have no file, browser, search, engine, or solver tools.
The picture is the actual 9x9 player viewport plus the normal HUD. The viewport occupies pixels x=8..440, y=8..440 in a 640x472 image; each tile is 48 pixels. Annotation coordinates are viewport columns and rows 0..8.
The world keeps running at 20 ticks/second while you decide. You are seeing a past observation. Be concise and respond quickly. Enemies and forced floors can move during your decision.
Choose ONLY directional key holds or none (wait). Each action has 1..20 ticks; at most 6 actions totaling 40 ticks (2 seconds). A normal floor step typically takes about 4 ticks; use short actions near uncertainty. Longer holds are only for clear routes you have seen.
The local executor only holds/releases keys; it does not navigate, inspect tiles, or avoid hazards for you. Keys release after the sequence. Your receipts describe inputs, not successful movement. Check screenshots to establish what actually happened.
Write a short viewer-facing summary of your next objective and uncertainty, not private chain-of-thought. Mark at most 6 visible cells with short labels. Your memory is a concise notebook based only on observed areas; unknown terrain stays unknown. Include the image IDs of important discoveries you may want to recall later.
You may request an explicit explanation pause by setting explain=true and actions=[]; use this sparingly for useful explanation, not routinely to gain thinking time. Choose recallObservationId from the discovered image IDs provided, or null. Marks then refer to that recalled image; otherwise they refer to the latest supplied image.
Never claim unseen switches, connections, paths, or movement outcomes as known. If the HUD shows death or completion, use actions=[] and explain=true to describe the outcome.
Return only the required JSON decision.`;

export const DISABLED_CODEX_FEATURES = [
  "shell_tool", "unified_exec", "view_image", "apps", "plugins", "remote_plugin", "browser_use",
  "browser_use_external", "computer_use", "image_generation", "multi_agent", "memories", "code_mode",
  "code_mode_host", "goals", "hooks", "skill_search", "sleep_tool",
];

export function codexPlayerArgs({ directory, images, schemaPath, outputPath, model }) {
  return ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only", "--json",
    ...DISABLED_CODEX_FEATURES.flatMap((feature) => ["--disable", feature]),
    "-c", 'web_search="disabled"', "-c", "project_doc_max_bytes=0", "-c", 'model_reasoning_effort="low"',
    "-c", "features.default_mode_request_user_input=false",
    ...(model ? ["--model", model] : []),
    "--output-schema", schemaPath, "--output-last-message", outputPath, "-C", directory,
    ...images.flatMap((path) => ["--image", path]), "-"];
}

export function playerPrompt({ observations, memory, receipts, discoveredIds }) {
  return `${PLAYER_INSTRUCTIONS}\n\nPrevious notebook:\n${memory || "Nothing discovered yet."}\n\nInput receipts:\n${JSON.stringify(receipts)}\n\nPreviously discovered image IDs available for explanation: ${discoveredIds.join(", ")}\n\nAttached observations, oldest first:\n${observations.map((o) => `Image ${o.id}, captured ${Date.now() - o.capturedAt} ms ago.`).join("\n")}`;
}

export async function runCodexPlayer(context, signal, { executable = process.env.TWORLD_CODEX_BIN || "codex", model = process.env.TWORLD_PLAY_MODEL } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tworld-vision-player-"));
  try {
    const schemaPath = join(directory, "decision.schema.json");
    const outputPath = join(directory, "decision.json");
    await writeFile(schemaPath, JSON.stringify(PLAY_DECISION_SCHEMA));
    const images = [];
    for (const observation of context.observations) {
      const path = join(directory, `observation-${observation.id}.png`);
      await writeFile(path, Buffer.from(observation.image.split(",")[1], "base64"));
      images.push(path);
    }
    const args = codexPlayerArgs({ directory, images, schemaPath, outputPath, model });
    await new Promise((resolve, reject) => {
      // Keep login discovery, but do not inherit this coding session's context or credentials for other services.
      const env = Object.fromEntries(["PATH", "HOME", "CODEX_HOME", "TMPDIR", "SystemRoot"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
      const child = spawn(executable, args, { cwd: directory, env, stdio: ["pipe", "pipe", "pipe"] });
      let lines = "";
      let failure = "";
      let stderr = "";
      const abort = () => child.kill("SIGKILL");
      const timeout = setTimeout(() => { failure = "Vision decision exceeded 45 seconds."; abort(); }, 45000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.stdout.on("data", (chunk) => {
        lines += chunk.toString();
        let end;
        while ((end = lines.indexOf("\n")) !== -1) {
          const line = lines.slice(0, end); lines = lines.slice(end + 1);
          try {
            const event = JSON.parse(line);
            if (event.item && !["agent_message", "reasoning", "error"].includes(event.item.type)) {
              failure = `Player attempted an unsupported tool (${event.item.type}).`; abort();
            }
            if (event.type === "error" || event.type === "turn.failed") failure = event.message || event.error?.message || "Vision turn failed.";
          } catch { /* Non-JSON diagnostic lines are not observations. */ }
        }
        if (lines.length > 100000) { failure = "Unexpected player output."; abort(); }
      });
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-3000); });
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout); signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(new Error("Player stopped."));
        else if (failure || code !== 0) reject(new Error(failure || (stderr.includes("not logged in") ? "Run codex login, then restart Play Lab." : `Codex player exited with code ${code}. Check codex login status.`)));
        else resolve();
      });
      child.stdin.on("error", () => {});
      child.stdin.end(playerPrompt(context));
    });
    return parsePlayDecision(JSON.parse(await readFile(outputPath, "utf8")));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runApiPlayer(context, signal) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY locally to use the API provider.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
    headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.TWORLD_PLAY_MODEL || "gpt-6-astra", store: false,
      reasoning: { effort: "low" }, max_output_tokens: 1800, tools: [],
      input: [{ role: "user", content: [{ type: "input_text", text: playerPrompt(context) }, ...context.observations.map((o) => ({ type: "input_image", image_url: o.image, detail: "original" }))] }],
      text: { format: { type: "json_schema", name: "play_decision", strict: true, schema: PLAY_DECISION_SCHEMA } },
    }),
  });
  if (!response.ok) throw new Error(`Vision API returned HTTP ${response.status}.`);
  const result = await response.json();
  const output = result.output?.flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
  return parsePlayDecision(JSON.parse(output || "null"));
}
