export type TileLifecyclePhase =
  | "probe-enter"
  | "begin-enter"
  | "complete-enter"
  | "probe-exit"
  | "complete-exit"
  | "probe-support"
  | "activate"
  | "tick"
  | "render"
  | "decode-load";

export const TILE_LIFECYCLE_PHASES = [
  "probe-enter",
  "begin-enter",
  "complete-enter",
  "probe-exit",
  "complete-exit",
  "probe-support",
  "activate",
  "tick",
  "render",
  "decode-load",
] as const satisfies readonly TileLifecyclePhase[];

export type TileLifecycleHookName =
  | "testEnter"
  | "startEnter"
  | "finishEnter"
  | "testExit"
  | "finishExit"
  | "support"
  | "activate"
  | "tick"
  | "render"
  | "decodeLoad";

export const TILE_LIFECYCLE_HOOKS = [
  "testEnter",
  "startEnter",
  "finishEnter",
  "testExit",
  "finishExit",
  "support",
  "activate",
  "tick",
  "render",
  "decodeLoad",
] as const satisfies readonly TileLifecycleHookName[];

export const TILE_LIFECYCLE_PHASE_BY_HOOK = {
  testEnter: "probe-enter",
  startEnter: "begin-enter",
  finishEnter: "complete-enter",
  testExit: "probe-exit",
  finishExit: "complete-exit",
  support: "probe-support",
  activate: "activate",
  tick: "tick",
  render: "render",
  decodeLoad: "decode-load",
} as const satisfies Record<TileLifecycleHookName, TileLifecyclePhase>;

export const TILE_LIFECYCLE_HOOK_BY_PHASE = {
  "probe-enter": "testEnter",
  "begin-enter": "startEnter",
  "complete-enter": "finishEnter",
  "probe-exit": "testExit",
  "complete-exit": "finishExit",
  "probe-support": "support",
  activate: "activate",
  tick: "tick",
  render: "render",
  "decode-load": "decodeLoad",
} as const satisfies Record<TileLifecyclePhase, TileLifecycleHookName>;

export interface TileLifecycleContext<
  TTileId extends number = number,
  TActorId extends number = number,
  TPhase extends TileLifecyclePhase = TileLifecyclePhase,
> {
  readonly phase: TPhase;
  readonly tileId: TTileId;
  readonly actorId?: TActorId;
}

export type TileLifecycleHandler<
  TTileId extends number = number,
  TActorId extends number = number,
  TPhase extends TileLifecyclePhase = TileLifecyclePhase,
> = (context: TileLifecycleContext<TTileId, TActorId, TPhase>) => void;

export type TileTestEnterContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "probe-enter"> & {
    readonly actorId: TActorId;
  };

export type TileStartEnterContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "begin-enter"> & {
    readonly actorId: TActorId;
  };

export type TileFinishEnterContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "complete-enter"> & {
    readonly actorId: TActorId;
  };

export type TileTestExitContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "probe-exit"> & {
    readonly actorId: TActorId;
  };

export type TileFinishExitContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "complete-exit"> & {
    readonly actorId: TActorId;
  };

export type TileSupportContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "probe-support">;

export type TileActivateContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "activate">;

export type TileTickContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "tick">;

export type TileRenderContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "render">;

export type TileDecodeLoadContext<TTileId extends number = number, TActorId extends number = number> =
  TileLifecycleContext<TTileId, TActorId, "decode-load">;

export interface TileLifecycleHooks<TTileId extends number = number, TActorId extends number = number> {
  readonly testEnter?: TileLifecycleHandler<TTileId, TActorId, "probe-enter">;
  readonly startEnter?: TileLifecycleHandler<TTileId, TActorId, "begin-enter">;
  readonly finishEnter?: TileLifecycleHandler<TTileId, TActorId, "complete-enter">;
  readonly testExit?: TileLifecycleHandler<TTileId, TActorId, "probe-exit">;
  readonly finishExit?: TileLifecycleHandler<TTileId, TActorId, "complete-exit">;
  readonly support?: TileLifecycleHandler<TTileId, TActorId, "probe-support">;
  readonly activate?: TileLifecycleHandler<TTileId, TActorId, "activate">;
  readonly tick?: TileLifecycleHandler<TTileId, TActorId, "tick">;
  readonly render?: TileLifecycleHandler<TTileId, TActorId, "render">;
  readonly decodeLoad?: TileLifecycleHandler<TTileId, TActorId, "decode-load">;
}

