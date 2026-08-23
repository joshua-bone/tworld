import createHybridCcModule from "./engine/hybridcc_v0_wasm.js";
import type { HybridCcWasmModule } from "./wasmBridge";

let modulePromise: Promise<HybridCcWasmModule> | null = null;
const engineWasmUrl = new URL("./engine/hybridcc_v0_wasm.wasm", import.meta.url).href;

export function loadHybridCcWasm(): Promise<HybridCcWasmModule> {
  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = createHybridCcModule({ locateFile: () => engineWasmUrl });
  return modulePromise;
}
