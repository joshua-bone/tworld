import { assertPlayerAdapter } from "./adapter.mjs";
import {
  MAX_DAT_BYTES,
  createIndexedDbDatSource,
  datSha256,
} from "./dat-source.mjs";

/** Raw Emscripten exports supplied by the PR35 private browser-player host. */
export const EXPECTED_HCC_PLAYER_EXPORTS = Object.freeze([
  "_malloc",
  "_free",
  "_hcc_player_create",
  "_hcc_player_destroy",
  "_hcc_player_open_dat",
  "_hcc_player_level_count",
  "_hcc_player_start_level",
  "_hcc_player_restart_level",
  "_hcc_player_step",
  "_hcc_player_catalog_json",
  "_hcc_player_frame_json",
  "_hcc_player_export_replay",
  "_hcc_player_verify_replay",
  "_hcc_player_last_error",
]);

const DIRECTION_CODES = Object.freeze({ null: 0, N: 1, E: 2, S: 3, W: 4 });
const TOOL_NAMES = Object.freeze(["flippers", "fire_boots", "ice_skates", "force_boots"]);
const BUTTON_APPEARANCES = new Set(["green", "red", "brown", "blue"]);
const VIEW_SIZE = 9;
const SIZE_T_BYTES = 4;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export const DEFAULT_BUNDLED_DAT_MANIFEST_URL = new URL(
  "../data/bundled-dats.v1.json",
  import.meta.url,
).href;

function replayBytes(value) {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  throw new TypeError("Replay must be an ArrayBuffer or typed-array view");
}

function directionCode(direction) {
  const key = String(direction);
  if (!Object.hasOwn(DIRECTION_CODES, key)) {
    throw new TypeError(`Unknown player direction ${key}`);
  }
  return DIRECTION_CODES[key];
}

function conversionMessage(filename, error) {
  return `${filename}: ${error instanceof Error ? error.message : String(error)}`;
}

function normalizeManifest(value, manifestUrl) {
  const entries = Array.isArray(value) ? value : value?.entries ?? value?.sets;
  if (!Array.isArray(entries)) {
    throw new TypeError("Bundled DAT manifest must contain an entries array");
  }
  const seen = new Set();
  const normalized = [];
  for (const entry of entries) {
    if (
      typeof entry?.filename !== "string" ||
      entry.filename.trim() === "" ||
      !/\.dat$/i.test(entry.filename) ||
      typeof entry.url !== "string" ||
      entry.url.trim() === "" ||
      typeof entry.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(entry.sha256)
    ) {
      throw new TypeError("Bundled DAT manifest contains an invalid entry");
    }
    if (seen.has(entry.filename)) continue;
    seen.add(entry.filename);
    normalized.push(Object.freeze({
      filename: entry.filename,
      // Bundle manifests live in data/, while their emitted URLs are relative
      // to the player root (for example ./data/intro.dat).
      url: new URL(entry.url, new URL("../", manifestUrl)).href,
      sha256: entry.sha256,
      ...(typeof entry.title === "string" && entry.title.trim() !== ""
        ? { title: entry.title }
        : {}),
      ...(typeof entry.category === "string" && entry.category.trim() !== ""
        ? { category: entry.category }
        : {}),
    }));
  }
  return normalized;
}

