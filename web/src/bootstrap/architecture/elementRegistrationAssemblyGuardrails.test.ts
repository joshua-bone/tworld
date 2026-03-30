import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(currentDir, "../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), "utf8");
}

function expectSourceToMatch(relativePath: string, required: RegExp[]): void {
  const source = readSource(relativePath);
  const missing = required.filter((pattern) => !pattern.test(source)).map((pattern) => pattern.source);
  expect(missing, `${relativePath} required source patterns`).toEqual([]);
}

function expectSourceNotToMatch(relativePath: string, forbidden: RegExp[]): void {
  const source = readSource(relativePath);
  const matches = forbidden.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
  expect(matches, `${relativePath} forbidden source patterns`).toEqual([]);
}

describe("element registration assembly guardrails", () => {
  it("keeps MS element registration as assembly-only wiring", () => {
    expectSourceToMatch("ruleset-ms/impl/elementRegistration.ts", [
      /@ruleset-ms\/impl\/builtinLevelRegistration/,
      /@ruleset-ms\/impl\/terrainPickupRegistration/,
      /@ruleset-ms\/impl\/elements\/actors\/registration/,
    ]);
    expectSourceNotToMatch("ruleset-ms/impl/elementRegistration.ts", [
      /\bMS_TILE\./,
      /\bmsCreatureTile\(/,
      /\bcreateMsLevelDecodeRegistration\b/,
      /\bcreateMsLevelLoadRegistration\b/,
      /\bnew Map\(/,
    ]);
  });

  it("keeps Lynx element registration as assembly-only wiring", () => {
    expectSourceToMatch("ruleset-lynx/impl/elementRegistration.ts", [
      /@ruleset-lynx\/impl\/builtinLevelRegistration/,
      /@ruleset-lynx\/impl\/terrainPickupRegistration/,
      /@ruleset-lynx\/impl\/elements\/actors\/registration/,
    ]);
    expectSourceNotToMatch("ruleset-lynx/impl/elementRegistration.ts", [
      /\bMS_TILE\./,
      /\bcreateLynxLevelLoadRegistration\b/,
      /\bnew Map\(/,
    ]);
  });
});
