import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(currentDir, "../..");

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcRoot, relativePath), "utf8");
}

function expectSourceNotToMatch(relativePath: string, forbidden: RegExp[]): void {
  const source = readSource(relativePath);
  const matches = forbidden.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
  expect(matches, `${relativePath} forbidden source patterns`).toEqual([]);
}

describe("engine kernel guardrails", () => {
  it("keeps portable move-modifier and bowling-ball helper bodies out of the MS engine", () => {
    expectSourceNotToMatch("ruleset-ms/impl/engine.ts", [
      /\bfunction tryActivateMsBowlingBallThrow\b/,
      /\bfunction activateMappedBowlingBallsOnForceFloors\b/,
      /\bmanualHookTugEnabled\b/,
      /\bhookTugEnabled\b/,
      /\bapplyHookTug\b/,
    ]);
  });

  it("keeps portable move-modifier and bowling-ball helper bodies out of the Lynx engine", () => {
    expectSourceNotToMatch("ruleset-lynx/impl/engine.ts", [
      /\bfunction tryActivateLynxBowlingBallThrow\b/,
      /\bfunction activateMappedLynxBowlingBallsOnForceFloors\b/,
      /\bfunction seedLynxPortableBackedBowlingBallActors\b/,
      /\bapplyHookTug\b/,
    ]);
  });
});
