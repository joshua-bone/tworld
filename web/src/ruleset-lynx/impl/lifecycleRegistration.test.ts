import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  getLynxRegisteredActorLifecycleRegistry,
  lookupLynxActorLifecyclePhase,
} from "@ruleset-lynx/impl/actorLifecycleRegistration";
import {
  getLynxRegisteredTileLifecycleRegistry,
  lookupLynxTileLifecyclePhase,
} from "@ruleset-lynx/impl/tileLifecycleRegistration";

describe("Lynx lifecycle registration", () => {
  it("registers tile lifecycle handlers through the tile registry", () => {
    expect(getLynxRegisteredTileLifecycleRegistry().behaviors.size).toBeGreaterThan(0);
    expect(lookupLynxTileLifecyclePhase(MS_TILE.Exit, "begin-enter")).toBeTypeOf("function");
    expect(lookupLynxTileLifecyclePhase(MS_TILE.Cloud, "complete-exit")).toBeTypeOf("function");
    expect(lookupLynxTileLifecyclePhase(MS_TILE.Beartrap, "probe-exit")).toBeTypeOf("function");
    expect(lookupLynxTileLifecyclePhase(MS_TILE.CloneMachine, "probe-exit")).toBeTypeOf("function");
    expect(lookupLynxTileLifecyclePhase(MS_TILE.Socket, "probe-support")).toBeTypeOf("function");
    expect(lookupLynxTileLifecyclePhase(msCreatureTile(MS_TILE.Ball, MS_DIRECTION.north), "begin-enter")).toBeNull();
  });

  it("registers actor lifecycle handlers through the actor registry", () => {
    expect(getLynxRegisteredActorLifecycleRegistry().behaviors.size).toBeGreaterThan(0);
    expect(lookupLynxActorLifecyclePhase(MS_TILE.BowlingBall, "blocked-move")).toBeTypeOf("function");
    expect(lookupLynxActorLifecyclePhase(MS_TILE.BowlingBall, "collision")).toBeTypeOf("function");
    expect(lookupLynxActorLifecyclePhase(MS_TILE.BowlingBall, "arrival")).toBeTypeOf("function");
    expect(lookupLynxActorLifecyclePhase(MS_TILE.BowlingBall, "held-floor")).toBeTypeOf("function");
    expect(lookupLynxActorLifecyclePhase(MS_TILE.BowlingBall, "support")).toBeTypeOf("function");
    expect(lookupLynxActorLifecyclePhase(msCreatureTile(MS_TILE.Glider, MS_DIRECTION.east), "trap-release")).toBeTypeOf(
      "function",
    );
    expect(lookupLynxActorLifecyclePhase(MS_TILE.Teleport, "held-floor")).toBeNull();
  });
});
