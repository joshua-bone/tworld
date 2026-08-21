import { describe, expect, it } from "vitest";
import {
  renderP7bLevelReplayPage,
  renderP7bPackIndex,
  type P7bLevelReplayPresentation,
  type P7bPackPresentation,
} from "./p7bReplayPresentation";

function levelPresentation(): P7bLevelReplayPresentation {
  return {
    packId: "cclp1",
    levelNumber: 1,
    title: "Key Pyramid",
    sourceHref: "../../../data/source.json",
    levelManifestHref: "../../../data/player-level.json",
    playerModuleHref: "../../../assets/p7b-replay-player.js",
    initialSelection: { executionTarget: "ms", variant: "raw-ms" },
    variants: [
      {
        id: "raw-ms",
        label: "Original MS",
        description: "Immutable MS donor replay.",
        segments: [
          { id: "collect-red-key", ordinal: 1, title: "Collect the red key" },
          { id: "unlock-red-door", ordinal: 2, title: "Unlock the red door" },
        ],
      },
      {
        id: "raw-lynx",
        label: "Original Lynx",
        description: "Immutable Lynx donor replay.",
        segments: [
          { id: "lynx-circuit", ordinal: 1, title: "Take the Lynx circuit" },
          { id: "lynx-exit", ordinal: 2, title: "Finish the Lynx route" },
        ],
      },
      {
        id: "portable",
        label: "Sanitized",
        description: "Portable replay candidate.",
        segments: [
          { id: "collect-red-key", ordinal: 1, title: "Collect the red key" },
          { id: "unlock-red-door", ordinal: 2, title: "Unlock the red door" },
        ],
      },
    ],
    executionTargets: [
      { id: "ms", label: "MS" },
      { id: "lynx", label: "Lynx" },
    ],
    combinations: [
      {
        availability: "available",
        transport: "native-replay-pulses",
        certificationHref: "../../../data/raw-ms-ms-certificate.json",
        decisionProfile: { cadenceHz: 20, clockBasis: "native-tick", profileId: "ms-native-tws" },
        executionTarget: "ms",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 55,
        authoredDecisionCount: 30,
        executedDecisionCount: 29,
        provenanceLabel: "Official CCLP1 MS donor",
        replayHref: "../../../data/raw-ms-ms-replay.json",
        replayContent: { digest: `sha256:${"0".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "collect-red-key", startNativeTick: 0, endNativeTick: 27 },
          { segmentId: "unlock-red-door", startNativeTick: 27, endNativeTick: 55 },
        ],
        variant: "raw-ms",
      },
      {
        availability: "unavailable",
        certificationStatus: "unavailable",
        executionTarget: "lynx",
        reason: "The native MS donor is not certified on Lynx.",
        variant: "raw-ms",
      },
      {
        availability: "unavailable",
        certificationStatus: "unavailable",
        executionTarget: "ms",
        reason: "The native Lynx donor is not certified on MS.",
        variant: "raw-lynx",
      },
      {
        availability: "available",
        transport: "native-replay-pulses",
        decisionProfile: { cadenceHz: 20, clockBasis: "native-tick", profileId: "lynx-native-tws" },
        executionTarget: "lynx",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 53,
        authoredDecisionCount: 29,
        executedDecisionCount: 29,
        provenanceLabel: "Official CCLP1 Lynx donor",
        replayHref: "../../../data/raw-lynx-lynx-replay.json",
        replayContent: { digest: `sha256:${"1".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "lynx-circuit", startNativeTick: 0, endNativeTick: 26 },
          { segmentId: "lynx-exit", startNativeTick: 26, endNativeTick: 53 },
        ],
        variant: "raw-lynx",
      },
      {
        availability: "available",
        transport: "manual-held-schedule",
        decisionProfile: { cadenceHz: 10, clockBasis: "portable-decision", profileId: "hybridcc-candidate-10hz-v1" },
        executionTarget: "ms",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 59,
        authoredDecisionCount: 29,
        executedDecisionCount: 29,
        provenanceLabel: "P7B portable candidate",
        replayHref: "../../../data/portable-ms-replay.json",
        replayContent: { digest: `sha256:${"2".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "collect-red-key", startNativeTick: 0, endNativeTick: 31, startDecisionOrdinal: 0, endDecisionOrdinal: 15 },
          { segmentId: "unlock-red-door", startNativeTick: 31, endNativeTick: 59, startDecisionOrdinal: 15, endDecisionOrdinal: 29 },
        ],
        variant: "portable",
      },
      {
        availability: "available",
        transport: "manual-held-schedule",
        decisionProfile: { cadenceHz: 10, clockBasis: "portable-decision", profileId: "hybridcc-candidate-10hz-v1" },
        executionTarget: "lynx",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 57,
        authoredDecisionCount: 29,
        executedDecisionCount: 29,
        provenanceLabel: "P7B portable candidate",
        replayHref: "../../../data/portable-lynx-replay.json",
        replayContent: { digest: `sha256:${"3".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "collect-red-key", startNativeTick: 0, endNativeTick: 29, startDecisionOrdinal: 0, endDecisionOrdinal: 15 },
          { segmentId: "unlock-red-door", startNativeTick: 29, endNativeTick: 57, startDecisionOrdinal: 15, endDecisionOrdinal: 29 },
        ],
        variant: "portable",
      },
    ],
  };
}

