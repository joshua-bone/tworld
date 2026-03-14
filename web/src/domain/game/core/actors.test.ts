import { describe, expect, it } from "vitest";
import {
  findExistingActorAtPosition,
  findHiddenActorAtPosition,
  findReusableHiddenActorIndex,
  findVisibleActorAtPosition,
  storeActorInReusableHiddenSlot,
  type HiddenPositionedActor,
} from "@domain/game/core/actors";

interface TestActor extends HiddenPositionedActor {
  id: number;
  reserved?: boolean;
}

describe("actor core helpers", () => {
  const actors: TestActor[] = [
    { id: 1, pos: 5, hidden: false },
    { id: 2, pos: 5, hidden: true, reserved: true },
    { id: 3, pos: 8, hidden: true, reserved: false },
    { id: 4, pos: 8, hidden: false },
  ];

  it("finds visible actors at a position with optional filtering", () => {
    expect(findVisibleActorAtPosition(actors, 5)?.id).toBe(1);
    expect(findVisibleActorAtPosition(actors, 8, (actor) => actor.id === 4)?.id).toBe(4);
    expect(findVisibleActorAtPosition(actors, 8, (actor) => actor.id === 3)).toBeUndefined();
  });

  it("finds hidden actors at a position with optional filtering", () => {
    expect(findHiddenActorAtPosition(actors, 5)?.id).toBe(2);
    expect(findHiddenActorAtPosition(actors, 5, (actor) => actor.reserved === true)?.id).toBe(2);
    expect(findHiddenActorAtPosition(actors, 8, (actor) => actor.reserved === true)).toBeUndefined();
  });

  it("finds an existing actor at a position preferring visible actors", () => {
    expect(findExistingActorAtPosition(actors, 5)?.id).toBe(1);
    expect(findExistingActorAtPosition(actors, 8, (actor) => actor.hidden)?.id).toBe(3);
  });

  it("finds reusable hidden actor slots with optional filtering", () => {
    expect(findReusableHiddenActorIndex(actors)).toBe(1);
    expect(findReusableHiddenActorIndex(actors, (actor) => actor.reserved !== true)).toBe(2);
    expect(findReusableHiddenActorIndex(actors, (actor) => actor.id === 99)).toBe(-1);
  });

  it("stores actors in reusable hidden slots before appending", () => {
    const next = [...actors];
    const stored = storeActorInReusableHiddenSlot(next, { id: 9, pos: 99, hidden: false }, (actor) => actor.reserved !== true);

    expect(stored).toEqual({ id: 9, pos: 99, hidden: false });
    expect(next[2]).toEqual({ id: 9, pos: 99, hidden: false });
    expect(next).toHaveLength(4);
  });
});
