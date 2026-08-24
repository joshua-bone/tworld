import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { HybridCcV0HelpOverlay, HybridCcV0ResultSheet } from "./HybridCcV0Overlays";
import type { HybridCcNativeLevel } from "./nativeLevel";

const level = {
  number: 7,
  title: "Projection",
  timeLimitSeconds: 100,
} as HybridCcNativeLevel;

function failedSession(): InteractiveGameSession {
  return {
    request: { seriesFile: "PACK.dat", levelNumber: 7, ruleset: "Lynx", randomSeed: 0 },
    frame: {
      snapshot: { currentTime: 8, timelimit: 2000 },
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: false,
      result: {
        outcome: "failed",
        endPosition: { x: 3, y: 1, z: 1 },
        cause: {
          kind: "fire",
          message: "Stepped in fire at (3, 1)",
          position: { x: 3, y: 1, z: 1 },
          actorId: null,
          actorName: null,
          tileId: null,
        },
        score: null,
      },
    },
    recordedMoveCount: 4,
  } as InteractiveGameSession;
}

describe("HybridCC v0 lifecycle overlays", () => {
  it("uses the shared modern result-sheet structure and visible Hybrid ruleset label", () => {
    const markup = renderToStaticMarkup(
      <HybridCcV0ResultSheet level={level} onNext={() => {}} onRetry={() => {}} session={failedSession()} />,
    );

    expect(markup).toContain("modern-result-sheet__backdrop");
    expect(markup).toContain("Level result");
    expect(markup).toContain("Hybrid v0");
    expect(markup).toContain("Stepped in fire at (3, 1)");
    expect(markup).toContain("Retry (R)");
  });

  it("uses the shared keyboard-help overlay structure", () => {
    const markup = renderToStaticMarkup(<HybridCcV0HelpOverlay onClose={() => {}} />);

    expect(markup).toContain("legacy-help-backdrop");
    expect(markup).toContain("Shift (hold)");
    expect(markup).toContain("Backspace / Delete");
  });
});
