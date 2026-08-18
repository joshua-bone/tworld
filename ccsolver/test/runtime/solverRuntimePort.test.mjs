import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("the solver runtime port is target-neutral, canonical-safe, and type-closed", () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "../node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--lib",
      "ES2022",
      resolve(packageRoot, "fixtures/typecheck/solverRuntimePort.typecheck.ts"),
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      timeout: 30_000,
    },
  );

  assert.equal(
    result.status,
    0,
    `runtime port type contract failed:\n${result.stdout}${result.stderr}`,
  );
});

test("runtime errors retain stable code, operation, details, and cause", async () => {
  const {
    RuntimePortError,
    SolverRuntimeError,
  } = await import("../../dist/ports/index.js");
  const cause = new Error("adapter rejected the request");
  const details = {
    actualMode: "manual",
    expectedMode: "replay",
  };
  const error = new SolverRuntimeError(
    "runtime.mode-mismatch",
    "advanceTick",
    "manual input cannot advance a replay run",
    details,
    { cause },
  );

  assert.equal(RuntimePortError, SolverRuntimeError);
  assert.equal(error.name, "SolverRuntimeError");
  assert.equal(error.code, "runtime.mode-mismatch");
  assert.equal(error.operation, "advanceTick");
  assert.deepEqual(error.details, details);
  assert.equal(error.cause, cause);
});
