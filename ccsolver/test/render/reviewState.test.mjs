import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalizeJson } from "../../dist/domain/index.js";
import {
  ReviewStateValidationError,
  createReviewState,
  rebindReviewState,
  validateReviewState,
} from "../../dist/render/reviewState.js";

function reference(character, byteLength = 100) {
  return {
    digest: `sha256:${character.repeat(64)}`,
    byteLength,
  };
}

function binding(evidence = "a", witness = "b") {
  return {
    evidenceContent: reference(evidence, 101),
    witnessContent: reference(witness, 202),
  };
}

function reviewedInput(overrides = {}) {
  return {
    binding: binding(),
    status: "reviewed",
    notes: [
      { noteId: "note:first", text: "The red-key callout is clear." },
      { noteId: "note:second", text: "Keep the blue alternative visible.\nIt matters later." },
    ],
    overlayOverrides: [
      {
        overrideId: "override:red-key-label",
        overlayId: "overlay:selected-red-key",
        replacementText: "Selected red key",
        hidden: false,
      },
      {
        overrideId: "override:hide-noise",
        overlayId: "overlay:incidental-noise",
        replacementText: null,
        hidden: true,
      },
    ],
    staleBinding: null,
    ...overrides,
  };
}

test("creates a detached unreviewed state with ordered empty human data", () => {
  const sourceBinding = binding();
  const state = createReviewState({ binding: sourceBinding });

  assert.deepEqual(state, {
    reviewStateVersion: 1,
    binding: sourceBinding,
    status: "unreviewed",
    notes: [],
    overlayOverrides: [],
    staleBinding: null,
  });
  assert.doesNotThrow(() => validateReviewState(state));

  sourceBinding.evidenceContent.digest = reference("f").digest;
  assert.equal(state.binding.evidenceContent.digest, reference("a").digest);
});

test("creates and validates reviewed notes and presentation-only overrides in supplied order", () => {
  const state = createReviewState(reviewedInput());

  assert.deepEqual(
    state.notes.map(({ noteId }) => noteId),
    ["note:first", "note:second"],
  );
  assert.deepEqual(
    state.overlayOverrides.map(({ overrideId, overlayId }) => ({ overrideId, overlayId })),
    [
      { overrideId: "override:red-key-label", overlayId: "overlay:selected-red-key" },
      { overrideId: "override:hide-noise", overlayId: "overlay:incidental-noise" },
    ],
  );
  assert.equal("author" in state.notes[0], false);
  assert.equal("timestamp" in state, false);
  assert.equal("machineAnnotations" in state, false);
  assert.doesNotThrow(() => validateReviewState(state));
});

test("an identical binding preserves the complete durable review byte-semantically", () => {
  const state = createReviewState(reviewedInput());
  const before = canonicalizeJson(state);
  const rebound = rebindReviewState(state, {
    evidenceContent: { ...state.binding.evidenceContent },
    witnessContent: { ...state.binding.witnessContent },
  });

  assert.equal(canonicalizeJson(rebound), before);
  assert.notEqual(rebound, state);
  assert.notEqual(rebound.notes, state.notes);
  assert.notEqual(rebound.overlayOverrides, state.overlayOverrides);
});

test("a changed witness requests changes and records an auditable stale transition", () => {
  const state = createReviewState(reviewedInput());
  const notesBefore = canonicalizeJson(state.notes);
  const overridesBefore = canonicalizeJson(state.overlayOverrides);
  const nextBinding = binding("c", "d");
  const rebound = rebindReviewState(state, nextBinding);

  assert.equal(rebound.status, "changes-requested");
  assert.deepEqual(rebound.binding, nextBinding);
  assert.deepEqual(rebound.staleBinding, {
    reason: "bound-witness-changed",
    previousBinding: state.binding,
    currentBinding: nextBinding,
  });
  assert.equal(canonicalizeJson(rebound.notes), notesBefore);
  assert.equal(canonicalizeJson(rebound.overlayOverrides), overridesBefore);
});

test("changed machine evidence alone requests changes with its distinct reason", () => {
  const state = createReviewState(reviewedInput());
  const nextBinding = {
    evidenceContent: reference("e", 303),
    witnessContent: { ...state.binding.witnessContent },
  };
  const rebound = rebindReviewState(state, nextBinding);

  assert.equal(rebound.status, "changes-requested");
  assert.deepEqual(rebound.staleBinding, {
    reason: "machine-evidence-changed",
    previousBinding: state.binding,
    currentBinding: nextBinding,
  });
  assert.deepEqual(rebound.notes, state.notes);
  assert.deepEqual(rebound.overlayOverrides, state.overlayOverrides);
});

