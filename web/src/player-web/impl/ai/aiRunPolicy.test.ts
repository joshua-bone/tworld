import { expect, it } from "vitest";
import { aiHarnessEnabled, withoutAiFlag, maySaveHumanProgress } from "./aiRunPolicy";
it("requires the explicit flag and preserves ordinary launch parameters", () => {
  expect(aiHarnessEnabled("?set=CCLP1&level=2&ruleset=MS")).toBe(false);
  expect(aiHarnessEnabled("?ai=0")).toBe(false);
  expect(aiHarnessEnabled("?ai=1&set=CCLP1&level=2&ruleset=MS")).toBe(true);
  expect(withoutAiFlag("https://example.org/tworld/?ai=1&set=CCLP1&level=2&ruleset=MS#dat=abc")).toBe("https://example.org/tworld/?set=CCLP1&level=2&ruleset=MS#dat=abc");
});
it("isolates testing-page results from human progress even after takeover", () => {
  expect(maySaveHumanProgress(true)).toBe(false);
  expect(maySaveHumanProgress(false)).toBe(true);
});
