import { describe, expect, it } from "vitest";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_LOSS,
} from "./engineFacts";
import {
  collectHybridCcV1LifecycleAnimations,
  projectHybridCcV1LifecycleAnimations,
  reconcileHybridCcV1LifecycleAnimations,
} from "./lifecycleAnimationProjection";
import { testEvent, testSnapshot } from "./testFacts";

describe("Hybrid v1 lifecycle animation projection", () => {
  it("maps non-player destruction causes to explicit Lynx effect sprites", () => {
    const snapshot = testSnapshot({
      events: [
        testEvent({
          sequence: 0,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 2n,
          actorKind: HYBRID_CC_V1_ELEMENT.ball,
          lossCause: HYBRID_CC_V1_LOSS.water,
          destination: { x: 1, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 1,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 3n,
          actorKind: HYBRID_CC_V1_ELEMENT.dirtBlock,
          lossCause: HYBRID_CC_V1_LOSS.bomb,
          destination: { x: 2, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 2,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 4n,
          actorKind: HYBRID_CC_V1_ELEMENT.blob,
          lossCause: HYBRID_CC_V1_LOSS.fire,
          destination: { x: 3, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 3,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 1n,
          actorKind: HYBRID_CC_V1_ELEMENT.player,
          lossCause: HYBRID_CC_V1_LOSS.bomb,
        }),
      ],
    });

    const projected = projectHybridCcV1LifecycleAnimations(
      collectHybridCcV1LifecycleAnimations(snapshot),
      2,
      32,
    );

    expect(projected).toEqual([
      expect.objectContaining({ pos: 1, frame: 11, tileId: 0x74, visual: { kind: "creature", tileId: 0x74, dir: 1, moving: 0, frame: 11 } }),
      expect.objectContaining({ pos: 2, frame: 11, tileId: 0x75, visual: { kind: "creature", tileId: 0x75, dir: 1, moving: 0, frame: 11 } }),
      expect.objectContaining({ pos: 3, frame: 11, tileId: 0x76, visual: { kind: "creature", tileId: 0x76, dir: 1, moving: 0, frame: 11 } }),
    ]);
  });

  it("keeps a destruction effect alive for the full descending Lynx sequence", () => {
    const track = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.ball,
        logicBoundary: 1n,
      })],
    }));

    expect(projectHybridCcV1LifecycleAnimations(track, 2, 32)[0]?.frame).toBe(11);
    expect(projectHybridCcV1LifecycleAnimations(track, 7, 32)[0]?.frame).toBe(6);
    expect(projectHybridCcV1LifecycleAnimations(track, 13, 32)[0]?.frame).toBe(0);
    expect(projectHybridCcV1LifecycleAnimations(track, 14, 32)).toEqual([]);
  });

  it("replaces an older effect when a new destruction starts on the same cell", () => {
    const oldTrack = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.ball,
        logicBoundary: 1n,
        lossCause: HYBRID_CC_V1_LOSS.water,
      })],
    }));
    const updated = reconcileHybridCcV1LifecycleAnimations(oldTrack, testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 3n,
        actorKind: HYBRID_CC_V1_ELEMENT.ball,
        logicBoundary: 2n,
        lossCause: HYBRID_CC_V1_LOSS.bomb,
      })],
    }));

    expect(updated).toEqual([
      expect.objectContaining({ position: { x: 1, y: 0, z: 0 }, tileId: 0x75 }),
    ]);
  });

  it("clears an older effect when an actor later completes arrival in its cell", () => {
    const current = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.ball,
        destination: { x: 4, y: 5, z: 0 },
      })],
    }));

    const updated = reconcileHybridCcV1LifecycleAnimations(current, testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.moveCompleted,
        actorId: 3n,
        actorKind: HYBRID_CC_V1_ELEMENT.blob,
        destination: { x: 4, y: 5, z: 0 },
      })],
    }));

    expect(updated).toEqual([]);
  });

  it("clears an older effect when an actor is later created in its cell", () => {
    const current = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.ball,
        destination: { x: 4, y: 5, z: 0 },
      })],
    }));

    const updated = reconcileHybridCcV1LifecycleAnimations(current, testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorCreated,
        actorId: 3n,
        actorKind: HYBRID_CC_V1_ELEMENT.blob,
        destination: { x: 4, y: 5, z: 0 },
      })],
    }));

    expect(updated).toEqual([]);
  });

  it("preserves deterministic event order across simultaneous starts and cancellation", () => {
    const updated = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [
        testEvent({
          sequence: 0,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 2n,
          actorKind: HYBRID_CC_V1_ELEMENT.ball,
          lossCause: HYBRID_CC_V1_LOSS.water,
          destination: { x: 1, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 1,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 3n,
          actorKind: HYBRID_CC_V1_ELEMENT.blob,
          lossCause: HYBRID_CC_V1_LOSS.bomb,
          destination: { x: 2, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 2,
          kind: HYBRID_CC_V1_EVENT.actorCreated,
          actorId: 4n,
          actorKind: HYBRID_CC_V1_ELEMENT.teeth,
          destination: { x: 1, y: 0, z: 0 },
        }),
        testEvent({
          sequence: 3,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 5n,
          actorKind: HYBRID_CC_V1_ELEMENT.teeth,
          lossCause: HYBRID_CC_V1_LOSS.fire,
          destination: { x: 1, y: 0, z: 0 },
        }),
      ],
    }));

    expect(updated).toEqual([
      expect.objectContaining({ position: { x: 2, y: 0, z: 0 }, tileId: 0x75 }),
      expect.objectContaining({ position: { x: 1, y: 0, z: 0 }, tileId: 0x76 }),
    ]);
  });

  it("leaves the player actor-destroyed/terminal pair exclusively to terminal projection", () => {
    const updated = collectHybridCcV1LifecycleAnimations(testSnapshot({
      events: [
        testEvent({
          sequence: 0,
          kind: HYBRID_CC_V1_EVENT.actorDestroyed,
          actorId: 1n,
          actorKind: HYBRID_CC_V1_ELEMENT.player,
          lossCause: HYBRID_CC_V1_LOSS.bomb,
        }),
        testEvent({
          sequence: 1,
          kind: HYBRID_CC_V1_EVENT.terminal,
          actorId: 1n,
          actorKind: HYBRID_CC_V1_ELEMENT.player,
          lossCause: HYBRID_CC_V1_LOSS.bomb,
        }),
      ],
    }));

    expect(updated).toEqual([]);
  });
});
