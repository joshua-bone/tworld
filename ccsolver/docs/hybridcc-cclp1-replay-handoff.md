# HybridCC2026 CCLP1 replay handoff

## Purpose

This is the implementation handoff for consuming the checked CCLP1 P7
training artifacts in HybridCC2026. The artifacts are candidate input
timelines plus legacy evidence. They are not Hybrid native replays, and no
MS/Lynx terminal result may be copied into an `HCC26RPL`.

The first HybridCC2026 work belongs to Milestone 5, official corpus. The
HybridCC2026 repository currently says that M5 has not started and does not
freeze an M5 pull-request denominator. Establish that reviewed PR sequence
before labeling the first change with the required `M5, PR... (... of ... for
M5)` status.

## Exact source pin

Use the artifact-producing Tile World commit, not a moving branch:

```text
repository:          joshua-bone/tworld
commit:              1df2a63ca294b2d036ac660a5ee1659c74e43cb1
authority path:      ccsolver/fixtures/golden/p7b/
                     presentation-authorities/cclp1.json
authority SHA-256:   4d7ee0d1d9af8769f79dd30b1849c8e3cea62f09931a3e36237b40fad96bd9ed
pack root:           ccsolver/fixtures/golden/p7b/training-packs/cclp1
manifest bytes:      396194
manifest SHA-256:    a1787aa1e5849791fb351d604451b13442643de8b6a885f3b201373428b98544
proof-index SHA-256: 2f33b518004abe1ff6002023f2bbcf8ef77a2afe89ebcb8f62b17d92e96b82d3
execution-index SHA: ee545e23b4f5fababf25ff86fcdfcac8045c5501cc839b58d3e023f33404de13
CCLP1 DAT path:      data/CCLP1.dat
CCLP1 DAT bytes:     111772
CCLP1 DAT SHA-256:   46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e
profile path:        ccsolver/fixtures/golden/p7b/training-packs/cclp1/
                     profiles/hybridcc-candidate-10hz-v1.json
profile SHA-256:     c6eb1f0516b299dc5fab4128fa657eb12c950dae76300fd3364747f2d00f8939
```

The feature branch is `agent/p7b-training-replay-foundation`. A branch push
makes the commit fetchable but does not publish GitHub Pages. HybridCC should
consume the exact Git object or a checkout verified at the exact commit; it
must not depend on the web deployment.

The profile records the HybridCC2026 compatibility point
`34eeeb571a1bb1a33596e95fe8d783b744aefa44`. At the 2026-08-21 handoff audit,
the current HybridCC2026 timing header still had the profile's exact SHA-256
`844e821cc8a3f33f37135c977460c9a956380b706d4d754e2c99e97ce876078a`,
but HybridCC's replay document and production replay implementation had moved
forward. Treat the profile revision as a known input protocol and prove its
mapping to the current engine with conformance tests. Do not silently rewrite
the profile pin.

## What each artifact is for

| Artifact | Use in HybridCC2026 |
| --- | --- |
| `presentation-authorities/cclp1.json` | Outer checked closure. It binds 1,587 outputs, including the manifest and execution index. This is the consumer's root of trust after the Git commit. |
| `manifest.json` | Closed path, byte-length, media-type, and SHA-256 inventory for pack outputs. Pin the manifest itself with the SHA-256 above. |
| `proof-index.json` | Resolves each level number to its checked `contract.json` and binds the exact external inputs, including `data/CCLP1.dat`. |
| `levels/NNN/contract.json` | Per-level semantic authority: source identity, donor lineage, variants, portability, target certifications, and content references. |
| `profiles/hybridcc-candidate-10hz-v1.json` | Exact cadence and held-packet protocol. |
| `levels/NNN/portable/*-hybrid-candidate-10hz.json` | The only direct candidate input timeline for Hybrid. |
| `levels/NNN/evidence/{index.json,payload.bin}` | Checked digest-addressed evidence store. Resolve the legacy execution envelope here only to recover and cross-check the lineage seed. |
| `levels/NNN/browser.json` and `replays/*.json` | Presentation-only legacy playback projections. They run at 20 Hz, collapse ordered secondary input, and may omit post-terminal changes. Never construct Hybrid input from them. |
| `raw/*.tws-entry.bin` | Immutable donor evidence only. Never feed TWS bytes or TWS action words to Hybrid. |
| Other `evidence/*`, `execution-index.json` | Audit and reproduction evidence. They are not step input. |
| HTML and the shared player | Human review only. They are not an interchange contract. |

