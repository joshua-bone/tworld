import type { BitbustersCustomPackGame } from "@level-catalog/ports/ImportedDatCatalogStore";

const BITBUSTERS_CUSTOM_PACKS_API_BASE_URL = "https://api.bitbusters.club/custom-packs";

export type BitbustersCustomPackGameSlug = "cc1" | "cc2";

export interface BitbustersCustomPackRecord {
  id: number;
  packName: string;
  displayName: string | null;
  game: BitbustersCustomPackGame;
  fileName: string;
  downloadUrl: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseBitbustersCustomPackRecord(value: unknown): BitbustersCustomPackRecord | null {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.id) ||
    typeof value.pack_name !== "string" ||
    typeof value.file_name !== "string" ||
    (value.display_name !== null && value.display_name !== undefined && typeof value.display_name !== "string") ||
    (value.download_url !== null && value.download_url !== undefined && typeof value.download_url !== "string")
  ) {
    return null;
  }

  let game: BitbustersCustomPackGame;
  if (value.game === "CC1") {
    game = "CC1";
  } else if (value.game === "CC2") {
    game = "CC2";
  } else {
    return null;
  }

  return {
    id: Number(value.id),
    packName: value.pack_name,
    displayName: typeof value.display_name === "string" ? value.display_name : null,
    game,
    fileName: value.file_name,
    downloadUrl: typeof value.download_url === "string" ? value.download_url : null,
  };
}

export function bitbustersCustomPackGameSlug(game: BitbustersCustomPackGame): BitbustersCustomPackGameSlug {
  return game === "CC1" ? "cc1" : "cc2";
}

export async function fetchBitbustersCustomPack(
  gameSlug: BitbustersCustomPackGameSlug,
  packId: number,
): Promise<BitbustersCustomPackRecord | null> {
  const url = `${BITBUSTERS_CUSTOM_PACKS_API_BASE_URL}/${gameSlug}/${packId}`;
  const response = await fetch(url);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error(`Unexpected response from ${url}.`);
  }

  const record = payload.length === 1 ? parseBitbustersCustomPackRecord(payload[0]) : null;
  if (!record) {
    return null;
  }

  return record;
}
