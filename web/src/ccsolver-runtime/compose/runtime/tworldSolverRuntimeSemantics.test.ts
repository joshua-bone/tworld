import { describe, expect, it } from "vitest";
import {
  createMsInteractiveSession,
} from "@ruleset-ms/impl/engine";
import {
  createEmptyCells as createEmptyMsCells,
  createLevel as createMsLevel,
  createRequest as createMsRequest,
  pos as msPos,
} from "@ruleset-ms/impl/testSupport";
import {
  MS_DIRECTION,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import { createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import {
  createCell as createLynxCell,
  createLevel as createLynxLevel,
  createRequest as createLynxRequest,
} from "@ruleset-lynx/impl/testSupport";
import type { TworldSolverManualStartSource } from "./tworldSolverRuntimeSource";
import {
  isMsSolverActorTrapped,
  isMsSolverBeartrapOpen,
  isMsSolverBrownButtonHeld,
  msSolverBlockLifecycle,
} from "./msSolverRuntimeSemantics";
import {
  isLynxSolverActorContained,
  isLynxSolverActorTrapped,
  isLynxSolverBeartrapOpen,
  isLynxSolverBrownButtonHeld,
} from "./lynxSolverRuntimeSemantics";
import { placementForRuntimeElement } from "./tworldRuntimeProjectionSupport";

describe("MS solver trap semantics", () => {
  it("derives held buttons, open traps, and closed-trap control without render-only flags", () => {
    const cells = createEmptyMsCells();
    const chipPos = msPos(1, 1);
    const closedActorPos = msPos(2, 1);
    const buttonPos = msPos(3, 1);
    const openActorPos = msPos(4, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[chipPos]!.bottom.id = MS_TILE.Beartrap;
    cells[closedActorPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[closedActorPos]!.bottom.id = MS_TILE.Beartrap;
    cells[buttonPos]!.top.id = MS_TILE.Block_Static;
    cells[buttonPos]!.bottom.id = MS_TILE.Button_Brown;
    cells[openActorPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[openActorPos]!.bottom.id = MS_TILE.Beartrap;
    const session = createMsInteractiveSession(createMsRequest(), createMsLevel({
      cells,
      creaturePositions: [chipPos, closedActorPos, openActorPos],
      traps: [{ from: buttonPos, to: openActorPos }],
    }));

    expect(isMsSolverBrownButtonHeld(session, buttonPos)).toBe(true);
    expect(isMsSolverBeartrapOpen(session, openActorPos)).toBe(true);
    expect(session.state.engine.map.cells[openActorPos]?.bottom.state ?? 0).toBe(0);
    expect(isMsSolverActorTrapped(session, {
      pos: chipPos,
      moving: false,
      released: session.state.internal.chipReleased,
    })).toBe(true);
    const closedActor = session.state.internal.creatures.find((actor) => actor.pos === closedActorPos)!;
    expect(isMsSolverActorTrapped(session, {
      pos: closedActor.pos,
      z: closedActor.z,
      moving: closedActor.moving > 0,
      released: closedActor.released,
    })).toBe(true);
  });

  it("classifies a visible tracked block on a clone machine as contained", () => {
    const cells = createEmptyMsCells();
    const chipPos = msPos(1, 1);
    const clonerPos = msPos(2, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[clonerPos]!.top.id = MS_TILE.Block_Static;
    cells[clonerPos]!.bottom.id = MS_TILE.CloneMachine;
    const session = createMsInteractiveSession(createMsRequest(), createMsLevel({
      cells,
      creaturePositions: [chipPos, clonerPos],
    }));
    const block = session.state.internal.blocks[0]!;

    expect(msSolverBlockLifecycle(session, block)).toBe("contained");
    block.hidden = true;
    expect(msSolverBlockLifecycle(session, block)).toBe("destroyed");
  });
});

describe("Lynx solver trap semantics", () => {
  it("classifies a settled clone-machine source as contained", () => {
    const chipPos = 33;
    const clonerPos = 34;
    const session = createLynxInteractiveSession(createLynxRequest(), createLynxLevel([
      createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createLynxCell(
        clonerPos,
        msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east),
        MS_TILE.CloneMachine,
      ),
    ]));
    const source = session.actors.find((actor) => actor.pos === clonerPos)!;

    expect(isLynxSolverActorContained(session, source)).toBe(true);
    source.moving = 6;
    expect(isLynxSolverActorContained(session, source)).toBe(false);
    source.moving = 0;
    source.hidden = true;
    expect(isLynxSolverActorContained(session, source)).toBe(false);
  });

  it("classifies an unordered dormant block on a clone machine as contained", () => {
    const chipPos = 33;
    const clonerPos = 34;
    const session = createLynxInteractiveSession(createLynxRequest(), createLynxLevel([
      createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createLynxCell(clonerPos, MS_TILE.Block_Static, MS_TILE.CloneMachine),
    ], [chipPos]));
    const source = session.actors.find((actor) => actor.pos === clonerPos)!;

    expect(source.dormant).toBe(true);
    expect(isLynxSolverActorContained(session, source)).toBe(true);
  });

  it("requires a runtime actor to settle before it holds a brown button", () => {
    const chipPos = 33;
    const buttonPos = 34;
    const trapPos = 35;
    const session = createLynxInteractiveSession(createLynxRequest(), createLynxLevel([
      createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createLynxCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
      createLynxCell(trapPos, MS_TILE.Beartrap),
    ], undefined, { traps: [{ from: buttonPos, to: trapPos }] }));
    const holder = session.actors.find((actor) => actor.pos === buttonPos)!;

    expect(isLynxSolverBrownButtonHeld(session, buttonPos)).toBe(true);
    expect(isLynxSolverBeartrapOpen(session, trapPos)).toBe(true);
    holder.moving = 6;
    expect(isLynxSolverBrownButtonHeld(session, buttonPos)).toBe(false);
    expect(isLynxSolverBeartrapOpen(session, trapPos)).toBe(false);
  });

  it("marks stationary Chip and actors on closed traps, but not held-open traps", () => {
    const chipPos = 33;
    const actorPos = 34;
    const buttonPos = 35;
    const openTrapPos = 36;
    const session = createLynxInteractiveSession(createLynxRequest(), createLynxLevel([
      createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Beartrap),
      createLynxCell(actorPos, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east), MS_TILE.Beartrap),
      createLynxCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
      createLynxCell(openTrapPos, MS_TILE.Beartrap),
    ], undefined, { traps: [{ from: buttonPos, to: openTrapPos }] }));

    expect(isLynxSolverActorTrapped(session, {
      pos: session.chipPos,
      z: session.chipZ,
      moving: session.chipMoving,
    })).toBe(true);
    const trappedActor = session.actors.find((actor) => actor.pos === actorPos)!;
    expect(isLynxSolverActorTrapped(session, trappedActor)).toBe(true);
    expect(isLynxSolverActorTrapped(session, {
      pos: openTrapPos,
      moving: 0,
    })).toBe(false);
  });
});

describe.each([
  ["ms", "cc1:switchwall-open", "cc1:switchwall-closed"],
  ["lynx", "cc1:switchwall-closed", "cc1:switchwall-open"],
] as const)("%s mutable device identity", (_target, initialType, runtimeType) => {
  it("retains the static placement across open/closed variants", () => {
    const placementId = "placement:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const source = {
      levelFacts: {
        facts: {
          payload: {
            placements: [{
              placementId,
              descriptor: {
                semanticType: initialType,
                stratum: "terrain",
                coordinate: { x: 2, y: 3, z: 0 },
              },
            }],
          },
        },
      },
    } as unknown as TworldSolverManualStartSource;

    expect(placementForRuntimeElement(
      source,
      { x: 2, y: 3, z: 0 },
      runtimeType,
      "terrain",
      new Set(),
    )?.placementId).toBe(placementId);
  });
});
