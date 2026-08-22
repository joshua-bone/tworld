import { BoundedSubtickClock, BrowserInputCollector } from "./input.mjs";
import { loadSelectedPlayerLevel } from "./level-loader.mjs";
import {
  buildPlayerViewModel,
  createSelection,
  filterSets,
  normalizeCatalog,
  selectAdjacentLevel,
  selectLevel,
  selectSet,
  selectZ,
} from "./model.mjs";
import { drawBoard } from "./render.mjs";
import { loadWasmPlayerAdapter } from "./wasm-adapter.mjs";

const HOST_SUBTICK_MS = 25;

function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`HybridCC player markup is missing #${id}`);
  return element;
}

const ui = {
  activeSetSource: byId("active-set-source"),
  activeSetTitle: byId("active-set-title"),
  board: byId("game-board"),
  boardMessage: byId("board-message"),
  datDrop: byId("dat-drop"),
  datFile: byId("dat-file"),
  importErrors: byId("import-errors"),
  keyBlue: byId("key-blue"),
  keyGreen: byId("key-green"),
  keyRed: byId("key-red"),
  keyYellow: byId("key-yellow"),
  levelCount: byId("level-count"),
  levelList: byId("level-list"),
  nextLevel: byId("next-level"),
  notice: byId("notice"),
  openDat: byId("open-dat"),
  pause: byId("pause"),
  playerAuthor: byId("player-author"),
  playerLevelTitle: byId("player-level-title"),
  playerSetTitle: byId("player-set-title"),
  previousLevel: byId("previous-level"),
  restart: byId("restart"),
  saveReplay: byId("save-replay"),
  setCount: byId("set-count"),
  setList: byId("set-list"),
  setSearch: byId("set-search"),
  statusLabel: byId("status-label"),
  statusPill: byId("status-pill"),
  toolList: byId("tool-list"),
  hudBoundary: byId("hud-boundary"),
  hudChips: byId("hud-chips"),
  hudMessage: byId("hud-message"),
  hudTime: byId("hud-time"),
  zDown: byId("z-down"),
  zLabel: byId("z-label"),
  zUp: byId("z-up"),
};

const input = new BrowserInputCollector();
const subtickClock = new BoundedSubtickClock({
  intervalMs: HOST_SUBTICK_MS,
  maxCatchUp: 8,
});
let adapter = null;
let catalog = normalizeCatalog([]);
let selection = createSelection(catalog);
let observation = null;
let paused = true;
let busy = false;
let available = false;
let unavailableMessage = "";
let importErrors = [];
let searchQuery = "";
let clockId = null;
let unbindInput = null;

function notice(message = "", tone = "info") {
  ui.notice.textContent = message;
  ui.notice.dataset.tone = tone;
}

function textElement(className, text) {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function selectedSet() {
  return catalog.find((set) => set.id === selection.setId) ?? null;
}

function selectedLevel() {
  return selectedSet()?.levels.find((level) => level.id === selection.levelId) ?? null;
}

function renderSets(view) {
  const visibleSets = filterSets(catalog, searchQuery);
  ui.setCount.textContent = String(visibleSets.length);
  const fragment = document.createDocumentFragment();

  for (const set of visibleSets) {
    const row = view.sets.find((candidate) => candidate.id === set.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-button set-row";
    button.disabled = busy || !available;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(row?.selected === true));
    button.append(
      textElement("set-row__title", set.title),
      textElement("set-row__summary", set.summary),
      textElement(
        "set-row__meta",
        `${set.levels.length} ${set.levels.length === 1 ? "level" : "levels"} · ${set.sourceName}`,
      ),
    );
    button.addEventListener("click", () => {
      void runExclusive(async () => {
        selection = selectSet(catalog, selection, set.id);
        await loadSelectedLevel();
      });
    });
    fragment.append(button);
  }

  if (visibleSets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = searchQuery.trim()
      ? `No DAT sets match “${searchQuery.trim()}”.`
      : "No stored DAT files are playable yet.";
    fragment.append(empty);
  }
  ui.setList.replaceChildren(fragment);
}

function renderLevels(view) {
  ui.levelCount.textContent = String(view.levels.length);
  const fragment = document.createDocumentFragment();

  for (const level of view.levels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-button level-row";
    button.disabled = busy || !available;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(level.selected));
    const copy = document.createElement("span");
    copy.className = "level-row__copy";
    copy.append(
      textElement("level-row__title", level.title),
      textElement("level-row__meta", level.author || "Unknown author"),
    );
    button.append(
      textElement("level-row__number", String(level.number)),
      copy,
      textElement("level-row__depth", level.depth > 1 ? `${level.depth}Z` : ""),
    );
    button.addEventListener("click", () => {
      void runExclusive(async () => {
        selection = selectLevel(catalog, selection, level.id);
        await loadSelectedLevel();
      });
    });
    fragment.append(button);
  }

  if (view.levels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = selectedSet()
      ? "This DAT contains no convertible levels."
      : "Choose a DAT set to see its levels.";
    fragment.append(empty);
  }
  ui.levelList.replaceChildren(fragment);
}

