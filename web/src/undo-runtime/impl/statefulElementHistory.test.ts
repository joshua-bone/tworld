import { describe, expect, it } from "vitest";
import { encodeRuntimeInputCode, GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import {
  createCell as createLynxCell,
  createLevel as createLynxLevel,
  createRequest as createLynxRequest,
  lynxPortableItems,
  lynxRuntimeStateForTest,
} from "@ruleset-lynx/impl/testSupport";
import {
  reconcileLynxPortableToolProjection,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import { advanceLynxInteractiveSession, createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import {
  createEmptyCells as createMsEmptyCells,
  createLevel as createMsLevel,
  createRequest as createMsRequest,
  pos as msPos,
} from "@ruleset-ms/impl/testSupport";
import { reconcileMsPortableToolProjection } from "@ruleset-ms/impl/portableItems";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { createLynxUndoHistory, recordLynxUndoTick, restoreLynxUndoHistoryToTick } from "@undo-runtime/impl/lynxHistory";
import { createMsUndoHistory, recordMsUndoTick, restoreMsUndoHistoryToTick } from "@undo-runtime/impl/msHistory";

describe("stateful element undo/projection characterization", () => {
  it("replays MS portable-item primed drops through undo restore without losing the projected overlay", () => {
    const cells = createMsEmptyCells();
    const chipPos = msPos(8, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.inventory.tools = [MS_TILE.Sandbag];
    reconcileMsPortableToolProjection(session.state.internal.portableTools, session.state.engine.inventory);

    let history = createMsUndoHistory(session, 2);
    const primeInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
    session = advanceMsInteractiveSession(session, primeInput);
    history = recordMsUndoTick(history, session, primeInput);
    session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
    history = recordMsUndoTick(history, session, GAME_INPUT_CODES.none);

    const restored = restoreMsUndoHistoryToTick(history, 0);

    expect(restored.replayedEventCount).toBeGreaterThan(0);
    expect(restored.session.state.internal.portableTools.primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: chipPos,
      z: 1,
    });
    expect(
      restored.session.state.internal.portableTools.portableItems.find((item) => item.state.mode === "primed")?.tileId,
    ).toBe(MS_TILE.Sandbag);

    const frame = projectMsInteractiveFrame(restored.session, "tick");
    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: chipPos,
      kind: "carried-tool",
      tileId: MS_TILE.Sandbag,
    });
  });

  it("replays Lynx portable-item primed drops through undo restore without losing the projected overlay", () => {
    const chipPos = 33;
    let session = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel([createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east))], [chipPos]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];
    const runtime = lynxRuntimeStateForTest(session.state);
    const portableTools = runtime.portableTools as LynxPortableToolStateStore;
    reconcileLynxPortableToolProjection(portableTools, session.state.inventory);

    let history = createLynxUndoHistory(session, 2);
    const primeInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
    session = advanceLynxInteractiveSession(session, primeInput);
    history = recordLynxUndoTick(history, session, primeInput);
    session = advanceLynxInteractiveSession(session, GAME_INPUT_CODES.none);
    history = recordLynxUndoTick(history, session, GAME_INPUT_CODES.none);

    const restored = restoreLynxUndoHistoryToTick(history, 0);

    expect(restored.replayedEventCount).toBeGreaterThan(0);
    expect((lynxRuntimeStateForTest(restored.session.state).portableTools as LynxPortableToolStateStore).primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: chipPos,
      z: 1,
    });
    expect(lynxPortableItems(restored.session.state).find((item) => item.state.mode === "primed")?.tileId).toBe(MS_TILE.Sandbag);

    const frame = projectLynxInteractiveFrame(restored.session, "tick");
    expectOverlayPresent(frame.tileOverlays, {
      z: 1,
      pos: chipPos,
      kind: "carried-tool",
      tileId: MS_TILE.Sandbag,
    });
  });
});
