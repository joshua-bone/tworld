import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PlayController } from "./controller.mjs";
import { runApiPlayer, runCodexPlayer } from "./player.mjs";

const root = fileURLToPath(new URL("../../web/", import.meta.url));
const requireFromWeb = createRequire(new URL("../../web/package.json", import.meta.url));
const { createServer } = await import(requireFromWeb.resolve("vite"));
const port = Number(process.env.TWORLD_PLAY_PORT || 5174);
const provider = process.env.TWORLD_PLAY_PROVIDER || "codex";
if (!["codex", "openai"].includes(provider)) throw new Error("TWORLD_PLAY_PROVIDER must be codex or openai.");
const clients = new Set();
const broadcast = (type, data) => {
  for (const client of clients) client.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
};
const controller = new PlayController(provider === "codex" ? runCodexPlayer : runApiPlayer, broadcast,
  { provider, model: process.env.TWORLD_PLAY_MODEL || (provider === "codex" ? "Codex default" : "gpt-6-astra") });

async function jsonBody(req) {
  let body = "";
  for await (const chunk of req) { body += chunk; if (body.length > 2100000) throw new Error("Request too large."); }
  return JSON.parse(body || "{}");
}

const vite = await createServer({
  root, configFile: fileURLToPath(new URL("../../web/vite.config.ts", import.meta.url)),
  server: { host: "127.0.0.1", port, strictPort: true },
  plugins: [{ name: "tworld-local-visual-player", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const path = req.url?.split("?")[0];
      if (!path?.startsWith("/__play/")) return next();
      const origin = `http://127.0.0.1:${port}`;
      if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) {
        res.writeHead(403); res.end("Local Play Lab only."); return;
      }
      if (req.method === "GET" && path === "/__play/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        clients.add(res); res.write(`event: state\ndata: ${JSON.stringify(controller.state)}\n\n`);
        req.on("close", () => { clients.delete(res); if (!clients.size) controller.stop("Viewer disconnected. Agent stopped."); }); return;
      }
      res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
      try {
        if (req.method === "GET" && path === "/__play/journal") {
          res.setHeader("Content-Disposition", 'attachment; filename="tworld-visual-play.json"');
          res.end(JSON.stringify(controller.exportJournal())); return;
        }
        if (req.method !== "POST" || !req.headers["content-type"]?.startsWith("application/json") || req.headers.origin !== origin) {
          res.writeHead(403); res.end(JSON.stringify({ error: "Use the local Play Lab controls." })); return;
        }
        const body = await jsonBody(req);
        if (path === "/__play/reset") {
          if (typeof body.sessionId !== "string" || body.sessionId.length > 100) throw new Error("Invalid session.");
          controller.reset(body.sessionId);
        } else if (path === "/__play/observe") controller.observe(body);
        else if (path === "/__play/receipt") controller.receipt(body);
        else if (path === "/__play/start") controller.start();
        else if (path === "/__play/stop") controller.stop();
        else { res.writeHead(404); res.end("{}"); return; }
        res.end(JSON.stringify({ ok: true }));
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message })); }
    });
  } }],
});
await vite.listen();
const pump = setInterval(() => void controller.pump(), 200);
const heartbeat = setInterval(() => { for (const client of clients) client.write(": heartbeat\n\n"); }, 10000);
// A development session has a bounded lifetime; restart the command to extend it.
const lifetime = setTimeout(() => void shutdown(), Number(process.env.TWORLD_PLAY_LIFETIME_MS || 14400000));
let closing = false;
async function shutdown() {
  if (closing) return; closing = true;
  controller.stop(); clearInterval(pump); clearInterval(heartbeat); clearTimeout(lifetime);
  for (const client of clients) client.end();
  await vite.close();
}
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
console.log(`\n  Play Lab: http://127.0.0.1:${port}/dev/play-lab\n  Vision provider: ${provider}. Game speed: 20 ticks/second.\n`);
