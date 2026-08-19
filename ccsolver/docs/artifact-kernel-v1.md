# CCSolver artifact kernel v1

## Authority and scope

This document, the JSON Schemas in `../schemas/v1/`, and the conformance
fixtures in `../fixtures/conformance/v1/` define CCSolver's first durable
artifact kernel. The TypeScript decoder enforces semantic invariants that JSON
Schema cannot express. A value is accepted only when it satisfies both the
canonical JSON profile and its artifact-specific runtime contract.

Version 1 deliberately defines only:

- the common artifact envelope and content references;
- corpus cases with append-only per-ruleset attempts and current state;
- replay certificates independently verified by Tile World's TypeScript engine
  and native oracle;
- static level facts with exact source/import provenance;
- expanded-plan roots that bind a planning document and an optional selected
  implementation by exact content;
- normalized level, static-placement, actor-lineage, and static-wiring
  identities.

Derived topology, semantic events, subgoal
contracts, contextual witnesses, dossiers, and native Hybrid replays are not
v1 root artifacts yet. Their schemas will be based on execution evidence in
later milestones rather than guessed ahead of their producing code.

## Envelope and references

Every root artifact is a closed object:

```json
{
  "artifactType": "corpus-case",
  "payload": {},
  "protocol": "ccsolver-artifact",
  "protocolVersion": 1,
  "schemaVersion": 1
}
```

The v1 root types are `corpus-case`, `expanded-plan`, `replay-certificate`, and
`level-facts`. Unknown
protocols, protocol versions, artifact types, and schema versions fail before
payload decoding. Artifact references repeat the target artifact type, protocol
version, schema version, and digest, but do not embed the referenced value.

An artifact never contains its own digest. Its external identity is:

```text
sha256:<64 lowercase hexadecimal digits>
```

The digest covers the exact canonical UTF-8 bytes of the complete envelope.
Static placement and actor IDs use the same primitive with `placement:` and
`actor:` prefixes; static wiring uses `wiring:`. What is hashed is the
versioned descriptor, never an object that already contains its derived ID.

## Canonical JSON profile

`CCSolver Canonical JSON Profile v1` is the safe-integer subset of RFC 8785
needed by the artifact protocol:

- values are null, booleans, Unicode-scalar strings, safe integers, arrays, or
  plain data objects;
- fractions, negative zero, unsafe or non-finite numbers, sparse arrays,
  accessors, hidden or symbol properties, non-plain objects, cycles, and lone
  UTF-16 surrogates are rejected;
- object keys are ordered by their raw unsigned UTF-16 code units;
- arrays retain their declared order;
- strings use ECMAScript JSON escaping and are not Unicode-normalized;
- arrays and objects may nest at most 128 levels, producing the same bounded
  failure before host stack limits differ; and
- output is compact JSON with no BOM, insignificant whitespace, or trailing
  newline.

Canonical source parsing is byte-shape strict: alternate key order, whitespace,
number spelling, duplicate keys, and a trailing newline are rejected rather
than silently normalized. Files and network bodies must be decoded as fatal
UTF-8 before entering the string API; a reader must not replace malformed bytes.
Ingress adapters also own suitable byte, nesting, and work limits for their
trust boundary.

The canonicalizer writes sorted members directly. Rebuilding an object and then
calling `JSON.stringify` is not conforming because JavaScript reorders
integer-like property names.

## Corpus cases

A corpus case binds a stable case occurrence to a normalized gameplay digest.
It contains one or both target records in the fixed order `ms`, then `lynx`.
Each target owns an append-only attempt history; attempt sequence numbers are
contiguous and one-based, and attempt IDs are unique within that target.

Attempt context records independent dimensions:

- donor availability;
- donor exposure;
- construction method;
- optional evaluation cohort;
- budget and solver revisions; and
- optional deterministic search seed.

An attempt is a generated candidate, a certified replay, or a categorized
failure. Its optional plan reference identifies a schema-version-1
`expanded-plan` root and may narrow that reference to a goal or subgoal ID.

Current target state is a discriminated union. States that refer to an attempt
must resolve inside the same target and must agree with its result kind:

- `candidate-generated` references a candidate result;
- `needs-local-repair` and `needs-route-replan` reference a failed result; and
- `solved-current` and `needs-reverify` reference a certified result.

No aggregate case status is serialized. It is derived from the two independent
target states, so asymmetric MS/Lynx progress is retained. Superseding a corpus
case uses `previous`; older attempts and certificate references remain evidence.
`verifyCorpusSuccessor` proves that the link names the supplied predecessor,
case and level identities are unchanged, every prior target remains, and each
prior attempt is an exact prefix of the successor history. Validating either
artifact alone cannot establish those cross-artifact facts.

