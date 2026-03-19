export interface FastForwardModifierState {
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

export function isFastForwardModifierActive(
  mode: "series-list" | "game",
  event: FastForwardModifierState,
): boolean {
  return (
    mode === "game" &&
    event.shiftKey === true &&
    event.metaKey !== true &&
    event.ctrlKey !== true &&
    event.altKey !== true
  );
}
