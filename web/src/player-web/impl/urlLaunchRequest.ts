import type { BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";

export interface ParsedUrlLaunchRequest {
  datPayload: string | null;
  packToken: string | null;
  setToken: string | null;
  levelNumber: number;
  ruleset: BrowserPreferredRuleset;
  slotName: string | null;
}

function parseLevelNumber(value: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseRuleset(value: string | null): BrowserPreferredRuleset {
  return value === "MS" ? "MS" : "Lynx";
}

export function parseUrlLaunchRequest(location: Pick<Location, "hash" | "search">): ParsedUrlLaunchRequest | null {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  const datPayload = hashParams.get("dat") ?? searchParams.get("dat") ?? searchParams.get("levelset");
  const packToken = searchParams.get("pack") ?? hashParams.get("pack");
  const setToken = searchParams.get("set") ?? hashParams.get("set");

  if (!datPayload && !packToken && !setToken) {
    return null;
  }

  return {
    datPayload,
    packToken,
    setToken,
    levelNumber: parseLevelNumber(searchParams.get("level") ?? hashParams.get("level")),
    ruleset: parseRuleset(searchParams.get("ruleset") ?? hashParams.get("ruleset")),
    slotName: searchParams.get("slot") ?? hashParams.get("slot") ?? searchParams.get("name") ?? hashParams.get("name"),
  };
}
