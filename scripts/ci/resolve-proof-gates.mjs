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
} from "./changed-gates.mjs";
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
});

const WORKFLOW_GATE_KEYS = Object.freeze({
  browser: "browser",
  native: "native",
  p4b: "p4b",
  p5: "p5",
  p6_presentation_attest: "p6-presentation-attest",
  reviews_p2a_p4: "reviews-p2a-p4",
  runtime_p6_evidence: "runtime-p6-evidence",
  static_corpus_p1b: "static-corpus-p1b",
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
  root = process.cwd(),
  trustedRoot,
}) {
  const changed = classifyChangedPaths(changedPaths);
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
  gates.native = gates.native || proofs.p5.heavy;
  gates.p5 = proofs.p5.heavy;
  gates.p6_presentation_attest = gates.p6_presentation_attest || proofs.p6a.heavy;

  return {
    allHeavy: forced || failClosed,
    changed,
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
    || value.includes("\0")
    || value.includes("\n")
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

function workflowOutputs(result) {
  return {
    ...result.gates,
    current_receipts_valid: result.currentReceiptsValid,
    heavy_p1b: result.proofs.p1b.heavy,
    heavy_p5: result.proofs.p5.heavy,
    heavy_p6a: result.proofs.p6a.heavy,
    reuse_p1b: result.proofs.p1b.reuse,
    reuse_p5: result.proofs.p5.reuse,
    reuse_p6a: result.proofs.p6a.reuse,
  };
}

async function writeGithubOutputs(path, result) {
  const values = workflowOutputs(result);
  const lines = Object.keys(values).sort().map((key) => `${key}=${values[key] ? "true" : "false"}`);
  await appendFile(resolve(path), `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = resolve(options.root ?? process.cwd());
  const head = options.head ?? "HEAD";
  const paths = [...options.paths];
  let materialized;
  if (options.base !== undefined) {
    paths.push(...await resolveChangedPaths({ base: options.base, head, cwd: root }));
    materialized = await materializeTrustedReceipts({ base: options.base, head, root });
  }
  try {
    const result = await resolveProofGates({
      all: options.all,
      changedPaths: paths,
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
