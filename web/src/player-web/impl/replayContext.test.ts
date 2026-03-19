import { describe, expect, it } from "vitest";
import type { SeriesCatalogEntry } from "@content/api/series";
import { resolveReplayActionContext } from "@player-web/impl/replayContext";

function createSeries(filebase: string, ruleset: "MS" | "Lynx", levelNumbers: readonly number[] = [1, 2]): SeriesCatalogEntry {
  return {
    name: filebase,
    filebase,
    mapfilename: `${filebase}.dat`,
    ruleset,
    levels: levelNumbers.map((number, index) => ({
      index,
      number,
      name: `Level ${number}`,
      author: "Tester",
      password: `A${number.toString().padStart(3, "0")}`.slice(0, 4),
      timeLimitSeconds: 100,
      bestTimeTicks: 0,
      levelSize: 0,
      solutionSize: 0,
      levelHash: `${filebase}:${number}`,
      hasSolution: false,
      sgflags: 0,
      unsolvable: null,
    })),
  };
}

describe("resolveReplayActionContext", () => {
  it("prefers the active session request over the sidebar selection", () => {
    const catalog = [createSeries("intro-ms.dac", "MS"), createSeries("intro-lynx.dac", "Lynx")];

    const resolved = resolveReplayActionContext(
      catalog,
      {
        seriesFile: "intro-lynx.dac",
        levelNumber: 2,
      },
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
      },
    );

    expect(resolved.series?.filebase).toBe("intro-ms.dac");
    expect(resolved.level?.number).toBe(1);
  });

  it("falls back to the selected sidebar entry when there is no active session", () => {
    const catalog = [createSeries("intro-ms.dac", "MS")];

    const resolved = resolveReplayActionContext(
      catalog,
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 2,
      },
      null,
    );

    expect(resolved.series?.filebase).toBe("intro-ms.dac");
    expect(resolved.level?.number).toBe(2);
  });
});
