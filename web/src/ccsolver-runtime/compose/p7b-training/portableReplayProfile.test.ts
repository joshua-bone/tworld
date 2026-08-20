import { describe, expect, it } from "vitest";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  buildP7bPortableDecisionTrace,
  canonicalizeP7bPortableDecisionTrace,
  parseP7bPortableDecisionTrace,
} from "./portableReplayProfile";

function traceFixture() {
  return {
    artifact: "ccsolver-p7b-portable-decision-trace",
    version: 1,
    profileId: "hybridcc-candidate-10hz-v1",
    profileRevision: "ccsolver-p7b-hybridcc-candidate-profile-v1",
    terminalLogicStep: 8,
    changes: [{
      logicStep: 0,
      packet: { primary: "north", secondary: "none" },
    }, {
      logicStep: 2,
      packet: { primary: "north", secondary: "east" },
    }, {
      logicStep: 4,
      packet: { primary: "none", secondary: "none" },
    }, {
      logicStep: 6,
      packet: { primary: "south", secondary: "none" },
    }],
  };
}

describe("the P7B HybridCC candidate portable replay profile", () => {
  it("pins the audited upstream contract, 10 Hz cadence, and all 13 packet shapes", () => {
    expect(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1).toMatchObject({
      profileId: "hybridcc-candidate-10hz-v1",
      profileRevision: "ccsolver-p7b-hybridcc-candidate-profile-v1",
      classification: "candidate-external-contract",
      upstream: {
        repository: "HybridCC2026",
        headRevision: "34eeeb571a1bb1a33596e95fe8d783b744aefa44",
        timingHeader: {
          path: "include/hybridcc/timing.hpp",
          sha256: "844e821cc8a3f33f37135c977460c9a956380b706d4d754e2c99e97ce876078a",
        },
        replayDocumentation: {
          path: "docs/replays-and-solving.md",
          sha256: "955963e2f98d9496892b8468b9f0af2edb67485004651b59a5d0711e6dfa5445",
        },
      },
      logicStepsPerSecond: 10,
      stepOrigin: 0,
      normalMoveLogicSteps: 2,
      packetSemantics: "held-primary-secondary-until-change",
      changePolicy: "sparse-strictly-increasing-nonredundant",
    });
    expect(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1.canonicalPackets).toHaveLength(13);
    expect(new Set(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1.canonicalPackets.map(
      ({ primary, secondary }) => `${primary}+${secondary}`,
    )).size).toBe(13);
    expect(Object.isFrozen(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1.canonicalPackets)).toBe(true);
  });

  it("accepts sparse held-packet changes and an explicit release", () => {
    const built = buildP7bPortableDecisionTrace(traceFixture());

    expect(built.changes.map(({ logicStep }) => logicStep)).toEqual([0, 2, 4, 6]);
    expect(built.changes[2]!.packet).toEqual({ primary: "none", secondary: "none" });
    expect(Object.isFrozen(built.changes)).toBe(true);
  });

  it.each([
    ["secondary-only", { primary: "none", secondary: "north" }],
    ["duplicate", { primary: "north", secondary: "north" }],
    ["opposite north/south", { primary: "north", secondary: "south" }],
    ["opposite east/west", { primary: "east", secondary: "west" }],
  ])("rejects the noncanonical %s packet", (_label, packet) => {
    const value = traceFixture();
    value.changes[1]!.packet = packet;

    expect(() => buildP7bPortableDecisionTrace(value)).toThrow(
      "portable decision packet is not one of the 13 canonical shapes",
    );
  });

  it("requires strictly increasing change steps", () => {
    const duplicateStep = traceFixture();
    duplicateStep.changes[1]!.logicStep = 0;
    expect(() => buildP7bPortableDecisionTrace(duplicateStep)).toThrow(
      "portable decision changes must be strictly increasing",
    );

    const backwards = traceFixture();
    backwards.changes[2]!.logicStep = 1;
    expect(() => buildP7bPortableDecisionTrace(backwards)).toThrow(
      "portable decision changes must be strictly increasing",
    );
  });

  it("rejects redundant held-packet changes and an initially redundant release", () => {
    const repeated = traceFixture();
    repeated.changes[1]!.packet = { primary: "north", secondary: "none" };
    expect(() => buildP7bPortableDecisionTrace(repeated)).toThrow(
      "portable decision changes must not repeat the held packet",
    );

    const initialRelease = traceFixture();
    initialRelease.changes[0]!.packet = { primary: "none", secondary: "none" };
    expect(() => buildP7bPortableDecisionTrace(initialRelease)).toThrow(
      "portable decision trace cannot begin with the already-held release packet",
    );
  });

  it("bounds changes by the terminal logic step", () => {
    const pastTerminal = traceFixture();
    pastTerminal.terminalLogicStep = 5;

    expect(() => buildP7bPortableDecisionTrace(pastTerminal)).toThrow(
      "portable decision change logic step is out of bounds",
    );
  });

  it("round-trips only canonical versioned traces", () => {
    const canonical = canonicalizeP7bPortableDecisionTrace(traceFixture());
    expect(parseP7bPortableDecisionTrace(canonical)).toEqual(
      buildP7bPortableDecisionTrace(traceFixture()),
    );
    expect(() => parseP7bPortableDecisionTrace(`${canonical}\n`)).toThrow(
      "portable decision trace is not canonical JSON",
    );

    expect(() => buildP7bPortableDecisionTrace({
      ...traceFixture(),
      profileId: "generic-20hz-v1",
    })).toThrow("portable decision trace profile is unsupported");
  });
});
