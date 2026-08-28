import { describe, expect, it, vi } from "vitest";
import {
  applyHybridCcV1HintOverlay,
  type HybridCcV1WasmModule,
} from "./wasmBridge";

function preflightModule(): HybridCcV1WasmModule {
  return {
    HEAPU8: new Uint8Array(128),
    _hybridcc_v1_abi_version: () => 2,
    _malloc: vi.fn(() => 0),
    _free: vi.fn(),
  } as unknown as HybridCcV1WasmModule;
}

describe("HybridCC v1 native hint-overlay bridge", () => {
  it("rejects native placement and per-message limits before allocating Wasm memory", () => {
    const module = preflightModule();

    expect(() => applyHybridCcV1HintOverlay(
      module,
      Uint8Array.of(1),
      Array.from({ length: 65_537 }, (_, cellIndex) => ({ cellIndex, text: "hint" })),
    )).toThrow("65536-placement limit");
    expect(() => applyHybridCcV1HintOverlay(
      module,
      Uint8Array.of(1),
      [{ cellIndex: 0, text: "x".repeat(257) }],
    )).toThrow("256-byte text limit");
    expect(module._malloc).not.toHaveBeenCalled();
  });

  it("releases earlier allocations when a later overlay allocation fails", () => {
    const module = preflightModule();
    const malloc = vi.mocked(module._malloc);
    const free = vi.mocked(module._free);
    malloc
      .mockReturnValueOnce(4) // native bytes
      .mockReturnValueOnce(16) // text blob
      .mockReturnValueOnce(32) // placement records
      .mockReturnValueOnce(0); // output-handle pointer allocation fails

    expect(() => applyHybridCcV1HintOverlay(
      module,
      Uint8Array.of(1),
      [{ cellIndex: 0, text: "hint" }],
    )).toThrow("HybridCC hint overlay handle allocation");
    expect(free.mock.calls.map(([pointer]) => pointer)).toEqual([32, 16, 4]);
  });
});
