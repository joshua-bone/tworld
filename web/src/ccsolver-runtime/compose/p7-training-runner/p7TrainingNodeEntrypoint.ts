import { lstat, realpath } from "node:fs/promises";
import { parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type P7TrainingEntrypointResult = "not-entry" | "executed" | "failed";

async function assertNoSymlinkPath(path: string): Promise<void> {
  const absolute = resolve(path);
  const parsed = parse(absolute);
  let current = parsed.root;
  const suffix = absolute.slice(parsed.root.length);
  for (const segment of suffix.split(/[\\/]/u).filter((value) => value.length > 0)) {
    current = resolve(current, segment);
    const details = await lstat(current);
    if (details.isSymbolicLink()) {
      throw new Error(`P7 runner executable path contains a symbolic link: ${current}`);
    }
  }
}

export async function runP7TrainingNodeEntrypoint(input: {
  readonly argv: readonly string[];
  readonly moduleUrl: string;
  readonly dispatch: (argv: readonly string[]) => Promise<void>;
  readonly reportError?: (message: string) => void;
  readonly setExitCode?: (code: number) => void;
}): Promise<P7TrainingEntrypointResult> {
  const rawExecutable = input.argv[1];
  if (rawExecutable === undefined) return "not-entry";
  const executable = resolve(rawExecutable);
  const modulePath = resolve(fileURLToPath(input.moduleUrl));
  let executableRealPath: string;
  let moduleRealPath: string;
  try {
    [executableRealPath, moduleRealPath] = await Promise.all([
      realpath(executable),
      realpath(modulePath),
    ]);
  } catch (error) {
    if (executable !== modulePath) return "not-entry";
    const report = input.reportError ?? ((message: string) => process.stderr.write(`${message}\n`));
    const setExitCode = input.setExitCode ?? ((code: number) => { process.exitCode = code; });
    report(error instanceof Error ? error.message : String(error));
    setExitCode(2);
    return "failed";
  }
  if (executableRealPath !== moduleRealPath) return "not-entry";
  const report = input.reportError ?? ((message: string) => process.stderr.write(`${message}\n`));
  const setExitCode = input.setExitCode ?? ((code: number) => { process.exitCode = code; });
  try {
    await assertNoSymlinkPath(executable);
    await input.dispatch(input.argv.slice(2));
    return "executed";
  } catch (error) {
    report(error instanceof Error ? error.message : String(error));
    setExitCode(2);
    return "failed";
  }
}
