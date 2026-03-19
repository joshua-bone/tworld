import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCcxLevelset } from "@content/api/ccx";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../..");

describe("ccx", () => {
  it("parses narrative metadata and inherited properties from the bundled ccx files", async () => {
    const xml = await readFile(resolve(repoRoot, "data/CCLP1.ccx"), "utf-8");
    const levelset = parseCcxLevelset(xml, 149);

    expect(levelset.description).toBe("Chip's Challenge Level Pack 1");
    expect(levelset.rules.ms).toBe("yes");
    expect(levelset.rules.lynx).toBe("yes");
    expect(levelset.pageProps.format).toBe("html");

    const level1 = levelset.levels.get(1);
    const level10 = levelset.levels.get(10);
    const level2 = levelset.levels.get(2);

    expect(level1?.author).toBe("Tyler Sontag");
    expect(level1?.prologue.pages).toHaveLength(3);
    expect(level10?.prologue.pages).toHaveLength(3);
    expect(level2?.prologue.pages).toHaveLength(0);
  });
});
