/// <reference lib="webworker" />

import {
  loadBrowserSeriesCatalogEntriesFromLoaders,
  type BrowserSeriesLoaderMap,
} from "@level-catalog/impl/browserSeriesCatalogEntries.shared";
import type {
  BrowserSeriesCatalogWorkerRequest,
  BrowserSeriesCatalogWorkerResponse,
} from "@level-catalog/impl/browserSeriesCatalog.worker.protocol";

const seriesConfigs = import.meta.glob("@sets/*.dac", {
  import: "default",
  query: "?raw",
}) as BrowserSeriesLoaderMap<string>;

const dataFiles = import.meta.glob(["@data/*.dat", "!@data/CHIPS.dat"], {
  import: "default",
  query: "?url",
}) as BrowserSeriesLoaderMap<string>;

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = async (event: MessageEvent<BrowserSeriesCatalogWorkerRequest>) => {
  const { id, seriesFiles } = event.data;

  try {
    const entries = await loadBrowserSeriesCatalogEntriesFromLoaders(seriesConfigs, dataFiles, seriesFiles);
    const response: BrowserSeriesCatalogWorkerResponse = { id, entries };
    workerScope.postMessage(response);
  } catch (error: unknown) {
    const response: BrowserSeriesCatalogWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    workerScope.postMessage(response);
  }
};

export {};
