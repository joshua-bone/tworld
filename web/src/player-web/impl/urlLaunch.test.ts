import { describe, expect, it } from "vitest";
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
  __savedSelections: { seriesFile: string; levelNumber: number }[];
} {
  const importedDatFiles = overrides?.importedDatFiles ?? [];
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
      importedDatFiles.push({
        filename,
        datBytes: new Uint8Array(datBytes),
      });
      return [];
    },
    profileStore: profileStore as BrowserAppServices["profileStore"],
    selectionStore: selectionStore as BrowserAppServices["selectionStore"],
    get __savedSelections() {
      return savedSelections;
    },
  };
}

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