/** Load pinned DAT bytes emitted beside the static player bundle. */
export function createBundledDatSource({
  manifestUrl = DEFAULT_BUNDLED_DAT_MANIFEST_URL,
  fetchImpl = globalThis.fetch,
  cryptoProvider = globalThis.crypto,
} = {}) {
  if (typeof fetchImpl !== "function") {
    return Object.freeze({
      async manifest() {
        return [];
      },
      async load() {
        throw new Error("Fetch is unavailable for bundled DAT files");
      },
    });
  }
  return Object.freeze({
    async manifest() {
      let response;
      try {
        response = await fetchImpl(manifestUrl);
      } catch {
        return [];
      }
      if (!response?.ok) return [];
      return normalizeManifest(await response.json(), response.url || manifestUrl);
    },

    async load(entry) {
      const response = await fetchImpl(entry.url);
      if (!response?.ok) {
        throw new Error(`could not fetch bundled DAT (${response?.status ?? "network error"})`);
      }
      const declaredBytes = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_DAT_BYTES) {
        throw new RangeError(`bundled DAT exceeds the ${MAX_DAT_BYTES}-byte import limit`);
      }
      const datBytes = await response.arrayBuffer();
      if (datBytes.byteLength > MAX_DAT_BYTES) {
        throw new RangeError(`bundled DAT exceeds the ${MAX_DAT_BYTES}-byte import limit`);
      }
      const datHash = await datSha256(datBytes, cryptoProvider);
      if (datHash !== entry.sha256) {
        throw new Error(`bundled DAT SHA-256 mismatch (expected ${entry.sha256}, got ${datHash})`);
      }
      return Object.freeze({
        filename: entry.filename,
        datHash,
        datBytes,
        origin: "bundled",
        ...(entry.title ? { title: entry.title } : {}),
        ...(entry.category ? { category: entry.category } : {}),
      });
    },
  });
}

function positiveInteger(value, fallback = 1) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function unsignedNumber(value, fallback = 0) {
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Math.min(Number(value), Number.MAX_SAFE_INTEGER);
  }
  return Number.isFinite(value) && value >= 0
    ? Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER)
    : fallback;
}

function optionalUnsignedNumber(value) {
  return value === null || value === undefined ? undefined : unsignedNumber(value);
}

function sumCounts(values) {
  return Array.isArray(values)
    ? values.reduce(
        (total, value) => Math.min(Number.MAX_SAFE_INTEGER, total + unsignedNumber(value)),
        0,
      )
    : 0;
}

function countAt(values, index) {
  return Array.isArray(values) ? unsignedNumber(values[index]) : 0;
}

function terminalMessage(terminal) {
  if (terminal?.result === "win") return "Exit reached. Replay ready to save.";
  if (terminal?.result !== "loss") return undefined;
  return {
    timeout: "Time ran out.",
    water: "Chip drowned.",
    collision: "A creature caught Chip.",
    fallingOut: "Chip fell out of the level.",
    fire: "Chip burned up.",
    bomb: "Chip was caught in an explosion.",
  }[terminal.cause] ?? "The level ended in a loss.";
}

function terminalStatus(terminal) {
  if (terminal?.result === "win") return "won";
  if (terminal?.result === "loss") return "lost";
  return "playing";
}

function viewportOrigin(size, focus) {
  if (size <= VIEW_SIZE) return 0;
  return Math.min(size - VIEW_SIZE, Math.max(0, Math.trunc(focus) - Math.floor(VIEW_SIZE / 2)));
}

function visualElements(cell) {
  return Array.isArray(cell?.elements)
    ? cell.elements.filter((element) => typeof element?.symbol === "string")
    : [];
}

function presentationFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const fields = {};
  for (const [name, field] of Object.entries(value)) {
    if (
      typeof name === "string" &&
      name !== "" &&
      (typeof field === "string" ||
        typeof field === "number" ||
        typeof field === "boolean" ||
        field === null)
    ) {
      fields[name] = field;
    }
  }
  return Object.freeze(fields);
}

function presentationElement(element) {
  const channelOpen = typeof element.channelOpen === "boolean" ? element.channelOpen : null;
  const appearance = element.appearance ?? null;
  if (
    appearance !== null &&
    (element.symbol !== "button" || !BUTTON_APPEARANCES.has(appearance))
  ) {
    throw new TypeError("Native player returned an invalid button appearance");
  }
  return Object.freeze({
    slot: typeof element.slot === "string" ? element.slot : "",
    symbol: element.symbol,
    live: element.live === true,
    channelOpen,
    appearance,
    fields: presentationFields(element.fields),
    state: Object.freeze({
      remainingUses: unsignedNumber(element.remainingUses),
      revealUntilBoundary: unsignedNumber(element.revealUntilBoundary),
      stateFlags: unsignedNumber(element.stateFlags),
      channelOpen,
    }),
  });
}

