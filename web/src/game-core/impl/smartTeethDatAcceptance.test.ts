import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  extractGroupedDatLevels,
  parseDatFile,
} from "@content/api/series-file";
import {
  replaySolutionCodec,
  type ReplayRecordedMove,
} from "@game-core/api/codec";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelLoadRegistration } from "@ruleset-ms/impl/builtinLevelRegistration";
import {
  createMsInteractiveSession,
  advanceMsInteractiveSession,
  createMsReplaySession,
} from "@ruleset-ms/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import { lynxRegisteredLevelLoadRegistration } from "@ruleset-lynx/impl/builtinLevelRegistration";
import {
  createLynxInteractiveSession,
  advanceLynxInteractiveSession,
  createLynxReplaySession,
} from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";
import {
  captureLynxUndoCheckpoint,
  restoreLynxUndoCheckpoint,
} from "@undo-runtime/impl/lynxCheckpoint";

function replay(moves: ReplayRecordedMove[]) {
  const result = replaySolutionCodec.decode(
    replaySolutionCodec.encode(1, "BRAI", 1000, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves,
    }),
  );
  if (!result) throw new Error("Replay must decode");
  return result;
}

type Source = ReturnType<typeof extractGroupedDatLevels>["levels"][number];
function driver(ruleset: "MS" | "Lynx", source: Source, levelNumber = 1) {
  const request = {
    seriesFile: "SMART_TEETH_ACCEPTANCE.dat",
    levelNumber,
    ruleset,
  };
  if (ruleset === "MS") {
    const level = msRegisteredLevelLoadRegistration.prepareLoadedLevel(source);
    let session = createMsInteractiveSession({ ...request, ruleset }, level);
    return {
      actors: () => session.state.internal.creatures,
      frame: () => projectMsInteractiveFrame(session, "tick"),
      advance: (input: number) => {
        session = advanceMsInteractiveSession(session, input);
      },
      checkpoint: () => {
        const checkpoint = captureMsUndoCheckpoint(session);
        return () => {
          session = restoreMsUndoCheckpoint(checkpoint);
        };
      },
      replay: () => {
        session = createMsReplaySession(
          { ...request, ruleset },
          level,
          replay(session.recordedMoves),
        );
      },
    };
  }
  const level = lynxRegisteredLevelLoadRegistration.prepareLoadedLevel(source);
  let session = createLynxInteractiveSession({ ...request, ruleset }, level);
  return {
    actors: () => session.actors,
    frame: () => projectLynxInteractiveFrame(session, "tick"),
    advance: (input: number) => {
      session = advanceLynxInteractiveSession(session, input);
    },
    checkpoint: () => {
      const checkpoint = captureLynxUndoCheckpoint(session);
      return () => {
        session = restoreLynxUndoCheckpoint(checkpoint);
      };
    },
    replay: () => {
      session = createLynxReplaySession(
        { ...request, ruleset },
        level,
        replay(session.recordedMoves),
      );
    },
  };
}

function progress(game: ReturnType<typeof driver>) {
  return structuredClone({
    actors: game
      .actors()
      .filter((actor) => actor.id === MS_TILE.SmartTeeth && !actor.hidden)
      .map(({ pos, dir, plannedPath, plannedDirect }) => ({
        pos,
        dir,
        plannedPath,
        plannedDirect,
      })),
    routes: game
      .frame()
      .tileOverlays.filter((overlay) => overlay.kind === "planned-route"),
  });
}

describe("DATTools Smart Teeth exported DAT acceptance", () => {
  it.each(["MS", "Lynx"] as const)(
    "opens the exported teamwork level with a helper in %s",
    async (ruleset) => {
      const bytes = new Uint8Array(
        await readFile(
          new URL(
            "../../../../fixtures/smart-teeth/SMART_TEETH_ACCEPTANCE.dat",
            import.meta.url,
          ),
        ),
      );
      const source = extractGroupedDatLevels(bytes).levels[1]!;
      const game = driver(ruleset, source, 2);
      const initial = progress(game);
      expect(
        initial.actors
          .find((actor) => actor.pos === 194)
          ?.plannedPath?.map((node) => node.pos),
      ).toEqual([194, 195, 196]);
      expect(
        initial.actors.find((actor) => actor.pos === 99)?.plannedDirect,
      ).toBe(true);
      expect(
        initial.actors.find((actor) => actor.pos === 99)?.plannedPath?.at(-1)
          ?.pos,
      ).toBe(105);
      let crossed = false;
      for (let tick = 0; tick < 48; tick++) {
        game.advance(0);
        const actors = progress(game).actors;
        if (actors.some((actor) => actor.pos >= 102 && actor.pos <= 105)) {
          expect(actors.some((actor) => actor.pos === 196)).toBe(true);
          crossed = true;
        }
      }
      expect(crossed).toBe(true);
    },
  );

  it.each(["MS", "Lynx"] as const)(
    "plays coordinated routes, checkpoint undo and encoded replay in %s",
    async (ruleset) => {
      const bytes = new Uint8Array(
        await readFile(
          new URL(
            "../../../../fixtures/smart-teeth/SMART_TEETH_ACCEPTANCE.dat",
            import.meta.url,
          ),
        ),
      );
      expect(parseDatFile(bytes, { ruleset }).levels[0]?.name).toBe(
        "Smart Teeth acceptance",
      );
      const source = extractGroupedDatLevels(bytes).levels[0]!;
      const decoded =
        msRegisteredLevelLoadRegistration.decodeLoadedLevel(source);
      expect(decoded.badTiles).toBe(false);
      expect(decoded.creaturePositions).toEqual([100, 227, 232]);
      expect([100, 227, 232].map((pos) => decoded.cells[pos]!.top.id)).toEqual([
        0x8f, 0x8f, 0x8c,
      ]);
      const game = driver(ruleset, source);
      game.advance(0);
      const initial = progress(game);
      expect(initial.actors).toHaveLength(3);
      expect(initial.actors.find((actor) => actor.plannedDirect)?.pos).toBe(
        ruleset === "MS" ? 232 : 200,
      );
      expect(
        new Set(initial.actors.map((actor) => actor.plannedPath?.at(-1)?.pos))
          .size,
      ).toBe(3);
      expect(initial.routes.length).toBeGreaterThan(3);
      const restore = game.checkpoint();
      const expected = [];
      for (let tick = 0; tick < 12; tick++) {
        game.advance(tick === 0 ? 2 : 0);
        expected.push(progress(game));
      }
      restore();
      expect(progress(game)).toEqual(initial);
      for (let tick = 0; tick < 12; tick++) {
        game.advance(tick === 0 ? 2 : 0);
        expect(progress(game)).toEqual(expected[tick]);
      }
      game.replay();
      game.advance(0);
      for (const state of expected) {
        game.advance(0);
        expect(progress(game)).toEqual(state);
      }
    },
  );
});
