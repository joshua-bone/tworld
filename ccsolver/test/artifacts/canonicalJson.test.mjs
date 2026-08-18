import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CanonicalJsonError,
  canonicalizeJson,
  parseCanonicalJson,
} from "@tworld/ccsolver/domain";

function rejectsCanonical(value, code, path) {
  assert.throws(
    () => canonicalizeJson(value),
    (error) => (
      error instanceof CanonicalJsonError
      && error.code === code
      && error.path === path
    ),
  );
}

test("canonicalizes the safe-integer JCS profile with ordinal UTF-16 keys", () => {
  assert.equal(
    canonicalizeJson({ 2: "two", 10: "ten" }),
    '{"10":"ten","2":"two"}',
  );
  assert.equal(
    canonicalizeJson({ "\u{10000}": 1, "\ue000": 2 }),
    '{"𐀀":1,"":2}',
  );
  assert.equal(
    canonicalizeJson({ zero: 0, max: Number.MAX_SAFE_INTEGER, min: Number.MIN_SAFE_INTEGER }),
    '{"max":9007199254740991,"min":-9007199254740991,"zero":0}',
  );
  assert.equal(canonicalizeJson({ values: [3, 2, 1] }), '{"values":[3,2,1]}');
});

test("preserves Unicode rather than silently normalizing it", () => {
  assert.equal(canonicalizeJson({ a: "é" }), '{"a":"é"}');
  assert.equal(canonicalizeJson({ a: "e\u0301" }), '{"a":"é"}');
  assert.notEqual(canonicalizeJson({ a: "é" }), canonicalizeJson({ a: "e\u0301" }));
});

test("rejects values outside the canonical artifact domain", () => {
  rejectsCanonical(-0, "canonical.invalid-number", "");
  rejectsCanonical(1.5, "canonical.invalid-number", "");
  rejectsCanonical(Number.MAX_SAFE_INTEGER + 1, "canonical.invalid-number", "");
  rejectsCanonical(undefined, "canonical.unsupported-type", "");
  rejectsCanonical(new Date(0), "canonical.non-plain-object", "");
  rejectsCanonical([, 1], "canonical.sparse-array", "/0");
  rejectsCanonical({ value: "\ud800" }, "canonical.invalid-unicode", "/value");

  const cyclic = {};
  cyclic.self = cyclic;
  rejectsCanonical(cyclic, "canonical.cyclic-reference", "/self");

  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  rejectsCanonical(accessor, "canonical.accessor-property", "/value");
});

test("accepts only byte-canonical source JSON", () => {
  assert.deepEqual(parseCanonicalJson('{"a":1}'), { a: 1 });
  for (const source of [
    ' {"a":1}',
    '{"a":1}\n',
    '{"b":2,"a":1}',
    '{"a":1,"a":2}',
    '{"a":1.0}',
    '{"a":1e0}',
  ]) {
    assert.throws(
      () => parseCanonicalJson(source),
      (error) => error instanceof CanonicalJsonError && error.code === "canonical.non-canonical",
    );
  }
});

test("applies one portable nesting limit before host stack exhaustion", () => {
  let accepted = 0;
  for (let depth = 0; depth < 128; depth += 1) {
    accepted = [accepted];
  }
  assert.equal(typeof canonicalizeJson(accepted), "string");

  const tooDeep = [accepted];
  rejectsCanonical(
    tooDeep,
    "canonical.maximum-depth",
    "/0".repeat(128),
  );
});