function visualTerrain(elements, boundary) {
  const terrain = elements.find((element) => element.slot === "terrain")?.symbol ?? "floor";
  const overlayElement = elements.find((element) => element.slot === "overlay");
  const overlay = overlayElement?.symbol;
  if (overlay === "socket") return "socket";
  if (overlay === "toggle_wall") {
    const open = overlayElement.channelOpen === true;
    if (!open) return "wall";
  }
  const terrainElement = elements.find((element) => element.slot === "terrain");
  if (terrain === "pop_up_wall") return "floor";
  if (terrain === "trick_wall") {
    const rule = terrainElement?.fields?.rule;
    if (rule === "invisible_becomes_wall") return "floor";
    if (rule === "permanently_invisible") {
      return terrainElement.state.revealUntilBoundary > boundary ? "wall" : "floor";
    }
    return "wall";
  }
  if (terrain === "ice_corner") return "ice";
  if (terrain === "force_random") return "force";
  return terrain;
}

function visualItem(elements) {
  const pickup = elements.find((element) => element.slot === "pickup")?.symbol;
  if (pickup === "ic_chip") return "chip";
  return pickup;
}

function visualField(elements, slot, name) {
  const value = elements.find((element) => element.slot === slot)?.fields?.[name];
  return typeof value === "string" ? value : undefined;
}

function normalizedCell(cell, actorById, playerActorId, originX, originY, boundary) {
  const rawElements = visualElements(cell);
  const elements = Object.freeze(rawElements.map(presentationElement));
  const result = {
    x: Math.trunc(cell.x) - originX,
    y: Math.trunc(cell.y) - originY,
    terrain: visualTerrain(elements, boundary),
    elements,
  };
  const item = visualItem(elements);
  if (item) result.item = item;
  const itemColor = visualField(elements, "pickup", "color");
  if (itemColor) result.itemColor = itemColor;
  const overlay = elements.find((element) => element.slot === "overlay")?.symbol;
  if (overlay && overlay !== "toggle_wall") result.overlay = overlay;
  const overlayColor = visualField(elements, "overlay", "color");
  if (overlayColor) result.overlayColor = overlayColor;
  if (cell.occupantActorId !== null && cell.occupantActorId !== undefined) {
    const actor = actorById.get(cell.occupantActorId);
    result.actor = cell.occupantActorId === playerActorId
      ? "player"
      : actor?.symbol ?? "actor";
    result.actorSymbol = result.actor;
    if (typeof actor?.facing === "string") result.actorFacing = actor.facing;
  }
  return result;
}

/** Translate the native host's complete layer frame into the compact UI view. */
export function normalizeNativeFrame(frame) {
  if (
    !frame ||
    frame.format !== "hybridcc.player-frame" ||
    frame.version !== 1 ||
    !frame.dimensions ||
    !Array.isArray(frame.cells) ||
    !Array.isArray(frame.actors)
  ) {
    throw new TypeError("Native player returned an unsupported frame format");
  }

  const width = positiveInteger(frame.dimensions.width);
  const height = positiveInteger(frame.dimensions.height);
  const depth = positiveInteger(frame.dimensions.depth);
  const z = Math.min(depth - 1, unsignedNumber(frame.viewZ));
  const focusX = Number.isFinite(frame.player?.x)
    ? frame.player.x
    : Number.isFinite(frame.terminal?.location?.x)
      ? frame.terminal.location.x
      : 0;
  const focusY = Number.isFinite(frame.player?.y)
    ? frame.player.y
    : Number.isFinite(frame.terminal?.location?.y)
      ? frame.terminal.location.y
      : 0;
  const originX = viewportOrigin(width, focusX);
  const originY = viewportOrigin(height, focusY);
  const boundary = unsignedNumber(frame.boundary);
  const actorById = new Map(
    frame.actors
      .filter((actor) => actor && actor.actorId !== undefined)
      .map((actor) => [
        actor.actorId,
        Object.freeze({
          symbol: typeof actor.symbol === "string" ? actor.symbol : "actor",
          facing: typeof actor.facing === "string" ? actor.facing : undefined,
        }),
      ]),
  );
  const playerActorId = frame.player?.actorId;
  const cells = frame.cells
    .filter(
      (cell) =>
        Number.isInteger(cell?.x) &&
        Number.isInteger(cell?.y) &&
        cell.x >= originX &&
        cell.x < originX + VIEW_SIZE &&
        cell.y >= originY &&
        cell.y < originY + VIEW_SIZE,
    )
    .map((cell) => normalizedCell(
      cell,
      actorById,
      playerActorId,
      originX,
      originY,
      boundary,
    ));
  const resources = frame.resources ?? {};
  const keys = resources.keys;
  const tools = TOOL_NAMES.filter((_, index) => countAt(resources.tools, index) > 0);

  return {
    status: terminalStatus(frame.terminal),
    boundary,
    timeRemainingLogicSteps: optionalUnsignedNumber(frame.timeRemainingSteps),
    chipsRemaining: sumCounts(resources.remaining),
    terminalMessage: terminalMessage(frame.terminal),
    hint: typeof frame.hint === "string" ? frame.hint : undefined,
    resources: {
      keys: {
        red: countAt(keys, 0),
        yellow: countAt(keys, 1),
        blue: countAt(keys, 2),
        green: countAt(keys, 3),
      },
      tools,
    },
    viewport: {
      width: VIEW_SIZE,
      height: VIEW_SIZE,
      depth,
      z,
      originX,
      originY,
      cells,
    },
  };
}

