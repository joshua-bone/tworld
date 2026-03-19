import { describe, expect, it } from "vitest";
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
  resolveReplaySeries,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";
import type { SeriesCatalogEntry } from "@content/api/series";

describe("buildReplayTraceScenariosFromSolutionFile", () => {
  it("maps MS solution entries onto replay trace scenarios for the matching series", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP1-MS.tws",
      label: "CCLP1-MS.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP1-MS.dac",
        entries: [
          {
            levelNumber: 1,
            password: "VVGF",
            bestTimeTicks: 105,
            solutionData: Uint8Array.from([1]),
            expandedSolution: {
              flags: 0,
              randomSlideDirection: 0,
              stepping: 0,
              randomSeed: 1234,
              moves: [{ when: 0, dir: 8 }],
            },
          },
        ],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP1-MS.dac",
        filebase: "CCLP1-MS.dac",
        mapfilename: "./data/CCLP1.dat",
        ruleset: "MS",
        levels: [
          {
            index: 0,
            number: 1,
            name: "Key Pyramid",
            author: "",
            password: "VVGF",
            timeLimitSeconds: 180,
            chipsRequired: 0,
            bestTimeTicks: 0,
            levelSize: 0,
            solutionSize: 0,
            levelHash: "0",
            gameplayHash: "0",
            hasSolution: false,
            sgflags: 0,
            unsolvable: null,
          },
        ],
      },
    ];

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, catalog);

    expect(plan.series.filebase).toBe("CCLP1-MS.dac");
    expect(plan.skippedEntries).toBe(0);
    expect(plan.scenarios).toEqual([
      {
        name: "CCLP1-MS.tws:1",
        request: {
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 1,
          ruleset: "MS",
          randomSeed: 1234,
        },
        replay: {
          bestTimeTicks: 105,
          flags: 0,
          randomSlideDirection: 0,
          stepping: 0,
          randomSeed: 1234,
          moves: [{ when: 0, dir: 8 }],
          movesSpec: "0:8",
        },
        maxTicks: 145,
      },
    ]);
  });

  it("normalizes replay seeds to the native 31-bit range", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP1-MS.tws",
      label: "CCLP1-MS.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP1-MS.dac",
        entries: [
          {
            levelNumber: 1,
            password: "VVGF",
            bestTimeTicks: 32,
            solutionData: Uint8Array.from([1]),
            expandedSolution: {
              flags: 0,
              randomSlideDirection: 0,
              stepping: 0,
              randomSeed: 0xffffffff,
              moves: [{ when: 0, dir: 8 }],
            },
          },
        ],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP1-MS.dac",
        filebase: "CCLP1-MS.dac",
        mapfilename: "./data/CCLP1.dat",
        ruleset: "MS",
        levels: [
          {
            index: 0,
            number: 1,
            name: "Key Pyramid",
            author: "",
            password: "VVGF",
            timeLimitSeconds: 180,
            chipsRequired: 0,
            bestTimeTicks: 0,
            levelSize: 0,
            solutionSize: 0,
            levelHash: "0",
            gameplayHash: "0",
            hasSolution: false,
            sgflags: 0,
            unsolvable: null,
          },
        ],
      },
    ];

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, catalog);

    expect(plan.scenarios[0]?.request.randomSeed).toBe(0x7fffffff);
    expect(plan.scenarios[0]?.replay.randomSeed).toBe(0xffffffff);
  });

  it("applies MS series aliases from official tws names", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP1.dac.tws",
      label: "CCLP1.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP1.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP1-MS.dac",
        filebase: "CCLP1-MS.dac",
        mapfilename: "./data/CCLP1.dat",
        ruleset: "MS",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(loaded, catalog)?.filebase).toBe("CCLP1-MS.dac");
  });

  it("applies public CCLP5 aliases from official replay corpora", () => {
    const msLoaded: LoadedSolutionFile = {
      path: "/tmp/CCLP5.dac.tws",
      label: "CCLP5.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CCLP5.dac",
        entries: [],
      },
    };
    const lynxLoaded: LoadedSolutionFile = {
      path: "/tmp/CCLP5-lynx.dac.tws",
      label: "CCLP5-lynx.dac.tws",
      file: {
        ruleset: "Lynx",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CCLP5-lynx.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP5-MS.dac",
        filebase: "CCLP5-MS.dac",
        mapfilename: "./data/CCLP5.dat",
        ruleset: "MS",
        levels: [],
      },
      {
        name: "CCLP5-Lynx.dac",
        filebase: "CCLP5-Lynx.dac",
        mapfilename: "./data/CCLP5.dat",
        ruleset: "Lynx",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(msLoaded, catalog)?.filebase).toBe("CCLP5-MS.dac");
    expect(resolveReplaySeries(lynxLoaded, catalog)?.filebase).toBe("CCLP5-Lynx.dac");
  });

  it("applies canonical Lynx casing aliases for local replay corpora", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CCLP3-lynx.dac.tws",
      label: "CCLP3-lynx.dac.tws",
      file: {
        ruleset: "Lynx",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "CCLP3-lynx.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "CCLP3-Lynx.dac",
        filebase: "CCLP3-Lynx.dac",
        mapfilename: "./data/CCLP3.dat",
        ruleset: "Lynx",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(loaded, catalog)?.filebase).toBe("CCLP3-Lynx.dac");
    expect(isUnsupportedReplaySeries(loaded, catalog)).toBe(false);
  });

  it("marks unsupported CC1 MS replay corpora as unsupported for this repo", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/CC1.dac.tws",
      label: "CC1.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CHIPS.dac",
        entries: [],
      },
    };

    expect(isUnsupportedReplaySeries(loaded, [])).toBe(true);
  });

  it("resolves CC1 and public CHIPS replays directly when public_CHIPS.dac is in the catalog", () => {
    const cc1Loaded: LoadedSolutionFile = {
      path: "/tmp/CC1.dac.tws",
      label: "CC1.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CHIPS.dac",
        entries: [],
      },
    };
    const publicLoaded: LoadedSolutionFile = {
      path: "/tmp/public_CHIPS.dac.tws",
      label: "public_CHIPS.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CHIPS.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "public_CHIPS.dac",
        filebase: "public_CHIPS.dac",
        mapfilename: "./data/CHIPS.dat",
        ruleset: "MS",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(cc1Loaded, catalog)?.filebase).toBe("public_CHIPS.dac");
    expect(resolveReplaySeries(publicLoaded, catalog)?.filebase).toBe("public_CHIPS.dac");
    expect(isUnsupportedReplaySeries(cc1Loaded, catalog)).toBe(false);
    expect(isUnsupportedReplaySeries(publicLoaded, catalog)).toBe(false);
  });

  it("resolves CC1 and public CHIPS Lynx replays directly when a local Lynx catalog entry is present", () => {
    const cc1Loaded: LoadedSolutionFile = {
      path: "/tmp/CC1-lynx.dac.tws",
      label: "CC1-lynx.dac.tws",
      file: {
        ruleset: "Lynx",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CHIPS-lynx.dac",
        entries: [],
      },
    };
    const publicLoaded: LoadedSolutionFile = {
      path: "/tmp/public_CHIPS-lynx.dac.tws",
      label: "public_CHIPS-lynx.dac.tws",
      file: {
        ruleset: "Lynx",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CHIPS-lynx.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "public_CHIPS-lynx.dac",
        filebase: "public_CHIPS-lynx.dac",
        mapfilename: "./data/CHIPS.dat",
        ruleset: "Lynx",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(cc1Loaded, catalog)?.filebase).toBe("public_CHIPS-lynx.dac");
    expect(resolveReplaySeries(publicLoaded, catalog)?.filebase).toBe("public_CHIPS-lynx.dac");
    expect(isUnsupportedReplaySeries(cc1Loaded, catalog)).toBe(false);
    expect(isUnsupportedReplaySeries(publicLoaded, catalog)).toBe(false);
  });

  it("marks unresolved public replay corpora as unsupported until their dat files are added", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/public_CCZoneTT.dac.tws",
      label: "public_CCZoneTT.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CCZoneTT.dac",
        entries: [],
      },
    };

    expect(isUnsupportedReplaySeries(loaded, [])).toBe(true);
  });

  it("treats public CCZoneTT as supported when its local dac/dat pair is present", () => {
    const loaded: LoadedSolutionFile = {
      path: "/tmp/public_CCZoneTT.dac.tws",
      label: "public_CCZoneTT.dac.tws",
      file: {
        ruleset: "MS",
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: "public_CCZoneTT.dac",
        entries: [],
      },
    };
    const catalog: SeriesCatalogEntry[] = [
      {
        name: "public_CCZoneTT.dac",
        filebase: "public_CCZoneTT.dac",
        mapfilename: "./data/CCZoneTT.dat",
        ruleset: "MS",
        levels: [],
      },
    ];

    expect(resolveReplaySeries(loaded, catalog)?.filebase).toBe("public_CCZoneTT.dac");
    expect(isUnsupportedReplaySeries(loaded, catalog)).toBe(false);
  });
});
