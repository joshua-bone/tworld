import type { SeriesCatalogEntry } from "@content/api/series";

export interface BrowserSeriesCatalogWorkerRequest {
  id: number;
  ignoreSeriesLoadErrors?: boolean;
  seriesFiles: string[];
}

export interface BrowserSeriesCatalogWorkerResponse {
  id: number;
  entries?: SeriesCatalogEntry[];
  error?: string;
}