function normalizeNativeCatalog(record, value, levelCount) {
  if (
    !value ||
    value.format !== "hybridcc.player-catalog" ||
    value.version !== 1 ||
    !Array.isArray(value.levels)
  ) {
    throw new TypeError("Native player returned an unsupported catalog format");
  }
  if (value.levels.length !== levelCount) {
    throw new TypeError("Native catalog length disagrees with hcc_player_level_count");
  }

  const levels = value.levels.map((rawLevel, position) => {
    const index = Number.isInteger(rawLevel?.index) && rawLevel.index >= 0
      ? rawLevel.index
      : position;
    const idHex = typeof rawLevel?.idHex === "string" ? rawLevel.idHex : "";
    return {
      id: `${index}:${idHex}`,
      number: index + 1,
      sourceNumber: index + 1,
      title:
        typeof rawLevel?.title === "string" && rawLevel.title.trim() !== ""
          ? rawLevel.title
          : `Level ${index + 1}`,
      author: typeof rawLevel?.author === "string" ? rawLevel.author : "",
      // The catalog intentionally does not start every level merely to learn
      // dimensions. The first frame replaces these display placeholders.
      width: 1,
      height: 1,
      depth: 1,
    };
  });
  const title =
    typeof record.title === "string" && record.title.trim() !== ""
      ? record.title
      : record.filename.replace(/\.dat$/i, "") || record.filename;
  const summary = record.source
    ? `BitBusters ${record.source.game} custom pack #${record.source.packId}`
    : record.origin === "bundled"
      ? `${record.category ? `${record.category} · ` : ""}Bundled DAT level set`
      : "Stored DAT level set";
  return {
    id: record.filename,
    title,
    summary,
    sourceName: record.filename,
    levels,
  };
}

function levelIndexFromId(value) {
  const match = /^(\d+):/.exec(value);
  return match ? Number(match[1]) : -1;
}

function sameBytes(left, right) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

/**
 * Bind the web UI to the raw private C ABI. IndexedDB is the multi-DAT catalog:
 * one native handle owns one immediately converted DAT, so catalog scans and
 * level selection reopen the appropriate stored bytes sequentially. No DAT is
 * ever passed to the deterministic hcc_game_* ABI.
 */
