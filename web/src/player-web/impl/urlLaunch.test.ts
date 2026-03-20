import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import { decodeDatUrlPayload, encodeDatUrlPayload } from "@player-web/impl/urlDatCodec";
import { buildUrlLaunchHref, resolveUrlLaunchSelection } from "@player-web/impl/urlLaunch";
import { importedSeriesFile } from "@player-web/impl/importedDatIdentity";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { BrowserProfileStore } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";

function createDatBytes(): Uint8Array {
  return Uint8Array.from([
    0xac, 0xaa, 0x02, 0x00, 0x01, 0x00,
    0x11, 0x00,
    0x01, 0x00, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01,
    0x01, 0x00, 0x00,
    0x03, 0x00, 0x03, 0x01, 0x41, 0x04, 0x06, 0x04, 0xd8, 0xdb, 0xda, 0xdd,
  ]);
}

function createServices(overrides?: {
  importedDatFiles?: PersistedImportedDatFile[];
}): Pick<BrowserAppServices, "importDatBytes" | "profileStore" | "selectionStore"> & {
  __imports: { datBytes: Uint8Array; filename: string }[];
  __savedSelections: { seriesFile: string; levelNumber: number }[];
} {
  const importedDatFiles = overrides?.importedDatFiles ?? [];
  const imports: { datBytes: Uint8Array; filename: string }[] = [];
  const savedSelections: { seriesFile: string; levelNumber: number }[] = [];

  const profileStore = {
    async listImportedDatFiles() {
      return importedDatFiles;
    },
  } as BrowserProfileStore;

  const selectionStore = {
    async saveSelection(selection) {
      savedSelections.push(selection);
    },
  } as PlayableSelectionStore;

  return {
    async importDatBytes(filename, datBytes) {
      imports.push({
        filename,
        datBytes: new Uint8Array(datBytes),
      });
      importedDatFiles.push({
        filename,
        datBytes: new Uint8Array(datBytes),
      });
      return [];
    },
    profileStore: profileStore as BrowserAppServices["profileStore"],
    selectionStore: selectionStore as BrowserAppServices["selectionStore"],
    get __imports() {
      return imports;
    },
    get __savedSelections() {
      return savedSelections;
    },
  };
}

function createFetchResponse(bytes: Uint8Array, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveUrlLaunchSelection", () => {
  it("imports gzip+base64url DAT payloads into the requested slot and defaults to Lynx", async () => {
    const services = createServices();
    const payload = await encodeDatUrlPayload(createDatBytes());

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
    const datBytes = createDatBytes();
    const payload = await encodeDatUrlPayload(datBytes);
    const services = createServices({
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
    const services = createServices();
    const datBytes = createDatBytes();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://bitbusters.club/gliderbot/sets/cc1/custompack.dat");
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
        seriesFile: importedSeriesFile("custompack.dat", "MS"),
        levelNumber: 4,
      },
    });
    expect(services.__imports).toEqual([
      {
        filename: "custompack.dat",
        datBytes,
      },
    ]);
  });

  it("canonicalizes gb pack paths before downloading", async () => {
    const services = createServices();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://bitbusters.club/gliderbot/sets/cc1/custompack.dat");
      return createFetchResponse(createDatBytes());
    });
    vi.stubGlobal("fetch", fetchMock);

    await resolveUrlLaunchSelection(
      services,
      null,
      new URL("https://example.test/?pack=gb:cc1/./foo/../custompack/&ruleset=Lynx"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(services.__imports[0]?.filename).toBe("custompack.dat");
  });

  it("reuses an existing imported pack when the downloaded gb bytes already match", async () => {
    const datBytes = createDatBytes();
    const services = createServices({
      importedDatFiles: [
        {
          filename: "CustomPack.dat",
          datBytes,
        },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(async () => createFetchResponse(datBytes)));

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
    const services = createServices();
    const datBytes = new Uint8Array(await readFile(new URL("../../../../data/JBLP1.dat", import.meta.url)));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://bitbusters.club/gliderbot/sets/cc1/jblp1.dat" || url.includes("JBLP1.dat")) {
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

  it("resolves built-in short links by set token and ruleset", async () => {
    const services = createServices();

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
    const services = createServices();
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
    const datBytes = createDatBytes();
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
});
