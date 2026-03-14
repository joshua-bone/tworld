import chipBlockUrl from "../../../../res/block.wav?url";
import bombUrl from "../../../../res/bomb.wav?url";
import bumpUrl from "../../../../res/bump.wav?url";
import pickupChipMsUrl from "../../../../res/chack.wav?url";
import buttonUrl from "../../../../res/click.wav?url";
import fireWalkingUrl from "../../../../res/crackle.wav?url";
import chipDeathLynxUrl from "../../../../res/derezz.wav?url";
import doorUrl from "../../../../res/door.wav?url";
import chipDeathMsUrl from "../../../../res/death.wav?url";
import timeoutMsUrl from "../../../../res/ding.wav?url";
import slideUrl from "../../../../res/force.wav?url";
import iceWalkingUrl from "../../../../res/snick.wav?url";
import slideWalkingUrl from "../../../../res/slurp.wav?url";
import socketMsUrl from "../../../../res/socket.wav?url";
import splashUrl from "../../../../res/splash.wav?url";
import skateForwardUrl from "../../../../res/skate.wav?url";
import skateTurnUrl from "../../../../res/skaturn.wav?url";
import itemPickupUrl from "../../../../res/ting.wav?url";
import teleportUrl from "../../../../res/teleport.wav?url";
import thiefUrl from "../../../../res/thief.wav?url";
import winUrl from "../../../../res/tada.wav?url";
import tileEmptiedUrl from "../../../../res/whisk.wav?url";
import wallCreatedUrl from "../../../../res/popup.wav?url";
import waterWalkingUrl from "../../../../res/plip.wav?url";
import blockedMoveMsUrl from "../../../../res/oof.wav?url";
import type { GameRequest } from "@domain/game/types";
import { LYNX_FLOOR_SOUND_MASK, LYNX_SOUND } from "@domain/game/rules/lynx/engine";
import { MS_SOUND } from "@domain/game/rules/ms/tiles";

type Ruleset = GameRequest["ruleset"];

interface SoundDefinition {
  bit: number;
  url: string;
  loop?: boolean;
}

const LYNX_LOOP_MASK = LYNX_FLOOR_SOUND_MASK | (1 << LYNX_SOUND.BlockMoving);

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
  Lynx: [
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
  ],
};

function playSafely(audio: HTMLAudioElement): void {
  void audio.play().catch(() => {});
}

export class BrowserSoundEffectsPlayer {
  private levelKey: string | null = null;
  private tick = -1;
  private previousMask = 0;
  private muted = false;
  private volume = 0.7;
  private readonly loopingAudio = new Map<number, HTMLAudioElement>();

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume();
  }

  syncFrame(levelKey: string, ruleset: Ruleset, tick: number, soundEffects: number): void {
    if (this.levelKey !== levelKey || tick < this.tick) {
      this.reset();
      this.levelKey = levelKey;
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

    if (ruleset === "Lynx" && (soundEffects & LYNX_LOOP_MASK) === 0) {
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
    this.loopingAudio.clear();
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.volume;
  }

  private applyVolume(): void {
    const volume = this.effectiveVolume();
    for (const audio of this.loopingAudio.values()) {
      audio.volume = volume;
    }
  }

  private playOneShot(url: string): void {
    if (this.muted || this.volume <= 0) {
      return;
    }

    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = this.volume;
    playSafely(audio);
  }

  private ensureLoop(bit: number, url: string): void {
    let audio = this.loopingAudio.get(bit);
    if (!audio) {
      audio = new Audio(url);
      audio.loop = true;
      audio.preload = "auto";
      this.loopingAudio.set(bit, audio);
    }

    audio.volume = this.effectiveVolume();
    if (audio.paused) {
      playSafely(audio);
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
}
