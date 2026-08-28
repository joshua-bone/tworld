import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "./engine/engine-manifest.json";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import { HYBRIDCC_V1_ABI } from "./wasmBridge";

const EXPECTED_SOURCE_COMMIT = "f93de19e88829bdae97b7f1525612f13c0b3cf61";
const EXPECTED_JS_SHA256 = "c70eb34985d4eda9f49a5d2ae6487e7d33006be5cba81f5d14084771124bb02a";
const EXPECTED_WASM_SHA256 = "f9308c325c446b2c6fb73d7ee8dc1130c358e7e6505ca135046d4f6fad856996";
const EXPECTED_RULESET = `${HYBRIDCC_V1_ABI.ruleset.major}.${HYBRIDCC_V1_ABI.ruleset.minor}.${HYBRIDCC_V1_ABI.ruleset.tweak}`;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("pinned HybridCC v1 WebAssembly artifact", () => {
  it("matches the reviewed engine source and bytes", async () => {
    const jsBytes = await readFile(new URL("./engine/hybridcc_v1_wasm.js", import.meta.url));
    const wasmBytes = await readFile(new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url));

    expect(manifest).toMatchObject({
      product: "HybridCC v1",
      abiVersion: 2,
      ruleset: HYBRIDCC_V1_ABI.ruleset,
      sourceCommit: EXPECTED_SOURCE_COMMIT,
      sourceMergeCommit: "2346e7e0434644154720426894091a83c8386068",
      sourcePullRequest: "https://github.com/joshua-bone/HybridCC2026/pull/60",
      artifacts: {
        "hybridcc_v1_wasm.js": `sha256:${EXPECTED_JS_SHA256}`,
        "hybridcc_v1_wasm.wasm": `sha256:${EXPECTED_WASM_SHA256}`,
      },
    });
    expect(sha256(jsBytes)).toBe(EXPECTED_JS_SHA256);
    expect(sha256(wasmBytes)).toBe(EXPECTED_WASM_SHA256);
  });

  it("keeps every current Tile World version surface on the runtime contract", async () => {
    const [readme, engineFacts] = await Promise.all([
      readFile(new URL("./README.md", import.meta.url), "utf8"),
      readFile(new URL("./engineFacts.ts", import.meta.url), "utf8"),
    ]);

    expect(manifest.ruleset).toEqual(HYBRIDCC_V1_ABI.ruleset);
    expect(readme).toContain(`ruleset ${EXPECTED_RULESET}`);
    expect(engineFacts).toContain(`ruleset ${EXPECTED_RULESET}`);
  });

  it("exports the complete reviewed 43-function C ABI", async () => {
    const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
    const module = await createHybridCcV1Module({ locateFile: () => wasmUrl });
    const cAbiExports = Object.keys(module)
      .filter((name) => name.startsWith("_hybridcc_v1_"))
      .sort();

    expect(module._hybridcc_v1_abi_version()).toBe(2);
    expect(cAbiExports).toHaveLength(43);
    expect(cAbiExports).toContain("_hybridcc_v1_dat_conversion_create");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_create_detailed");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_copy_presentation");
    expect(cAbiExports).toContain("_hybridcc_v1_replay_verify");
  });
});
