import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  NATIVE_CHANGED_WEB_TESTS,
  UNSUPPORTED_CHANGED_WEB_TESTS,
  MAX_CHANGED_TEST_COUNT,
  MAX_CHANGED_TEST_FILE_BYTES,
  MAX_CHANGED_TEST_JSON_BYTES,
  buildChangedWebTestInvocation,
  changedWebTestDisposition,
  parseChangedWebTestJson,
  partitionChangedWebTestPaths,
} from "../scripts/ci/run-changed-web-tests.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");

test("partitions every changed web test into one explicit disposition", () => {
  assert.equal(changedWebTestDisposition("web/src/ruleset-ms/impl/portableItems.test.ts"), "workspace");
  assert.equal(
    changedWebTestDisposition("web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Execution.test.ts"),
    "p5",
  );
  assert.equal(
    changedWebTestDisposition("web/src/replay-verifier/impl/compareMsInputTraceScenario.test.ts"),
    "native",
  );
  for (const path of UNSUPPORTED_CHANGED_WEB_TESTS) {
    assert.equal(changedWebTestDisposition(path), "unsupported", path);
  }
  for (const path of [
    "web/src/not-a-test.ts",
    "web/test/outside.test.ts",
    "./web/src/ruleset-ms/impl/portableItems.test.ts",
    "web/src/../escape.test.ts",
    "web/src/control\u0007.test.ts",
  ]) {
    assert.equal(changedWebTestDisposition(path), null, path);
  }
});

test("audits every native, disabled, skipped, or todo test", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z", "--", "web/src"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const audited = [];
  for (const path of stdout.split("\0").filter((entry) => entry.endsWith(".test.ts"))) {
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    const hasEnvironmentGatedSuite = /\bprocess\.env\b/u.test(source)
      && /\bconst\s+runSuite\b/u.test(source);
    if (
      /new NativeOracleGameEngineAdapter|NativeOracleGameEngineAdapter\.hasDefaultOracle/u.test(source)
      || /\b(?:describe|it|test)\.(?:skip|todo)\b/u.test(source)
      || hasEnvironmentGatedSuite
    ) {
      audited.push(path);
      assert.ok(["native", "unsupported"].includes(changedWebTestDisposition(path)), path);
    }
  }
  assert.deepEqual(
    audited.filter((path) => changedWebTestDisposition(path) === "native"),
    [...NATIVE_CHANGED_WEB_TESTS],
  );
  assert.deepEqual(
    audited.filter((path) => changedWebTestDisposition(path) === "unsupported"),
    [...UNSUPPORTED_CHANGED_WEB_TESTS],
  );
});

test("trusts missing changed tests only when diff status proves deletion", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tworld-changed-web-tests-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const ordinary = "web/src/ruleset-ms/impl/ordinary.test.ts";
  const native = NATIVE_CHANGED_WEB_TESTS[0];
  const p5 = "web/src/ccsolver-runtime/compose/p5-review/buildP5ReviewOutputs.test.ts";
  for (const path of [ordinary, native, p5]) {
    await mkdir(dirname(resolve(root, path)), { recursive: true });
    await writeFile(resolve(root, path), "export {};\n");
  }
  const deleted = "web/src/ruleset-ms/impl/deleted.test.ts";
  assert.deepEqual(
    await partitionChangedWebTestPaths({ changedPaths: [p5, native, ordinary, deleted], deletedPaths: [deleted], root }),
    { native: [native], p5: [p5], workspace: [ordinary] },
  );
  await assert.rejects(
    partitionChangedWebTestPaths({ changedPaths: [deleted], deletedPaths: [], root }),
    /changed test is missing but is not a proven deletion/u,
  );

  const linked = "web/src/ruleset-ms/impl/linked.test.ts";
  await symlink(resolve(root, ordinary), resolve(root, linked));
  await assert.rejects(
    partitionChangedWebTestPaths({ changedPaths: [linked], deletedPaths: [], root }),
    /symbolic link/u,
  );

  const oversized = "web/src/ruleset-ms/impl/oversized.test.ts";
  await writeFile(resolve(root, oversized), "");
  await truncate(resolve(root, oversized), MAX_CHANGED_TEST_FILE_BYTES + 1);
  await assert.rejects(
    partitionChangedWebTestPaths({ changedPaths: [oversized], deletedPaths: [], root }),
    /file-size limit/u,
  );
});

test("parses capped lane JSON and builds one argv-safe exact invocation", () => {
  const ordinary = "web/src/ruleset-ms/impl/portableItems.test.ts";
  assert.deepEqual(parseChangedWebTestJson(JSON.stringify([ordinary]), "workspace"), [ordinary]);
  for (const value of [
    "{}",
    JSON.stringify([ordinary, ordinary]),
    JSON.stringify(["./web/src/ruleset-ms/impl/portableItems.test.ts"]),
    JSON.stringify(["web/src/ruleset-ms/impl/control\u0001.test.ts"]),
    JSON.stringify([NATIVE_CHANGED_WEB_TESTS[0]]),
  ]) {
    assert.throws(() => parseChangedWebTestJson(value, "workspace"));
  }
  assert.throws(
    () => parseChangedWebTestJson(" ".repeat(MAX_CHANGED_TEST_JSON_BYTES + 1), "workspace"),
    /transport limit/u,
  );
  const tooMany = Array.from(
    { length: MAX_CHANGED_TEST_COUNT + 1 },
    (_, index) => `web/src/generated/test-${String(index).padStart(4, "0")}.test.ts`,
  );
  assert.throws(() => parseChangedWebTestJson(JSON.stringify(tooMany), "workspace"), /bounded array/u);

  const workspace = buildChangedWebTestInvocation([ordinary], "workspace", repositoryRoot);
  assert.equal(workspace.command, "npm");
  assert.deepEqual(workspace.args, [
    "--workspace", "web", "run", "test", "--", "--run",
    "src/ruleset-ms/impl/portableItems.test.ts",
  ]);
  assert.equal(workspace.options.shell, false);

  const native = buildChangedWebTestInvocation([NATIVE_CHANGED_WEB_TESTS[0]], "native", repositoryRoot);
  assert.equal(native.options.env.TWORLD_ORACLE_BIN, resolve(repositoryRoot, "build-verify/legacy_c/tworld-oracle"));
  assert.equal(native.options.env.TWORLD_ENABLE_LYNX_REPLAY_SWEEP, "1");
  assert.equal(native.options.env.TWORLD_ENABLE_LYNX_REPLAY_INSPECT, "1");
  assert.equal(native.options.env.TWORLD_MS_SOLUTION_FILE, "save/CCLP1.dac.tws");
  assert.equal(native.options.env.TWORLD_MS_REPLAY_FILTER, "CCLP1.dac.tws:1");
  assert.equal(native.options.env.TWORLD_LYNX_SOLUTION_FILE, "save/CCLP1-lynx.dac.tws");
  assert.equal(native.options.env.TWORLD_LYNX_REPLAY_FILTER, "CCLP1-lynx.dac.tws:1");
  assert.equal(native.options.env.TWORLD_MS_SWEEP_TIMEOUT_MS, "300000");
  assert.equal(native.options.env.TWORLD_LYNX_SWEEP_TIMEOUT_MS, "300000");
  assert.throws(
    () => buildChangedWebTestInvocation(["web/src/../escape.test.ts"], "workspace", repositoryRoot),
    /outside the workspace lane/u,
  );
});