export function createWasmPlayerAdapter(
  binding,
  {
    datSource = createIndexedDbDatSource(),
    bundledDatSource = createBundledDatSource(),
    rngSeed = 0,
  } = {},
) {
  for (const name of EXPECTED_HCC_PLAYER_EXPORTS) {
    if (typeof binding?.[name] !== "function") {
      throw new TypeError(`HybridCC Wasm module is missing ${name}()`);
    }
  }
  if (!(binding.HEAPU8 instanceof Uint8Array)) {
    throw new TypeError("HybridCC Wasm module is missing HEAPU8");
  }
  if (!datSource || typeof datSource.list !== "function" || typeof datSource.putFile !== "function") {
    throw new TypeError("HybridCC Wasm adapter requires a DAT source");
  }
  if (
    !bundledDatSource ||
    typeof bundledDatSource.manifest !== "function" ||
    typeof bundledDatSource.load !== "function"
  ) {
    throw new TypeError("HybridCC Wasm adapter requires a bundled DAT source");
  }
  if (!Number.isInteger(rngSeed) || rngSeed < 0 || rngSeed > 0xffffffff) {
    throw new TypeError("HybridCC Wasm RNG seed must be a uint32");
  }

  const player = binding._hcc_player_create();
  if (!player) throw new Error("HybridCC Wasm player could not be allocated");
  let destroyed = false;
  let importErrors = [];
  let entriesBySetId = new Map();
  let currentEntry = null;
  let currentLevel = null;
  let lastExport = null;

  function requireLive() {
    if (destroyed) throw new Error("HybridCC Wasm player has been destroyed");
    return player;
  }

  function heap() {
    if (!(binding.HEAPU8 instanceof Uint8Array)) {
      throw new Error("HybridCC Wasm memory is unavailable");
    }
    return binding.HEAPU8;
  }

  function allocateBytes(bytes) {
    const value = replayBytes(bytes);
    if (value.byteLength === 0) return { pointer: 0, size: 0 };
    const pointer = binding._malloc(value.byteLength);
    if (!pointer) throw new Error("HybridCC Wasm input allocation failed");
    heap().set(value, pointer);
    return { pointer, size: value.byteLength };
  }

  function freeAllocated(...allocated) {
    for (const value of allocated) {
      if (value.pointer) binding._free(value.pointer);
    }
  }

  function readBorrowedBytes(call, label) {
    const sizePointer = binding._malloc(SIZE_T_BYTES);
    if (!sizePointer) throw new Error("HybridCC Wasm output allocation failed");
    try {
      new DataView(heap().buffer).setUint32(sizePointer, 0, true);
      const pointer = call(sizePointer);
      const size = new DataView(heap().buffer).getUint32(sizePointer, true);
      if (size === 0) return new Uint8Array();
      if (!pointer || pointer > heap().byteLength || size > heap().byteLength - pointer) {
        throw new Error(`${label} returned an invalid Wasm memory range`);
      }
      return heap().slice(pointer, pointer + size);
    } finally {
      binding._free(sizePointer);
    }
  }

  function lastError() {
    try {
      return textDecoder.decode(
        readBorrowedBytes(
          (sizePointer) => binding._hcc_player_last_error(requireLive(), sizePointer),
          "hcc_player_last_error",
        ),
      );
    } catch {
      return "";
    }
  }

  function checkStatus(status, label) {
    if (status === 0) return;
    const detail = lastError();
    throw new Error(`${detail ? `${detail} (` : ""}${label} status ${status}${detail ? ")" : ""}`);
  }

  function readJson(call, label) {
    const bytes = readBorrowedBytes(call, label);
    if (bytes.byteLength === 0) {
      throw new Error(lastError() || `${label} returned no data`);
    }
    try {
      return JSON.parse(textDecoder.decode(bytes));
    } catch (error) {
      throw new Error(`${label} returned invalid JSON: ${error.message}`);
    }
  }

  function openRecord(record) {
    requireLive();
    if (record.datBytes?.byteLength > MAX_DAT_BYTES) {
      throw new RangeError(`DAT exceeds the ${MAX_DAT_BYTES}-byte import limit`);
    }
    let dat = { pointer: 0, size: 0 };
    let source = { pointer: 0, size: 0 };
    let revision = { pointer: 0, size: 0 };
    try {
      dat = allocateBytes(record.datBytes);
      source = allocateBytes(textEncoder.encode(record.filename));
      revision = allocateBytes(textEncoder.encode(record.datHash ?? ""));
      checkStatus(
        binding._hcc_player_open_dat(
          player,
          dat.pointer,
          dat.size,
          source.pointer,
          source.size,
          revision.pointer,
          revision.size,
        ),
        "hcc_player_open_dat",
      );
    } finally {
      freeAllocated(dat, source, revision);
    }
  }

  function readCatalog(record) {
    const raw = readJson(
      (sizePointer) => binding._hcc_player_catalog_json(player, sizePointer),
      "hcc_player_catalog_json",
    );
    const levelCount = binding._hcc_player_level_count(player);
    const set = normalizeNativeCatalog(record, raw, levelCount);
    const levelsById = new Map(
      set.levels.map((level) => [level.id, { ...level, index: levelIndexFromId(level.id) }]),
    );
    return { record, set, levelsById };
  }

  async function mergedDatRecords() {
    const errors = [];
    let importedRecords = [];
    let bundledEntries = [];
    try {
      importedRecords = await datSource.list();
      if (typeof datSource.getErrors === "function") {
        const storedErrors = await datSource.getErrors();
        for (const error of Array.isArray(storedErrors) ? storedErrors : []) {
          errors.push({
            filename:
              typeof error?.filename === "string" ? error.filename : "Stored DAT record",
            message:
              typeof error?.message === "string"
                ? error.message
                : "Stored DAT record was skipped",
          });
        }
      }
    } catch (error) {
      errors.push({
        filename: "Browser DAT storage",
        message: conversionMessage("Browser DAT storage", error),
      });
    }
    try {
      bundledEntries = await bundledDatSource.manifest();
    } catch (error) {
      errors.push({
        filename: "Bundled DAT manifest",
        message: conversionMessage("Bundled DAT manifest", error),
      });
    }

    const importedByFilename = new Map(
      importedRecords.map((record) => [record.filename, record]),
    );
    const records = [];
    for (const entry of bundledEntries) {
      const imported = importedByFilename.get(entry.filename);
      if (imported) {
        records.push({
          ...imported,
          ...(entry.title ? { title: entry.title } : {}),
          ...(entry.category ? { category: entry.category } : {}),
        });
        importedByFilename.delete(entry.filename);
        continue;
      }
      try {
        records.push(await bundledDatSource.load(entry));
      } catch (error) {
        errors.push({
          filename: entry.filename,
          message: conversionMessage(entry.filename, error),
        });
      }
    }
    records.push(...importedByFilename.values());
    return { records, errors };
  }

  async function rebuildCatalog() {
    requireLive();
    const merged = await mergedDatRecords();
    const nextEntries = new Map();
    const sets = [];
    const errors = [...merged.errors];
    for (const record of merged.records) {
      try {
        openRecord(record);
        const entry = readCatalog(record);
        nextEntries.set(entry.set.id, entry);
        sets.push(entry.set);
      } catch (error) {
        errors.push({
          filename: record.filename,
          message: conversionMessage(record.filename, error),
        });
      }
    }
    entriesBySetId = nextEntries;
    importErrors = errors;
    currentEntry = null;
    currentLevel = null;
    lastExport = null;
    return sets;
  }

  const adapter = {
    getCatalog: rebuildCatalog,

    async getImportErrors() {
      return importErrors.map((error) => ({ ...error }));
    },

    async importDat(file) {
      if (!/\.dat$/i.test(String(file?.name ?? "").trim())) {
        throw new TypeError("HybridCC player imports .dat files only");
      }
      const record = await datSource.putFile(file);
      const catalog = await rebuildCatalog();
      return { filename: record.filename, catalog };
    },

    async loadLevel(setId, levelId) {
      requireLive();
      const entry = entriesBySetId.get(setId);
      const level = entry?.levelsById.get(levelId);
      if (!entry || !level) throw new Error("Unknown DAT level selection");
      currentEntry = null;
      currentLevel = null;
      lastExport = null;
      openRecord(entry.record);
      checkStatus(
        binding._hcc_player_start_level(player, level.index, rngSeed),
        "hcc_player_start_level",
      );
      currentEntry = entry;
      currentLevel = level;
    },

    async getSnapshot(z = 0) {
      requireLive();
      const raw = readJson(
        (sizePointer) =>
          binding._hcc_player_frame_json(player, Math.max(0, Math.trunc(z)), sizePointer),
        "hcc_player_frame_json",
      );
      return normalizeNativeFrame(raw);
    },

    async step(packet) {
      requireLive();
      checkStatus(
        binding._hcc_player_step(
          player,
          directionCode(packet?.primary ?? null),
          directionCode(packet?.secondary ?? null),
        ),
        "hcc_player_step",
      );
      lastExport = null;
    },

    async restart() {
      requireLive();
      checkStatus(binding._hcc_player_restart_level(player), "hcc_player_restart_level");
      lastExport = null;
    },

    async saveReplay() {
      requireLive();
      if (!currentEntry || !currentLevel) throw new Error("No DAT level is running");
      const bytes = readBorrowedBytes(
        (sizePointer) => binding._hcc_player_export_replay(player, sizePointer),
        "hcc_player_export_replay",
      );
      if (bytes.byteLength === 0) {
        throw new Error(lastError() || "The native player could not export a verified replay");
      }
      lastExport = bytes.slice();
      const stem = currentEntry.set.sourceName.replace(/\.dat$/i, "") || "hybridcc";
      return {
        filename: `${stem}-${currentLevel.number}.hccrpl`,
        bytes,
        mimeType: "application/octet-stream",
      };
    },

    async verifyReplay(value) {
      requireLive();
      const bytes = replayBytes(value);
      if (!lastExport || !sameBytes(bytes, lastExport)) {
        return { ok: false, message: "Replay bytes do not match the latest native export." };
      }
      const allocated = allocateBytes(bytes);
      try {
        const status = binding._hcc_player_verify_replay(player, allocated.pointer, allocated.size);
        if (status !== 0) {
          return {
            ok: false,
            message: lastError() || `hcc_player_verify_replay status ${status}`,
          };
        }
      } finally {
        freeAllocated(allocated);
      }
      return { ok: true, message: "Replay was freshly verified by the native player." };
    },

    async destroy() {
      if (destroyed) return;
      destroyed = true;
      binding._hcc_player_destroy(player);
    },
  };

  return Object.freeze(assertPlayerAdapter(adapter));
}

/** Load generated Emscripten glue using deployment-root-relative siblings. */
export async function loadWasmPlayerAdapter({
  moduleUrl = new URL("../hybridcc-player.mjs", import.meta.url).href,
  wasmUrl = new URL("../hybridcc-player.wasm", import.meta.url).href,
  datSource,
  bundledDatSource,
  rngSeed = 0,
  fetchImpl = globalThis.fetch,
  webAssembly = globalThis.WebAssembly,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof webAssembly?.compile !== "function") {
    throw new Error("This browser cannot load the HybridCC Wasm engine");
  }
  const glue = await import(moduleUrl);
  const factory = glue.default;
  if (typeof factory !== "function") {
    throw new TypeError("HybridCC Wasm glue must export its Emscripten module factory as default");
  }
  const response = await fetchImpl(wasmUrl, { credentials: "same-origin" });
  if (!response?.ok) {
    throw new Error(`HybridCC Wasm binary could not be loaded (${response?.status ?? "network error"})`);
  }
  const compiled = await webAssembly.compile(await response.arrayBuffer());
  let exportedMemory = null;
  const binding = await factory({
    locateFile: (filename) => (filename.endsWith(".wasm") ? wasmUrl : filename),
    // Emscripten's documented hook lets the host retain the exported memory
    // without relying on generated glue exposing a particular heap global.
    instantiateWasm(imports, receiveInstance) {
      const instance = new webAssembly.Instance(compiled, imports);
      exportedMemory = Object.values(instance.exports).find(
        (value) => value instanceof webAssembly.Memory,
      ) ?? null;
      receiveInstance(instance);
      return instance.exports;
    },
  });
  if (!(binding.HEAPU8 instanceof Uint8Array)) {
    if (!exportedMemory) {
      throw new Error("HybridCC Wasm module did not export its linear memory");
    }
    Object.defineProperty(binding, "HEAPU8", {
      configurable: false,
      enumerable: true,
      get: () => new Uint8Array(exportedMemory.buffer),
    });
  }
  return createWasmPlayerAdapter(binding, { datSource, bundledDatSource, rngSeed });
}
