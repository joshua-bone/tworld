import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runHelp(relativePath) {
  return execFileSync(process.execPath, [resolve(workspaceRoot, relativePath), "--help"], {
    encoding: "utf8",
  });
}

test("exposes a side-effect-free CCSolver CLI help surface", () => {
  const output = runHelp("src/cli/main.mjs");
  assert.match(output, /Usage: npm run ccsolver:cli -- <command>/);
  assert.match(output, /CCSolver command surface \(P0A foundation\)/);
});

test("exposes a side-effect-free dossier help surface without claiming P4 support", () => {
  const output = runHelp("src/site/dossierCli.mjs");
  assert.match(output, /Usage: npm run ccsolver:dossier -- <command>/);
  assert.match(output, /CCSolver dossier command surface \(P0A foundation\)/);
  assert.match(output, /Dossier generation begins in P4/);
});
