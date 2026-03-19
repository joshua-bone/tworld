export function shouldPersistLevelProgress(params: {
  hasResult: boolean;
  mode: "game" | "series-list";
  sessionMode: "manual" | "replay" | null;
  sessionStartedFromReplay: boolean;
}): boolean {
  return (
    params.mode === "game" &&
    params.hasResult &&
    params.sessionMode === "manual" &&
    !params.sessionStartedFromReplay
  );
}
