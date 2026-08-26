import type { HybridCcV1WasmModule } from "../wasmBridge";

export interface HybridCcV1ModuleOptions {
  locateFile?: (filename: string) => string;
}

export default function createHybridCcV1Module(
  options?: HybridCcV1ModuleOptions,
): Promise<HybridCcV1WasmModule>;
