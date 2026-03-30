import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  getMsRegisteredActorLifecycleRegistry,
  lookupMsActorLifecyclePhase,
} from "@ruleset-ms/impl/actorLifecycleRegistration";
import {
  getMsRegisteredTileLifecycleRegistry,
  lookupMsTileLifecyclePhase,
} from "@ruleset-ms/impl/tileLifecycleRegistration";

describe("MS lifecycle registration", () => {
  it("registers tile lifecycle handlers through the tile registry", () => {
    expect(getMsRegisteredTileLifecycleRegistry().behaviors.size).toBeGreaterThan(0);
    expect(lookupMsTileLifecyclePhase(MS_TILE.Teleport, "begin-enter")).toBeTypeOf("function");
    expect(lookupMsTileLifecyclePhase(MS_TILE.Cloud, "complete-exit")).toBeTypeOf("function");
    expect(lookupMsTileLifecyclePhase(MS_TILE.Beartrap, "probe-exit")).toBeTypeOf("function");
    expect(lookupMsTileLifecyclePhase(MS_TILE.CloneMachine, "probe-exit")).toBeNull();
    expect(lookupMsTileLifecyclePhase(MS_TILE.Socket, "probe-support")).toBeTypeOf("function");
    expect(lookupMsTileLifecyclePhase(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.east), "begin-enter")).toBeNull();
  });

  it("registers actor lifecycle handlers through the actor registry", () => {
    expect(getMsRegisteredActorLifecycleRegistry().behaviors.size).toBeGreaterThan(0);
    expect(lookupMsActorLifecyclePhase(MS_TILE.BowlingBall, "blocked-move")).toBeTypeOf("function");
    expect(lookupMsActorLifecyclePhase(MS_TILE.BowlingBall, "collision")).toBeTypeOf("function");
    expect(lookupMsActorLifecyclePhase(MS_TILE.BowlingBall, "arrival")).toBeTypeOf("function");
    expect(lookupMsActorLifecyclePhase(MS_TILE.BowlingBall, "held-floor")).toBeTypeOf("function");
    expect(lookupMsActorLifecyclePhase(MS_TILE.BowlingBall, "support")).toBeTypeOf("function");
    expect(lookupMsActorLifecyclePhase(msCreatureTile(MS_TILE.Glider, MS_DIRECTION.east), "trap-release")).toBeTypeOf(
      "function",
    );
    expect(lookupMsActorLifecyclePhase(MS_TILE.Teleport, "held-floor")).toBeNull();
  });
});
