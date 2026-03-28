import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import { decodeDatUrlPayload, encodeDatUrlPayload } from "@player-web/impl/urlDatCodec";
import { buildUrlLaunchHref, resolveUrlLaunchSelection, resetUrlLaunchCachesForTest } from "@player-web/impl/urlLaunch";
import { importedSeriesFile } from "@player-web/impl/importedDatIdentity";
import {
  createFetchResponse,
  createJsonResponse,
  createUrlLaunchDatBytes,
  createUrlLaunchServices,
} from "@player-web/impl/urlLaunchTestSupport";

afterEach(() => {
  vi.unstubAllGlobals();
  resetUrlLaunchCachesForTest();
});

describe("resolveUrlLaunchSelection", () => {
  it("imports gzip+base64url DAT payloads into the requested slot and defaults to Lynx", async () => {
    const services = createUrlLaunchServices();
    const payload = await encodeDatUrlPayload(createUrlLaunchDatBytes());

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL(`https://example.test/?level=3&slot=SharedPack.dat#dat=${payload}`),
    );

    expect(result).toEqual({
      message: null,
      overrideApplied: true,
      selection: {
        seriesFile: importedSeriesFile("SharedPack.dat", "Lynx"),
        levelNumber: 3,
      },
    });
    expect(services.__savedSelections).toEqual([
      {
        seriesFile: importedSeriesFile("SharedPack.dat", "Lynx"),
        levelNumber: 3,
      },
    ]);
  });

  it("reuses an existing imported slot when the URL DAT hash already exists locally", async () => {
    const datBytes = createUrlLaunchDatBytes();
    const payload = await encodeDatUrlPayload(datBytes);
    const services = createUrlLaunchServices({
      importedDatFiles: [
        {
          filename: "Existing.dat",
          datBytes,
        },
      ],
    });

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL(`https://example.test/?level=2&ruleset=MS#dat=${payload}`),
    );

    expect(result.selection).toEqual({
      seriesFile: importedSeriesFile("Existing.dat", "MS"),
      levelNumber: 2,
    });
  });

  it("downloads gb pack links as DAT bytes and opens the requested ruleset and level", async () => {
    const services = createUrlLaunchServices();
    const datBytes = createUrlLaunchDatBytes();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://bitbusters.club/gliderbot/sets/cc1/") {
        return {
          ok: true,
          status: 200,
          text: async () => '<a href="CustomPack.dat">CustomPack.dat</a>',
        } as Response;
      }
      expect(String(input)).toBe("https://bitbusters.club/gliderbot/sets/cc1/CustomPack.dat");
      return createFetchResponse(datBytes);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=gb:cc1/custompack&level=4&ruleset=MS"),
    );

    expect(result).toEqual({
      message: null,
      overrideApplied: true,
      selection: {
        seriesFile: importedSeriesFile("CustomPack.dat", "MS"),
        levelNumber: 4,
      },
    });
    expect(services.__imports).toEqual([
      {
        filename: "CustomPack.dat",
        datBytes,
      },
    ]);
  });

  it("canonicalizes gb pack paths before downloading", async () => {
    const services = createUrlLaunchServices();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://bitbusters.club/gliderbot/sets/cc1/") {
        return {
          ok: true,
          status: 200,
          text: async () => '<a href="CustomPack.dat">CustomPack.dat</a>',
        } as Response;
      }
      expect(String(input)).toBe("https://bitbusters.club/gliderbot/sets/cc1/CustomPack.dat");
      return createFetchResponse(createUrlLaunchDatBytes());
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=gb:cc1/./foo/../custompack/&ruleset=Lynx"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(services.__imports[0]?.filename).toBe("CustomPack.dat");
  });

  it("reuses an existing imported pack when the downloaded gb bytes already match", async () => {
    const datBytes = createUrlLaunchDatBytes();
    const services = createUrlLaunchServices({
      importedDatFiles: [
        {
          filename: "CustomPack.dat",
          datBytes,
        },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://bitbusters.club/gliderbot/sets/cc1/") {
        return {
          ok: true,
          status: 200,
          text: async () => '<a href="CustomPack.dat">CustomPack.dat</a>',
        } as Response;
      }
      return createFetchResponse(datBytes);
    }));

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=gb:cc1/custompack&ruleset=Lynx"),
    );

    expect(result.selection).toEqual({
      seriesFile: importedSeriesFile("CustomPack.dat", "Lynx"),
      levelNumber: 1,
    });
    expect(services.__imports).toEqual([]);
  });

  it("reuses a built-in pack when the downloaded gb bytes match local content", async () => {
    const services = createUrlLaunchServices();
    const datBytes = new Uint8Array(await readFile(new URL("../../../../data/JBLP1.dat", import.meta.url)));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://bitbusters.club/gliderbot/sets/cc1/") {
        return {
          ok: true,
          status: 200,
          text: async () => '<a href="JBLP1.dat">JBLP1.dat</a>',
        } as Response;
      }
      if (url === "https://bitbusters.club/gliderbot/sets/cc1/JBLP1.dat" || url.includes("JBLP1.dat")) {
        return createFetchResponse(datBytes);
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=gb:cc1/jblp1&level=2&ruleset=MS"),
    );

    expect(result.selection).toEqual({
      seriesFile: "JBLP1-MS.dac",
      levelNumber: 2,
    });
    expect(services.__imports).toEqual([]);
  });

  it("downloads bb pack links from the Bit Busters API and records their source metadata", async () => {
    const services = createUrlLaunchServices();
    const datBytes = createUrlLaunchDatBytes();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.bitbusters.club/custom-packs/cc1/577") {
        return createJsonResponse([
          {
            id: 577,
            pack_name: "custompack",
            display_name: "Custom Pack",
            game: "CC1",
            file_name: "CustomPack.dat",
            download_url: "https://downloads.example.test/CustomPack.dat",
          },
        ]);
      }
      if (url === "https://downloads.example.test/CustomPack.dat") {
        return createFetchResponse(datBytes);
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=bb:cc1/577&level=4&ruleset=MS"),
    );

    expect(result).toEqual({
      message: null,
      overrideApplied: true,
      selection: {
        seriesFile: importedSeriesFile("CustomPack.dat", "MS"),
        levelNumber: 4,
      },
    });
    expect(services.__imports).toEqual([
      {
        filename: "CustomPack.dat",
        datBytes,
        source: {
          kind: "bitbusters-custom-pack",
          game: "CC1",
          packId: 577,
        },
      },
    ]);
  });

  it("rejects unsupported CC2 bb pack links", async () => {
    const services = createUrlLaunchServices();

    const result = await resolveUrlLaunchSelection(
      services,
      { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 },
      new URL("https://example.test/?pack=bb:cc2/669"),
    );

    expect(result).toEqual({
      message: "CC2 custom packs are ZIP-based and not yet supported.",
      overrideApplied: false,
      selection: {
        seriesFile: "CCLP1-Lynx.dac",
        levelNumber: 1,
      },
    });
  });

  it("resolves built-in short links by set token and ruleset", async () => {
    const services = createUrlLaunchServices();

    const result = await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?set=CCLP1&level=7&ruleset=MS"),
    );

    expect(result.selection).toEqual({
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 7,
    });
  });

  it("falls back to the saved selection when a set token is unknown", async () => {
    const services = createUrlLaunchServices();
    const result = await resolveUrlLaunchSelection(
      services,
      { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 },
      new URL("https://example.test/?set=missing-pack"),
    );

    expect(result.overrideApplied).toBe(false);
    expect(result.selection).toEqual({ seriesFile: "CCLP1-Lynx.dac", levelNumber: 1 });
    expect(result.message).toBe("Set missing-pack was not found.");
  });
});

