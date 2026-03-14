export type RulesetName = "MS" | "Lynx" | "None";

export function parseDatRulesetSignature(signature: number): Exclude<RulesetName, "None"> {
  switch (signature) {
    case 0x0002:
      return "MS";
    case 0x0102:
      return "Lynx";
    default:
      throw new Error(`unsupported data-file ruleset signature: ${signature}`);
  }
}

export function parseSolutionRulesetByte(value: number): Exclude<RulesetName, "None"> {
  switch (value) {
    case 1:
      return "Lynx";
    case 2:
      return "MS";
    default:
      throw new Error(`unsupported solution-file ruleset byte: ${value}`);
  }
}

export function solutionRulesetByte(ruleset: Exclude<RulesetName, "None">): number {
  return ruleset === "Lynx" ? 1 : 2;
}
