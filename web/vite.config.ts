import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@bootstrap": fileURLToPath(new URL("./src/bootstrap", import.meta.url)),
      "@content": fileURLToPath(new URL("./src/content", import.meta.url)),
      "@data": fileURLToPath(new URL("../data", import.meta.url)),
      "@game-core": fileURLToPath(new URL("./src/game-core", import.meta.url)),
      "@game-runtime": fileURLToPath(new URL("./src/game-runtime", import.meta.url)),
      "@level-catalog": fileURLToPath(new URL("./src/level-catalog", import.meta.url)),
      "@oracle-fixtures": fileURLToPath(new URL("./src/oracle-fixtures", import.meta.url)),
      "@player-web": fileURLToPath(new URL("./src/player-web", import.meta.url)),
      "@replay-verifier": fileURLToPath(new URL("./src/replay-verifier", import.meta.url)),
      "@res": fileURLToPath(new URL("../res", import.meta.url)),
      "@ruleset-lynx": fileURLToPath(new URL("./src/ruleset-lynx", import.meta.url)),
      "@ruleset-ms": fileURLToPath(new URL("./src/ruleset-ms", import.meta.url)),
      "@undo-runtime": fileURLToPath(new URL("./src/undo-runtime", import.meta.url)),
      "@sets": fileURLToPath(new URL("../sets", import.meta.url)),
      "@fixtures": fileURLToPath(new URL("../fixtures/characterization/v1", import.meta.url)),
    },
  },
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "node",
  },
});
