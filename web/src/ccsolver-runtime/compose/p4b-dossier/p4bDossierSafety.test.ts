import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveP4bTransactionTargets } from "./p4bDossierIo";

describe("P4B destructive-operation scope", () => {
  it("can replace only the exact checked leaf and dist dossier leaf, never repo/ccsolver", () => {
    const repositoryRoot = "/workspace/tworld";
    const targets = resolveP4bTransactionTargets(repositoryRoot);

    expect(targets).toEqual({
      repositoryCcsolverRoot: resolve(repositoryRoot, "ccsolver"),
      checkedOutputRoot: resolve(
        repositoryRoot,
        "ccsolver/fixtures/golden/p4b/cclp1-001",
      ),
      distOutputRoot: resolve(repositoryRoot, "web/dist/ccsolver"),
    });
    expect(targets.checkedOutputRoot).not.toBe(targets.repositoryCcsolverRoot);
    expect(targets.distOutputRoot).not.toBe(targets.repositoryCcsolverRoot);
  });
});
