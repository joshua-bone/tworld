import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import createHybridCcV1Module from "@player-web/impl/hybridcc-v1/engine/hybridcc_v1_wasm.js";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
  type HybridCcV1EngineFactory,
} from "@player-web/impl/hybridcc-v1/HybridCcV1GameEngineAdapter";
import {
  compileHybridCcV1Run,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  decodeHybridCcV1Replay,
  verifyHybridCcV1Replay,
  type HybridCcV1WasmModule,
} from "@player-web/impl/hybridcc-v1/wasmBridge";
import {
  LEGACY_DAT_SANDBOX_ASSET_ID,
  loadLegacyDatSandbox,
  parseLegacyDatSandboxHints,
  type LoadedLegacyDatSandbox,
  type LegacyDatSandboxAssetSource,
  type LegacyDatSandboxReferenceReplay,
} from "./legacyDatSandbox";

const SERIES_FILE = "hybrid-v1:sandbox:legacy_dat_sandbox";
const ACCEPTANCE_TIMEOUT_MS = 240_000;
const asset = (name: string) => new URL(`./assets/${name}`, import.meta.url);
const TRICK_WALLS_NORTH_WEST_HINT = [
  "The ball in the small enclosure intentionally presses the ordinary wall to its right; it causes no reveal.",
  "Below, Player can press the visible ordinary wall on the left or a hidden permanent wall on the right.",
  "Both block; only the hidden wall flashes.",
].join(" ");
const TRICK_WALLS_NORTH_EAST_HINT = [
  "The sealed monster rejects the invisible wall without revealing it.",
  "In the open fixture, a diagonal side attempt reveals the invisible wall while Chip's primary move still succeeds.",
].join(" ");
const EXPECTED_GAMEPLAY_HASHES = [
  "7c6ae9dcb65bbd38c17b2e776e982c606f8facc4a5ae64b251bb635ee9b69663",
  "e66139ee3370c94fb0c45b0c0f736b7ea22e9a81cee3a4fb5af37ca4df29f35a",
  "53a6bab579099f80730957fa62078853b46064929472d2ca4a8226bd2eb3ef6e",
  "6cf0d51eaf034605c93043580c0e6d5a72d50eadc5edb1a9bfc9817cd99942dc",
  "be5737439f9a4bcb73f2fac89d055deeb25dbcdd538a6e66157e8e68a4596c0d",
  "61fa05a5fc83286d88d7dba3f03678a2fda85088cf660c948a6d5ff4377b53ed",
  "db6684cf92ee118f40ebce5bb298ad412dd826857ba68c24e3dc2bc2d802a716",
  "d85d655d140483254a761f64408e3eeb3dc33b1166176c8b3be73cc2b8cd75dc",
  "22c4fd40f69aba84893c8a92e911737ab86a38c606d4049d8366a224e754397a",
  "4d0ba6755c098a984f1207a01c4ed2b7cca5ab0856f11db7152bb62a578635e1",
  "4a2bbe22b44eeb695dc945db63956064f492a4a739c3e424e61ad2b6d98aaa49",
  "17bf84c89f6b701eb8a036eab7c9628542df33ea8dc6bacefd060a651853d365",
  "813ab4bf23148e2d86957ed6310e7911bcfd699a234031b4d8a1f2cb33ecc7bc",
  "73dfcd0501ee4a1985655407f40e3af3e2da23d6018955d3f5024b04995d0fd7",
  "402577b61238efa81003ca6f27142f29c7e7d37a502aff2085f71152b7d421a1",
  "82ffb10ecd0d5f60573685885c8271718bc7d61212f987d1920a7fad3a84d670",
  "fa64f8421b353790a7e971f4b7f369c00ab28c3df62617e493649412a16080e3",
  "2b0c42311ec4c2bc74af40a8f63eb1fd661feadb08ac229d56214fc101bfa59c",
  "416ed2525c9190c1cf982e77847388337ec9ed0ee0dc8961368524e0d00cb892",
  "4eeafedc030eb751f261309c8255cc5de76eaa8a2c3d200bf423c1a2234697fe",
  "1031e6c27242ed36e0daff0925697522bd6e417f07df40102ae67a0ebd46627f",
  "15ada266ce71243e609d701cf9c6e80f9b8478297ef586f92e3a35f509cc6051",
  "4836f5806ad980da1cc260b81c02c1d0da0666550c88b179a680e79a77844ffc",
  "bbd6672ca9bb304a059ad781d19ae6426fd984a992fc7fb0309d4956a985ee5a",
  "b0e9f181504d91f3c51c513ffc29464b33a5831cb47ccb679c91339670bdbe52",
  "e808903c5e89212306a0862d74d970cd370656347a5d7b342b3a64847f76c185",
  "5db0320c7638fb2c22e20a8d09d9f1051a613c050d4565c5bcdd09e5c6d4930a",
  "23f738f97a3f2628461ba34f827b7fdcd02caae835b110ae31e936e356be4982",
  "f818895f81c232c06fc28618a3518e55c33894dbb2b6aab2d891810b2f770efb",
  "f2e6df2e87ae4ff6eebb08a6b1977aeef42d24dbaca92a2595ffac8f2c32b049",
  "5813b984ce4085e293d908732040eb10e6aefcfaf355ff2dfacfa2d199a0d134",
  "24cea79f6aa0008fb5fd09e1ab8e699eae56f404611e9a67c2ac40b8ceceadfa",
  "a35c674765d9ce898a5f332544883a83256c77b4380e64df9c8ed7724812785b",
  "b03613f9416666cfe41eaf6c492ce7368fe04299cb19d7ec7d00eecdfd0df877",
  "4b352c2a959e596187b5ad9bb243b86def311e428333ac7cafc95dc69c4ed6d1",
  "afa302cb0428222ce314ba54014f74b54070d2e3533595c44ca4bf39b8664b0b",
  "f9cdbd92a241e33c76868fa05dcb94f7747bdb40a6b907c82b792b817de8dfd6",
  "20c49a5d2cdfab5c276f3da391d91010667ece37841dcb473c732d7abeb90702",
  "b29713aeff527abb66462dd39c9d8dbfb73d50c061773aba00fe9e64ccc14a5f",
  "991e33134ad122ad283b3c580bc5e5dc8f0fd36fca61e2a511ddc7790faeaa6e",
  "e043c2d2a7d561ee602808d1461c33f361793abb8d2be7edc421b7fbf6b9c677",
  "a2199d761b543533a8af29b43e822262a313368d7d490a49f6890a9b9cd28d65",
  "37e6ec38af3cda01b9cb656e4a9e2ad9e983be9ceae762992a958fe01ad4a150",
  "de44e6fb8b25c854466af72ee186e84b0330bf9fac72587357a128bceaf777eb",
  "a5ee26b97c3686f6c3979b2ef5132bcf64945c91ece255b902c7ca77ed2165e9",
  "7ab7c07d2dfdd3641e7d85fe9827d53e049fad403ac55b19c2927396e93c73c3",
  "591209ff8e6439c3754a96cdcf655d010c5492e564035d9e4862418715320419",
  "0ffa1a08342bb6762ea7ffe0475cfaec3b9257e45687b82a9cbe42a3e6401637",
  "a4df3f9da6249c6bf8c7396c751ff0c9b1563e6e38fe5518137d8df60170a324",
  "4cc6e68be27a6e4a99c76fa5d1249ed5c5b6c2438cb9e45807a78ed27635af6d",
  "59513a9c536779fab61abfa17a6d8510bf4b89ab4b52b92bf9756b8d09e74769",
  "0ee39c3f65ecff099b2039c979928ee2bc013eba1c2f25c06b5743a4d171c044",
  "6fbbc634ac6d2421879c2c9b67a07ee4851e28f28707408cf58adcbd53808f0b",
  "544cdbb8cb857d5ffb5e3a0cf577694225a9e1955bca9507786d00265993abf2",
  "03bf75699ea2e126af18d253227e17dc7818f2e755630bc5250cc5d4dbce0421",
  "bb08cb103bd8aec9929840f88c50bf585927794e03502a2643b3a38ca85fd456",
  "68896438a85d14f1d024a28a3767559d233e0b7508c21e7611127f1673bc09fc",
  "c888c8e9f5f3b53cce2c47c5ba4a1a53e82fcf2c2f26f447a3905ecc8f428aee",
  "342f61d7e358086fffe9ab42abd2c1a89219e31df947babda2285b9e2f106c7a",
  "89c263bfde41afc61c6f7f44b69f7e2d20075be4297c7a9de3e108610517d960",
  "82ce8cae0a6c44ee09b33ef600d534e94d2d6d55036865162a5329e914a64b10",
  "f68031c778ca6cbae48dda8b6bf01e26a3c054ec8c66b0b9b88c07b65ba6c741",
  "a8891fc90b2f4d8639755b46293271eb3621b8e0c38ad297b58e74f2d47cf723",
  "314b60539e1834b7d67475f415a2548efaaa40bca45f4005c01cc6aeaa0ab741",
  "e22c19b8e1870c9f0465477cf53ec674764529dc799b270e1c9b4dc2877e44a4",
  "46ff03da7feece4de0d9ebc46c6e10f0cecf4d0ed8ed4a2ac1f1acd6fcfd4b2a",
  "c3d163b2ae8d492b2d9dd1aba140322a1ac07d1f96833c15fb074951daa697fb",
  "c1bbf00de8869520e19b07419359b22e80a1ccf010ce44f1c357e178f3edf4fa",
  "7725e6e8f3a2d939b75b8e0c8ead7c23e6789afe91f339366acdbff811194756",
  "0ede4530aac9d28936b2c0c890d8e0f4d96507c9f20665bb5c403c451a08677e",
  "d3de2288a813d027f7ece461f1602a155bd4ee8fa50e6a8396b6c2cff33aa577",
  "9720bf0946981b18c31750984c93277b92acd82bbf43328db09d19eadb6d4661",
  "8533a7bda2a81e8a7f16f9a0402fb81ae6e70d457b23289b4c71eebf3c5f8a7b",
  "76be75adac207bb3676cffedee7fac51de3bfdbe479cdb671c0b9a33f59b5c48",
  "8666a6a3f8b5907184511b1600f862b3838157c726522fd42b3929de4849ec50",
  "b8f6af585d7fb098106418f034d140231f58d968bb32ce88a9ba5a59cdb7c686",
  "8844f898c26d7742741a2ea115f13a7b6078b1a1052082b983bc337c3f66d793",
  "50ad108fecf5a0689cbc9a19ebb4065b9656bcb42362fd8ed676d16b0db8e52f",
  "e29c1af7ca452ee8de11b66eaae3f413dafbdf358764800374b4f49273310bda",
  "56f554fc9087fa67800c146e7414c79ba24171026ebe45d3a83364fcf45d5346",
  "b4d91475cb00cb889953174330f1b36d42450b74d93dc51e0c5ca7962b7f9026",
  "88b554e42c824fb2ebe3229be277a281dfc6ba1023ad945a8db6e97af8779780",
  "cf13ad2f0e8c1b9d2c1a050d98a4ce200b14003c48b605b5cf5082ab28533e5d",
  "ce75b1077df555904a71726698f688a03ce5dc73f2c9002cd61e0b2231767005",
  "01072185553c44a345df9d6108161b889fde1fdc7227d1c5233d5a41f7159b77",
  "e1e767a1170235555bafe0be9105864de3e20e7ebd411330433a18ef07d5772b",
  "e9d88d22042d4da7c0c778f8396509fa96c44cc01966f7dbef52ff014ba540a7",
  "3770885c41b1bbc4e1f6f3eee6587d68a0b7989602be928f4c14077898c2ff92",
  "3daf0c207cc95a8612c767503bdb655d56da60d36d466b3ae773ff93cbef8a96",
] as const;