The pack contains 149 complete level records and 115 portable trace
candidates. Of those candidates, 21 won under both legacy targets and are
classified `portable`, 80 are `target-specific`, and 14 are `not-portable`.
Another 34 levels have no portable trace. Start with the 21 `portable`
candidates. A legacy portability grade is prioritization evidence only; every
Hybrid result remains unverified until the Hybrid engine runs it.

The initial 21 level numbers are:

```text
001 005 015 024 025 032 033 034 046 051 056
057 059 061 078 080 094 099 105 109 132
```

The 34 levels without a portable trace are deliberately outside direct import:

```text
003 007 017 037 041 042 053 076 079 081 085 088
090 092 093 097 098 108 110 111 112 117 118 120
121 122 124 127 129 131 133 140 146 147
```

All 115 trace files fit inside HybridCC2026's current local canary replay
ceilings: the largest has 2,050 logic steps, 1,973 changes, and 129,836 bytes.
Those are measurements of this pinned pack, not future service limits.

## Fail-closed pack loading

Implement the consumer as a separate file/subprocess adapter in
HybridCC2026. Do not import, link, vendor, or translate Tile World/CCSolver
implementation source.

Load in this order:

1. Require the exact Tile World commit, then hash the outer presentation
   authority before parsing it. Require artifact
   `ccsolver-p7-training-presentation-authority`, version 1, pack ID `cclp1`,
   1,587 unique path-sorted outputs, and the exact authority SHA-256 above.
2. Resolve `manifest.json` through the authority and require its exact content
   reference before parsing it. Require manifest artifact
   `ccsolver-p7b-training-pack-manifest`, version 1,
   pack ID `cclp1`, expected level count 149, and `filesOrder: "path"`.
3. Require the authority outputs to be exactly the manifest plus the
   manifest's 1,586 files. Reject duplicate, unsorted, absolute, escaping, or
   symlinked file paths. Recompute the byte length and SHA-256 of every file
   the consumer opens.
4. Parse `proof-index.json` and `execution-index.json` only after verifying
   their authority and manifest references and the exact hashes above. Require
   the exact `data/CCLP1.dat` external input reference shown above.
5. Find exactly one row in the ordered `proof-index.levels` array whose
   `levelNumber` matches the requested number. Resolve its `contract`, then
   verify the contract's bytes before parsing it.
6. Require contract artifact `ccsolver-p7b-training-replay-level`, version 1,
   matching pack/level identity, `processing.status: "complete"`, and an
   eligible source. Keep `source.normalizedGameplaySha256` as external lineage;
   never compare or substitute it for a Hybrid gameplay-map digest.
7. Select the contract's `kind: "portable"` variant. For the first cohort also
   require `portability: "portable"` and both legacy certifications to be
   `status: "certified"`, `outcome: "won"`.
   The 80 target-specific and 14 not-portable traces are checked candidate
   artifacts, but admitting either cohort requires a separate explicit policy.
8. Resolve the trace by matching the variant's
   `portableProfile.decisionTraceContent` byte length and digest to exactly one
   manifest entry in the same level's `portable/` leaf. Do not select a payload
   merely because its filename looks plausible.
9. Require the trace's profile ID, profile revision, byte length, digest,
   change count, and terminal logic step to match the contract and the checked
   profile file.
10. Reject unknown versions and fields before allocating engine state. Apply
    explicit file, change, step, allocation, and work limits.

`pack-summary.json` is useful reporting. A trace file's existence and the UI's
`viewableVariantId` are not sufficient by themselves to admit a Hybrid
candidate; the importer must enforce its declared cohort policy.

## Portable trace version 1

The exact JSON value is:

```json
{
  "artifact": "ccsolver-p7b-portable-decision-trace",
  "changes": [
    {
      "logicStep": 0,
      "packet": { "primary": "east", "secondary": "none" }
    }
  ],
  "profileId": "hybridcc-candidate-10hz-v1",
  "profileRevision": "ccsolver-p7b-hybridcc-candidate-profile-v1",
  "terminalLogicStep": 1,
  "version": 1
}
```

Validation rules:

- The file is canonical UTF-8 JSON with no trailing newline or alternate
  spelling.
- Only the six root keys above, the two change keys, and the two packet keys
  are accepted.
- `terminalLogicStep` is a safe integer from 0 through 100,000,000.
- There are at most 1,000,000 changes and at most 8 MiB of canonical bytes.
- Change steps are zero-based, bounded by `terminalLogicStep`, and strictly
  increasing.
