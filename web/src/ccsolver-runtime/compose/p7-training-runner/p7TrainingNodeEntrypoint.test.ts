import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runP7TrainingNodeEntrypoint } from "./p7TrainingNodeEntrypoint";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("P7 Node bundle entrypoint", () => {
  it("executes normalized direct paths and fails before dispatch through symlink leaves or ancestors", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tworld-p7-entrypoint-"));
    roots.push(root);
    const normalizedRoot = await realpath(root);
    const realDirectory = resolve(normalizedRoot, "real");
    await mkdir(realDirectory);
    const executable = resolve(realDirectory, "runner.mjs");
    await writeFile(executable, "export {};\n", "utf8");
    const moduleUrl = pathToFileURL(executable).href;
    let dispatches = 0;
    const errors: string[] = [];
    const exitCodes: number[] = [];
    const invoke = (argvPath: string) => runP7TrainingNodeEntrypoint({
      argv: [process.execPath, argvPath, "probe"],
      moduleUrl,
      dispatch: async (argv) => {
        expect(argv).toEqual(["probe"]);
        dispatches += 1;
      },
      reportError: (message) => errors.push(message),
      setExitCode: (code) => exitCodes.push(code),
    });

    await expect(invoke(resolve(realDirectory, "child", "..", "runner.mjs")))
      .resolves.toBe("executed");
    expect(dispatches).toBe(1);

    const linkedExecutable = resolve(realDirectory, "linked-runner.mjs");
    await symlink(executable, linkedExecutable);
    await expect(invoke(linkedExecutable)).resolves.toBe("failed");
    expect(dispatches).toBe(1);

    const linkedDirectory = resolve(normalizedRoot, "linked-parent");
    await symlink(realDirectory, linkedDirectory);
    await expect(invoke(resolve(linkedDirectory, "runner.mjs"))).resolves.toBe("failed");
    expect(dispatches).toBe(1);
    expect(errors).toHaveLength(2);
    expect(exitCodes).toEqual([2, 2]);
  });
});
