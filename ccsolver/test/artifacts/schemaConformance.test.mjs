import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(workspaceRoot, "fixtures/conformance/v1");
const schemaRoot = resolve(workspaceRoot, "schemas/v1");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function createValidators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const common = await readJson(resolve(schemaRoot, "common.schema.json"));
  const corpusCase = await readJson(resolve(schemaRoot, "corpus-case.schema.json"));
  const certificate = await readJson(resolve(schemaRoot, "replay-certificate.schema.json"));
  const levelFacts = await readJson(resolve(schemaRoot, "level-facts.schema.json"));
  const identities = await readJson(resolve(schemaRoot, "identity-primitives.schema.json"));
  ajv.addSchema(common);
  return {
    "corpus-case": ajv.compile(corpusCase),
    "replay-certificate": ajv.compile(certificate),
    "level-facts": ajv.compile(levelFacts),
    identities: ajv.compile(identities),
  };
}

test("keeps checked-in JSON Schemas aligned with all conformance fixtures", async () => {
  const manifest = await readJson(resolve(fixtureRoot, "manifest.json"));
  const validators = await createValidators();

  for (const fixture of manifest.validArtifacts) {
    const value = await readJson(resolve(fixtureRoot, fixture.path));
    assert.equal(validators[fixture.artifactType](value), true, fixture.path);
  }
  for (const fixture of manifest.validValues) {
    const value = await readJson(resolve(fixtureRoot, fixture.path));
    assert.equal(validators.identities(value), true, fixture.path);
  }
  for (const fixture of manifest.invalidArtifacts) {
    const value = await readJson(resolve(fixtureRoot, fixture.path));
    const validator = validators[value.artifactType];
    assert.equal(validator(value), fixture.schemaValid, fixture.path);
  }
});
