#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  classifyChangedPaths,
  resolveChangedPaths,
  resolveDeletedPaths,
} from "./changed-gates.mjs";
import { partitionChangedWebTestPaths } from "./run-changed-web-tests.mjs";
import {
  canonicalJson,
  verifyProofReceiptReuse,
} from "./proof-receipt.mjs";

const execFileAsync = promisify(execFile);

export const PROOF_BINDINGS = Object.freeze({
  p1b: Object.freeze({
    gate: "static-corpus-p1b",
    receiptPath: "scripts/ci/proof-receipts/p1b.receipt.json",
    specPath: "scripts/ci/proof-specs/p1b.json",
  }),
  p5: Object.freeze({
    gate: "p5",
    receiptPath: "scripts/ci/proof-receipts/p5.receipt.json",
    specPath: "scripts/ci/proof-specs/p5.json",
  }),
  p6a: Object.freeze({
    gate: "runtime-p6-evidence",
    receiptPath: "scripts/ci/proof-receipts/p6a.receipt.json",
    specPath: "scripts/ci/proof-specs/p6a.json",
  }),
  p7c: Object.freeze({
    gate: "training-p7c",
    receiptPath: "scripts/ci/proof-receipts/p7c.receipt.json",
    specPath: "scripts/ci/proof-specs/p7c.json",
  }),
  p7d: Object.freeze({
    gate: "training-p7d",
    receiptPath: "scripts/ci/proof-receipts/p7d.receipt.json",
    specPath: "scripts/ci/proof-specs/p7d.json",
  }),
  p7e: Object.freeze({
    gate: "training-p7e",
    receiptPath: "scripts/ci/proof-receipts/p7e.receipt.json",
    specPath: "scripts/ci/proof-specs/p7e.json",
  }),
  "p7-presentation": Object.freeze({
    gate: "p7-presentation-attest",
    receiptPath: "scripts/ci/proof-receipts/p7-presentation.receipt.json",
    specPath: "scripts/ci/proof-specs/p7-presentation.json",
  }),
});

const WORKFLOW_GATE_KEYS = Object.freeze({
  browser: "browser",
  native_qt: "native-qt",
  native_sdl_oracle: "native-sdl-oracle",
  p4b: "p4b",
  p5: "p5",
  p6_presentation_attest: "p6-presentation-attest",
  reviews_p2a_p4: "reviews-p2a-p4",
  runtime_p6_evidence: "runtime-p6-evidence",
  static_corpus_p1b: "static-corpus-p1b",
  training_p7c: "training-p7c",
  training_p7d: "training-p7d",
  training_p7e: "training-p7e",
  p7_presentation_attest: "p7-presentation-attest",
  workspace: "workspace",
});

function trustedPath(trustedRoot, receiptPath) {
  return trustedRoot === undefined ? undefined : resolve(trustedRoot, receiptPath);
}

function proofResult(verification, requested, forced) {
  const reusable = requested
    && !forced
    && verification.currentValid
    && verification.decision === "reuse";
  if (forced) {
    return {
      currentValid: verification.currentValid,
      decision: "heavy-required",
      heavy: true,
      reasons: [{ code: "all-heavy" }, ...verification.reasons],
      requested: true,
      reuse: false,
    };
  }
  return {
    currentValid: verification.currentValid,
    decision: verification.decision,
    heavy: requested && !reusable,
    reasons: verification.reasons,
    requested,
    reuse: verification.currentValid && verification.decision === "reuse",
  };
}

/**
 * Combine the fail-closed changed-path classifier with independently loaded,
 * merge-base-authoritative receipts. A cache directory is intentionally not
 * accepted as an authority source.
 */
