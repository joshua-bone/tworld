import type { SetFamilyRuleset } from "@player-web/impl/modern/curatedCatalog";

export type PlayerRulesetLabel = (ruleset: SetFamilyRuleset) => string;

export function defaultPlayerRulesetLabel(ruleset: SetFamilyRuleset): string {
  return ruleset;
}

export function formatPlayerRulesetLabel(
  ruleset: SetFamilyRuleset | null,
  label: PlayerRulesetLabel = defaultPlayerRulesetLabel,
): string | null {
  return ruleset === null ? null : label(ruleset);
}
