function requireNonEmptyId(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must have a non-empty id`);
  }
  return value;
}

function finiteInteger(value, fallback) {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function findSet(catalog, setId) {
  return catalog.find((set) => set.id === setId) ?? null;
}

function findLevel(set, levelId) {
  return set?.levels.find((level) => level.id === levelId) ?? null;
}

function activePair(catalog, selection) {
  const set = findSet(catalog, selection.setId);
  return { set, level: findLevel(set, selection.levelId) };
}

function freezeSelection(setId, levelId, z, rememberedLevelBySet) {
  return Object.freeze({
    setId,
    levelId,
    z,
    rememberedLevelBySet: Object.freeze({ ...rememberedLevelBySet }),
  });
}

function normalizeLevel(rawLevel, index, setId, seenLevelIds) {
  if (!rawLevel || typeof rawLevel !== "object") {
    throw new TypeError(`Level ${index + 1} in set ${setId} must be an object`);
  }

  const id = requireNonEmptyId(rawLevel.id, `Level ${index + 1} in set ${setId}`);
  if (seenLevelIds.has(id)) throw new TypeError(`Duplicate level id ${id} in set ${setId}`);
  seenLevelIds.add(id);

  const number = Math.max(1, finiteInteger(rawLevel.number, index + 1));
  const depth = Math.max(1, finiteInteger(rawLevel.depth, 1));
  return Object.freeze({
    id,
    number,
    title:
      typeof rawLevel.title === "string" && rawLevel.title.trim() !== ""
        ? rawLevel.title
        : `Level ${number}`,
    author: typeof rawLevel.author === "string" ? rawLevel.author : "",
    depth,
    width: Math.max(1, finiteInteger(rawLevel.width, 1)),
    height: Math.max(1, finiteInteger(rawLevel.height, 1)),
    sourceNumber: finiteInteger(rawLevel.sourceNumber, number),
  });
}

/** Normalize the DAT-source adapter catalog into immutable UI data. */
export function normalizeCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog)) throw new TypeError("Player catalog must be an array");

  const seenSetIds = new Set();
  const catalog = rawCatalog.map((rawSet, setIndex) => {
    if (!rawSet || typeof rawSet !== "object") {
      throw new TypeError(`Set ${setIndex + 1} must be an object`);
    }
    const id = requireNonEmptyId(rawSet.id, `Set ${setIndex + 1}`);
    if (seenSetIds.has(id)) throw new TypeError(`Duplicate set id ${id}`);
    seenSetIds.add(id);

    const seenLevelIds = new Set();
    const rawLevels = rawSet.levels ?? [];
    if (!Array.isArray(rawLevels)) throw new TypeError(`Set ${id} levels must be an array`);
    const levels = Object.freeze(
      rawLevels.map((level, index) => normalizeLevel(level, index, id, seenLevelIds)),
    );

    return Object.freeze({
      id,
      title:
        typeof rawSet.title === "string" && rawSet.title.trim() !== ""
          ? rawSet.title
          : id,
      summary: typeof rawSet.summary === "string" ? rawSet.summary : "Local DAT level set",
      sourceName:
        typeof rawSet.sourceName === "string" && rawSet.sourceName.trim() !== ""
          ? rawSet.sourceName
          : `${id}.dat`,
      sourceKind: "dat",
      levels,
    });
  });

  return Object.freeze(catalog);
}

export function createSelection(catalog, requested = {}) {
  const requestedSet = findSet(catalog, requested.setId);
  const set = requestedSet ?? catalog[0] ?? null;
  if (!set) return freezeSelection(null, null, 0, {});

  const requestedLevel = findLevel(set, requested.levelId);
  const level = requestedLevel ?? set.levels[0] ?? null;
  if (!level) return freezeSelection(set.id, null, 0, {});

  const z = clamp(finiteInteger(requested.z, 0), 0, level.depth - 1);
  return freezeSelection(set.id, level.id, z, { [set.id]: level.id });
}

export function selectSet(catalog, selection, setId) {
  const set = findSet(catalog, setId);
  if (!set) return selection;

  const remembered = selection.rememberedLevelBySet[set.id];
  const level = findLevel(set, remembered) ?? set.levels[0] ?? null;
  return freezeSelection(
    set.id,
    level?.id ?? null,
    0,
    level
      ? { ...selection.rememberedLevelBySet, [set.id]: level.id }
      : selection.rememberedLevelBySet,
  );
}

export function selectLevel(catalog, selection, levelId) {
  const set = findSet(catalog, selection.setId);
  const level = findLevel(set, levelId);
  if (!set || !level) return selection;
  return freezeSelection(set.id, level.id, 0, {
    ...selection.rememberedLevelBySet,
    [set.id]: level.id,
  });
}

export function selectAdjacentLevel(catalog, selection, delta) {
  const set = findSet(catalog, selection.setId);
  if (!set || set.levels.length === 0) return selection;
  const currentIndex = Math.max(
    0,
    set.levels.findIndex((level) => level.id === selection.levelId),
  );
  const nextIndex = clamp(currentIndex + Math.sign(finiteInteger(delta, 0)), 0, set.levels.length - 1);
  return selectLevel(catalog, selection, set.levels[nextIndex].id);
}

export function selectZ(catalog, selection, z, observedDepth = undefined) {
  const { level } = activePair(catalog, selection);
  if (!level) return selection;
  const depth = Math.max(1, finiteInteger(observedDepth, level.depth));
  return freezeSelection(
    selection.setId,
    selection.levelId,
    clamp(finiteInteger(z, 0), 0, depth - 1),
    selection.rememberedLevelBySet,
  );
}

export function filterSets(catalog, query) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
  if (normalizedQuery === "") return [...catalog];
  return catalog.filter((set) =>
    `${set.title}\n${set.summary}\n${set.sourceName}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
}

