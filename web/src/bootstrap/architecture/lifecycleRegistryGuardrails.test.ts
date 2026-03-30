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

describe("lifecycle registry guardrails", () => {
  it("routes MS lifecycle dispatch helpers through the lifecycle registry seam", () => {
    expectSourceToMatch("ruleset-ms/impl/chipArrival.ts", [/@ruleset-ms\/impl\/tileLifecycleRegistration/]);
    expectSourceToMatch("ruleset-ms/impl/tileEffects.ts", [/@ruleset-ms\/impl\/tileLifecycleRegistration/]);
    expectSourceToMatch("ruleset-ms/impl/actorLifecycleQueries.ts", [/@ruleset-ms\/impl\/actorLifecycleRegistration/]);
    expectSourceToMatch("ruleset-ms/impl/chipEnterBehavior.ts", [/@ruleset-ms\/impl\/floorImpactPolicy/]);
    expectSourceNotToMatch("ruleset-ms/impl/chipEnterBehavior.ts", [
      /\bfunction msChipEnterFloorImpactAction\b/,
      /\bfunction msTileChipEnterFloorImpactAction\b/,
    ]);
    for (const relativePath of ["ruleset-ms/impl/chipArrival.ts", "ruleset-ms/impl/tileEffects.ts", "ruleset-ms/impl/actorLifecycleQueries.ts"]) {
      expectSourceNotToMatch(relativePath, [/\bmsRulesetCatalog\.getTileBehavior\b/, /\bmsRulesetCatalog\.getActorBehavior\b/]);
    }
  });

  it("routes Lynx lifecycle dispatch helpers through the lifecycle registry seam", () => {
    expectSourceToMatch("ruleset-lynx/impl/chipArrival.ts", [/@ruleset-lynx\/impl\/tileLifecycleRegistration/]);
    expectSourceToMatch("ruleset-lynx/impl/tileEffects.ts", [/@ruleset-lynx\/impl\/tileLifecycleRegistration/]);
    expectSourceToMatch("ruleset-lynx/impl/actorLifecycleQueries.ts", [/@ruleset-lynx\/impl\/actorLifecycleRegistration/]);
    expectSourceToMatch("ruleset-lynx/impl/chipEnterBehavior.ts", [/@ruleset-lynx\/impl\/floorImpactPolicy/]);
    expectSourceNotToMatch("ruleset-lynx/impl/chipEnterBehavior.ts", [
      /\bfunction lynxChipEnterFloorImpactAction\b/,
      /\bfunction lynxTileChipEnterFloorImpactAction\b/,
    ]);
    for (const relativePath of ["ruleset-lynx/impl/chipArrival.ts", "ruleset-lynx/impl/tileEffects.ts", "ruleset-lynx/impl/actorLifecycleQueries.ts"]) {
      expectSourceNotToMatch(relativePath, [/\blynxRulesetCatalog\.getTileBehavior\b/, /\blynxRulesetCatalog\.getActorBehavior\b/]);
    }
  });
});
