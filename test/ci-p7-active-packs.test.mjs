import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  ORDERED_P7_PACK_IDS,
  P7_ACTIVE_PACKS_POLICY_PATH,
  P7_ACTIVE_PACKS_SCHEMA,
  P7_PACK_BINDINGS,
  loadP7ActivePackPolicy,
} from "../scripts/ci/p7-active-packs.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(repositoryRoot, "scripts/ci/p7-active-packs.mjs");

async function temporaryRoot(t) {
  const root = await mkdtemp(join(tmpdir(), "tworld-p7-active-packs-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function writePolicy(root, value, { canonical = true } = {}) {
  const destination = resolve(root, P7_ACTIVE_PACKS_POLICY_PATH);
  await mkdir(dirname(destination), { recursive: true });
  const contents = canonical
    ? `${JSON.stringify(value)}\n`
    : `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(destination, contents, "utf8");
}

test("declares one canonically ordered active CCLP1 proof", async () => {
  assert.deepEqual(ORDERED_P7_PACK_IDS, ["cclp1", "cclp4", "cclp5"]);
  assert.deepEqual(P7_PACK_BINDINGS, {
    cclp1: { gate: "training-p7c", proofId: "p7c" },
    cclp4: { gate: "training-p7d", proofId: "p7d" },
    cclp5: { gate: "training-p7e", proofId: "p7e" },
  });
  const policy = await loadP7ActivePackPolicy({ root: repositoryRoot });
  assert.deepEqual(policy, {
    activePacks: ["cclp1"],
    activeProofIds: ["p7c"],
    schema: P7_ACTIVE_PACKS_SCHEMA,
  });
});

test("fails closed on malformed, unknown, duplicate, unordered, or noncanonical policy", async (t) => {
  const invalidPolicies = [
    null,
    {},
    { activePacks: ["cclp1"], extra: true, schema: P7_ACTIVE_PACKS_SCHEMA },
    { activePacks: ["cclp1"], schema: "future" },
    { activePacks: [], schema: P7_ACTIVE_PACKS_SCHEMA },
    { activePacks: ["future"], schema: P7_ACTIVE_PACKS_SCHEMA },
    { activePacks: ["cclp1", "cclp1"], schema: P7_ACTIVE_PACKS_SCHEMA },
    { activePacks: ["cclp4", "cclp1"], schema: P7_ACTIVE_PACKS_SCHEMA },
  ];
  for (const [index, policy] of invalidPolicies.entries()) {
    const root = await temporaryRoot(t);
    await writePolicy(root, policy);
    await assert.rejects(
      loadP7ActivePackPolicy({ root }),
      /invalid P7 active-pack policy/u,
      `invalid policy ${index}`,
    );
  }

  const noncanonicalRoot = await temporaryRoot(t);
  await writePolicy(noncanonicalRoot, {
    activePacks: ["cclp1"],
    schema: P7_ACTIVE_PACKS_SCHEMA,
  }, { canonical: false });
  await assert.rejects(
    loadP7ActivePackPolicy({ root: noncanonicalRoot }),
    /must use canonical JSON/u,
  );

  const missingRoot = await temporaryRoot(t);
  await assert.rejects(
    loadP7ActivePackPolicy({ root: missingRoot }),
    /missing scripts\/ci\/p7-active-packs\.v1\.json/u,
  );
});

test("CLI emits the active packs and engine proof IDs in workflow-safe formats", async () => {
  for (const [format, expected] of [
    ["packs-csv", "cclp1\n"],
    ["packs-json", '["cclp1"]\n'],
    ["proof-ids-json", '["p7c"]\n'],
  ]) {
    const result = await execFileAsync(process.execPath, [
      cliPath,
      "--root", repositoryRoot,
      "--format", format,
    ]);
    assert.equal(result.stdout, expected, format);
    assert.equal(result.stderr, "", format);
  }
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "--root", repositoryRoot, "--format", "future"]),
  );
});
