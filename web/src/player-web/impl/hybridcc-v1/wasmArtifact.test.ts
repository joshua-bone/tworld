import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "./engine/engine-manifest.json";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";

const EXPECTED_SOURCE_COMMIT = "1ae05fc7071bef214a83f7ee8caca582f9b4e921";
const EXPECTED_JS_SHA256 = "c70eb34985d4eda9f49a5d2ae6487e7d33006be5cba81f5d14084771124bb02a";
const EXPECTED_WASM_SHA256 = "93433f92ef034a708cb664f3fb2ce6c1fbf3ae973e817fb73f381d57d1cf7276";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("pinned HybridCC v1 WebAssembly artifact", () => {
  it("matches the reviewed PR39 provenance and byte hashes", async () => {
    const jsBytes = await readFile(new URL("./engine/hybridcc_v1_wasm.js", import.meta.url));
    const wasmBytes = await readFile(new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url));

    expect(manifest).toMatchObject({
      product: "HybridCC v1",
      abiVersion: 1,
      sourceCommit: EXPECTED_SOURCE_COMMIT,
      sourcePullRequest: "https://github.com/joshua-bone/HybridCC2026/pull/39",
      artifacts: {
        "hybridcc_v1_wasm.js": `sha256:${EXPECTED_JS_SHA256}`,
        "hybridcc_v1_wasm.wasm": `sha256:${EXPECTED_WASM_SHA256}`,
      },
    });
    expect(sha256(jsBytes)).toBe(EXPECTED_JS_SHA256);
    expect(sha256(wasmBytes)).toBe(EXPECTED_WASM_SHA256);
  });

  it("exports the complete reviewed 43-function C ABI", async () => {
    const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
    const module = await createHybridCcV1Module({ locateFile: () => wasmUrl });
    const cAbiExports = Object.keys(module)
      .filter((name) => name.startsWith("_hybridcc_v1_"))
      .sort();

    expect(module._hybridcc_v1_abi_version()).toBe(1);
    expect(cAbiExports).toHaveLength(43);
    expect(cAbiExports).toContain("_hybridcc_v1_dat_conversion_create");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_create_detailed");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_copy_presentation");
    expect(cAbiExports).toContain("_hybridcc_v1_replay_verify");
  });
});
