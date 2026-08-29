#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal !== null) {
    throw new Error(`HybridCC sandbox gate was terminated by ${result.signal}.`);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [
  "web/src/player-web/impl/hybridcc-v1/sandbox/syncSandboxAssets.mjs",
  "--check",
]);
run("npm", [
  "--workspace",
  "web",
  "run",
  "test",
  "--",
  "--run",
  "src/player-web/impl/hybridcc-v1/wasmArtifact.test.ts",
  "src/player-web/impl/hybridcc-v1/wasmBridgeHintOverlay.test.ts",
  "src/player-web/impl/hybridcc-v1/sandbox/legacyDatSandbox.test.ts",
  "src/player-web/impl/hybridcc-v1/sandbox/sandboxAssetSync.test.ts",
  "src/player-web/impl/hybridcc-v1/sandbox/legacyDatSandboxRealWasmAcceptance.test.ts",
  "src/player-web/impl/hybridcc-v1/renderProjection.test.ts",
  "src/player-web/impl/hybridcc-v1/soundProjection.test.ts",
  "src/player-web/impl/legacyTileset.test.ts",
  "src/player-web/impl/legacyCanvasMapRenderer.test.ts",
  "src/player-web/impl/BrowserSoundEffectsPlayer.test.ts",
]);
