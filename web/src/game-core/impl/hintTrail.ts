import type { EngineState } from "@game-core/api/model";
import type { HintTrailState } from "@game-core/api/types";
import type { InteractiveGameTileOverlay } from "@game-core/api/interactive";
export type { HintTrailState } from "@game-core/api/types";

export function recordHintTrail(state: Pick<EngineState, "inventory" | "hintTrail">, hint: string, pos: number, z = 1): void {
  if (!(state.inventory.boots[4] > 0) || !hint || state.hintTrail?.marks.some((mark) => mark.pos === pos && mark.z === z)) {
    return;
  }
  const characters = Array.from(hint);
  const index = (state.hintTrail?.nextIndex ?? 0) % characters.length;
  state.hintTrail = {
    nextIndex: (index + 1) % characters.length,
    marks: [...(state.hintTrail?.marks ?? []), { pos, z, text: characters[index]! }],
  };
}

export function hintTrailOverlays(trail: HintTrailState | undefined): InteractiveGameTileOverlay[] {
  return (trail?.marks ?? []).map(({ pos, z, text }) => ({
    pos, z, kind: "hint-letter", render: { mode: "hint-letter", text, alpha: 0.6 },
  }));
}
