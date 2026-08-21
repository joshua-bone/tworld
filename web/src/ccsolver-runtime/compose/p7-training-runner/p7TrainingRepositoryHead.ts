import { execFile } from "node:child_process";

const GIT_HEAD_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export type P7TrainingHeadResolver = (repositoryRoot: string) => Promise<string>;

export const resolveP7TrainingRepositoryHead: P7TrainingHeadResolver = (repositoryRoot) => (
  new Promise<string>((resolve, reject) => {
    execFile(
      "git",
      ["-C", repositoryRoot, "rev-parse", "--verify", "HEAD^{commit}"],
      { encoding: "utf8", maxBuffer: 4_096, timeout: 10_000, windowsHide: true },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error("P7 runner could not attest repository HEAD", { cause: error }));
          return;
        }
        const head = stdout.trim();
        if (!GIT_HEAD_PATTERN.test(head)) {
          reject(new Error("P7 runner resolved an invalid repository HEAD"));
          return;
        }
        resolve(head);
      },
    );
  })
);

export async function assertP7TrainingRepositoryHead(input: {
  readonly repositoryRoot: string;
  readonly expectedHead: string;
  readonly resolveHead?: P7TrainingHeadResolver;
}): Promise<void> {
  if (!GIT_HEAD_PATTERN.test(input.expectedHead)) {
    throw new Error("P7 runner expected repository HEAD is invalid");
  }
  const actualHead = await (input.resolveHead ?? resolveP7TrainingRepositoryHead)(input.repositoryRoot);
  if (actualHead !== input.expectedHead) {
    throw new Error(`P7 runner repository HEAD mismatch: expected ${input.expectedHead}, got ${actualHead}`);
  }
}