async function loadModule(): Promise<HybridCcV1WasmModule> {
  const wasmUrl = new URL("../engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

function filesystemAssetSource(): LegacyDatSandboxAssetSource {
  return {
    assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
    async loadDatBytes() {
      return new Uint8Array(await readFile(asset("legacy_dat_sandbox.dat")));
    },
    async loadHintBytes() {
      return new Uint8Array(await readFile(asset("legacy_dat_sandbox.hints.json")));
    },
    async loadReplayIndexBytes() {
      return new Uint8Array(await readFile(asset("replay-index.json")));
    },
    async loadReplayBytes(path) {
      return new Uint8Array(await readFile(asset(path)));
    },
  };
}

function factory(module: HybridCcV1WasmModule): HybridCcV1EngineFactory {
  return {
    create: (level, seed) => createHybridCcV1Engine(module, level.nativeLevel, seed),
    decodeReplay: (bytes) => decodeHybridCcV1Replay(module, bytes),
    verifyReplay: (level, bytes) => verifyHybridCcV1Replay(module, level.nativeLevel, bytes),
    compileRun: (level, seed, inputs, checkpointMode) => (
      compileHybridCcV1Run(module, level.nativeLevel, seed, inputs, checkpointMode)
    ),
  };
}

interface RealSandboxFixture {
  adapter: HybridCcV1GameEngineAdapter;
  loaded: LoadedLegacyDatSandbox;
}

let realSandboxFixture: Promise<RealSandboxFixture> | null = null;

async function loadRealSandboxFixture(): Promise<RealSandboxFixture> {
  realSandboxFixture ??= (async () => {
    const module = await loadModule();
    const source = filesystemAssetSource();
    const datBytes = await source.loadDatBytes();
    const conversion = convertHybridCcV1Dat(module, datBytes);
    const converted = conversion.entries.filter((entry) => entry.status === 0);
    const loaded = await loadLegacyDatSandbox(module, source, datBytes, converted);
    const registry = new HybridCcV1LevelRegistry();
    registry.register(SERIES_FILE, loaded.levels);
    return {
      adapter: new HybridCcV1GameEngineAdapter(registry, factory(module)),
      loaded,
    };
  })();
  return realSandboxFixture;
}

function referenceReplay(
  loaded: LoadedLegacyDatSandbox,
  id: string,
): LegacyDatSandboxReferenceReplay {
  const replay = loaded.referenceReplays.find((candidate) => candidate.id === id);
  if (!replay) throw new Error(`Missing real-Wasm acceptance replay ${id}.`);
  return replay;
}

async function startReferenceReplay(
  fixture: RealSandboxFixture,
  id: string,
): Promise<InteractiveGameSession> {
  const replay = referenceReplay(fixture.loaded, id);
  return fixture.adapter.startOpaqueReplaySession(
    {
      seriesFile: SERIES_FILE,
      levelNumber: replay.levelNumber,
      ruleset: "Hybrid",
    },
    { format: "hcr1", bytes: replay.bytes },
  );
}

async function advanceToReplayBoundary(
  fixture: RealSandboxFixture,
  session: InteractiveGameSession,
  boundary: number,
): Promise<InteractiveGameSession> {
  let current = session;
  for (let sample = 0; sample < boundary * 4 + 8; sample += 1) {
    if (current.frame.snapshot.replayCursor === boundary) return current;
    current = await fixture.adapter.advanceSession(current, "none");
  }
  throw new Error(`Replay did not reach boundary ${boundary}.`);
}

function soundIsActive(session: InteractiveGameSession, sound: number): boolean {
  return (session.frame.snapshot.soundEffects & (1 << sound)) !== 0;
}

function presentedChipPosition(session: InteractiveGameSession): { x: number; y: number } {
  const chip = session.frame.render?.chip;
  if (!chip) throw new Error("Expected the Hybrid presentation to contain Chip.");
  let x = (chip.pos % 32) * 8;
  let y = Math.floor(chip.pos / 32) * 8;
  switch (chip.dir) {
    case MS_DIRECTION.north: y += chip.moving; break;
    case MS_DIRECTION.west: x += chip.moving; break;
    case MS_DIRECTION.south: y -= chip.moving; break;
    case MS_DIRECTION.east: x -= chip.moving; break;
  }
  return { x, y };
}

async function collectPresentationTicks(
  fixture: RealSandboxFixture,
  session: InteractiveGameSession,
  firstTick: number,
  lastTick: number,
): Promise<{
  frames: Map<number, InteractiveGameSession[]>;
  session: InteractiveGameSession;
}> {
  const frames = new Map<number, InteractiveGameSession[]>();
  let current = session;
  for (let sample = 0; sample < lastTick * 3 + 32; sample += 1) {
    current = await fixture.adapter.advanceSession(current, "none");
    const tick = current.frame.snapshot.tick;
    if (tick >= firstTick && tick <= lastTick) {
      frames.set(tick, [...(frames.get(tick) ?? []), current]);
    }
    if (tick > lastTick) return { frames, session: current };
  }
  throw new Error(`Replay presentation did not advance beyond tick ${lastTick}.`);
}

describe("Legacy DAT Sandbox real-Wasm browser acceptance", () => {
  it("converts DAT, applies every room hint, and plays all HCR1 proofs to their declared outcomes", async () => {
    const module = await loadModule();
    const source = filesystemAssetSource();
    const [datBytes, hintBytes] = await Promise.all([
      source.loadDatBytes(),
      source.loadHintBytes(),
    ]);
    const conversion = convertHybridCcV1Dat(module, datBytes);
    const converted = conversion.entries.filter((entry) => entry.status === 0);
    const loaded = await loadLegacyDatSandbox(module, source, datBytes, converted);
    const hints = parseLegacyDatSandboxHints(hintBytes);

    expect(conversion.fileStatus).toBe(0);
    expect(converted).toHaveLength(89);
    expect(conversion.entries.every((entry) => entry.status === 0)).toBe(true);
    expect(conversion.diagnostics).toHaveLength(4);
    expect(conversion.diagnostics).toEqual(expect.arrayContaining(
      [60, 61, 62, 63].map((tileCode) => expect.objectContaining({
        severity: 0,
        entryOrdinal: 13,
        levelNumber: 12,
        tileCode,
        code: "dat.sanitized_swimming_player_art",
      })),
    ));
    expect(loaded.gameplayHashes).toEqual(EXPECTED_GAMEPLAY_HASHES);
    expect(loaded.referenceReplays).toHaveLength(134);
    expect(loaded.referenceReplays.filter((replay) => replay.expectedOutcome === "win"))
      .toHaveLength(120);
    expect(loaded.referenceReplays.filter((replay) => replay.expectedOutcome === "loss"))
      .toHaveLength(14);
    expect(loaded.boundedProofs).toHaveLength(100);
    expect(loaded.boundedProofs).toContainEqual(expect.objectContaining({
      expectedOutcome: "unfinished",
      levelNumber: 24,
    }));
    expect(loaded.levels).toContainEqual(expect.objectContaining({
      entryOrdinal: 26,
      nativeLevel: expect.objectContaining({ number: 25, title: "Toggle Basics" }),
    }));
    expect(loaded.referenceReplays.some((replay) => replay.levelNumber === 25)).toBe(false);
    expect(loaded.boundedProofs.some((proof) => (
      proof.entryOrdinal === 26 && proof.levelNumber === 25
    ))).toBe(true);
    for (const [index, level] of loaded.levels.entries()) {
      const expectedMessages = hints.levels[index]!.rooms.map((room) => room.message);
      expect(level.nativeLevel.texts).toEqual(expectedMessages);
    }

    const registry = new HybridCcV1LevelRegistry();
    registry.register(SERIES_FILE, loaded.levels);
    for (const replay of loaded.referenceReplays) {
      const adapter = new HybridCcV1GameEngineAdapter(registry, factory(module));
      let session = await adapter.startOpaqueReplaySession(
        {
          seriesFile: SERIES_FILE,
          levelNumber: replay.levelNumber,
          ruleset: "Hybrid",
        },
        { format: "hcr1", bytes: replay.bytes },
      );
      const hintTransitions: Array<string | null> = [session.hintText];
      for (let sample = 0; sample < 2_000 && session.frame.snapshot.status === "playing"; sample += 1) {
        session = await adapter.advanceSession(session, "none");
        const hintText = session.hintText;
        if (hintTransitions.at(-1) !== hintText) hintTransitions.push(hintText);
      }
      const expectedStatus = replay.expectedOutcome === "win" ? "completed" : "failed";
      const expectedRunOutcome = replay.expectedOutcome === "win" ? "completed-clean" : "failed";
      expect(session.frame.snapshot.status, replay.id).toBe(expectedStatus);
      expect(session.run.result?.outcome, replay.id).toBe(expectedRunOutcome);
      const expectedMessages = hints.levels
        .find((level) => level.expectedNumber === replay.levelNumber)!
        .rooms.map((room) => room.message);
      const shownMessages = hintTransitions.filter((text): text is string => text !== null);
      expect(
        shownMessages.every((message) => expectedMessages.includes(message)),
        `${replay.id} displayed only hints from its own level`,
      ).toBe(true);
      const lifecycleMessage = hints.levels[0]!.rooms
        .find((room) => room.roomId === "hint-lifecycle")?.message;
      if (replay.id === "foundation-tour" && lifecycleMessage) {
        expect(new Set(shownMessages), "foundation-tour displayed all four room hints")
          .toEqual(new Set(expectedMessages));
        expect(shownMessages.filter((message) => message === lifecycleMessage)).toHaveLength(2);
      }
      await adapter.disposeSession(session);
    }
  }, ACCEPTANCE_TIMEOUT_MS);

  it("routes the two northern Trick Walls hints without describing the ordinary wall as invisible", async () => {
    const fixture = await loadRealSandboxFixture();
    const trickWalls = fixture.loaded.levels.find((level) => level.nativeLevel.number === 11)!;

    expect(trickWalls.nativeLevel.texts.slice(0, 2)).toEqual([
      TRICK_WALLS_NORTH_WEST_HINT,
      TRICK_WALLS_NORTH_EAST_HINT,
    ]);

    let ordinary = await startReferenceReplay(fixture, "trick-walls-ordinary");
    expect(ordinary.frame.cells[360]?.top.id).toBe(MS_TILE.HintButton);
    expect(ordinary.frame.cells[375]?.top.id).toBe(MS_TILE.HintButton);
    expect(ordinary.frame.cells[4 * 32 + 5]?.top.id).toBe(MS_TILE.Wall);
    expect(ordinary.frame.cells[4 * 32 + 20]?.top.id).toBe(MS_TILE.HiddenWall_Perm);
    expect(ordinary.frame.cells[7 * 32 + 10]?.top.id).toBe(MS_TILE.HiddenWall_Perm);
    ordinary = await advanceToReplayBoundary(fixture, ordinary, 23);
    expect(ordinary.hintText).toBe(TRICK_WALLS_NORTH_WEST_HINT);
    expect(ordinary.hintText).not.toBe(TRICK_WALLS_NORTH_EAST_HINT);
    await fixture.adapter.disposeSession(ordinary);

    let invisible = await startReferenceReplay(fixture, "trick-walls-permanent-invisible-slap");
    invisible = await advanceToReplayBoundary(fixture, invisible, 53);
    expect(invisible.hintText).toBe(TRICK_WALLS_NORTH_EAST_HINT);
    expect(invisible.hintText).not.toBe(TRICK_WALLS_NORTH_WEST_HINT);
    await fixture.adapter.disposeSession(invisible);
  }, ACCEPTANCE_TIMEOUT_MS);

  it("projects every real DAT ice corner with matching Lynx art and its open-edge departure", async () => {
    const fixture = await loadRealSandboxFixture();
    const cases = [
      {
        id: "corner-ne",
        source: { x: 5, y: 7 },
        tileId: MS_TILE.IceWall_Northeast,
        destination: { x: 6, y: 7 },
        direction: MS_DIRECTION.east,
      },
      {
        id: "corner-nw",
        source: { x: 11, y: 7 },
        tileId: MS_TILE.IceWall_Northwest,
        destination: { x: 10, y: 7 },
        direction: MS_DIRECTION.west,
      },
      {
        id: "corner-se",
        source: { x: 5, y: 23 },
        tileId: MS_TILE.IceWall_Southeast,
        destination: { x: 6, y: 23 },
        direction: MS_DIRECTION.east,
      },
      {
        id: "corner-sw",
        source: { x: 11, y: 23 },
        tileId: MS_TILE.IceWall_Southwest,
        destination: { x: 10, y: 23 },
        direction: MS_DIRECTION.west,
      },
    ] as const;

    for (const expected of cases) {
      let session = await startReferenceReplay(fixture, expected.id);
      const sourceIndex = expected.source.y * 32 + expected.source.x;
      expect(session.frame.cells[sourceIndex]?.top.id, `${expected.id} artwork`).toBe(expected.tileId);

      session = await advanceToReplayBoundary(fixture, session, 44);
      const chip = session.frame.render?.chip;
      expect(session.frame.snapshot.tick, `${expected.id} 20 Hz boundary sample`).toBe(88);
      expect(chip?.pos, `${expected.id} open-edge destination`)
        .toBe(expected.destination.y * 32 + expected.destination.x);
      expect(chip?.dir, `${expected.id} open-edge direction`).toBe(expected.direction);
      expect(chip?.moving, `${expected.id} starts the redirected fast leg immediately`).toBe(8);
      expect(chip?.visual?.frame, `${expected.id} Lynx movement cel`).toBe(3);
      expect(soundIsActive(session, LYNX_SOUND.SkatingTurn), `${expected.id} turn sound`).toBe(true);
      await fixture.adapter.disposeSession(session);
    }
  }, ACCEPTANCE_TIMEOUT_MS);

  it("publishes hitch-free ice and force tracks as paired host frames at 20 Hz", async () => {
    const fixture = await loadRealSandboxFixture();

    let ice = await startReferenceReplay(fixture, "long-slide-continuity");
    const iceSamples = await collectPresentationTicks(fixture, ice, 78, 98);
    ice = iceSamples.session;
    const expectedIceX = [
      32, 36, 40, 44, 48, 52, 56, 60, 64, 68,
      72, 76, 80, 84, 88, 92, 96, 98, 100, 102, 104,
    ];
    for (const [offset, expectedX] of expectedIceX.entries()) {
      const tick = 78 + offset;
      const frames = iceSamples.frames.get(tick) ?? [];
      expect(frames, `ice tick ${tick} is presented for both host frames`).toHaveLength(2);
      expect(frames.map((frame) => presentedChipPosition(frame).x), `ice tick ${tick} X`)
        .toEqual([expectedX, expectedX]);
      expect(frames.map((frame) => frame.frame.snapshot.currentTime), `ice tick ${tick} clock`)
        .toEqual([tick, tick]);
      if (tick < 94) {
        expect(frames.map((frame) => frame.frame.render?.chip?.visual?.frame), `ice tick ${tick} cel`)
          .toEqual(tick % 2 === 0 ? [3, 3] : [1, 1]);
        const sound = tick < 80 ? LYNX_SOUND.SkatingTurn : LYNX_SOUND.SkatingForward;
        expect(frames.every((frame) => soundIsActive(frame, sound)), `ice tick ${tick} sound`)
          .toBe(true);
      } else if (tick < 98) {
        expect(frames.every((frame) => (
          !soundIsActive(frame, LYNX_SOUND.SkatingForward)
          && !soundIsActive(frame, LYNX_SOUND.SkatingTurn)
        )), `ice tick ${tick} has reached ordinary floor`).toBe(true);
      }
    }
    await fixture.adapter.disposeSession(ice);

    let force = await startReferenceReplay(fixture, "tunnel-clearance");
    const forceSamples = await collectPresentationTicks(fixture, force, 46, 66);
    force = forceSamples.session;
    const expectedForceY = [
      152, 156, 160, 164, 168, 172, 176, 180, 184, 188,
      192, 196, 200, 202, 204, 206, 208, 210, 212, 214, 216,
    ];
    for (const [offset, expectedY] of expectedForceY.entries()) {
      const tick = 46 + offset;
      const frames = forceSamples.frames.get(tick) ?? [];
      expect(frames, `force tick ${tick} is presented for both host frames`).toHaveLength(2);
      expect(frames.map((frame) => presentedChipPosition(frame).y), `force tick ${tick} Y`)
        .toEqual([expectedY, expectedY]);
      expect(frames.map((frame) => frame.frame.snapshot.currentTime), `force tick ${tick} clock`)
        .toEqual([tick, tick]);
      if (tick < 58) {
        expect(frames.map((frame) => frame.frame.render?.chip?.visual?.frame), `force tick ${tick} cel`)
          .toEqual(tick % 2 === 0 ? [3, 3] : [1, 1]);
        expect(frames.every((frame) => soundIsActive(frame, LYNX_SOUND.Sliding)), `force tick ${tick} sound`)
          .toBe(true);
      } else if (tick < 66) {
        expect(frames.every((frame) => (
          !soundIsActive(frame, LYNX_SOUND.Sliding)
          && !soundIsActive(frame, LYNX_SOUND.SlideWalking)
        )), `force tick ${tick} has reached ordinary floor`).toBe(true);
      }
    }
    await fixture.adapter.disposeSession(force);
  }, ACCEPTANCE_TIMEOUT_MS);

  it("projects moving-block settlement and force-run provenance at their exact proof boundaries", async () => {
    const fixture = await loadRealSandboxFixture();

    let settlement = await startReferenceReplay(fixture, "initial-block-stationary");
    settlement = await advanceToReplayBoundary(fixture, settlement, 40);
    const repushedBlock = settlement.frame.render?.actors.find((actor) => (
      actor.id === MS_TILE.Block && actor.pos === 23 * 32 + 8
    ));
    expect(settlement.frame.snapshot.tick).toBe(80);
    expect(settlement.frame.render?.chip).toMatchObject({
      pos: 23 * 32 + 7,
      dir: MS_DIRECTION.east,
      moving: 8,
    });
    expect(repushedBlock).toMatchObject({
      dir: MS_DIRECTION.east,
      moving: 8,
    });
    await fixture.adapter.disposeSession(settlement);

    let plainIce = await startReferenceReplay(fixture, "ice-arrival-no-run-override");
    plainIce = await advanceToReplayBoundary(fixture, plainIce, 83);
    expect(plainIce.frame.snapshot.tick).toBe(166);
    expect(plainIce.frame.render?.chip).toMatchObject({
      pos: 20 * 32 + 21,
      dir: MS_DIRECTION.east,
      moving: 8,
    });
    await fixture.adapter.disposeSession(plainIce);

    let forcedBridge = await startReferenceReplay(fixture, "ice-force-handoff");
    forcedBridge = await advanceToReplayBoundary(fixture, forcedBridge, 58);
    expect(forcedBridge.frame.snapshot.tick).toBe(116);
    expect(forcedBridge.frame.render?.chip).toMatchObject({
      pos: 19 * 32 + 26,
      dir: MS_DIRECTION.north,
      moving: 8,
    });
    await fixture.adapter.disposeSession(forcedBridge);

    let playerBridge = await startReferenceReplay(
      fixture,
      "player-ice-bridge-clears-run-override",
    );
    playerBridge = await advanceToReplayBoundary(fixture, playerBridge, 78);
    expect(playerBridge.frame.snapshot.tick).toBe(156);
    expect(playerBridge.frame.render?.chip).toMatchObject({
      pos: 26 * 32 + 21,
      dir: MS_DIRECTION.east,
      moving: 8,
    });
    await fixture.adapter.disposeSession(playerBridge);
  }, ACCEPTANCE_TIMEOUT_MS);

  it("changes player surface loops exactly when on-terrain boot pickups complete", async () => {
    const fixture = await loadRealSandboxFixture();
    const cases = [
      {
        id: "skates-on-ice-pickup",
        inventoryIndex: 0,
        unbootedSound: LYNX_SOUND.SkatingTurn,
        bootedSound: LYNX_SOUND.IceWalking,
      },
      {
        id: "force-boots-on-force-pickup",
        inventoryIndex: 1,
        unbootedSound: LYNX_SOUND.Sliding,
        bootedSound: LYNX_SOUND.SlideWalking,
      },
    ] as const;

    for (const expected of cases) {
      let session = await startReferenceReplay(fixture, expected.id);
      session = await advanceToReplayBoundary(fixture, session, 75);
      expect(session.frame.snapshot.tick, `${expected.id} pickup entry sample`).toBe(150);
      expect(session.frame.snapshot.inventory.boots[expected.inventoryIndex], `${expected.id} not collected on start-enter`)
        .toBe(0);
      expect(session.frame.render?.chip?.moving, `${expected.id} first terrain leg is fast`).toBe(8);
      expect(soundIsActive(session, expected.unbootedSound), `${expected.id} pre-pickup loop`).toBe(true);
      expect(soundIsActive(session, expected.bootedSound), `${expected.id} no early booted loop`).toBe(false);

      session = await advanceToReplayBoundary(fixture, session, 76);
      expect(session.frame.snapshot.tick, `${expected.id} completion sample`).toBe(152);
      expect(session.frame.snapshot.inventory.boots[expected.inventoryIndex], `${expected.id} collected on finish-enter`)
        .toBe(1);
      expect(session.frame.render?.chip?.moving, `${expected.id} starts ordinary booted move without an idle sample`)
        .toBe(8);
      expect(soundIsActive(session, expected.unbootedSound), `${expected.id} old loop stops`).toBe(false);
      expect(soundIsActive(session, expected.bootedSound), `${expected.id} destination is ordinary floor`).toBe(false);
      expect(soundIsActive(session, LYNX_SOUND.ItemCollected), `${expected.id} pickup completion sound`).toBe(true);
      await fixture.adapter.disposeSession(session);
    }

    let skates = await startReferenceReplay(fixture, "skates-arrival-ordinary");
    skates = await advanceToReplayBoundary(fixture, skates, 43);
    expect(skates.frame.snapshot.inventory.boots[0]).toBe(1);
    expect(skates.frame.render?.chip?.moving).toBe(8);
    expect(soundIsActive(skates, LYNX_SOUND.IceWalking)).toBe(true);
    expect(soundIsActive(skates, LYNX_SOUND.SkatingForward)).toBe(false);
    await fixture.adapter.disposeSession(skates);

    let forceBoots = await startReferenceReplay(fixture, "force-boots-gallery");
    forceBoots = await advanceToReplayBoundary(fixture, forceBoots, 91);
    expect(forceBoots.frame.snapshot.inventory.boots[1]).toBe(1);
    expect(forceBoots.frame.render?.chip?.moving).toBe(8);
    expect(soundIsActive(forceBoots, LYNX_SOUND.SlideWalking)).toBe(true);
    expect(soundIsActive(forceBoots, LYNX_SOUND.Sliding)).toBe(false);
    await fixture.adapter.disposeSession(forceBoots);

    let block = await startReferenceReplay(fixture, "block-silent-autoslide");
    block = await advanceToReplayBoundary(fixture, block, 38);
    const playerSurfaceSounds = [
      LYNX_SOUND.SkatingForward,
      LYNX_SOUND.SkatingTurn,
      LYNX_SOUND.IceWalking,
      LYNX_SOUND.Sliding,
      LYNX_SOUND.SlideWalking,
    ];
    expect(block.frame.render?.actors.some((actor) => actor.id === MS_TILE.Block && actor.moving > 0))
      .toBe(true);
    expect(playerSurfaceSounds.every((sound) => !soundIsActive(block, sound))).toBe(true);
    await fixture.adapter.disposeSession(block);
  }, ACCEPTANCE_TIMEOUT_MS);

  it("rejects an altered bundled HCR1 before publishing any references", async () => {
    const module = await loadModule();
    const files = filesystemAssetSource();
    const datBytes = await files.loadDatBytes();
    const conversion = convertHybridCcV1Dat(module, datBytes);
    const converted = conversion.entries.filter((entry) => entry.status === 0);
    const source: LegacyDatSandboxAssetSource = {
      ...files,
      async loadReplayBytes(path) {
        const bytes = await files.loadReplayBytes(path);
        if (path.endsWith("1-foundation-tour.hcr1")) bytes[bytes.length - 1] ^= 1;
        return bytes;
      },
    };

    await expect(loadLegacyDatSandbox(module, source, datBytes, converted))
      .rejects.toThrow("failed its byte identity check");
  }, ACCEPTANCE_TIMEOUT_MS);
});
