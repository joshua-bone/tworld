import { describe, expect, it } from "vitest";
import {
  lynxRulesetCatalog,
} from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("Lynx ruleset catalog", () => {
  it("covers every shared tile id", () => {
    const tileIds = Object.values(MS_TILE).filter((value) => typeof value === "number") as number[];

    expect(lynxRulesetCatalog.name).toBe("lynx");
    expect(lynxRulesetCatalog.tiles.size).toBe(tileIds.length);
    expect(lynxRulesetCatalog.actors.size).toBeGreaterThan(0);
    expect(lynxRulesetCatalog.getTile(MS_TILE.Teleport)?.code).toBe("lynx:teleport");
    expect(lynxRulesetCatalog.getTile(MS_TILE.Button_Blue)?.name).toBe("Button Blue");
    expect(lynxRulesetCatalog.getActor(MS_TILE.Chip)?.code).toBe("lynx:chip");
  });
});
