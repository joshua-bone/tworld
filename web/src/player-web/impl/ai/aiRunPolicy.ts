export function aiHarnessEnabled(search: string): boolean { return new URLSearchParams(search).get("ai") === "1"; }
export function withoutAiFlag(url: string): string {
  const result = new URL(url); result.searchParams.delete("ai"); return result.href;
}
export function maySaveHumanProgress(enabled: boolean): boolean { return !enabled; }
