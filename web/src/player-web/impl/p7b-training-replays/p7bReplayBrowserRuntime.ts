import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import {
  encodeRuntimeInputCode,
  type InteractiveInput,
} from "@game-core/api/command";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameFrame } from "@game-core/api/interactive";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameSession,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type {
  P7bExecutionTargetId,
  P7bLevelReplayPresentation,
  P7bReplaySelection,
} from "@game-core/api/p7bReplayPresentation";
import { assertP7bLevelReplayPresentation } from "@game-core/api/p7bReplayPresentationValidation";
import { findP7bReplayCombination } from "@game-core/api/p7bReplayPresentationValidation";
import {
  parseP7TrainingBrowserReplay,
  p7ManualHeldInputAtNativeTick,
  P7_TRAINING_MAX_BROWSER_REPLAY_BYTES,
  type P7TrainingBrowserReplayV1,
  type P7TrainingManualHeldBrowserReplayV1,
  type P7TrainingNativeBrowserReplayV1,
} from "@game-core/api/p7TrainingBrowserReplay";
import type {
  P7bFullReplayPlaybackEngine,
  P7bReplayAssetLoader,
} from "./p7bSegmentReplayPlayer";

export const P7B_BROWSER_LEVEL_MANIFEST_MAX_BYTES = 512 * 1024;
export const P7B_BROWSER_REPLAY_MAX_BYTES = P7_TRAINING_MAX_BROWSER_REPLAY_BYTES;
export const P7B_NEUTRAL_REPLAY_INPUT = "none" satisfies InteractiveInput;

export type P7bBrowserTargetDescriptor = {
  readonly request: GameRequest;
  readonly startOptions?: InteractiveGameSessionStartOptions;
  readonly display: {
    readonly seriesName: string;
    readonly mapFilename: string;
    readonly level: SeriesLevel;
  };
};

export type P7bReplayBrowserManifestV1 = {
  readonly artifact: "ccsolver-p7b-replay-browser-level";
  readonly version: 1;
  readonly presentation: P7bLevelReplayPresentation;
  readonly targets: Readonly<Record<P7bExecutionTargetId, P7bBrowserTargetDescriptor>>;
};

export interface P7bBrowserReplayPayload extends ReplaySolutionPayload {
  readonly bestTimeTicks: number;
}

export type P7bNativeBrowserReplayAsset = {
  readonly transport: "native-replay-pulses";
  readonly request: GameRequest;
  readonly replay: P7bBrowserReplayPayload;
  readonly initialization: P7TrainingNativeBrowserReplayV1["initialization"];
  readonly options?: InteractiveGameSessionStartOptions;
};

export type P7bManualHeldBrowserReplayAsset = {
  readonly transport: "manual-held-schedule";
  readonly request: GameRequest;
  readonly replay: P7TrainingManualHeldBrowserReplayV1;
  readonly initialization: P7TrainingManualHeldBrowserReplayV1["initialization"];
  readonly options?: InteractiveGameSessionStartOptions;
};

export type P7bBrowserReplayAsset =
  | P7bNativeBrowserReplayAsset
  | P7bManualHeldBrowserReplayAsset;

export type P7bBrowserReplayEnvelopeV1 = P7TrainingBrowserReplayV1;

export type P7bFetchText = (href: string) => Promise<string>;

