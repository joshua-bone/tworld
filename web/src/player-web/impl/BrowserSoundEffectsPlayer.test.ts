import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserSoundEffectsPlayer } from "@player-web/impl/BrowserSoundEffectsPlayer";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { MS_SOUND } from "@ruleset-ms/api/tiles";

class FakeAudio {
  static instances: FakeAudio[] = [];

  readonly url: string;
  currentTime = 0;
  ended = false;
  error: MediaError | null = null;
  loop = false;
  muted = false;
  paused = true;
  preload = "none";
  volume = 1;
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(url: string) {
    this.url = url;
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    const entries = this.listeners.get(type) ?? [];
    entries.push(listener);
    this.listeners.set(type, entries);
  }

  load(): void {}

  pause(): void {
    this.paused = true;
  }

  play(): Promise<void> {
    this.paused = false;
    this.ended = false;
    return Promise.resolve();
  }

  setAttribute(): void {}
}

describe("BrowserSoundEffectsPlayer", () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prewarms one-shot pools and loop audio only once", async () => {
    const player = new BrowserSoundEffectsPlayer();

    player.prewarm();
    await Promise.resolve();

    const playerState = player as unknown as {
      loopingAudio: Map<number, HTMLAudioElement>;
      oneShotAudioPools: Map<string, HTMLAudioElement[]>;
    };

    expect(playerState.oneShotAudioPools.size).toBeGreaterThan(0);
    expect(playerState.loopingAudio.size).toBeGreaterThan(0);
    expect(FakeAudio.instances.length).toBeGreaterThan(0);

    const firstAudioCount = FakeAudio.instances.length;
    player.prewarm();
    await Promise.resolve();

    expect(FakeAudio.instances).toHaveLength(firstAudioCount);
  });

  it("reuses a prewarmed one-shot audio element on first playback", async () => {
    const player = new BrowserSoundEffectsPlayer();
    player.prewarm();
    await Promise.resolve();

    const firstAudioCount = FakeAudio.instances.length;
    player.syncFrame("level:1", "MS", 1, 1 << MS_SOUND.ButtonPushed);

    expect(FakeAudio.instances).toHaveLength(firstAudioCount);
  });

  it("reuses a prewarmed loop audio element on first playback", async () => {
    const player = new BrowserSoundEffectsPlayer();
    player.prewarm();
    await Promise.resolve();

    const firstAudioCount = FakeAudio.instances.length;
    player.syncFrame("level:1", "Lynx", 1, 1 << LYNX_SOUND.BlockMoving);

    expect(FakeAudio.instances).toHaveLength(firstAudioCount);
  });

  it("uses the Lynx one-shot and loop lifecycle for the honest Hybrid ruleset", async () => {
    const player = new BrowserSoundEffectsPlayer();
    player.prewarm();
    await Promise.resolve();
    const firstAudioCount = FakeAudio.instances.length;

    player.syncFrame(
      "hybrid:1",
      "Hybrid",
      1,
      (1 << LYNX_SOUND.BombExplodes) | (1 << LYNX_SOUND.IceWalking),
    );

    expect(FakeAudio.instances).toHaveLength(firstAudioCount);
    expect(FakeAudio.instances.some((audio) => audio.loop && !audio.paused)).toBe(true);
    player.syncFrame("hybrid:1", "Hybrid", 2, 0);
    expect(FakeAudio.instances.filter((audio) => audio.loop).every((audio) => audio.paused)).toBe(true);
  });

  it.each([
    ["ice", LYNX_SOUND.SkatingForward, LYNX_SOUND.IceWalking],
    ["force floor", LYNX_SOUND.Sliding, LYNX_SOUND.SlideWalking],
  ])("switches a Hybrid %s loop directly to its booted walking loop", async (
    _surface,
    unbootedSound,
    bootedSound,
  ) => {
    const player = new BrowserSoundEffectsPlayer();
    player.prewarm();
    await Promise.resolve();
    const playerState = player as unknown as {
      loopingAudio: Map<number, FakeAudio>;
    };
    const unbooted = playerState.loopingAudio.get(unbootedSound)!;
    const booted = playerState.loopingAudio.get(bootedSound)!;

    player.syncFrame("hybrid:boot-pickup", "Hybrid", 150, 1 << unbootedSound);
    expect(unbooted.paused).toBe(false);
    expect(booted.paused).toBe(true);

    player.syncFrame("hybrid:boot-pickup", "Hybrid", 152, 1 << bootedSound);
    expect(unbooted.paused).toBe(true);
    expect(booted.paused).toBe(false);
  });
});
