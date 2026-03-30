import { describe, expect, it } from "vitest";
import {
  msRulesetCatalog,
} from "@ruleset-ms/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { lookupTileBehaviorPhase } from "@game-core/api/ruleset";

describe("MS ruleset catalog", () => {
  it("covers every MS tile id", () => {
    const tileIds = Object.values(MS_TILE).filter((value) => typeof value === "number") as number[];

    expect(msRulesetCatalog.name).toBe("ms");
    expect(msRulesetCatalog.tiles.size).toBe(tileIds.length);
    expect(msRulesetCatalog.actors.size).toBeGreaterThan(0);
    expect(msRulesetCatalog.getTile(MS_TILE.Teleport)?.code).toBe("ms:teleport");
    expect(msRulesetCatalog.getTile(MS_TILE.Button_Blue)?.name).toBe("Button Blue");
    expect(msRulesetCatalog.getActor(MS_TILE.Chip)?.code).toBe("ms:chip");
    expect(lookupTileBehaviorPhase(msRulesetCatalog.getTileBehavior(MS_TILE.Teleport)!, "begin-enter")).toBeTypeOf(
      "function",
    );
    expect(lookupTileBehaviorPhase(msRulesetCatalog.getTileBehavior(MS_TILE.Cloud)!, "complete-exit")).toBeTypeOf(
      "function",
    );
    expect(lookupTileBehaviorPhase(msRulesetCatalog.getTileBehavior(MS_TILE.Socket)!, "probe-support")).toBeTypeOf(
      "function",
    );
    expect(lookupTileBehaviorPhase(msRulesetCatalog.getTileBehavior(MS_TILE.Empty)!, "begin-enter")).toBeTypeOf(
      "function",
    );
    expect(msRulesetCatalog.getActorBehavior(MS_TILE.Chip)?.phases).toMatchObject({
      "held-floor": expect.any(Function),
      "trap-release": expect.any(Function),
      "cloner-entry": expect.any(Function),
      "cloner-clone": expect.any(Function),
    });
  });
});