function formatTime(logicSteps) {
  if (!Number.isFinite(logicSteps)) return "--:--.-";
  const tenths = Math.max(0, Math.trunc(logicSteps));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

function statusLabel(observation, paused) {
  if (observation?.status === "won") return "Level complete";
  if (observation?.status === "lost") return "Bummer";
  if (observation?.status === "error") return "Engine error";
  return paused ? "Paused" : "Playing";
}

function normalizedKeys(resources) {
  const keys = resources?.keys ?? {};
  return {
    red: Math.max(0, finiteInteger(keys.red, 0)),
    blue: Math.max(0, finiteInteger(keys.blue, 0)),
    yellow: Math.max(0, finiteInteger(keys.yellow, 0)),
    green: Math.max(0, finiteInteger(keys.green, 0)),
  };
}

export function buildPlayerViewModel(
  catalog,
  selection,
  { paused = true, observation = null } = {},
) {
  const { set, level } = activePair(catalog, selection);
  const levelIndex = set?.levels.findIndex((candidate) => candidate.id === level?.id) ?? -1;
  const observedDepth = finiteInteger(observation?.viewport?.depth, 0);
  const depth = level ? Math.max(1, observedDepth || level.depth) : 0;

  return Object.freeze({
    sets: Object.freeze(
      catalog.map((candidate) =>
        Object.freeze({
          id: candidate.id,
          title: candidate.title,
          summary: candidate.summary,
          sourceName: candidate.sourceName,
          levelCount: candidate.levels.length,
          selected: candidate.id === set?.id,
        }),
      ),
    ),
    levels: Object.freeze(
      (set?.levels ?? []).map((candidate) =>
        Object.freeze({
          id: candidate.id,
          number: candidate.number,
          title: candidate.title,
          author: candidate.author,
          depth: candidate.depth,
          selected: candidate.id === level?.id,
        }),
      ),
    ),
    player: Object.freeze({
      setTitle: set?.title ?? "No DAT selected",
      title: level ? `${level.number}. ${level.title}` : "No level selected",
      author: level?.author ?? "",
      time: formatTime(observation?.timeRemainingLogicSteps),
      chips: Number.isFinite(observation?.chipsRemaining)
        ? String(Math.max(0, Math.trunc(observation.chipsRemaining)))
        : "—",
      boundary: Number.isFinite(observation?.boundary)
        ? String(Math.max(0, Math.trunc(observation.boundary)))
        : "0",
      zLabel: level ? `Z ${selection.z + 1} of ${depth}` : "Z —",
      z: selection.z,
      depth,
      canZDown: selection.z > 0,
      canZUp: Boolean(level && selection.z + 1 < depth),
      canPrevious: levelIndex > 0,
      canNext: Boolean(set && levelIndex >= 0 && levelIndex + 1 < set.levels.length),
      canPlay: Boolean(level),
      paused,
      statusLabel: statusLabel(observation, paused),
      terminal: observation?.status === "won" || observation?.status === "lost",
      message:
        observation?.terminalMessage ??
        observation?.hint ??
        (level ? "Arrow keys or WASD to move." : "Choose a local DAT and a level."),
      keys: Object.freeze(normalizedKeys(observation?.resources)),
      tools: Object.freeze(
        Array.isArray(observation?.resources?.tools)
          ? observation.resources.tools.filter((tool) => typeof tool === "string")
          : [],
      ),
    }),
  });
}