type BrowserReplayServices = Pick<BrowserAppServices, "engines" | "preloadGameRequest">;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer at least ${minimum}`);
  }
  return value as number;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertNoEmbeddedFrames(value: unknown, path = "browser level manifest"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoEmbeddedFrames(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (key === "frames" || key === "frameSnapshots") {
      throw new Error(`${path} must not embed replay frame histories`);
    }
    assertNoEmbeddedFrames(entry, `${path}.${key}`);
  }
}

function parseBoundedJson(text: string, maximumBytes: number, label: string): unknown {
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new Error(`${label} exceeds its ${maximumBytes}-byte browser limit`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

function assertTargetDescriptor(
  value: unknown,
  target: P7bExecutionTargetId,
  expectedLevelNumber: number,
): asserts value is P7bBrowserTargetDescriptor {
  const descriptor = objectValue(value, `P7B ${target} target descriptor`);
  const request = objectValue(descriptor.request, `P7B ${target} game request`);
  const expectedRuleset = target === "ms" ? "MS" : "Lynx";
  if (request.ruleset !== expectedRuleset) {
    throw new Error(`P7B ${target} game request must use the ${expectedRuleset} ruleset`);
  }
  nonEmptyString(request.seriesFile, `P7B ${target} series file`);
  if (safeInteger(request.levelNumber, `P7B ${target} level number`, 1) !== expectedLevelNumber) {
    throw new Error(`P7B ${target} game request level does not match its presentation`);
  }
  if (request.randomSeed !== undefined) safeInteger(request.randomSeed, `P7B ${target} random seed`);

  const display = objectValue(descriptor.display, `P7B ${target} display metadata`);
  nonEmptyString(display.seriesName, `P7B ${target} display series name`);
  nonEmptyString(display.mapFilename, `P7B ${target} display map filename`);
  const level = objectValue(display.level, `P7B ${target} display level`);
  if (safeInteger(level.number, `P7B ${target} display level number`, 1) !== expectedLevelNumber) {
    throw new Error(`P7B ${target} display level does not match its presentation`);
  }
  nonEmptyString(level.name, `P7B ${target} display level name`);
}

export function parseP7bReplayBrowserManifest(text: string): P7bReplayBrowserManifestV1 {
  const value = parseBoundedJson(
    text,
    P7B_BROWSER_LEVEL_MANIFEST_MAX_BYTES,
    "P7B browser level manifest",
  );
  assertNoEmbeddedFrames(value);
  const manifest = objectValue(value, "P7B browser level manifest");
  if (manifest.artifact !== "ccsolver-p7b-replay-browser-level" || manifest.version !== 1) {
    throw new Error("P7B browser level manifest identity is unsupported");
  }
  const presentation = objectValue(manifest.presentation, "P7B browser presentation");
  const levelNumber = safeInteger(presentation.levelNumber, "P7B browser presentation level", 1);
  const targets = objectValue(manifest.targets, "P7B browser target descriptors");
  assertTargetDescriptor(targets.ms, "ms", levelNumber);
  assertTargetDescriptor(targets.lynx, "lynx", levelNumber);
  const parsed = structuredClone(value) as P7bReplayBrowserManifestV1;
  assertP7bLevelReplayPresentation(parsed.presentation);
  return parsed;
}

export function parseP7bBrowserReplayAsset(
  text: string,
  expectedSelection?: P7bReplaySelection,
): P7TrainingBrowserReplayV1 {
  const value = parseBoundedJson(text, P7B_BROWSER_REPLAY_MAX_BYTES, "P7B replay asset");
  assertNoEmbeddedFrames(value, "P7B replay asset");
  const envelope = parseP7TrainingBrowserReplay(text);
  if (
    expectedSelection !== undefined
    && (
      envelope.variantId !== expectedSelection.variant
      || envelope.target !== expectedSelection.executionTarget
    )
  ) {
    throw new Error("P7B replay asset identity does not match the requested selection");
  }
  return envelope;
}

function nativeReplayPayload(
  envelope: P7TrainingNativeBrowserReplayV1,
): P7bBrowserReplayPayload {
  return {
    ...envelope.initialization,
    moves: envelope.decisions.map(({ inputCode, encodedWhen }) => ({
      when: encodedWhen,
      dir: inputCode,
    })),
    modifierMasks: envelope.decisions.map(({ modifierMask }) => modifierMask),
  };
}

function manualStartOptions(
  target: P7bBrowserTargetDescriptor,
): InteractiveGameSessionStartOptions | undefined {
  const options = target.startOptions === undefined
    ? undefined
    : structuredClone(target.startOptions);
  if (target.request.ruleset === "Lynx") {
    if (options?.msStepping !== undefined) {
      throw new Error("P7B Lynx manual replay cannot carry MS stepping options");
    }
    return options;
  }
  if (options?.msStepping !== undefined && options.msStepping !== 0) {
    throw new Error("P7B portable manual replay requires zero MS stepping");
  }
  return { ...options, msStepping: 0 };
}

async function assertReplayContent(
  text: string,
  expected: { readonly digest: string; readonly byteLength: number },
): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength !== expected.byteLength) {
    throw new Error("P7B replay asset content does not match its checked manifest reference");
  }
  const digestBytes = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  const digest = `sha256:${Array.from(
    digestBytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
  if (digest !== expected.digest) {
    throw new Error("P7B replay asset content does not match its checked manifest reference");
  }
}

export async function browserFetchText(href: string): Promise<string> {
  const response = await fetch(href, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`P7B asset request failed (${response.status}) for ${href}`);
  return response.text();
}

export function createP7bBrowserReplayAssetLoader(input: {
  readonly manifest: P7bReplayBrowserManifestV1;
  readonly services: BrowserReplayServices;
  readonly fetchText?: P7bFetchText;
}): P7bReplayAssetLoader<P7bBrowserReplayAsset> {
  const fetchText = input.fetchText ?? browserFetchText;
  return {
    async load(selection: P7bReplaySelection, href: string): Promise<P7bBrowserReplayAsset> {
      const target = input.manifest.targets[selection.executionTarget];
      const combination = findP7bReplayCombination(input.manifest.presentation, selection);
      if (combination.availability !== "available" || combination.replayHref !== href) {
        throw new Error("P7B replay request is not an available checked manifest combination");
      }
      const replayText = await fetchText(href);
      await assertReplayContent(replayText, combination.replayContent);
      const envelope = parseP7bBrowserReplayAsset(replayText, selection);
      if (envelope.transport !== combination.transport) {
        throw new Error("P7B replay asset transport does not match the checked manifest");
      }
      if (envelope.transport === "native-replay-pulses") {
        const request = structuredClone(target.request);
        await input.services.preloadGameRequest?.(request);
        return {
          transport: envelope.transport,
          request,
          replay: nativeReplayPayload(envelope),
          initialization: structuredClone(envelope.initialization),
          options: target.startOptions === undefined
            ? undefined
            : structuredClone(target.startOptions),
        };
      }
      const request = {
        ...structuredClone(target.request),
        randomSeed: envelope.initialization.randomSeed,
      };
      const options = manualStartOptions(target);
      await input.services.preloadGameRequest?.(request);
      return {
        transport: envelope.transport,
        request,
        replay: structuredClone(envelope),
        initialization: structuredClone(envelope.initialization),
        options,
      };
    },
  };
}

export function createP7bBrowserReplayPlaybackEngine(
  services: BrowserReplayServices,
): P7bFullReplayPlaybackEngine<
  P7bBrowserReplayAsset,
  InteractiveGameSession,
  InteractiveGameFrame
> {
  interface ManualPlaybackState {
    readonly replay: P7TrainingManualHeldBrowserReplayV1;
  }
  const manualSessions = new WeakMap<InteractiveGameSession, ManualPlaybackState>();
  return {
    startFullReplay: async (asset) => {
      const engine = services.engines[asset.request.ruleset];
      if (asset.transport === "native-replay-pulses") {
        return engine.startReplaySession(asset.request, asset.replay, asset.options);
      }
      const session = await engine.startSession(asset.request, asset.options);
      manualSessions.set(session, {
        replay: asset.replay,
      });
      return session;
    },
    advanceOneTick: async (session) => {
      const engine = services.engines[session.request.ruleset];
      const manual = manualSessions.get(session);
      if (manual === undefined) {
        return engine.advanceSession(session, P7B_NEUTRAL_REPLAY_INPUT);
      }
      const nextNativeTick = session.history.currentTick + 1;
      const heldInput = p7ManualHeldInputAtNativeTick(manual.replay, nextNativeTick);
      const next = await engine.advanceSession(session, encodeRuntimeInputCode(heldInput, 0));
      manualSessions.delete(session);
      manualSessions.set(next, manual);
      return next;
    },
    // Durable spans use exclusive advance-count boundaries: a fresh history tick -1 is boundary 0.
    currentTick: (session) => session.history.currentTick + 1,
    frame: (session) => session.frame,
    dispose: async (session) => {
      manualSessions.delete(session);
      await services.engines[session.request.ruleset].disposeSession?.(session);
    },
  };
}

export function p7bBrowserSeriesForTarget(
  manifest: P7bReplayBrowserManifestV1,
  target: P7bExecutionTargetId,
): SeriesCatalogEntry {
  const descriptor = manifest.targets[target];
  return {
    name: descriptor.display.seriesName,
    filebase: descriptor.request.seriesFile,
    mapfilename: descriptor.display.mapFilename,
    ruleset: descriptor.request.ruleset,
    levels: [structuredClone(descriptor.display.level)],
  };
}
