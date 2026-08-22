export const PLAYER_ADAPTER_METHODS = Object.freeze([
  "getCatalog",
  "getImportErrors",
  "importDat",
  "loadLevel",
  "getSnapshot",
  "step",
  "restart",
  "saveReplay",
  "verifyReplay",
  "destroy",
]);

/** Validate the mockable host boundary used by the browser UI. */
export function assertPlayerAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("HybridCC player adapter must be an object");
  }
  for (const method of PLAYER_ADAPTER_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new TypeError(`HybridCC player adapter is missing ${method}()`);
    }
  }
  return adapter;
}
