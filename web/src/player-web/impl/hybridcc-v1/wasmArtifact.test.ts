import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import manifest from "./engine/engine-manifest.json";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import { HYBRIDCC_V1_ABI } from "./wasmBridge";

const EXPECTED_SOURCE_COMMIT = "227b2dbb1b410941f0a3f13cddc0c26fad6378b7";
const EXPECTED_SOURCE_MERGE_COMMIT = "5bb3f35fe759effe7a22b91fb7879a1cabf0c177";
const EXPECTED_JS_SHA256 = "ae7156ca6cadb8cc1ed89e32217fdab212afbf59a752d3b02600728bbefb1043";
const EXPECTED_WASM_SHA256 = "f8c19e066bf37966d93e72d6461ab4c8b5cf0451ac07b3aad3c01c40d7ce29cf";
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
      sourceMergeCommit: EXPECTED_SOURCE_MERGE_COMMIT,
      sourcePullRequest: "https://github.com/joshua-bone/HybridCC2026/pull/63",
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

  it("exports the complete reviewed 44-function C ABI", async () => {
    const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
    const module = await createHybridCcV1Module({ locateFile: () => wasmUrl });
    const cAbiExports = Object.keys(module)
      .filter((name) => name.startsWith("_hybridcc_v1_"))
      .sort();

    expect(module._hybridcc_v1_abi_version()).toBe(2);
    expect(cAbiExports).toHaveLength(44);
    expect(cAbiExports).toContain("_hybridcc_v1_native_level_apply_hint_overlay");
    expect(cAbiExports).toContain("_hybridcc_v1_dat_conversion_create");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_create_detailed");
    expect(cAbiExports).toContain("_hybridcc_v1_engine_copy_presentation");
    expect(cAbiExports).toContain("_hybridcc_v1_replay_verify");
  });
});
