import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { P4bDossierOutput } from "./buildP4bDossierOutputs";
import {
  checkExactOutputTree,
  installP4bDistTransactionally,
  writeOutputTreeTransactionally,
} from "./p4bDossierIo";

const encoder = new TextEncoder();
const temporaryRoots: string[] = [];

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), "tworld-p4b-io-"));
  temporaryRoots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("P4B transactional output IO", () => {
  it("replaces and checks one bounded output tree exactly", async () => {
    const repositoryRoot = await root();
    await mkdir(resolve(repositoryRoot, "checked/root"), { recursive: true });
    await writeFile(resolve(repositoryRoot, "checked/root/stale.txt"), "stale");
    const outputs: readonly P4bDossierOutput[] = [
      { path: "checked/root/a.json", mediaType: "application/json", content: encoder.encode("{}") },
      { path: "checked/root/nested/b.md", mediaType: "text/markdown", content: encoder.encode("review") },
    ];

    await writeOutputTreeTransactionally(repositoryRoot, "checked/root", outputs);
    await expect(checkExactOutputTree(repositoryRoot, "checked/root", outputs)).resolves.toBeUndefined();
    expect(await readdir(resolve(repositoryRoot, "checked/root"))).toEqual(["a.json", "nested"]);
  });

  it("installs the dossier after the app build and preserves the non-dossier SPA fallback", async () => {
    const repositoryRoot = await root();
    const dist = resolve(repositoryRoot, "web/dist");
    await mkdir(dist, { recursive: true });
    await writeFile(resolve(dist, "index.html"), "<!doctype html><html><head></head><body>APP</body></html>");
    await writeFile(
      resolve(dist, "404.html"),
      "<!doctype html><html><head></head><body>PLAYER_FALLBACK_SENTINEL</body></html>",
    );
    const outputs: readonly P4bDossierOutput[] = [
      { path: "dev/ccsolver/index.html", mediaType: "text/html", content: encoder.encode("DOSSIER") },
      { path: "dev/ccsolver/data/x.json", mediaType: "application/json", content: encoder.encode("{}") },
    ];

    await installP4bDistTransactionally(repositoryRoot, outputs);
    await installP4bDistTransactionally(repositoryRoot, outputs);

    expect(await readFile(resolve(dist, "dev/ccsolver/index.html"), "utf8")).toBe("DOSSIER");
    const fallback = await readFile(resolve(dist, "404.html"), "utf8");
    expect(fallback).toContain("PLAYER_FALLBACK_SENTINEL");
    expect(fallback).toContain("data-ccsolver-dossier-fallback");
    expect(fallback.match(/data-ccsolver-dossier-fallback/gu)).toHaveLength(1);
    expect(fallback).toContain("noindex,nofollow");
  });
});