export async function resolveProofGates({
  all = false,
  changedPaths,
  deletedPaths = [],
  root = process.cwd(),
  trustedRoot,
}) {
  const changed = classifyChangedPaths(changedPaths, { deletedPaths });
  const changedTests = await partitionChangedWebTestPaths({
    changedPaths: changed.paths,
    deletedPaths,
    root,
  });
  const policyForcesAll = changed.unknownPaths.length > 0
    || Object.values(changed.reasons).includes("ci-control");
  const forced = all || policyForcesAll;
  const proofs = {};
  for (const [proofId, binding] of Object.entries(PROOF_BINDINGS)) {
    const verification = await verifyProofReceiptReuse({
      receiptPath: binding.receiptPath,
      root,
      specPath: binding.specPath,
      trustedReceiptPath: trustedPath(trustedRoot, binding.receiptPath),
    });
    // Receipt drift is itself a request for a new heavy proof even if a path
    // classifier omission would otherwise route the change elsewhere.
    const requested = forced
      || changed.gates[binding.gate]
      || (verification.currentValid && verification.decision !== "reuse");
    proofs[proofId] = proofResult(verification, requested, forced);
  }

  const currentReceiptsValid = Object.values(proofs).every(({ currentValid }) => currentValid);
  const failClosed = !currentReceiptsValid;
  if (failClosed) {
    for (const proof of Object.values(proofs)) {
      proof.decision = "heavy-required";
      proof.heavy = true;
      proof.requested = true;
      proof.reuse = false;
      proof.reasons = [{ code: "current-receipt-invalid" }, ...proof.reasons];
    }
  }

  const gates = Object.fromEntries(Object.entries(WORKFLOW_GATE_KEYS).map(
    ([workflowKey, classifierKey]) => [
      workflowKey,
      failClosed || forced || changed.gates[classifierKey],
    ],
  ));
  // Keep affected integration lanes independent from reusable artifact proofs:
  // editing a test must still run that lane even when checked artifacts reuse.
  // Heavy P1B/P6A decisions are exported separately by workflowOutputs().
  gates.p5 = gates.p5 || proofs.p5.heavy;
  gates.native_sdl_oracle = gates.native_sdl_oracle || gates.p5 || proofs.p5.heavy;
  gates.p6_presentation_attest = gates.p6_presentation_attest || proofs.p6a.heavy;
  gates.training_p7c = gates.training_p7c || proofs.p7c.heavy;
  gates.training_p7d = gates.training_p7d || proofs.p7d.heavy;
  gates.training_p7e = gates.training_p7e || proofs.p7e.heavy;
  gates.p7_presentation_attest = gates.p7_presentation_attest
    || proofs["p7-presentation"].heavy
    || proofs.p7c.heavy
    || proofs.p7d.heavy
    || proofs.p7e.heavy;

  return {
    allHeavy: forced || failClosed,
    changed,
    changedTests,
    currentReceiptsValid,
    gates,
    proofs,
    schema: "tworld.proof-gate-resolution/v1",
  };
}

