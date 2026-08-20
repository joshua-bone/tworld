import { describe, expect, it } from "vitest";
import {
  buildP7TrainingBrowserReplay,
  canonicalizeP7TrainingBrowserReplay,
  parseP7TrainingBrowserReplay,
} from "./p7TrainingBrowserReplay";

const content = {
  digest: `sha256:${"a".repeat(64)}` as const,
  byteLength: 12,
};

function portable() {
  return {
    artifact: "ccsolver-p7b-browser-replay",
    version: 1,
    variantId: "portable",
    target: "ms",
    transport: "manual-held-schedule",
    sourceReplayContent: content,
    nativeTickRateHz: 20,
    terminalNativeTick: 8,
    initialization: {
      flags: 0,
      randomSeed: 1,
      randomSlideDirection: 1,
      stepping: 0,
      bestTimeTicks: 8,
    },
    changes: [
      { ordinal: 0, nativeTick: 0, inputCode: 8, modifierMask: 0 },
      { ordinal: 1, nativeTick: 2, inputCode: 0, modifierMask: 0 },
    ],
  } as const;
}

describe("P7 browser replay transport contract", () => {
  it("accepts and round-trips a closed portable manual-held schedule", () => {
    expect(buildP7TrainingBrowserReplay(portable())).toEqual(portable());
    const canonical = canonicalizeP7TrainingBrowserReplay(portable());
    expect(canonical).toContain('"transport":"manual-held-schedule"');
    expect(parseP7TrainingBrowserReplay(canonical)).toEqual(portable());
    expect(() => parseP7TrainingBrowserReplay(`${canonical}\n`)).toThrow("canonical JSON");
  });

  it("rejects portable header quirks, redundant changes, and an initial release", () => {
    expect(() => buildP7TrainingBrowserReplay({
      ...portable(),
      initialization: { ...portable().initialization, stepping: 4 },
    })).toThrow("portable browser initialization");
    expect(() => buildP7TrainingBrowserReplay({
      ...portable(),
      changes: [
        { ordinal: 0, nativeTick: 0, inputCode: 8, modifierMask: 0 },
        { ordinal: 1, nativeTick: 2, inputCode: 8, modifierMask: 0 },
        { ordinal: 2, nativeTick: 4, inputCode: 0, modifierMask: 0 },
      ],
    })).toThrow("must not repeat");
    expect(() => buildP7TrainingBrowserReplay({
      ...portable(),
      changes: [{ ordinal: 0, nativeTick: 0, inputCode: 0, modifierMask: 0 }],
    })).toThrow("nonzero input");
    expect(buildP7TrainingBrowserReplay({
      ...portable(),
      changes: portable().changes.slice(0, 1),
    })).toMatchObject({
      transport: "manual-held-schedule",
      changes: [{ inputCode: 8 }],
    });
  });

  it("binds raw variants to their native target and rejects unknown fields", () => {
    const raw = {
      ...portable(),
      variantId: "raw-ms",
      target: "lynx",
      transport: "native-replay-pulses",
      decisions: [{
        ordinal: 0,
        nativeTick: 0,
        encodedWhen: 0x1_0000_0000,
        inputCode: 8,
        modifierMask: 0,
      }],
    } as const;
    const { changes: _changes, ...withoutChanges } = raw;
    expect(() => buildP7TrainingBrowserReplay(withoutChanges)).toThrow("does not match its target");
    expect(() => buildP7TrainingBrowserReplay({
      ...withoutChanges,
      variantId: "raw-lynx",
      decisions: [{ ...withoutChanges.decisions[0], nativeTick: 1 }],
    })).toThrow("does not match its native tick");
    expect(() => buildP7TrainingBrowserReplay({
      ...withoutChanges,
      variantId: "raw-lynx",
      decisions: [{ ...withoutChanges.decisions[0], encodedWhen: 1.5 }],
    })).toThrow("safe integer");
    expect(() => buildP7TrainingBrowserReplay({
      ...withoutChanges,
      variantId: "raw-lynx",
      decisions: [{
        ...withoutChanges.decisions[0],
        encodedWhen: Number.MAX_SAFE_INTEGER + 1,
      }],
    })).toThrow("safe integer");
    expect(() => buildP7TrainingBrowserReplay({ ...portable(), frames: [] }))
      .toThrow("unsupported shape");
  });
});
