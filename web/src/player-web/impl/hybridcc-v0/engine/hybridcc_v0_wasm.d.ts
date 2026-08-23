import type { HybridCcWasmModule } from "../wasmBridge";

export interface HybridCcModuleOptions {
  locateFile?: (filename: string) => string;
}

export default function createHybridCcModule(
  options?: HybridCcModuleOptions,
): Promise<HybridCcWasmModule>;
