import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";

import {
  MAX_ENTRY_BYTES,
  PROOF_RECEIPT_SCHEMA,
  PROOF_SPEC_SCHEMA,
  buildProofReceipt,
  canonicalJson,
  verifyProofReceiptReuse,
  writeProofReceipt,
} from "../scripts/ci/proof-receipt.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = resolve(repositoryRoot, "scripts/ci/proof-receipt.mjs");
const scratchDirectories = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => (
    rm(path, { force: true, recursive: true })
  )));
});

async function write(root, path, contents, options) {
  const absolutePath = resolve(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, options);
}

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), "tworld-proof-receipt-"));
  scratchDirectories.push(root);

  await write(root, "src/a.mjs", "export const a = 1;\n");
  await write(root, "src/nested/b.txt", "relevant fixture\n");
  await write(root, "proof/payload.json", '{"answer":42}\n');
  await write(
    root,
    "proof/manifest.json",
    canonicalJson({ payloads: [{ path: "proof/payload.json", sha256: "old" }] }),
  );
  await write(root, "docs/readme.md", "Documentation is outside the proof scope.\n");

  const spec = {
    inputScopes: [{ kind: "tree", path: "src" }],
    outputManifestPath: "proof/manifest.json",
    outputScopes: [{ kind: "tree", path: "proof" }],
    producerContract: "p1b:v1|npm run ccsolver:p1b:check:prepared|ubuntu-ci-image@sha256:abc",
    proofId: "p1b",
    schema: PROOF_SPEC_SCHEMA,
  };
  await write(root, ".ci/p1b.spec.json", canonicalJson(spec));
  await writeProofReceipt({
    receiptPath: ".ci/p1b.receipt.json",
    root,
    specPath: ".ci/p1b.spec.json",
  });

  return {
    receiptPath: ".ci/p1b.receipt.json",
    root,
    specPath: ".ci/p1b.spec.json",
  };
}

function reasonCodes(result) {
  return result.reasons.map(({ code }) => code);
}

async function verify(fixture, overrides = {}) {
  return verifyProofReceiptReuse({
    ...fixture,
    trustedReceiptPath: resolve(fixture.root, fixture.receiptPath),
    ...overrides,
  });
}

async function mutateReceipt(fixture, mutation) {
  const path = resolve(fixture.root, fixture.receiptPath);
  const receipt = JSON.parse(await readFile(path, "utf8"));
  mutation(receipt);
  await writeFile(path, canonicalJson(receipt));
}

test("generates a deterministic canonical receipt and reuses only the identical trusted proof", async () => {
  const fixture = await makeFixture();
  const firstBytes = await readFile(resolve(fixture.root, fixture.receiptPath), "utf8");
  const rebuilt = await buildProofReceipt(fixture);

  assert.equal(firstBytes, canonicalJson(rebuilt));
  assert.equal(rebuilt.schema, PROOF_RECEIPT_SCHEMA);
  assert.equal(rebuilt.algorithm, "sha256");
  assert.deepEqual(
    rebuilt.inputs.entries.map(({ path }) => path),
    ["src/a.mjs", "src/nested/b.txt"],
  );
  assert.deepEqual(
    rebuilt.outputs.entries.map(({ path }) => path),
    ["proof/manifest.json", "proof/payload.json"],
  );
  assert.deepEqual(
    Object.keys(rebuilt.outputManifest),
    ["digest", "length", "mode", "path"],
  );

  const result = await verify(fixture);
  assert.deepEqual(result, {
    currentValid: true,
    decision: "reuse",
    proofId: "p1b",
    reasons: [],
    schema: "tworld.proof-reuse-decision/v1",
  });
});

test("ignores docs-only changes outside the receipt scopes", async () => {
  const fixture = await makeFixture();
  await write(fixture.root, "docs/readme.md", "Changed docs.\n");
  await write(fixture.root, "docs/new.md", "More docs.\n");

  assert.equal((await verify(fixture)).decision, "reuse");
});

