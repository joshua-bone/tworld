export type RulesetName = "MS" | "Lynx" | "Hybrid" | "None";
export type LegacyRulesetName = Exclude<RulesetName, "Hybrid" | "None">;

export function parseDatRulesetSignature(signature: number): LegacyRulesetName {
  switch (signature) {
    case 0x0002:
      return "MS";
    case 0x0102:
      return "Lynx";
    default:
      throw new Error(`unsupported data-file ruleset signature: ${signature}`);
  }
}

export function parseSolutionRulesetByte(value: number): LegacyRulesetName {
  switch (value) {
    case 1:
      return "Lynx";
    case 2:
      return "MS";
    default:
      throw new Error(`unsupported solution-file ruleset byte: ${value}`);
  }
}

export function solutionRulesetByte(ruleset: LegacyRulesetName): number {
  return ruleset === "Lynx" ? 1 : 2;
}