const EMPTY_TILE_LIFECYCLE_HOOKS = Object.freeze({}) as Readonly<TileLifecycleHooks<number, number>>;

export function createTileLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(
  hooks: Partial<TileLifecycleHooks<TTileId, TActorId>> = {},
): TileLifecycleHooks<TTileId, TActorId> {
  const filteredHooks: Partial<TileLifecycleHooks<TTileId, TActorId>> = {};
  for (const [hook, handler] of Object.entries(hooks)) {
    if (handler !== undefined) {
      Object.assign(filteredHooks, { [hook]: handler });
    }
  }
  return filteredHooks;
}

export function noTileLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(): TileLifecycleHooks<
  TTileId,
  TActorId
> {
  return EMPTY_TILE_LIFECYCLE_HOOKS as TileLifecycleHooks<TTileId, TActorId>;
}

export function composeTileLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(
  ...hooksList: ReadonlyArray<TileLifecycleHooks<TTileId, TActorId> | undefined>
): TileLifecycleHooks<TTileId, TActorId> | undefined {
  const hooks: Partial<TileLifecycleHooks<TTileId, TActorId>> = {};
  let hasHook = false;
  for (const registeredHooks of hooksList) {
    if (!registeredHooks) {
      continue;
    }
    Object.assign(hooks, registeredHooks);
    hasHook ||= Object.keys(registeredHooks).length > 0;
  }
  return hasHook ? createTileLifecycleHooks(hooks) : undefined;
}

export function lookupTileLifecycleHook<TTileId extends number = number, TActorId extends number = number>(
  hooks: TileLifecycleHooks<TTileId, TActorId>,
  hook: TileLifecycleHookName,
): TileLifecycleHooks<TTileId, TActorId>[typeof hook] | null {
  return hooks[hook] ?? null;
}

export function tileLifecycleHooksToPhaseMap<TTileId extends number = number, TActorId extends number = number>(
  hooks: TileLifecycleHooks<TTileId, TActorId>,
): Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>> {
  const phases: Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>> = {};

  if (hooks.testEnter) {
    phases["probe-enter"] = hooks.testEnter as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.startEnter) {
    phases["begin-enter"] = hooks.startEnter as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.finishEnter) {
    phases["complete-enter"] = hooks.finishEnter as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.testExit) {
    phases["probe-exit"] = hooks.testExit as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.finishExit) {
    phases["complete-exit"] = hooks.finishExit as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.support) {
    phases["probe-support"] = hooks.support as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.activate) {
    phases.activate = hooks.activate as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.tick) {
    phases.tick = hooks.tick as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.render) {
    phases.render = hooks.render as TileLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.decodeLoad) {
    phases["decode-load"] = hooks.decodeLoad as TileLifecycleHandler<TTileId, TActorId>;
  }

  return phases;
}

export function tileLifecyclePhaseMapToHooks<TTileId extends number = number, TActorId extends number = number>(
  phases: Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>> = {},
): TileLifecycleHooks<TTileId, TActorId> {
  return createTileLifecycleHooks({
    testEnter: phases["probe-enter"] as TileLifecycleHooks<TTileId, TActorId>["testEnter"],
    startEnter: phases["begin-enter"] as TileLifecycleHooks<TTileId, TActorId>["startEnter"],
    finishEnter: phases["complete-enter"] as TileLifecycleHooks<TTileId, TActorId>["finishEnter"],
    testExit: phases["probe-exit"] as TileLifecycleHooks<TTileId, TActorId>["testExit"],
    finishExit: phases["complete-exit"] as TileLifecycleHooks<TTileId, TActorId>["finishExit"],
    support: phases["probe-support"] as TileLifecycleHooks<TTileId, TActorId>["support"],
    activate: phases.activate as TileLifecycleHooks<TTileId, TActorId>["activate"],
    tick: phases.tick as TileLifecycleHooks<TTileId, TActorId>["tick"],
    render: phases.render as TileLifecycleHooks<TTileId, TActorId>["render"],
    decodeLoad: phases["decode-load"] as TileLifecycleHooks<TTileId, TActorId>["decodeLoad"],
  });
}