test("excludes only declared test files while keeping production changes causal", async () => {
  const fixture = await makeFixture();
  const specPath = resolve(fixture.root, fixture.specPath);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  spec.inputScopes = [{
    excludeFileSuffixes: [".test.ts"],
    kind: "tree",
    path: "src",
  }];
  await writeFile(specPath, canonicalJson(spec));
  await write(fixture.root, "src/a.test.ts", "test v1\n");
  await writeProofReceipt(fixture);

  const receipt = await buildProofReceipt(fixture);
  assert.deepEqual(
    receipt.inputs.entries.map(({ path }) => path),
    ["src/a.mjs", "src/nested/b.txt"],
  );

  await write(fixture.root, "src/a.test.ts", "test v2\n");
  await write(fixture.root, "src/new.test.ts", "new test\n");
  assert.equal((await verify(fixture)).decision, "reuse");

  await write(fixture.root, "src/not-excluded.test.tsx", "tsx remains causal\n");
  const lookalike = await verify(fixture);
  assert.equal(lookalike.currentValid, false);
  assert.ok(reasonCodes(lookalike).includes("input-extra"));
  await unlink(resolve(fixture.root, "src/not-excluded.test.tsx"));
  assert.equal((await verify(fixture)).decision, "reuse");

  await write(fixture.root, "src/a.mjs", "export const a = 2;\n");
  const changed = await verify(fixture);
  assert.equal(changed.currentValid, false);
  assert.ok(reasonCodes(changed).includes("input-digest-drift"));

  await writeProofReceipt(fixture);
  await write(fixture.root, "src/new.mjs", "export const added = true;\n");
  const added = await verify(fixture);
  assert.equal(added.currentValid, false);
  assert.ok(reasonCodes(added).includes("input-extra"));
});

test("rejects a symlink even when its name matches an excluded test suffix", async () => {
  const fixture = await makeFixture();
  const specPath = resolve(fixture.root, fixture.specPath);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  spec.inputScopes = [{
    excludeFileSuffixes: [".test.ts"],
    kind: "tree",
    path: "src",
  }];
  await writeFile(specPath, canonicalJson(spec));
  await writeProofReceipt(fixture);
  await symlink("../docs/readme.md", resolve(fixture.root, "src/linked.test.ts"));

  const result = await verify(fixture);
  assert.equal(result.currentValid, false);
  assert.ok(reasonCodes(result).includes("input-symlink"));
});

test("rejects malformed, duplicate, unsorted, and unsafe tree exclusions", async (t) => {
  const cases = [
    ["file scope", { excludeFileSuffixes: [".test.ts"], kind: "file", path: "src/a.mjs" }, "unknown-field"],
    ["not an array", { excludeFileSuffixes: ".test.ts", kind: "tree", path: "src" }, "invalid-exclusions"],
    ["empty", { excludeFileSuffixes: [], kind: "tree", path: "src" }, "invalid-exclusions"],
    ["duplicate", { excludeFileSuffixes: [".test.ts", ".test.ts"], kind: "tree", path: "src" }, "duplicate-exclusion"],
    ["unsorted", { excludeFileSuffixes: [".test.tsx", ".test.ts"], kind: "tree", path: "src" }, "unsorted-exclusion"],
    ["extra suffix", { excludeFileSuffixes: [".test.ts", ".test.tsx"], kind: "tree", path: "src" }, "invalid-exclusions"],
    ["traversal", { excludeFileSuffixes: ["../.test.ts"], kind: "tree", path: "src" }, "unsafe-exclusion"],
    ["production suffix", { excludeFileSuffixes: [".ts"], kind: "tree", path: "src" }, "unsafe-exclusion"],
  ];
  for (const [name, inputScope, code] of cases) {
    await t.test(name, async () => {
      const fixture = await makeFixture();
      const specPath = resolve(fixture.root, fixture.specPath);
      const spec = JSON.parse(await readFile(specPath, "utf8"));
      spec.inputScopes = [inputScope];
      await writeFile(specPath, canonicalJson(spec));
      await assert.rejects(
        buildProofReceipt(fixture),
        (error) => error instanceof Error && error.message === code,
      );
    });
  }

  await t.test("output tree", async () => {
    const fixture = await makeFixture();
    const specPath = resolve(fixture.root, fixture.specPath);
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    spec.outputScopes = [{
      excludeFileSuffixes: [".test.ts"],
      kind: "tree",
      path: "proof",
    }];
    await writeFile(specPath, canonicalJson(spec));
    await assert.rejects(
      buildProofReceipt(fixture),
      (error) => error instanceof Error && error.message === "unknown-field",
    );
  });
});