function renderTools(tools) {
  if (tools.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty-value";
    empty.textContent = "None";
    ui.toolList.replaceChildren(empty);
    return;
  }

  ui.toolList.replaceChildren(
    ...tools.map((tool) => {
      const chip = document.createElement("span");
      chip.className = "tool-chip";
      chip.textContent = tool.replaceAll("_", " ");
      return chip;
    }),
  );
}

function renderImportErrors() {
  ui.importErrors.replaceChildren(
    ...importErrors.map((error) => {
      const line = document.createElement("div");
      line.textContent = error.message ?? `${error.filename}: conversion failed`;
      return line;
    }),
  );
}

function render() {
  const view = buildPlayerViewModel(catalog, selection, { paused, observation });
  const set = selectedSet();
  renderSets(view);
  renderLevels(view);
  renderImportErrors();

  ui.activeSetTitle.textContent = view.player.setTitle;
  ui.activeSetSource.textContent = set?.sourceName ?? "Choose or drop a local DAT file.";
  ui.playerSetTitle.textContent = view.player.setTitle;
  ui.playerLevelTitle.textContent = view.player.title;
  ui.playerAuthor.textContent = view.player.author ? `by ${view.player.author}` : "";
  ui.statusLabel.textContent = unavailableMessage ? "Unavailable" : view.player.statusLabel;
  ui.statusPill.dataset.tone =
    unavailableMessage
      ? "error"
      : observation?.status === "won"
      ? "won"
      : observation?.status === "lost"
        ? "lost"
        : observation?.status === "error"
          ? "error"
          : paused
            ? "paused"
            : "playing";

  ui.hudTime.textContent = view.player.time;
  ui.hudChips.textContent = view.player.chips;
  ui.hudBoundary.textContent = view.player.boundary;
  ui.hudMessage.textContent = view.player.message;
  ui.keyRed.textContent = String(view.player.keys.red);
  ui.keyBlue.textContent = String(view.player.keys.blue);
  ui.keyYellow.textContent = String(view.player.keys.yellow);
  ui.keyGreen.textContent = String(view.player.keys.green);
  renderTools(view.player.tools);

  ui.openDat.disabled = busy || !available;
  ui.datFile.disabled = busy || !available;
  ui.setSearch.disabled = busy || !available;
  ui.datDrop.dataset.disabled = String(!available);
  ui.datDrop.setAttribute("aria-disabled", String(!available));
  ui.previousLevel.disabled = busy || !available || !view.player.canPrevious;
  ui.nextLevel.disabled = busy || !available || !view.player.canNext;
  ui.pause.disabled =
    busy ||
    !available ||
    !view.player.canPlay ||
    view.player.terminal ||
    observation?.status === "error";
  ui.pause.textContent = paused ? "Play" : "Pause";
  ui.restart.disabled = busy || !available || !view.player.canPlay;
  ui.saveReplay.disabled = busy || !available || !view.player.terminal;
  ui.zDown.disabled = busy || !available || !view.player.canZDown;
  ui.zUp.disabled = busy || !available || !view.player.canZUp;
  ui.zLabel.textContent = view.player.zLabel;
  for (const button of document.querySelectorAll("[data-direction]")) {
    button.disabled =
      !available || paused || view.player.terminal || observation?.status === "error";
  }

  ui.boardMessage.textContent = unavailableMessage
    ? unavailableMessage
    : !selectedLevel()
      ? "Choose a DAT and level."
      : view.player.terminal
        ? view.player.message
        : observation?.status === "error"
          ? view.player.message
        : paused
          ? "Paused"
          : "";
  drawBoard(ui.board, observation);
}

