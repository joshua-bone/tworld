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

describe("lifecycle dispatch guardrails", () => {
  it("keeps MS engine tile lifecycle access behind dispatch helpers", () => {
    expectSourceToMatch("ruleset-ms/impl/engine.ts", [
      /@ruleset-ms\/impl\/chipArrival/,
      /@ruleset-ms\/impl\/tileEffects/,
    ]);
    expectSourceNotToMatch("ruleset-ms/impl/engine.ts", [
      /@ruleset-ms\/impl\/chipEnterBehavior/,
      /@ruleset-ms\/impl\/elements\/tiles\/families\/support/,
      /@ruleset-ms\/impl\/elements\/tiles\/families\/leave/,
      /@ruleset-ms\/impl\/elements\/actors\/families\/specialFloors/,
    ]);
  });

  it("keeps Lynx engine tile lifecycle access behind dispatch helpers", () => {
    expectSourceToMatch("ruleset-lynx/impl/engine.ts", [
      /@ruleset-lynx\/impl\/chipArrival/,
      /@ruleset-lynx\/impl\/tileEffects/,
    ]);
    expectSourceNotToMatch("ruleset-lynx/impl/engine.ts", [
      /@ruleset-lynx\/impl\/chipEnterBehavior/,
      /@ruleset-lynx\/impl\/elements\/tiles\/families\/support/,
      /@ruleset-lynx\/impl\/elements\/tiles\/families\/leave/,
      /@ruleset-lynx\/impl\/elements\/actors\/families\/specialFloors/,
    ]);
  });
});