## Expanded plans

An `expanded-plan` root is a deliberately compact, planner-independent binding.
Its payload names the producer, corpus case, normalized level, ruleset target,
plan, root goal, selected goal, exit, and provisional status. Status is either
`candidate` or `unresolved`; execution evidence upgrades a corpus attempt, not
this pre-execution planning claim.

`document` identifies the exact canonical planning-document bytes with a stable
format ID and blob reference. `selectedImplementation` has the same descriptor
shape and is either null or binds exact bytes selected to implement the plan,
such as a tile route. The artifact does not interpret either format and does not
embed planner-domain DTOs. This keeps the root usable by later planners while
making the actual planning and implementation bytes independently checkable.
`planId`, `rootId`, `goalId`, `exitId`, and `status` are copied into the root so
consumers can route and sanity-check the opaque document without claiming to
decode it.

Lineage is a unique set-like artifact-reference array ordered by artifact type,
numeric schema version, then digest. The expanded-plan artifact digest covers
the complete canonical envelope; it never substitutes a digest of the embedded
planning document or selected implementation. A caller resolving a plan
reference must identify the supplied expanded-plan envelope and separately
verify the two blob references against their supplied bytes.

## Replay certificates

A replay certificate binds a case, normalized level identity, target ruleset,
attempt ID, TWS content digest and length, optional plan reference, and lineage.
It records separate winning verification results from the TypeScript target
engine and the native oracle. Both terminal ticks must agree.

Bundle verification recomputes the certificate artifact ID and proves that the
corpus's certified attempt references those exact bytes. It also compares case,
level, target, attempt, replay, and plan. A certificate never points back to the
current corpus-case digest, avoiding a content-hash cycle.

P0B certificates cover legacy `ms` and `lynx` TWS only. A future Hybrid replay
format requires a new schema version or artifact type after its verifier
contract exists.

## Semantic identities

A static placement descriptor contains the normalized gameplay-map digest,
zero-based `x`, `y`, and `z`, semantic stratum, semantic element type, and a
discriminator for repeated placements in one slot. The v1 strata are
`terrain`, `overlay`, `pickup`, `actor`, and `side`.

Initial actor identity derives from a placement ID and source actor order.
Clone identity derives from its parent actor ID, source placement ID, and a
positive clone ordinal. These descriptors make lineage stable without using
runtime array positions as durable identity.

A static wiring descriptor contains the normalized gameplay-map digest,
semantic kind, source declaration order, source and target placement IDs, and a
discriminator. Source order participates in identity because legacy DAT
connection declaration order can be gameplay-significant.

## Static level facts

`level-facts` records a target-specific conservative projection of imported
static gameplay data: uniform zero-based geometry, placements, complete initial
actor order, time and resource requirements, exits, wiring, transports, forced
surfaces, hazards, and explicit source uncertainties. Exact container,
occurrence-member, and normalized gameplay-map byte references make its source
chain independently verifiable.

The normalized gameplay map is target-neutral; the facts projection is
target-specific because MS and Lynx may interpret the same placement
differently. The artifact is not a rules engine and does not assert runtime
legality, topology, goals, or solution behavior. The complete contract is in
[Level facts v1](level-facts-v1.md).

## Errors and ordering

Protocol failures expose a stable `artifact.*` code and JSON Pointer path.
Callers should branch on those fields, not human-readable messages. Distinct
codes cover invalid or noncanonical JSON, invalid envelopes, unsupported
versions/types, schema failures, cross-field invariant failures, hash failures,
digest mismatches, and certificate bundle mismatches.

Set-like artifact-reference arrays are unique and ordered by artifact type
(UTF-16 ordinal), numeric schema version, then digest. Target arrays use their
explicit MS-before-Lynx order. Replay attempts preserve append order and are not
sorted by content.

## Conformance and compatibility

The valid fixtures freeze canonical bytes and independently computed SHA-256
IDs. Invalid fixtures freeze representative error codes and paths. Both the
runtime decoder and Draft 2020-12 schemas run in tests; Ajv is a development
dependency only and is not part of the runtime protocol.

Protocol conformance fixtures are explicitly synthetic examples. Their map and TWS
digests name deterministic fixture byte labels, and their verifier revisions
are `fixture-*` labels; they do not claim that a real replay was run. Likewise,
`verifyCertificateBundle` proves internal content-addressed linkage, not that a
caller truthfully issued the certificate. Real certificate issuance must run
both pinned engines and is delivered with the runtime/certification milestones.

Within a published schema version, changing accepted bytes or identity rules is
breaking. Additive-looking changes to closed objects also require a new schema
version. There is no implicit migration or best-effort decoding: unsupported
versions fail explicitly, and migrations must be named, tested transforms.