function packPresentation(): P7bPackPresentation {
  return {
    expectedLevelCount: 149,
    packId: "cclp1",
    title: "CCLP1 training replay corpus",
    levels: Array.from({ length: 149 }, (_, index) => {
      const levelNumber = 149 - index;
      return {
        href: `levels/${String(levelNumber).padStart(3, "0")}/`,
        levelNumber,
        processedTargetCount: levelNumber === 1 ? 2 : 0,
        status: levelNumber === 1 ? "complete" as const : "unprocessed" as const,
        title: levelNumber === 1 ? "Key Pyramid" : `Level ${levelNumber}`,
        totalTargetCount: 2,
      };
    }),
  };
}

describe("P7B replay presentation", () => {
  it("renders variant and execution target as independent accessible axes", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain('<fieldset data-replay-variant-axis>');
    expect(html).toContain('<legend>Replay variant</legend>');
    expect(html).toContain('name="replay-variant" value="raw-ms"');
    expect(html).toContain('name="replay-variant" value="raw-lynx"');
    expect(html).toContain('name="replay-variant" value="portable"');
    expect(html).toContain('<label for="execution-target">Execution engine</label>');
    expect(html).toContain('<select id="execution-target" data-execution-target-axis>');
    expect(html).toContain('<option value="ms" selected>MS</option>');
    expect(html).toContain('<option value="lynx">Lynx</option>');
    expect(html).not.toContain("MS replay mode");
    expect(html).not.toContain("Lynx replay mode");
  });

  it("exposes accessible manual playback controls, never autoplays, and honors reduced motion", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain('data-autoplay="false"');
    expect(html.replaceAll('data-autoplay="false"', "")).not.toMatch(/\bautoplay\b/u);
    expect(html).toContain('aria-label="Play replay segment"');
    expect(html).toContain('aria-label="Pause replay segment"');
    expect(html).toContain('aria-label="Restart replay segment"');
    expect(html).toContain('aria-label="Advance one native tick"');
    expect(html).toContain('<label for="replay-position">Replay position</label>');
    expect(html).toContain('<label for="replay-speed">Playback speed</label>');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("@media(prefers-reduced-motion:reduce)");
    expect(html).toContain("scroll-behavior:auto");
  });

  it("keeps unavailable combinations visible and explains why they cannot run", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain('data-replay-combination="raw-ms:lynx"');
    expect(html).toContain('data-availability="unavailable"');
    expect(html).toContain("The native MS donor is not certified on Lynx.");
    expect(html).toContain("Unavailable combinations stay visible");
  });

  it("references compact replay assets lazily without embedding frame arrays", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain('data-replay-href="../../../data/raw-ms-ms-replay.json"');
    expect(html).toContain('data-level-manifest-href="../../../data/player-level.json"');
    expect(html).toContain('type="module" defer src="../../../assets/p7b-replay-player.js"');
    expect(html).not.toContain('"frames"');
    expect(html).not.toContain('data-replay-frames');
    expect(html).not.toMatch(/<script[^>]*type="application\/json"/u);
  });

  it("discloses portable decision cadence separately from native execution clocks", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain("hybridcc-candidate-10hz-v1");
    expect(html).toContain("Portable decisions · 10 Hz");
    expect(html).toContain("Native execution · 20 Hz");
    expect(html).toContain("portable decisions 0–15");
    expect(html).toContain("native ticks 0–31");
  });

  it("discloses authored and executed decision counts without conflating them", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain("Authored decisions: 30 · Executed decisions: 29");
  });

  it("rejects an executed decision count beyond the authored replay", () => {
    const model = structuredClone(levelPresentation());
    const combination = model.combinations.find((candidate) => (
      candidate.availability === "available"
      && candidate.variant === "raw-ms"
      && candidate.executionTarget === "ms"
    ));
    if (combination?.availability !== "available") throw new Error("missing fixture combination");
    (combination as { authoredDecisionCount: number }).authoredDecisionCount = 28;

    expect(() => renderP7bLevelReplayPage(model)).toThrow(
      "executed decisions exceed its authored decision count",
    );
  });

  it("renders each variant's own semantic segments without requiring donor alignment", () => {
    const html = renderP7bLevelReplayPage(levelPresentation());

    expect(html).toContain('data-segment-variant="raw-ms"');
    expect(html).toContain('data-segment-id="collect-red-key"');
    expect(html).toContain('data-segment-variant="raw-lynx"');
    expect(html).toContain('data-segment-id="lynx-circuit"');
    expect(html).toContain("Each variant owns its semantic segment list");
  });

  it("renders one stable, level-number ordered row for every CCLP1 level", () => {
    const html = renderP7bPackIndex(packPresentation());
    const rows = html.match(/<tr data-pack-level="\d{3}">/gu) ?? [];

    expect(rows).toHaveLength(149);
    expect(rows[0]).toBe('<tr data-pack-level="001">');
    expect(rows[148]).toBe('<tr data-pack-level="149">');
    expect(html.indexOf("Key Pyramid")).toBeLessThan(html.indexOf("Level 2"));
    expect(html).toContain("1 / 149 levels complete");
    expect(html).toContain("2 / 298 target records processed");
  });

  it("rejects a pack index that hides a missing level row", () => {
    const presentation = packPresentation();
    expect(() => renderP7bPackIndex({
      ...presentation,
      levels: presentation.levels.slice(1),
    })).toThrow("exactly 149 level rows");
  });
});
