import { mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const wrapperPath = fileURLToPath(new URL("./runP7bTrainingPackDist.ts", import.meta.url));
const viteNodePath = resolve(webRoot, "node_modules/vite-node/vite-node.mjs");

function invokeWrapper(path: string) {
  const result = spawnSync(process.execPath, [viteNodePath, "--script", path], {
    cwd: webRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return result;
}

describe("the checked P7 training-pack dist wrapper entrypoint", () => {
  it("fails closed for invalid arguments and a symlinked executable path", async () => {
    const invalid = invokeWrapper(wrapperPath);
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain("requires --root and --packs");

    const temporaryRoot = await realpath(await mkdtemp(resolve(tmpdir(), "tworld-p7-dist-entry-")));
    try {
      const linkedWrapper = resolve(temporaryRoot, "runP7bTrainingPackDist.ts");
      await symlink(wrapperPath, linkedWrapper);
      const linked = invokeWrapper(linkedWrapper);
      expect(linked.status).toBe(2);
      expect(linked.stderr).toContain("contains a symbolic link");
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  });
});