test("rejects source content, new-file, missing-file, and executable-mode drift", async (t) => {
  await t.test("content", async () => {
    const fixture = await makeFixture();
    await write(fixture.root, "src/a.mjs", "export const a = 2;\n");
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.equal(result.decision, "heavy-required");
    assert.ok(reasonCodes(result).includes("input-digest-drift"));
  });

  await t.test("new file", async () => {
    const fixture = await makeFixture();
    await write(fixture.root, "src/new.mjs", "export const added = true;\n");
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.ok(reasonCodes(result).includes("input-extra"));
  });

  await t.test("missing file", async () => {
    const fixture = await makeFixture();
    await unlink(resolve(fixture.root, "src/a.mjs"));
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.ok(reasonCodes(result).includes("input-missing"));
  });

  await t.test("mode", async () => {
    const fixture = await makeFixture();
    await chmod(resolve(fixture.root, "src/a.mjs"), 0o755);
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.ok(reasonCodes(result).includes("input-mode-drift"));
  });
});

test("rejects stale outputs and a coherent payload/manifest/receipt rewrite against the trusted base", async () => {
  const fixture = await makeFixture();
  const trustedPath = resolve(fixture.root, ".ci/trusted.receipt.json");
  await copyFile(resolve(fixture.root, fixture.receiptPath), trustedPath);

  await write(fixture.root, "proof/payload.json", '{"answer":43}\n');
  await write(
    fixture.root,
    "proof/manifest.json",
    canonicalJson({ payloads: [{ path: "proof/payload.json", sha256: "coherently-new" }] }),
  );

  const stale = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(stale.currentValid, false);
  assert.ok(reasonCodes(stale).includes("output-digest-drift"));
  assert.ok(reasonCodes(stale).includes("output-manifest-digest-drift"));

  await writeProofReceipt(fixture);
  const rewritten = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(rewritten.currentValid, true);
  assert.equal(rewritten.decision, "heavy-required");
  assert.deepEqual(reasonCodes(rewritten), ["receipt-changed"]);
});

test("binds the canonical spec so a scope shrink cannot silently reuse a proof", async () => {
  const fixture = await makeFixture();
  const trustedPath = resolve(fixture.root, ".ci/trusted.receipt.json");
  await copyFile(resolve(fixture.root, fixture.receiptPath), trustedPath);
  const specPath = resolve(fixture.root, fixture.specPath);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  spec.inputScopes = [{ kind: "file", path: "src/a.mjs" }];
  await writeFile(specPath, canonicalJson(spec));

  const stale = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(stale.currentValid, false);
  assert.ok(reasonCodes(stale).includes("spec-drift"));

  await writeProofReceipt(fixture);
  const regenerated = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(regenerated.currentValid, true);
  assert.equal(regenerated.decision, "heavy-required");
  assert.deepEqual(reasonCodes(regenerated), ["receipt-changed"]);
});

test("binds the exact producer contract and requires a heavy proof when it changes", async () => {
  const fixture = await makeFixture();
  const trustedPath = resolve(fixture.root, ".ci/trusted.receipt.json");
  await copyFile(resolve(fixture.root, fixture.receiptPath), trustedPath);
  const specPath = resolve(fixture.root, fixture.specPath);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  spec.producerContract = "p1b:v2|npm run ccsolver:p1b:check:prepared|ubuntu-ci-image@sha256:def";
  await writeFile(specPath, canonicalJson(spec));

  const stale = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(stale.currentValid, false);
  assert.ok(reasonCodes(stale).includes("spec-drift"));
  assert.ok(reasonCodes(stale).includes("producer-contract-drift"));

  await writeProofReceipt(fixture);
  const regenerated = await verify(fixture, { trustedReceiptPath: trustedPath });
  assert.equal(regenerated.currentValid, true);
  assert.deepEqual(reasonCodes(regenerated), ["receipt-changed"]);
});