test("sequential rebinds never replace or drop human notes or overrides", () => {
  const state = createReviewState(reviewedInput());
  const afterEvidence = rebindReviewState(state, binding("c", "b"));
  const afterWitness = rebindReviewState(afterEvidence, binding("d", "e"));

  assert.equal(canonicalizeJson(afterWitness.notes), canonicalizeJson(state.notes));
  assert.equal(
    canonicalizeJson(afterWitness.overlayOverrides),
    canonicalizeJson(state.overlayOverrides),
  );
  assert.deepEqual(afterWitness.staleBinding, {
    reason: "bound-witness-changed",
    previousBinding: afterEvidence.binding,
    currentBinding: afterWitness.binding,
  });
});

test("validation rejects malformed bindings, status, IDs, text, and duplicate IDs", () => {
  const valid = createReviewState(reviewedInput());
  const invalidStates = [
    { label: "status", value: { ...valid, status: "approved" } },
    {
      label: "evidence digest",
      value: {
        ...valid,
        binding: {
          ...valid.binding,
          evidenceContent: { digest: `sha256:${"A".repeat(64)}`, byteLength: 101 },
        },
      },
    },
    {
      label: "witness length",
      value: {
        ...valid,
        binding: {
          ...valid.binding,
          witnessContent: { ...valid.binding.witnessContent, byteLength: -1 },
        },
      },
    },
    {
      label: "note ID",
      value: { ...valid, notes: [{ noteId: "Not Valid", text: "Still text" }] },
    },
    {
      label: "duplicate note IDs",
      value: { ...valid, notes: [valid.notes[0], { ...valid.notes[0] }] },
    },
    {
      label: "override ID",
      value: {
        ...valid,
        overlayOverrides: [{ ...valid.overlayOverrides[0], overrideId: "bad id" }],
      },
    },
    {
      label: "overlay ID",
      value: {
        ...valid,
        overlayOverrides: [{ ...valid.overlayOverrides[0], overlayId: "BadOverlay" }],
      },
    },
    {
      label: "duplicate override IDs",
      value: {
        ...valid,
        overlayOverrides: [valid.overlayOverrides[0], { ...valid.overlayOverrides[0] }],
      },
    },
    {
      label: "note text",
      value: { ...valid, notes: [{ noteId: "note:bad", text: "" }] },
    },
    {
      label: "override text",
      value: {
        ...valid,
        overlayOverrides: [{ ...valid.overlayOverrides[0], replacementText: "bad\rtext" }],
      },
    },
  ];

  for (const { label, value } of invalidStates) {
    assert.throws(
      () => validateReviewState(value),
      (error) => error instanceof ReviewStateValidationError,
      label,
    );
  }
});

test("validation rejects unknown review or annotation fields and non-canonical values", () => {
  const valid = createReviewState(reviewedInput());
  const cyclic = { ...valid };
  cyclic.notes = [cyclic];

  for (const value of [
    { ...valid, reviewedAt: "2026-08-18T00:00:00Z" },
    { ...valid, machineAnnotations: [] },
    { ...valid, notes: [{ ...valid.notes[0], author: "reviewer" }] },
    cyclic,
    { ...valid, overlayOverrides: [undefined] },
  ]) {
    assert.throws(
      () => validateReviewState(value),
      (error) => error instanceof ReviewStateValidationError,
    );
  }
});

test("validation enforces stale-binding status, current binding, and reason semantics", () => {
  const reviewed = createReviewState(reviewedInput());
  const stale = rebindReviewState(reviewed, binding("c", "b"));
  const wrongCurrent = binding("d", "b");

  for (const value of [
    { ...stale, status: "reviewed" },
    {
      ...stale,
      staleBinding: { ...stale.staleBinding, currentBinding: wrongCurrent },
    },
    {
      ...stale,
      staleBinding: { ...stale.staleBinding, reason: "bound-witness-changed" },
    },
    {
      ...stale,
      staleBinding: { ...stale.staleBinding, reason: "some-other-reason" },
    },
  ]) {
    assert.throws(
      () => validateReviewState(value),
      (error) => error instanceof ReviewStateValidationError,
    );
  }
});

test("create and rebind fail closed before accepting unknown or malformed input", () => {
  assert.throws(
    () => createReviewState({ binding: binding(), author: "not-in-the-domain" }),
    (error) => error instanceof ReviewStateValidationError,
  );
  assert.throws(
    () => createReviewState({
      binding: binding(),
      status: "reviewed",
      notes: [{ noteId: "note:one", text: "ok" }, { noteId: "note:one", text: "again" }],
    }),
    (error) => error instanceof ReviewStateValidationError,
  );
  assert.throws(
    () => rebindReviewState(createReviewState({ binding: binding() }), {
      ...binding(),
      evidenceContent: { digest: "sha256:no", byteLength: 1 },
    }),
    (error) => error instanceof ReviewStateValidationError,
  );
});
