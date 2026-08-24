import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createHybridCcEngine,
  importHybridCcDat,
  type HybridCcWasmModule,
} from "./wasmBridge";

interface HybridCcModuleFactory {
  (options?: { locateFile?: (filename: string) => string }): Promise<HybridCcWasmModule>;
}

async function loadArtifactModule(): Promise<HybridCcWasmModule> {
  const moduleUrl = new URL(
    "./engine/hybridcc_v0_wasm.js",
    import.meta.url,
  );
  const wasmUrl = new URL(
    "./engine/hybridcc_v0_wasm.wasm",
    import.meta.url,
  );
  const { default: factory } = await import(/* @vite-ignore */ moduleUrl.href) as {
    default: HybridCcModuleFactory;
  };
  return factory({ locateFile: () => wasmUrl.href });
}

describe("deployed HybridCC v0 WebAssembly artifact", () => {
  it("imports every bundled official DAT through the deployed converter", async () => {
    const module = await loadArtifactModule();

    for (const filename of ["CCLP1.dat", "CCLP2.dat", "CCLP3.dat", "CCLP4.dat", "CCLP5.dat", "CCLXP2.dat"]) {
      const datBytes = new Uint8Array(
        await readFile(new URL(`../../../../../data/${filename}`, import.meta.url)),
      );
      expect(importHybridCcDat(module, datBytes), filename).toHaveLength(149);
    }
  });

  it("imports an official DAT and advances the real C++ engine", async () => {
    const module = await loadArtifactModule();
    const datBytes = new Uint8Array(
      await readFile(new URL("../../../../../data/CCLP1.dat", import.meta.url)),
    );
    const levels = importHybridCcDat(module, datBytes);

    expect(levels).toHaveLength(149);
    expect(levels[0]).toMatchObject({ number: 1, title: "Key Pyramid" });

    const engine = createHybridCcEngine(module, levels[0]!, 0);
    const initial = engine.snapshot();
    expect(initial.actors.find((actor) => actor.kind === 41)?.position).toEqual({
      x: 15,
      y: 19,
      z: 0,
    });

    const moved = engine.logicStep(2);
    expect(moved.logicStep).toBe(1);
    expect(moved.actors.find((actor) => actor.kind === 41)?.position).toEqual({
      x: 16,
      y: 19,
      z: 0,
    });
    expect(moved.stateHash).not.toBe(initial.stateHash);
    engine.dispose();
  });
});
