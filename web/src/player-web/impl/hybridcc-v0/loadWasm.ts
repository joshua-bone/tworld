import engineJsUrl from "./engine/hybridcc_v0_wasm.js?url";
import engineWasmUrl from "./engine/hybridcc_v0_wasm.wasm?url";
import type { HybridCcWasmModule } from "./wasmBridge";

let modulePromise: Promise<HybridCcWasmModule> | null = null;

type HybridCcModuleFactory = (options: {
  locateFile: () => string;
}) => Promise<HybridCcWasmModule>;

export function loadHybridCcWasm(): Promise<HybridCcWasmModule> {
  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = import(/* @vite-ignore */ engineJsUrl).then(({ default: factory }) =>
    (factory as HybridCcModuleFactory)({ locateFile: () => engineWasmUrl }),
  );
  return modulePromise;
}
