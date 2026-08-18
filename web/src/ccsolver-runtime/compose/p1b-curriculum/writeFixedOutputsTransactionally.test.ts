import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { afterEach, describe, expect, it } from "vitest";
import { writeFixedOutputsTransactionally } from "./writeFixedOutputsTransactionally";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "tworld-p1b-output-test-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true }),
  ));
});

describe("fixed P1B output transactions", () => {
  it("commits every staged canonical output together", async () => {
    const root = await temporaryRoot();
    await mkdir(resolve(root, "corpus"), { recursive: true });
    await writeFile(resolve(root, "corpus/existing.json"), "old", "utf8");

    await writeFixedOutputsTransactionally(root, [
      { path: "corpus/existing.json", canonicalJson: canonicalizeJson({ value: "new" }) },
      { path: "golden/new.json", canonicalJson: canonicalizeJson({ value: 2 }) },
    ]);

    expect(await readFile(resolve(root, "corpus/existing.json"), "utf8"))
      .toBe('{"value":"new"}');
    expect(await readFile(resolve(root, "golden/new.json"), "utf8"))
      .toBe('{"value":2}');
    expect((await readdir(root)).filter((entry) => entry.startsWith(".p1b-output-")))
      .toEqual([]);
  });

  it("restores predecessors and leaves no partial output after a commit failure", async () => {
    const root = await temporaryRoot();
    await writeFile(resolve(root, "existing.json"), "old", "utf8");
    await writeFile(resolve(root, "blocked"), "still-here", "utf8");

    await expect(writeFixedOutputsTransactionally(root, [
      { path: "existing.json", canonicalJson: canonicalizeJson({ value: "new" }) },
      { path: "blocked/new.json", canonicalJson: canonicalizeJson({ value: 2 }) },
    ])).rejects.toThrow();

    expect(await readFile(resolve(root, "existing.json"), "utf8")).toBe("old");
    expect(await readFile(resolve(root, "blocked"), "utf8")).toBe("still-here");
    expect((await readdir(root)).filter((entry) => entry.startsWith(".p1b-output-")))
      .toEqual([]);
  });
});