async function refreshObservation() {
  observation = selectedLevel() ? await adapter.getSnapshot(selection.z) : null;
}

async function refreshImportErrors() {
  importErrors = await adapter.getImportErrors();
}

async function loadSelectedLevel() {
  const set = selectedSet();
  const level = selectedLevel();
  const result = await loadSelectedPlayerLevel({
    adapter,
    set,
    level,
    z: selection.z,
    onBegin() {
      input.reset("map");
      subtickClock.reset();
      paused = true;
      observation = null;
      render();
    },
  });
  observation = result.observation;
  paused = !result.ok;
  if (result.error) notice(result.error, "error");
  render();
  return result.ok;
}

async function refreshCatalog(preferredSourceName = null) {
  const rawCatalog = await adapter.getCatalog();
  catalog = normalizeCatalog(rawCatalog);
  let requested = {
    setId: selection.setId,
    levelId: selection.levelId,
    z: selection.z,
  };
  if (preferredSourceName) {
    const imported = catalog.find((set) => set.sourceName === preferredSourceName);
    if (imported) requested = { setId: imported.id };
  }
  selection = createSelection(catalog, requested);
  await refreshImportErrors();
}

async function runExclusive(task) {
  if (busy) return;
  busy = true;
  render();
  try {
    await task();
  } catch (error) {
    notice(error instanceof Error ? error.message : String(error), "error");
  } finally {
    busy = false;
    render();
  }
}

function togglePause() {
  if (
    !selectedLevel() ||
    observation?.status === "won" ||
    observation?.status === "lost" ||
    observation?.status === "error"
  ) return;
  paused = !paused;
  input.reset("pause");
  subtickClock.reset();
  render();
}

async function restartLevel() {
  if (!selectedLevel()) return;
  if (observation?.status === "error") {
    await loadSelectedLevel();
    return;
  }
  input.reset("restart");
  subtickClock.reset();
  await adapter.restart();
  paused = false;
  await refreshObservation();
  notice("Level restarted.", "info");
}

async function moveLevel(delta) {
  const next = selectAdjacentLevel(catalog, selection, delta);
  if (next.levelId === selection.levelId) return;
  selection = next;
  await loadSelectedLevel();
}

async function changeZ(delta) {
  selection = selectZ(
    catalog,
    selection,
    selection.z + delta,
    observation?.viewport?.depth,
  );
  await refreshObservation();
}

function download(filename, bytes, mimeType) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function saveReplay() {
  const replay = await adapter.saveReplay();
  const verification = await adapter.verifyReplay(replay.bytes);
  if (verification?.ok !== true) {
    throw new Error(verification?.message ?? "Replay verification failed; nothing was downloaded");
  }
  download(replay.filename, replay.bytes, replay.mimeType);
  notice(verification.message ?? "Replay verified and saved.", "success");
}

async function importFiles(files) {
  let preferredSourceName = null;
  for (const file of files) {
    try {
      const result = await adapter.importDat(file);
      preferredSourceName = result?.filename ?? file.name;
    } catch (error) {
      notice(error instanceof Error ? error.message : String(error), "error");
    }
  }
  await refreshCatalog(preferredSourceName);
  await loadSelectedLevel();
  if (importErrors.length > 0) {
    notice(`${importErrors.length} stored DAT file${importErrors.length === 1 ? "" : "s"} could not be converted.`, "error");
  } else if (preferredSourceName) {
    notice(`${preferredSourceName} stored and converted for HybridCC.`, "success");
  }
}