- Held input begins at `(none, none)`, so the first change cannot be release.
- Consecutive changes cannot repeat the held packet.
- A packet is release, one cardinal primary, or an ordered primary plus an
  orthogonal secondary. Secondary-only, duplicate, and opposite pairs are
  invalid.

The 13 canonical packets are:

```text
none+none
north+none  east+none  south+none  west+none
north+east  east+north  east+south  south+east
south+west  west+south  west+north  north+west
```

Map the direction strings explicitly to
`hybridcc::runtime::FacingDirection`. Do not cast Tile World input-code bits or
Hybrid C-ABI numeric values. Preserve primary/secondary order.

## Timing semantics

Hybrid and the portable profile both use 10 Hz logic boundaries. Do not apply
the legacy `2 native ticks per portable logic step` projection in Hybrid.

State `S[0]` is canonical initialized state. For boundary `n`:

1. apply the change whose `logicStep == n`, if present;
2. otherwise retain the previously held packet;
3. call the authoritative Hybrid `Step` once to transition from `S[n]` to
   `S[n+1]`.

`(none, none)` is an explicit release. `terminalLogicStep` is the authored
candidate end boundary, not a Hybrid win assertion. A change exactly at that
boundary is not executable within the candidate interval. Preserve it as
audit evidence; an endpoint release may be omitted from a final native replay,
but an unconsumed directional change is a divergence and must not disappear
silently.

Legacy certification used a bounded watchdog of
`terminalLogicStep * 2 + 40` native 20 Hz ticks and stopped as soon as the
legacy terminal latched. It therefore allowed up to 20 portable-step-equivalent
boundaries after the authored endpoint while holding the final packet, normally
release. That grace was not part of the portable trace. Adapter v1 is
deliberately stricter: import no legacy grace and execute only the authored
half-open interval `[0, terminalLogicStep)`.

## Initial RNG

The portable trace intentionally does not contain a production replay
envelope. In particular, it does not directly contain the initial RNG state.
For adapter version 1:

1. From both target certifications on the selected portable variant, read the
   non-null `execution.replayContent` reference. This reference exists for a
   compiled failure as well as a certified win.
2. Verify `levels/NNN/evidence/index.json` and `payload.bin` through the outer
   authority, manifest, proof-index sidecar binding, and the sidecar's own
   `payloadContent`. Require artifact
   `ccsolver-p7-generated-evidence-sidecar`, version 1, unique digest entries,
   sorted contiguous offsets, consistent totals, and in-bounds slices.
3. For each target reference, find exactly one sidecar entry with the same
   byte length and digest, slice those exact bytes from `payload.bin`, and
   rehash them before parsing.
4. Require canonical JSON with exactly `artifact`, `version`, `target`,
   `randomSeed`, and `changes`. Require artifact
   `ccsolver-p7b-compiled-native-input-replay`, version 1, the expected target,
   and a nonnegative 31-bit `randomSeed`. Require `changes` to be a bounded
   array whose length equals the selected trace's checked change count and
   whose entries have exactly nonnegative safe-integer `nativeTick` and
   `inputCode` fields, even though the adapter will not consume them.
5. Require the MS and Lynx blobs to carry the same seed. The pinned pack has
   230/230 resolvable target blobs and agreement on all 115 target pairs; it
   contains 102 distinct seeds in the range 0 through 2,107,056,710.
6. Consume only `randomSeed` from these blobs. Their `changes` are 20 Hz
   legacy projections and are not Hybrid input. Record both blob references
   in corpus lineage.
7. Adapter policy v1 maps that exact 31-bit numeric state to
   `RuntimeRngState{policy_version: kRuntimeRngPolicyVersion, state:
   randomSeed}`. This identity mapping is explicit and testable: current
   Hybrid policy v1 and the source engines use the same 31-bit state recurrence
   `state = (state * 1103515245 + 12345) & 0x7fffffff`. It does not assert that
   the engines consume draws at the same boundaries.

Never default or discard a missing/conflicting source seed, and never take it
from a browser projection when the checked execution blob is available. This
adapter policy does not permit copying the legacy replay's terminal, tick
count, input changes, map identity, or final state.

## Constructing an `HCC26RPL`

The importer cannot construct a complete production `NativeReplay` by field
translation alone because all terminal and state fields must come from Hybrid.
Add a new private portable-trace adapter, for example
`src/solver/ccsolver_portable_replay_compiler.{hpp,cpp}`, and initially expose
it through a contract test or bounded local tool. Do not pass these files to
the existing CCSolver recipe/evidence compiler: it accepts `HCC26RCP` private
recipes, expanded plans, and level facts, not
`ccsolver-p7b-portable-decision-trace`.