test("rejects symlinked and missing scoped files instead of following them", async (t) => {
  await t.test("symlink", async () => {
    const fixture = await makeFixture();
    await unlink(resolve(fixture.root, "src/a.mjs"));
    await symlink("../docs/readme.md", resolve(fixture.root, "src/a.mjs"));
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.ok(reasonCodes(result).includes("input-symlink"));
  });

  await t.test("missing root", async () => {
    const fixture = await makeFixture();
    await rm(resolve(fixture.root, "src"), { recursive: true });
    const result = await verify(fixture);
    assert.equal(result.currentValid, false);
    assert.ok(reasonCodes(result).includes("input-missing"));
  });
});

test("rejects malformed, ambiguous, traversal, and oversized receipt entries", async (t) => {
  const cases = [
    ["unknown schema", (receipt) => { receipt.schema = "future"; }, "unknown-receipt-schema"],
    ["unknown algorithm", (receipt) => { receipt.algorithm = "sha512"; }, "unknown-algorithm"],
    ["duplicate", (receipt) => {
      receipt.inputs.entries.splice(1, 0, { ...receipt.inputs.entries[0] });
    }, "duplicate-entry"],
    ["unsorted", (receipt) => { receipt.inputs.entries.reverse(); }, "unsorted-entry"],
    ["traversal", (receipt) => { receipt.inputs.entries[0].path = "../escape"; }, "invalid-path"],
    ["oversized", (receipt) => { receipt.inputs.entries[0].length = MAX_ENTRY_BYTES + 1; }, "entry-too-large"],
    ["extra field", (receipt) => { receipt.untrusted = true; }, "unknown-field"],
  ];

  for (const [name, mutation, expectedCode] of cases) {
    await t.test(name, async () => {
      const fixture = await makeFixture();
      await mutateReceipt(fixture, mutation);
      const result = await verify(fixture);
      assert.equal(result.currentValid, false);
      assert.equal(result.decision, "heavy-required");
      assert.ok(reasonCodes(result).includes(expectedCode), JSON.stringify(result));
    });
  }
});

test("treats an absent trusted merge-base receipt as a cache miss, never as proof", async () => {
  const fixture = await makeFixture();
  const result = await verify(fixture, {
    trustedReceiptPath: resolve(fixture.root, ".ci/does-not-exist.json"),
  });

  assert.equal(result.currentValid, true);
  assert.equal(result.decision, "heavy-required");
  assert.deepEqual(reasonCodes(result), ["trusted-receipt-missing"]);
});

test("CLI emits one machine-readable decision and exits nonzero only when current proof is invalid", async () => {
  const fixture = await makeFixture();
  const trustedPath = resolve(fixture.root, ".ci/trusted.receipt.json");
  await copyFile(resolve(fixture.root, fixture.receiptPath), trustedPath);

  const valid = await execFileAsync(process.execPath, [
    scriptPath,
    "verify",
    "--root", fixture.root,
    "--spec", fixture.specPath,
    "--receipt", fixture.receiptPath,
    "--trusted-receipt", trustedPath,
  ]);
  assert.equal(JSON.parse(valid.stdout).decision, "reuse");
  assert.equal(valid.stderr, "");

  await write(fixture.root, "src/new.mjs", "drift\n");
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "verify",
      "--root", fixture.root,
      "--spec", fixture.specPath,
      "--receipt", fixture.receiptPath,
      "--trusted-receipt", trustedPath,
    ]),
    (error) => {
      const decision = JSON.parse(error.stdout);
      assert.equal(error.code, 1);
      assert.equal(decision.currentValid, false);
      assert.equal(decision.decision, "heavy-required");
      return true;
    },
  );
});
