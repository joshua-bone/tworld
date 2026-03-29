export function trimReplaySweepPackName(value: string): string {
  return value.replace(/\.(dac|dat|ccs|tws)$/i, "");
}

export function formatReplaySweepOutcomeBar(outcomes: readonly string[]): string {
  return outcomes.length > 0 ? outcomes.join("") : "(no matches)";
}

export function formatReplaySweepPackProgress(packName: string, outcomes: readonly string[]): string {
  return `${trimReplaySweepPackName(packName)}: ${formatReplaySweepOutcomeBar(outcomes)}`;
}