describe("buildUrlLaunchHref", () => {
  it("builds canonical built-in set links", async () => {
    const href = await buildUrlLaunchHref({
      baseUrl: "/tworld/",
      importedDatFiles: [],
      levelNumber: 3,
      origin: "https://example.test",
      ruleset: "MS",
      seriesFile: "CCLP1-MS.dac",
    });

    expect(href).toBe("https://example.test/tworld/?level=3&ruleset=MS&set=CCLP1");
  });

  it("embeds imported DAT payloads for uploaded sets", async () => {
    const datBytes = createUrlLaunchDatBytes();
    const href = await buildUrlLaunchHref({
      baseUrl: "/tworld/",
      importedDatFiles: [{ filename: "SharedPack.dat", datBytes }],
      levelNumber: 4,
      origin: "https://example.test",
      ruleset: "Lynx",
      seriesFile: importedSeriesFile("SharedPack.dat", "Lynx"),
    });

    const url = new URL(href);
    expect(url.origin).toBe("https://example.test");
    expect(url.pathname).toBe("/tworld/");
    expect(url.searchParams.get("level")).toBe("4");
    expect(url.searchParams.get("ruleset")).toBe("Lynx");
    expect(url.searchParams.get("slot")).toBe("SharedPack.dat");
    expect(url.hash.startsWith("#dat=")).toBe(true);
    await expect(decodeDatUrlPayload(url.hash.slice("#dat=".length))).resolves.toEqual(datBytes);
  });

  it("builds canonical bb links for Bit Busters API-backed imports", async () => {
    const datBytes = createUrlLaunchDatBytes();
    const href = await buildUrlLaunchHref({
      baseUrl: "/tworld/",
      importedDatFiles: [
        {
          filename: "CustomPack.dat",
          datBytes,
          source: {
            kind: "bitbusters-custom-pack",
            game: "CC1",
            packId: 577,
          },
        },
      ],
      levelNumber: 4,
      origin: "https://example.test",
      ruleset: "Lynx",
      seriesFile: importedSeriesFile("CustomPack.dat", "Lynx"),
    });

    expect(href).toBe("https://example.test/tworld/?level=4&ruleset=Lynx&pack=bb%3Acc1%2F577");
  });
});
