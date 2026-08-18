import assert from "node:assert/strict";
import { test } from "node:test";

test("loads every supported CCSolver package export after the package build", async () => {
  for (const specifier of [
    "@tworld/ccsolver",
    "@tworld/ccsolver/application",
    "@tworld/ccsolver/analyze",
    "@tworld/ccsolver/domain",
    "@tworld/ccsolver/ports",
    "@tworld/ccsolver/adapters/web-crypto",
  ]) {
    assert.equal(typeof await import(specifier), "object");
  }
});
