import chipBlockUrl from "@res/block.wav?url";
import bombUrl from "@res/bomb.wav?url";
import bumpUrl from "@res/bump.wav?url";
import pickupChipMsUrl from "@res/chack.wav?url";
import buttonUrl from "@res/click.wav?url";
import fireWalkingUrl from "@res/crackle.wav?url";
import chipDeathLynxUrl from "@res/derezz.wav?url";
import doorUrl from "@res/door.wav?url";
import chipDeathMsUrl from "@res/death.wav?url";
import timeoutMsUrl from "@res/ding.wav?url";
import slideUrl from "@res/force.wav?url";
import iceWalkingUrl from "@res/snick.wav?url";
import slideWalkingUrl from "@res/slurp.wav?url";
import socketMsUrl from "@res/socket.wav?url";
import splashUrl from "@res/splash.wav?url";
import skateForwardUrl from "@res/skate.wav?url";
import skateTurnUrl from "@res/skaturn.wav?url";
import itemPickupUrl from "@res/ting.wav?url";
import teleportUrl from "@res/teleport.wav?url";
import thiefUrl from "@res/thief.wav?url";
import winUrl from "@res/tada.wav?url";
import tileEmptiedUrl from "@res/whisk.wav?url";
import wallCreatedUrl from "@res/popup.wav?url";
import waterWalkingUrl from "@res/plip.wav?url";
import blockedMoveMsUrl from "@res/oof.wav?url";
import type { GameRequest } from "@game-core/api/types";
import { measurePerfAsync } from "@player-web/impl/runtimePerf";
import { LYNX_FLOOR_SOUND_MASK, LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { MS_SOUND } from "@ruleset-ms/api/tiles";

type Ruleset = GameRequest["ruleset"];

interface SoundDefinition {
  bit: number;
  url: string;
  loop?: boolean;
}

const LYNX_LOOP_MASK = LYNX_FLOOR_SOUND_MASK | (1 << LYNX_SOUND.BlockMoving);
const SOUND_UNLOCK_URL = buttonUrl;
const ONE_SHOT_PREWARM_POOL_SIZE = 1;

const LYNX_SOUND_DEFINITIONS: SoundDefinition[] = [
  { bit: LYNX_SOUND.ChipLoses, url: chipDeathLynxUrl },
  { bit: LYNX_SOUND.ChipWins, url: winUrl },
  { bit: LYNX_SOUND.TimeOut, url: chipDeathLynxUrl },
  { bit: LYNX_SOUND.CantMove, url: bumpUrl },
  { bit: LYNX_SOUND.IcCollected, url: itemPickupUrl },
  { bit: LYNX_SOUND.ItemCollected, url: itemPickupUrl },
  { bit: LYNX_SOUND.BootsStolen, url: thiefUrl },
  { bit: LYNX_SOUND.Teleporting, url: teleportUrl },
  { bit: LYNX_SOUND.DoorOpened, url: doorUrl },
  { bit: LYNX_SOUND.SocketOpened, url: doorUrl },
  { bit: LYNX_SOUND.ButtonPushed, url: buttonUrl },
  { bit: LYNX_SOUND.TileEmptied, url: tileEmptiedUrl },
  { bit: LYNX_SOUND.WallCreated, url: wallCreatedUrl },
  { bit: LYNX_SOUND.TrapEntered, url: bumpUrl },
  { bit: LYNX_SOUND.BombExplodes, url: bombUrl },
  { bit: LYNX_SOUND.WaterSplash, url: splashUrl },
  { bit: LYNX_SOUND.BlockMoving, url: chipBlockUrl, loop: true },
  { bit: LYNX_SOUND.SkatingForward, url: skateForwardUrl, loop: true },
  { bit: LYNX_SOUND.SkatingTurn, url: skateTurnUrl, loop: true },
  { bit: LYNX_SOUND.Sliding, url: slideUrl, loop: true },
  { bit: LYNX_SOUND.SlideWalking, url: slideWalkingUrl, loop: true },
  { bit: LYNX_SOUND.IceWalking, url: iceWalkingUrl, loop: true },
  { bit: LYNX_SOUND.WaterWalking, url: waterWalkingUrl, loop: true },
  { bit: LYNX_SOUND.FireWalking, url: fireWalkingUrl, loop: true },
];

const SOUND_DEFINITIONS: Record<Ruleset, SoundDefinition[]> = {
  MS: [
    { bit: MS_SOUND.ChipLoses, url: chipDeathMsUrl },
    { bit: MS_SOUND.ChipWins, url: winUrl },
    { bit: MS_SOUND.TimeOut, url: timeoutMsUrl },
    { bit: MS_SOUND.CantMove, url: blockedMoveMsUrl },
    { bit: MS_SOUND.IcCollected, url: pickupChipMsUrl },
    { bit: MS_SOUND.ItemCollected, url: itemPickupUrl },
    { bit: MS_SOUND.BootsStolen, url: thiefUrl },
    { bit: MS_SOUND.Teleporting, url: teleportUrl },
    { bit: MS_SOUND.DoorOpened, url: doorUrl },
    { bit: MS_SOUND.SocketOpened, url: socketMsUrl },
    { bit: MS_SOUND.ButtonPushed, url: buttonUrl },
    { bit: MS_SOUND.BombExplodes, url: bombUrl },
    { bit: MS_SOUND.WaterSplash, url: splashUrl },
  ],
  Lynx: LYNX_SOUND_DEFINITIONS,
  Hybrid: LYNX_SOUND_DEFINITIONS,
};

const ALL_SOUND_DEFINITIONS = [...SOUND_DEFINITIONS.MS, ...SOUND_DEFINITIONS.Lynx];

function primeAudioElement(audio: HTMLAudioElement): void {
  audio.preload = "auto";
  try {
    audio.load();
  } catch {
    // Ignore explicit load failures; playback will surface actual runtime issues later.
  }
}

function playSafely(audio: HTMLAudioElement): void {
  void audio.play().catch(() => {});
}

export class BrowserSoundEffectsPlayer {
  private levelKey: string | null = null;
  private tick = -1;
  private previousMask = 0;
  private muted = false;
  private volume = 0.7;
  private audioUnlocked = false;
  private audioUnlocking = false;
  private audioPrewarmed = false;
  private audioPrewarmPromise: Promise<void> | null = null;
  private unlockAudio: HTMLAudioElement | null = null;
  private readonly loggedFailures = new Set<string>();
  private readonly loopingAudio = new Map<number, HTMLAudioElement>();
  private readonly oneShotAudioPools = new Map<string, HTMLAudioElement[]>();

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  prewarm(): void {
    if (this.audioPrewarmed || this.audioPrewarmPromise) {
      return;
    }

    const prewarmPromise = measurePerfAsync("audioBootstrapMs", async () => {
      const seenOneShotUrls = new Set<string>();

      this.unlockAudio ??= this.createAudio(SOUND_UNLOCK_URL);
      primeAudioElement(this.unlockAudio);

      for (const definition of ALL_SOUND_DEFINITIONS) {
        if (definition.loop) {
          this.ensureLoopAudio(definition.bit, definition.url);
          continue;
        }

        if (seenOneShotUrls.has(definition.url)) {
          continue;
        }
        seenOneShotUrls.add(definition.url);
        this.ensureOneShotPool(definition.url, ONE_SHOT_PREWARM_POOL_SIZE);
      }
    })
      .then(() => {
        this.audioPrewarmed = true;
      })
      .finally(() => {
        if (this.audioPrewarmPromise === prewarmPromise) {
          this.audioPrewarmPromise = null;
        }
      });

    this.audioPrewarmPromise = prewarmPromise;
  }

  syncFrame(levelKey: string, ruleset: Ruleset, tick: number, soundEffects: number): void {
    if (this.levelKey !== levelKey || tick < this.tick) {
      this.reset();
      this.levelKey = levelKey;
    }

    if (soundEffects !== 0 && (this.muted || this.volume <= 0)) {
      this.logSoundSuppressed(this.muted ? "muted" : "zero-volume");
    }

    const definitions = SOUND_DEFINITIONS[ruleset];
    const risingMask = soundEffects & ~this.previousMask;

    for (const definition of definitions) {
      const bitMask = 1 << definition.bit;
      const active = (soundEffects & bitMask) !== 0;
      if (definition.loop) {
        if (active) {
          this.ensureLoop(definition.bit, definition.url);
        } else {
          this.stopLoop(definition.bit);
        }
        continue;
      }

      if ((risingMask & bitMask) !== 0) {
        this.playOneShot(definition.url);
      }
    }

    if ((ruleset === "Lynx" || ruleset === "Hybrid") && (soundEffects & LYNX_LOOP_MASK) === 0) {
      this.stopAllLoops();
    }

    this.tick = tick;
    this.previousMask = soundEffects;
  }

  reset(): void {
    this.stopAllLoops();
    this.tick = -1;
    this.previousMask = 0;
  }

  dispose(): void {
    this.reset();
    this.levelKey = null;
    this.unlockAudio?.pause();
    this.unlockAudio = null;
    for (const pool of this.oneShotAudioPools.values()) {
      for (const audio of pool) {
        audio.pause();
      }
    }
    this.loggedFailures.clear();
    this.loopingAudio.clear();
    this.oneShotAudioPools.clear();
    this.audioPrewarmed = false;
    this.audioPrewarmPromise = null;
  }

  unlock(): void {
    if (this.audioUnlocked || this.audioUnlocking) {
      return;
    }

    const audio = this.unlockAudio ?? new Audio(SOUND_UNLOCK_URL);
    this.unlockAudio = audio;
    this.audioUnlocking = true;
    audio.preload = "auto";
    audio.muted = true;
    audio.setAttribute("playsinline", "true");
    audio.currentTime = 0;

    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = this.effectiveVolume();
        this.audioUnlocked = true;
        this.audioUnlocking = false;
        this.prewarm();
      })
      .catch((error: unknown) => {
        this.logSoundFailure("unlock-play", SOUND_UNLOCK_URL, error);
        this.audioUnlocking = false;
      });
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyVolume(): void {
    const volume = this.effectiveVolume();
    for (const audio of this.loopingAudio.values()) {
      audio.volume = volume;
    }
    for (const pool of this.oneShotAudioPools.values()) {
      for (const audio of pool) {
        audio.volume = volume;
      }
    }
    if (this.unlockAudio && !this.audioUnlocking) {
      this.unlockAudio.volume = volume;
    }
  }

  private playOneShot(url: string): void {
    if (this.muted || this.volume <= 0) {
      return;
    }

    const audio = this.acquireOneShotAudio(url);
    audio.volume = this.effectiveVolume();
    audio.currentTime = 0;
    void audio.play().catch((error: unknown) => {
      this.logSoundFailure("one-shot-play", url, error);
    });
  }

  private ensureLoop(bit: number, url: string): void {
    const audio = this.ensureLoopAudio(bit, url);
    audio.volume = this.effectiveVolume();
    if (audio.paused) {
      void audio.play().catch((error: unknown) => {
        this.logSoundFailure("loop-play", url, error);
      });
    }
  }

  private stopLoop(bit: number): void {
    const audio = this.loopingAudio.get(bit);
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
  }

  private stopAllLoops(): void {
    for (const audio of this.loopingAudio.values()) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  private ensureOneShotPool(url: string, size: number): HTMLAudioElement[] {
    const pool = this.oneShotAudioPools.get(url) ?? [];
    while (pool.length < size) {
      const audio = this.createAudio(url);
      audio.volume = this.effectiveVolume();
      primeAudioElement(audio);
      pool.push(audio);
    }
    this.oneShotAudioPools.set(url, pool);
    return pool;
  }

  private acquireOneShotAudio(url: string): HTMLAudioElement {
    const pool = this.ensureOneShotPool(url, ONE_SHOT_PREWARM_POOL_SIZE);
    const available = pool.find((audio) => audio.paused || audio.ended);
    if (available) {
      return available;
    }

    const audio = this.createAudio(url);
    audio.volume = this.effectiveVolume();
    primeAudioElement(audio);
    pool.push(audio);
    return audio;
  }

  private ensureLoopAudio(bit: number, url: string): HTMLAudioElement {
    const existing = this.loopingAudio.get(bit);
    if (existing) {
      return existing;
    }

    const audio = this.createAudio(url);
    audio.loop = true;
    audio.volume = this.effectiveVolume();
    primeAudioElement(audio);
    this.loopingAudio.set(bit, audio);
    return audio;
  }

  private createAudio(url: string): HTMLAudioElement {
    const audio = new Audio(url);
    audio.setAttribute("playsinline", "true");
    audio.addEventListener("error", () => {
      this.logSoundFailure(
        "audio-error",
        url,
        audio.error
          ? new Error(`MediaError code=${audio.error.code} message=${audio.error.message}`)
          : new Error("Unknown audio error"),
      );
    });
    return audio;
  }

  private logSoundFailure(kind: string, url: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const key = `${kind}:${url}:${message}`;
    if (this.loggedFailures.has(key)) {
      return;
    }
    this.loggedFailures.add(key);
    console.warn("[tworld:sound]", {
      error,
      kind,
      pageUrl: window.location.href,
      url,
    });
  }

  private logSoundSuppressed(reason: "muted" | "zero-volume"): void {
    const key = `suppressed:${reason}`;
    if (this.loggedFailures.has(key)) {
      return;
    }
    this.loggedFailures.add(key);
    console.warn("[tworld:sound]", {
      kind: "suppressed-by-settings",
      pageUrl: window.location.href,
      reason,
    });
  }
}
