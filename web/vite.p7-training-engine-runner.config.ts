import { builtinModules } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const outputDirectory = process.env.P7_TRAINING_RUNNER_OUT_DIR
  ?? fileURLToPath(new URL("./dist-p7-training-runners", import.meta.url));
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

export default defineConfig({
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
  ssr: {
    noExternal: true,
  },
  build: {
    copyPublicDir: false,
    emptyOutDir: false,
    minify: false,
    outDir: outputDirectory,
    sourcemap: false,
    ssr: fileURLToPath(new URL(
      "./src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts",
      import.meta.url,
    )),
    target: "node22",
    rollupOptions: {
      external: (id) => id.startsWith("node:") || nodeBuiltins.has(id),
      output: {
        entryFileNames: "p7-training-engine-runner.mjs",
        format: "es",
        inlineDynamicImports: true,
      },
    },
  },
});
