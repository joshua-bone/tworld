function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Start one selected level without turning a per-level rejection into a
 * product-wide failure. onBegin runs synchronously so callers can pause and
 * clear the previous observation before any Wasm work yields.
 */
export async function loadSelectedPlayerLevel({
  adapter,
  set,
  level,
  z = 0,
  onBegin = () => {},
}) {
  onBegin();
  if (!set || !level) {
    return Object.freeze({ ok: false, observation: null, error: null });
  }
  try {
    await adapter.loadLevel(set.id, level.id);
    const observation = await adapter.getSnapshot(z);
    return Object.freeze({ ok: true, observation, error: null });
  } catch (error) {
    const message = `${set.sourceName} · ${level.number}. ${level.title}: ${errorMessage(error)}`;
    return Object.freeze({
      ok: false,
      observation: Object.freeze({ status: "error", terminalMessage: message }),
      error: message,
    });
  }
}
