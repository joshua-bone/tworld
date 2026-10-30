import { afterEach, describe, expect, it, vi } from "vitest";
import { serializeSolutionFile } from "@content/api/solution-file";
import type { SeriesCatalogEntry } from "@content/api/series";
import { resolveUrlReplayLaunch } from "@player-web/impl/urlReplayLaunch";
import { createFetchResponse } from "@player-web/impl/urlLaunchTestSupport";

const selection = { seriesFile: "Jacques-MS.dac", levelNumber: 937 };
const resolution = { selection, message: null, overrideApplied: true };
const catalog = [{
  filebase: selection.seriesFile, ruleset: "MS",
  levels: [{ number: 937, name: "The Bomb Squad", password: "ABCD" }],
}] as SeriesCatalogEntry[];
const payload = { flags: 0, randomSlideDirection: 1, stepping: 2, randomSeed: 42, moves: [{ when: 0, dir: 8 }] };
function tws(ruleset: "MS" | "Lynx" = "MS", password = "ABCD", levelNumber = 937) {
  return serializeSolutionFile({ ruleset, flags: 0, extraHeader: new Uint8Array(), setName: "Jacques-MS.dac", entries: [
    { levelNumber, password, bestTimeTicks: 4, solutionData: null, expandedSolution: payload },
  ] });
}
function location(replay = "dev/solutions/jacques/replays/937.tws") {
  return new URL(`https://example.test/tworld/mobile?pack=gb:cc1/Jacques.dat&level=937&ruleset=MS&replay=${encodeURIComponent(replay)}`);
}
const options = { baseUrl: "/tworld/", location: location() };
afterEach(() => vi.unstubAllGlobals());

describe("resolveUrlReplayLaunch", () => {
  it("loads a full native TWS relative to the app base and preserves its playback seed and stepping", async () => {
    const fetchMock = vi.fn(async () => createFetchResponse(tws()));
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveUrlReplayLaunch(resolution, catalog, options);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/tworld/dev/solutions/jacques/replays/937.tws", expect.objectContaining({ redirect: "error" }));
    expect(result.message).toBeNull();
    expect(result.replay).toMatchObject({ ...selection, replayName: "937.tws", launch: { kind: "legacy", replay: payload } });
  });

  it.each([
    ["wrong ruleset", () => tws("Lynx"), /Lynx.*MS/],
    ["wrong password", () => tws("MS", "WXYZ"), /does not match level 937/],
    ["wrong level", () => tws("MS", "ABCD", 938), /does not match level 937/],
    ["malformed file", () => new Uint8Array([1, 2, 3]), /replay/i],
  ] as const)("rejects %s before launching", async (_label, bytes, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => createFetchResponse(bytes())));
    const result = await resolveUrlReplayLaunch(resolution, catalog, options);
    expect(result.replay).toBeNull();
    expect(result.message).toMatch(message);
  });

  it("reports download failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createFetchResponse(new Uint8Array(), false, 404)));
    expect((await resolveUrlReplayLaunch(resolution, catalog, options)).message).toMatch(/404/);
  });

  it("rejects other origins without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolveUrlReplayLaunch(resolution, catalog, { ...options, location: location("https://other.test/replay.tws") });
    expect(result.message).toMatch(/same origin/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never attaches a replay to a fallback or missing selection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await resolveUrlReplayLaunch({ ...resolution, overrideApplied: false }, catalog, options)).replay).toBeNull();
    expect((await resolveUrlReplayLaunch(resolution, [], options)).message).toMatch(/937.*not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves ordinary level links unchanged", async () => {
    expect(await resolveUrlReplayLaunch(resolution, catalog, { ...options, location: new URL("https://example.test/?set=Jacques") })).toEqual({ replay: null, message: null });
  });
});