async function handleRuntimeAction(action) {
  if (action.kind === "pause_toggle") {
    togglePause();
  } else if (action.kind === "restart_level") {
    await restartLevel();
  } else if (action.kind === "next_level") {
    await moveLevel(1);
  } else if (action.kind === "prev_level") {
    await moveLevel(-1);
  } else if (action.kind === "back") {
    if (!paused) togglePause();
  }
}

async function sampleHostSubtick() {
  if (busy) return;
  const nowMs = performance.now();
  const actions = input.drainActions();
  if (actions.length > 0) {
    subtickClock.reset(nowMs);
    await runExclusive(async () => {
      for (const action of actions) await handleRuntimeAction(action);
    });
    return;
  }
  const samples = subtickClock.due(
    nowMs,
    !paused && Boolean(selectedLevel()) && !document.hidden,
  );
  if (samples === 0) return;
  await runExclusive(async () => {
    for (let sample = 0; sample < samples; sample += 1) {
      const packet = input.sampleSubtick();
      if (packet !== null) {
        await adapter.step(packet);
        await refreshObservation();
      }
      if (observation?.status === "won" || observation?.status === "lost") {
        paused = true;
        input.reset("terminal");
        subtickClock.reset(nowMs);
        break;
      }
    }
  });
}

function bindUi() {
  ui.setSearch.addEventListener("input", () => {
    searchQuery = ui.setSearch.value;
    render();
  });
  ui.openDat.addEventListener("click", () => ui.datFile.click());
  ui.datFile.addEventListener("change", () => {
    const files = [...(ui.datFile.files ?? [])];
    ui.datFile.value = "";
    if (files.length > 0) void runExclusive(() => importFiles(files));
  });

  let dragDepth = 0;
  ui.datDrop.addEventListener("dragenter", (event) => {
    if (!available) return;
    if (![...(event.dataTransfer?.types ?? [])].includes("Files")) return;
    event.preventDefault();
    dragDepth += 1;
    ui.datDrop.dataset.active = "true";
  });
  ui.datDrop.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = available ? "copy" : "none";
  });
  ui.datDrop.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) ui.datDrop.dataset.active = "false";
  });
  ui.datDrop.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    ui.datDrop.dataset.active = "false";
    if (!available) return;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) void runExclusive(() => importFiles(files));
  });

  ui.pause.addEventListener("click", togglePause);
  ui.restart.addEventListener("click", () => void runExclusive(restartLevel));
  ui.previousLevel.addEventListener("click", () => void runExclusive(() => moveLevel(-1)));
  ui.nextLevel.addEventListener("click", () => void runExclusive(() => moveLevel(1)));
  ui.saveReplay.addEventListener("click", () => void runExclusive(saveReplay));
  ui.zDown.addEventListener("click", () => void runExclusive(() => changeZ(-1)));
  ui.zUp.addEventListener("click", () => void runExclusive(() => changeZ(1)));

  for (const button of document.querySelectorAll("[data-direction]")) {
    const direction = button.dataset.direction;
    const release = (event) => {
      input.releaseTouchDirection(event.pointerId);
      button.dataset.held = "false";
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      input.pressTouchDirection(event.pointerId, direction);
      button.dataset.held = "true";
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  unbindInput = input.bind(window, { visibilityTarget: document });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && !paused) {
      paused = true;
      subtickClock.reset();
      render();
    }
  });
}

async function resolveAdapter() {
  return loadWasmPlayerAdapter();
}

async function start() {
  bindUi();
  render();
  adapter = await resolveAdapter();
  await refreshCatalog();
  available = true;
  await loadSelectedLevel();
  subtickClock.reset(performance.now());
  clockId = window.setInterval(() => void sampleHostSubtick(), HOST_SUBTICK_MS);
}

window.addEventListener("pagehide", () => {
  if (clockId !== null) window.clearInterval(clockId);
  unbindInput?.();
  void adapter?.destroy();
}, { once: true });

start().catch((error) => {
  available = false;
  paused = true;
  input.reset("unavailable");
  unavailableMessage = `HybridCC player unavailable: ${
    error instanceof Error ? error.message : String(error)
  }`;
  notice(unavailableMessage, "error");
  void adapter?.destroy();
  adapter = null;
  render();
});