function assertRevision(value, flag) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.startsWith("-")
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${flag} requires a safe Git revision`);
  }
}

async function mergeBase({ base, head, root }) {
  assertRevision(base, "--base");
  assertRevision(head, "--head");
  const { stdout } = await execFileAsync("git", ["merge-base", base, head], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
  const revision = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/u.test(revision)) {
    throw new Error("git merge-base returned an invalid revision");
  }
  return revision;
}

async function materializeTrustedReceipts({ base, head, root }) {
  const revision = await mergeBase({ base, head, root });
  const trustedRoot = await mkdtemp(join(tmpdir(), "tworld-trusted-proof-receipts-"));
  for (const { receiptPath } of Object.values(PROOF_BINDINGS)) {
    let stdout;
    try {
      ({ stdout } = await execFileAsync("git", ["show", `${revision}:${receiptPath}`], {
        cwd: root,
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 10_000,
      }));
    } catch (error) {
      if (error?.code === 128) continue;
      throw error;
    }
    const destination = resolve(trustedRoot, receiptPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, stdout);
  }
  return { revision, trustedRoot };
}

function parseArguments(argv) {
  const options = { all: false, paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--all") {
      options.all = true;
    } else if (["--root", "--base", "--head", "--github-output", "--trusted-root"].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0) throw new Error(`${argument} requires a value`);
      const key = argument.slice(2).replaceAll("-", "_");
      if (options[key] !== undefined) throw new Error(`${argument} may be provided only once`);
      options[key] = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      options.paths.push(argument);
    }
  }
  if (options.head !== undefined && options.base === undefined) {
    throw new Error("--head requires --base");
  }
  if (options.base !== undefined && options.trusted_root !== undefined) {
    throw new Error("--base and --trusted-root are mutually exclusive authority sources");
  }
  return options;
}

export function workflowOutputs(result) {
  const p7EnginePacks = [
    ["cclp1", result.proofs.p7c.heavy],
    ["cclp4", result.proofs.p7d.heavy],
    ["cclp5", result.proofs.p7e.heavy],
  ].filter(([, heavy]) => heavy).map(([packId]) => packId);
  const p7NeedsShards = p7EnginePacks.length > 0;
  const attestP7Presentation = result.gates.p7_presentation_attest;
  return {
    ...result.gates,
    changed_native_web_tests: result.changedTests.native.length > 0,
    changed_native_web_tests_json: JSON.stringify(result.changedTests.native),
    changed_web_tests_json: JSON.stringify(result.changedTests.workspace),
    current_receipts_valid: result.currentReceiptsValid,
    heavy_p1b: result.proofs.p1b.heavy,
    heavy_p5: result.proofs.p5.heavy,
    heavy_p6a: result.proofs.p6a.heavy,
    heavy_p7c: result.proofs.p7c.heavy,
    heavy_p7d: result.proofs.p7d.heavy,
    heavy_p7e: result.proofs.p7e.heavy,
    attest_p7_presentation: attestP7Presentation,
    p7_engine_packs_json: JSON.stringify(p7EnginePacks),
    p7_needs_shards: p7NeedsShards,
    p7_selected: p7NeedsShards || attestP7Presentation,
    reuse_p1b: result.proofs.p1b.reuse,
    reuse_p5: result.proofs.p5.reuse,
    reuse_p6a: result.proofs.p6a.reuse,
    reuse_p7c: result.proofs.p7c.reuse,
    reuse_p7d: result.proofs.p7d.reuse,
    reuse_p7e: result.proofs.p7e.reuse,
    reuse_p7_presentation: result.proofs["p7-presentation"].reuse,
    trusted_merge_base: result.trustedMergeBase ?? "",
  };
}

async function writeGithubOutputs(path, result) {
  const values = workflowOutputs(result);
  const lines = Object.keys(values).sort().map((key) => {
    const value = values[key];
    if (typeof value === "boolean") return `${key}=${value ? "true" : "false"}`;
    if (
      typeof value !== "string"
      || Buffer.byteLength(value) > 64 * 1024
      || /[\u0000-\u001f\u007f]/u.test(value)
    ) {
      throw new Error(`unsafe GitHub output value: ${key}`);
    }
    return `${key}=${value}`;
  });
  await appendFile(resolve(path), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const head = options.head ?? "HEAD";
  const paths = [...options.paths];
  let deletedPaths = [];
  let materialized;
  if (options.base !== undefined) {
    paths.push(...await resolveChangedPaths({ base: options.base, head, cwd: root }));
    deletedPaths = await resolveDeletedPaths({ base: options.base, head, cwd: root });
    materialized = await materializeTrustedReceipts({ base: options.base, head, root });
  }
  try {
    const result = await resolveProofGates({
      all: options.all,
      changedPaths: paths,
      deletedPaths,
      root,
      trustedRoot: materialized?.trustedRoot ?? options.trusted_root,
    });
    if (materialized !== undefined) result.trustedMergeBase = materialized.revision;
    process.stdout.write(canonicalJson(result));
    if (options.github_output !== undefined) {
      await writeGithubOutputs(options.github_output, result);
    }
    if (!result.currentReceiptsValid) process.exitCode = 1;
  } finally {
    if (materialized !== undefined) {
      await rm(materialized.trustedRoot, { force: true, recursive: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(canonicalJson({
      error: error instanceof Error ? error.message : String(error),
      status: "error",
    }));
    process.exitCode = 2;
  });
}