Map conversion is a prerequisite, not part of replay translation. At
HybridCC2026 commit `11762a1`, strict DAT conversion still rejects unsupported
CC1 tiles and every nonzero chip requirement. In particular, CCLP1/001 requires
10 chips and also needs key, door, and socket mappings, so it cannot yet reach
`OwnedGameInstance`. Extend catalog, DAT policy, and gameplay with normative
microlevels before claiming that case is executable. Never weaken strict DAT
ingress just to admit a corpus level.

Use this execution flow:

1. Call `dat::Decode` on the verified `data/CCLP1.dat`, then
   `dat::BuildGroupIndex`, and locate the group by its decoded level number
   rather than assuming array position `N - 1`. Verify the exact source byte
   range against the proof index's `official-level-source` locator and the
   contract's `source.levelContent`, then call `dat::ConvertGroup` through the
   registered Hybrid catalog/ruleset, `EncodeCompiledMapImage`, and
   `PrepareCompiledMap`. Record the source DAT digest and level number. The
   Hybrid map, catalog, and ruleset digests remain independently authoritative.
2. Call `CreateOwnedGameInstance` with that prepared map and the checked
   adapter RNG state.
3. Map trace direction strings explicitly to `BoundaryInput` packets for
   execution. Do not yet claim that the unexecuted candidate is a native
   replay.
4. Execute the candidate with `StepOwnedGameInstance`, applying changes before
   their named boundaries. Query `GetOwnedGameTerminal` after each successful
   step and use `CaptureOwnedGameCheckpoint` for a bounded per-boundary state
   hash stream used in determinism and differential diagnosis.
5. Stop on the actual Hybrid terminal latch or at `terminalLogicStep`. Do not
   continue a held input beyond the authored endpoint and do not invent extra
   releases or waits.
6. If Hybrid reaches a loss or reaches the authored endpoint without a win,
   record a semantic candidate rejection with the actual terminal or endpoint
   boundary. If parsing, allocation, work, or an engine API fails, record an
   operational not-run instead. Neither outcome publishes a native replay.
   Later repair needs its own declared workflow and may reuse the real planner;
   the existing recipe compiler cannot consume this portable trace directly.
7. If Hybrid wins before or at the authored endpoint, inspect every change at
   or after the actual terminal boundary. A remaining directional packet means
   the candidate was not consumed and is a semantic divergence. A remaining
   release is audit-only.
8. For an accepted direct candidate, capture the actual final checkpoint and
   construct `NativeReplay` from the prepared-map bindings, checked Hybrid RNG
   policy/state, actual Hybrid terminal latch, actual end boundary, and actual
   final state digest. Convert only the executed, nonredundant packet changes
   strictly before that endpoint to `NativeReplayInputChange` records.
9. Call `ValidateNativeReplay`, `EncodeNativeReplayJson`, and
   `EncodeNativeReplayBinary`; strict-parse the binary into fresh storage with
   `ParseNativeReplayBinary`. Create a map-bound verifier with
   `CreateNativeReplayVerifier`, then call `VerifyNativeReplayBinary` from
   canonical initialization. Publish only a `kOk/kAccepted` result.
10. Put the CCSolver commit, authority, manifest, contract, trace, seed-blob,
    and eventual repair lineage in the Hybrid corpus/provenance report. Do not
    add those external identities to gameplay state or reinterpret them as
    Hybrid map identity.

The MS/Lynx certifications answer only whether the candidate won under those
legacy engines. They must never populate Hybrid terminal cause/trigger, replay
endpoint, checkpoints, final digest, or verifier verdict.

## Canary sequence

Use two external canaries because the current engine can import CCLP1/142 but
cannot yet represent CCLP1/001.

### Adapter and DAT plumbing: CCLP1/142

Hybrid already has an exact official-DAT conversion golden for level 142. Use
it first to prove the outer authority, contract, sidecar seed, portable-trace
parser, exact level lookup, and existing DAT ingress without broadening map
semantics:

```text
level:                 CCLP1/142, Bummbua Banubauabgv
contract path:         levels/142/contract.json
contract SHA-256:      91597608404e2753694170ecc13bc03316707302172465a858afc16fb5ac0d0a
source level bytes:    504
source level SHA-256:  91f1704afe5ec8cb7dbf6a70aa88305857cc3f11579aea0dd96089965c2e5e3f
portable trace path:   levels/142/portable/02-hybrid-candidate-10hz.json
portable trace SHA:    34592e774a26893551f4afd94ee0cd44d08fe1084841e9e17ba8e82227047933
terminal logic step:   172
change count:          172
adapter RNG state:     1092959053
first changes:         step 0 west+none; step 1 none+none;
                       step 2 north+none; step 3 none+none
last change:           step 171 none+none
legacy evidence:       certified MS win; Lynx loss
```

This is a plumbing canary, not cross-ruleset portability evidence. Require a
deterministic import and deterministic Hybrid outcome; do not require a Hybrid
win merely because MS won. Admit only this exact target-specific case under a
named plumbing-canary policy; do not weaken the default 21-level admission
policy. If Hybrid does not win, retain the deterministic diagnostic result but
publish no native replay.

### First direct-portable acceptance: CCLP1/001

After the necessary map/catalog/gameplay coverage lands, use Key Pyramid as the
first cross-legacy-positive end-to-end candidate:

```text
level:                 CCLP1/001, Key Pyramid
contract path:         levels/001/contract.json
contract SHA-256:      99ce9693951efd066878fa62381b2c2f95730db6b86d2a1060c1c02920cf7945
source level bytes:    424
source level SHA-256:  888d46dc1e6863694579b5f34106cf84b267b7b2a837ec11f42cd2f6e0655071
portable trace path:   levels/001/portable/02-hybrid-candidate-10hz.json
portable trace SHA:    20689c02085d97c2632efd523ad51f940d9af55fb5d48537cd9e83a0d55bcb53
terminal logic step:   324
change count:          324
adapter RNG state:     2011157566
first changes:         step 0 east+none; step 1 none+none;
                       step 2 west+none; step 3 none+none
last change:           step 323 none+none
legacy evidence:       certified win on MS and Lynx
Hybrid acceptance:     actual Hybrid win no later than boundary 324,
                       no unconsumed directional change, native verification
```

Acceptance for the adapter and Key Pyramid changes:

- A valid pinned artifact imports through the new file adapter without using
  Tile World source code.
- Unit tests reject a changed manifest, wrong digest/length, path escape,
  unknown field/version/profile, invalid packet, non-increasing step,
  redundant change, malformed seed evidence, missing/conflicting seed, and a
  directional change at or after the constructed native endpoint.
- A timing microtest proves that step-0 East affects `S[0] -> S[1]` and the
  step-1 release affects `S[1] -> S[2]`.
- Two independent Hybrid executions emit the same per-boundary state hashes.
- Level 142 records its actual deterministic result without using its MS win as
  a Hybrid assertion.
- Key Pyramid is accepted only if the produced binary round-trips and the
  ordinary persistent verifier accepts it from canonical initialization at
  the actual Hybrid terminal boundary, no later than boundary 324. A different
  outcome records the actual terminal or endpoint facts and publishes no
  replay.
- Any proposed gameplay change starts with a normative Hybrid microlevel,
  never with corpus tuning.

After Key Pyramid passes, expand in this order:

1. Run all 21 cross-legacy-positive `portable` candidates with explicit case,
   time, memory, step, event, and work bounds.
2. After reviewing the direct-import result vocabulary, admit the 80
   `target-specific` candidates as a separate cohort: 68 are MS-only wins and
   12 are Lynx-only wins under legacy certification.
3. After defining negative-result and repair policy, admit the 14
   `not-portable` candidates that failed on both legacy targets. Their checked
   traces remain valid candidate input, but provide no positive legacy witness.
4. Treat the 34 levels without a portable trace as construction/repair work,
   never as missing files to guess or synthesize during import.

Do not dispatch hosted CI without the explicit approval required by the
HybridCC2026 working agreements.

## Useful source-side validators

The source contract and its tests live at these Tile World paths for review;
they are not code dependencies for HybridCC2026:

```text
web/src/ccsolver-runtime/compose/p7b-training/portableReplayProfile.ts
web/src/ccsolver-runtime/compose/p7b-training/trainingReplayContract.ts
web/src/game-core/api/p7TrainingBrowserReplay.ts
web/src/ccsolver-runtime/compose/p7b-training-review/p7bTrainingPackIo.ts
ccsolver/docs/p7b-training-replay-foundation.md
```

HybridCC2026's target seams are:

```text
src/map/dat_ingress.hpp
src/runtime/owned_game.hpp
src/replay/native_replay.hpp
src/replay/native_replay_verifier.hpp
docs/replays-and-solving.md
docs/ccsolver-integration.md
```
