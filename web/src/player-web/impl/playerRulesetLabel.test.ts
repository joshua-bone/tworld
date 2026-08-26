import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  defaultPlayerRulesetLabel,
  formatPlayerRulesetLabel,
} from "@player-web/impl/playerRulesetLabel";

describe("player ruleset labels", () => {
  it.each(["MS", "Lynx", "Hybrid"] as const)(
    "preserves the legacy %s label by default",
    (ruleset) => {
      expect(defaultPlayerRulesetLabel(ruleset)).toBe(ruleset);
      expect(formatPlayerRulesetLabel(ruleset)).toBe(ruleset);
    },
  );

  it("uses a host-provided label on every non-null ruleset", () => {
    const label = (ruleset: "MS" | "Lynx" | "Hybrid") => (
      ruleset === "Hybrid" ? "Hybrid v1" : ruleset
    );

    expect(formatPlayerRulesetLabel("Hybrid", label)).toBe("Hybrid v1");
    expect(formatPlayerRulesetLabel("MS", label)).toBe("MS");
    expect(formatPlayerRulesetLabel(null, label)).toBeNull();
  });

  it("routes result, replay, family, and mobile display surfaces through the host label", async () => {
    const source = await readFile(new URL("./PlayerApp.tsx", import.meta.url), "utf8");

    expect(source).toContain("formatPlayerRulesetLabel(session.request.ruleset, rulesetLabel)");
    expect(source).toContain("[currentLevel?.name ?? null, currentRulesetDisplayLabel, currentReplayCountLabel]");
    expect(source).toContain("formatPlayerRulesetLabel(currentFamilyRuleset, rulesetLabel)");
    expect(source).toContain("Switch ruleset from ${currentRulesetDisplayLabel ?? \"---\"}");
    expect(source).toContain("No saved replays for this level in {currentRulesetDisplayLabel");
    expect(source).not.toContain("<strong>{session.request.ruleset}</strong>");
    expect(source).not.toContain("No saved replays for this level in {currentRuleset ??");
  });
});
