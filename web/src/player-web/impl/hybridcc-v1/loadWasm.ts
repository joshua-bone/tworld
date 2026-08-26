import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import type { HybridCcV1WasmModule } from "./wasmBridge";

let modulePromise: Promise<HybridCcV1WasmModule> | null = null;
const engineWasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;

export function loadHybridCcV1Wasm(): Promise<HybridCcV1WasmModule> {
  if (modulePromise === null) {
    modulePromise = createHybridCcV1Module({ locateFile: () => engineWasmUrl });
  }
  return modulePromise;
}
