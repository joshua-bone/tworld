import type { SeriesCatalogEntry } from "@content/api/series";
import {
  listBrowserSeriesCatalogFilesFromLoaders,
  loadBrowserSeriesCatalogEntriesFromLoaders,
  type LoadBrowserSeriesCatalogEntriesOptions,
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

interface PendingCatalogRequest {
  reject: (error: unknown) => void;
  resolve: (entries: SeriesCatalogEntry[]) => void;
}

let browserSeriesCatalogWorker: Worker | null = null;
let nextCatalogRequestId = 1;
const pendingCatalogRequests = new Map<number, PendingCatalogRequest>();

function rejectPendingCatalogRequests(error: unknown): void {
  for (const { reject } of pendingCatalogRequests.values()) {
    reject(error);
  }
  pendingCatalogRequests.clear();
}

function getBrowserSeriesCatalogWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    return null;
  }

  if (browserSeriesCatalogWorker) {
    return browserSeriesCatalogWorker;
  }

  const worker = new Worker(new URL("./browserSeriesCatalog.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<BrowserSeriesCatalogWorkerResponse>) => {
    const { id, entries, error } = event.data;
    const pending = pendingCatalogRequests.get(id);
    if (!pending) {
      return;
    }

    pendingCatalogRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
      return;
    }

    pending.resolve(entries ?? []);
  };

  worker.onerror = (event) => {
    rejectPendingCatalogRequests(event.error ?? new Error(event.message));
    worker.terminate();
    if (browserSeriesCatalogWorker === worker) {
      browserSeriesCatalogWorker = null;
    }
  };

  browserSeriesCatalogWorker = worker;
  return worker;
}

export function listBrowserSeriesCatalogFiles(): string[] {
  return listBrowserSeriesCatalogFilesFromLoaders(seriesConfigs);
}

export async function loadBrowserSeriesCatalogEntries(
  options: LoadBrowserSeriesCatalogEntriesOptions = {},
): Promise<SeriesCatalogEntry[]> {
  const targets = options.seriesFiles ?? listBrowserSeriesCatalogFiles();
  const worker = getBrowserSeriesCatalogWorker();
  if (!worker) {
    return loadBrowserSeriesCatalogEntriesFromLoaders(seriesConfigs, dataFiles, {
      ...options,
      seriesFiles: targets,
    });
  }

  const requestId = nextCatalogRequestId;
  nextCatalogRequestId += 1;

  return new Promise<SeriesCatalogEntry[]>((resolve, reject) => {
    pendingCatalogRequests.set(requestId, { resolve, reject });

    try {
      const request: BrowserSeriesCatalogWorkerRequest = {
        id: requestId,
        ignoreSeriesLoadErrors: options.ignoreSeriesLoadErrors,
        seriesFiles: targets,
      };
      worker.postMessage(request);
    } catch (error: unknown) {
      pendingCatalogRequests.delete(requestId);
      reject(error);
    }
  });
}
