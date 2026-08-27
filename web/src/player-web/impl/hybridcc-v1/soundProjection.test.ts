import { describe, expect, it } from "vitest";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import {
  HYBRID_CC_V1_COLOR,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import {
  projectHybridCcV1LoopSounds,
  projectHybridCcV1OneShotSounds,
} from "./soundProjection";
import {
  testActor,
  testCell,
  testElement,
  testEvent,
  testInventoryEntry,
  testMotionTrack,
  testSnapshot,
} from "./testFacts";

const bit = (sound: number) => 1 << sound;

describe("Hybrid v1 one-shot sound projection", () => {
  it("preserves bomb audio after Chip has disappeared", () => {
    const snapshot = testSnapshot({
      actors: [],
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.terminal,
        actorId: null,
        lossCause: HYBRID_CC_V1_LOSS.bomb,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.bomb }),
      })],
    });
    const sounds = projectHybridCcV1OneShotSounds(snapshot);
    expect(sounds & bit(LYNX_SOUND.BombExplodes)).not.toBe(0);
    expect(sounds & bit(LYNX_SOUND.ChipLoses)).toBe(0);
  });

  it("plays a water splash when a non-player is destroyed in water", () => {
    const sounds = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.blob,
        lossCause: HYBRID_CC_V1_LOSS.water,
      })],
    }));
    expect(sounds & bit(LYNX_SOUND.WaterSplash)).not.toBe(0);
    expect(sounds & bit(LYNX_SOUND.ChipLoses)).toBe(0);
  });

  it("keeps Lynx timeout silent", () => {
    const sounds = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.terminal,
        actorId: null,
        lossCause: HYBRID_CC_V1_LOSS.clock,
      })],
    }));
    expect(sounds).toBe(0);
  });

  it.each([
    HYBRID_CC_V1_ELEMENT.player,
    HYBRID_CC_V1_ELEMENT.dirtBlock,
    HYBRID_CC_V1_ELEMENT.ball,
  ])("plays a button edge for activating actor kind %i", (actorKind) => {
    const sounds = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.interaction,
        interaction: HYBRID_CC_V1_INTERACTION.activate,
        actorKind,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.button }),
      })],
    }));
    expect(sounds & bit(LYNX_SOUND.ButtonPushed)).not.toBe(0);
  });

  it("uses causal move rejection and teleport ownership", () => {
    const sounds = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [
        testEvent({ kind: HYBRID_CC_V1_EVENT.moveRejected }),
        testEvent({
          sequence: 1,
          kind: HYBRID_CC_V1_EVENT.moveStarted,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.teleport,
        }),
      ],
    }));
    expect(sounds & bit(LYNX_SOUND.CantMove)).not.toBe(0);
    expect(sounds & bit(LYNX_SOUND.Teleporting)).not.toBe(0);
  });

  it("plays block movement only for a causal active player push", () => {
    const activePush = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.interaction,
        interaction: HYBRID_CC_V1_INTERACTION.push,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.dirtBlock }),
      })],
    }));
    const nonPlayerPush = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.interaction,
        interaction: HYBRID_CC_V1_INTERACTION.push,
        actorKind: HYBRID_CC_V1_ELEMENT.dirtBlock,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.dirtBlock }),
      })],
    }));

    expect(activePush & bit(LYNX_SOUND.BlockMoving)).not.toBe(0);
    expect(nonPlayerPush & bit(LYNX_SOUND.BlockMoving)).toBe(0);
  });

  it("plays item collection for every unlimited green-key tile removal", () => {
    const pickupChanged = testEvent({
      kind: HYBRID_CC_V1_EVENT.pickupChanged,
      subject: testElement({
        id: HYBRID_CC_V1_ELEMENT.key,
        color: HYBRID_CC_V1_COLOR.green,
      }),
      replacement: testElement({ id: HYBRID_CC_V1_ELEMENT.none }),
    });
    const firstPickup = testSnapshot({
      events: [
        pickupChanged,
        testEvent({
          sequence: 1,
          kind: HYBRID_CC_V1_EVENT.inventoryChanged,
          inventoryIdentity: {
            kind: HYBRID_CC_V1_ELEMENT.key,
            color: HYBRID_CC_V1_COLOR.green,
            rule: 0,
          },
          inventoryBefore: { count: 0n, unlimited: false },
          inventoryAfter: { count: 0n, unlimited: true },
        }),
      ],
    });
    const laterUnlimitedPickup = testSnapshot({ events: [pickupChanged] });

    expect(projectHybridCcV1OneShotSounds(firstPickup) & bit(LYNX_SOUND.ItemCollected)).not.toBe(0);
    expect(projectHybridCcV1OneShotSounds(laterUnlimitedPickup) & bit(LYNX_SOUND.ItemCollected)).not.toBe(0);
  });

  it("does not mistake a removed bomb for an item collection", () => {
    const sounds = projectHybridCcV1OneShotSounds(testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.pickupChanged,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.bomb }),
        replacement: testElement({ id: HYBRID_CC_V1_ELEMENT.none }),
      })],
    }));

    expect(sounds & bit(LYNX_SOUND.ItemCollected)).toBe(0);
    expect(sounds & bit(LYNX_SOUND.IcCollected)).toBe(0);
  });
});

describe("Hybrid v1 loop sound projection", () => {
  it("does not loop merely because a booted player is standing on ice", () => {
    const snapshot = testSnapshot({
      cells: [testCell({ terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.ice }) })],
      inventory: [testInventoryEntry(HYBRID_CC_V1_ELEMENT.iceSkates, HYBRID_CC_V1_COLOR.white, 1n)],
    });
    expect(projectHybridCcV1LoopSounds(snapshot, [], 0)).toBe(0);
  });

  it("plays boot-walking only while the published ordinary motion is active", () => {
    const snapshot = testSnapshot({
      header: { ...testSnapshot().header, width: 2, cellCount: 2, logicBoundary: 1n },
      cells: [
        testCell(),
        testCell({ terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.ice }) }),
      ],
      actors: [testActor({ logicalPosition: { x: 0, y: 0, z: 0 } })],
      inventory: [testInventoryEntry(HYBRID_CC_V1_ELEMENT.iceSkates, HYBRID_CC_V1_COLOR.white, 1n)],
    });
    const track = testMotionTrack();
    expect(projectHybridCcV1LoopSounds(snapshot, [track], 2) & bit(LYNX_SOUND.IceWalking)).not.toBe(0);
    expect(projectHybridCcV1LoopSounds(snapshot, [track], 6)).toBe(0);
  });

  it("does not infer push audio from an autonomously moving block track", () => {
    const track = testMotionTrack({ actorId: 2n, actorKind: HYBRID_CC_V1_ELEMENT.dirtBlock });
    expect(projectHybridCcV1LoopSounds(testSnapshot(), [track], 2) & bit(LYNX_SOUND.BlockMoving)).toBe(0);
    expect(projectHybridCcV1LoopSounds(testSnapshot(), [track], 6)).toBe(0);
  });
});
