import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const optionalToolName = ["cc", "solver"].join("");
const optionalReviewName = ["p", "7"].join("");

async function workflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

test("product CI has no optional analysis-tool gates", async () => {
  const source = await workflow("ubuntu-ci.yml");

  assert.doesNotMatch(source, new RegExp(optionalToolName, "iu"));
  assert.doesNotMatch(source, new RegExp(`${optionalReviewName}[-_ ](?:training|presentation|proof)`, "iu"));
  assert.match(source, /^  web:\n    name: web$/mu);
  assert.match(source, /^  product:\n    name: product$/mu);
});

test("Pages builds and uploads only the browser product", async () => {
  const source = await workflow("github-pages.yml");

  assert.doesNotMatch(source, new RegExp(optionalToolName, "iu"));
  assert.doesNotMatch(source, new RegExp(`${optionalReviewName}[-_ ](?:training|presentation|proof)`, "iu"));
  assert.match(source, /run: npm run build/u);
  assert.match(source, /path: web\/dist/u);
});

test("the production bundle has no optional review-player entry", async () => {
  const source = await readFile(new URL("../web/vite.config.ts", import.meta.url), "utf8");

  assert.doesNotMatch(source, new RegExp(optionalToolName, "iu"));
  assert.doesNotMatch(source, new RegExp(`${optionalReviewName}[a-z0-9_-]*replay-player`, "iu"));
});
