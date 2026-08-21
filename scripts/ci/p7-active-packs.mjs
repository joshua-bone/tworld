#!/usr/bin/env node

import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const P7_ACTIVE_PACKS_POLICY_PATH = "scripts/ci/p7-active-packs.v1.json";
export const P7_ACTIVE_PACKS_SCHEMA = "tworld.p7-active-packs/v1";
export const ORDERED_P7_PACK_IDS = Object.freeze(["cclp1", "cclp4", "cclp5"]);
export const P7_PACK_BINDINGS = Object.freeze({
  cclp1: Object.freeze({ gate: "training-p7c", proofId: "p7c" }),
  cclp4: Object.freeze({ gate: "training-p7d", proofId: "p7d" }),
  cclp5: Object.freeze({ gate: "training-p7e", proofId: "p7e" }),
});

const POLICY_KEYS = Object.freeze(["activePacks", "schema"]);
const FORMATS = new Set(["packs-csv", "packs-json", "proof-ids-json"]);
const MAX_POLICY_BYTES = 4096;

function fail(message) {
  throw new Error(`invalid P7 active-pack policy: ${message}`);
}

function exactKeys(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("root must be an object");
  }
  const actual = Object.keys(value).sort();
  if (
    actual.length !== POLICY_KEYS.length
    || actual.some((key, index) => key !== POLICY_KEYS[index])
  ) {
    fail("root keys must be exactly activePacks,schema");
  }
}

function validateActivePacks(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > ORDERED_P7_PACK_IDS.length) {
    fail("activePacks must be a nonempty known-pack subset");
  }
  let priorIndex = -1;
  for (const packId of value) {
    if (typeof packId !== "string") fail("activePacks entries must be strings");
    const packIndex = ORDERED_P7_PACK_IDS.indexOf(packId);
    if (packIndex < 0) fail(`unknown active pack: ${packId}`);
    if (packIndex <= priorIndex) fail("activePacks must be unique and canonically ordered");
    priorIndex = packIndex;
  }
  return Object.freeze([...value]);
}

function canonicalPolicy(activePacks) {
  return `${JSON.stringify({ activePacks, schema: P7_ACTIVE_PACKS_SCHEMA })}\n`;
}

export async function loadP7ActivePackPolicy({ root = process.cwd() } = {}) {
  const policyPath = resolve(root, P7_ACTIVE_PACKS_POLICY_PATH);
  let stat;
  try {
    stat = await lstat(policyPath);
  } catch (error) {
    if (error?.code === "ENOENT") fail(`missing ${P7_ACTIVE_PACKS_POLICY_PATH}`);
    throw error;
  }
  if (stat.isSymbolicLink()) fail(`${P7_ACTIVE_PACKS_POLICY_PATH} must not be a symbolic link`);
  if (!stat.isFile()) fail(`${P7_ACTIVE_PACKS_POLICY_PATH} must be a file`);
  if (stat.size > MAX_POLICY_BYTES) fail(`${P7_ACTIVE_PACKS_POLICY_PATH} is too large`);

  const raw = await readFile(policyPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${P7_ACTIVE_PACKS_POLICY_PATH} is not valid JSON`);
  }
  exactKeys(parsed);
  if (parsed.schema !== P7_ACTIVE_PACKS_SCHEMA) fail(`unknown schema: ${parsed.schema}`);
  const activePacks = validateActivePacks(parsed.activePacks);
  if (raw !== canonicalPolicy(activePacks)) {
    fail(`${P7_ACTIVE_PACKS_POLICY_PATH} must use canonical JSON`);
  }
  return Object.freeze({
    activePacks,
    activeProofIds: Object.freeze(activePacks.map((packId) => P7_PACK_BINDINGS[packId].proofId)),
    schema: P7_ACTIVE_PACKS_SCHEMA,
  });
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      value === undefined
      || !["--format", "--root"].includes(flag)
      || values.has(flag)
    ) {
      throw new Error(`invalid or duplicate P7 active-pack argument: ${flag ?? "<missing>"}`);
    }
    values.set(flag, value);
  }
  const format = values.get("--format");
  if (!FORMATS.has(format)) throw new Error(`unknown or missing P7 active-pack format: ${format ?? "<missing>"}`);
  return { format, root: resolve(values.get("--root") ?? process.cwd()) };
}

async function main() {
  const { format, root } = parseArguments(process.argv.slice(2));
  const policy = await loadP7ActivePackPolicy({ root });
  const output = format === "packs-csv"
    ? policy.activePacks.join(",")
    : JSON.stringify(format === "packs-json" ? policy.activePacks : policy.activeProofIds);
  process.stdout.write(`${output}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
