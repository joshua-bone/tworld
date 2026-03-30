export type ActorLifecyclePhase =
  | "probe-move"
  | "begin-move"
  | "complete-move"
  | "blocked-move"
  | "collision"
  | "arrival"
  | "held-floor"
  | "trap-release"
  | "cloner-entry"
  | "cloner-clone"
  | "support"
  | "portable-backing"
  | "render";

export const ACTOR_LIFECYCLE_PHASES = [
  "probe-move",
  "begin-move",
  "complete-move",
  "blocked-move",
  "collision",
  "arrival",
  "held-floor",
  "trap-release",
  "cloner-entry",
  "cloner-clone",
  "support",
  "portable-backing",
  "render",
] as const satisfies readonly ActorLifecyclePhase[];

export type ActorLifecycleHookName =
  | "testMove"
  | "startMove"
  | "finishMove"
  | "blockedMove"
  | "collision"
  | "arrival"
  | "heldFloor"
  | "trapRelease"
  | "clonerEntry"
  | "clonerClone"
  | "support"
  | "portableBacking"
  | "render";

export const ACTOR_LIFECYCLE_HOOKS = [
  "testMove",
  "startMove",
  "finishMove",
  "blockedMove",
  "collision",
  "arrival",
  "heldFloor",
  "trapRelease",
  "clonerEntry",
  "clonerClone",
  "support",
  "portableBacking",
  "render",
] as const satisfies readonly ActorLifecycleHookName[];

export const ACTOR_LIFECYCLE_PHASE_BY_HOOK = {
  testMove: "probe-move",
  startMove: "begin-move",
  finishMove: "complete-move",
  blockedMove: "blocked-move",
  collision: "collision",
  arrival: "arrival",
  heldFloor: "held-floor",
  trapRelease: "trap-release",
  clonerEntry: "cloner-entry",
  clonerClone: "cloner-clone",
  support: "support",
  portableBacking: "portable-backing",
  render: "render",
} as const satisfies Record<ActorLifecycleHookName, ActorLifecyclePhase>;

export const ACTOR_LIFECYCLE_HOOK_BY_PHASE = {
  "probe-move": "testMove",
  "begin-move": "startMove",
  "complete-move": "finishMove",
  "blocked-move": "blockedMove",
  collision: "collision",
  arrival: "arrival",
  "held-floor": "heldFloor",
  "trap-release": "trapRelease",
  "cloner-entry": "clonerEntry",
  "cloner-clone": "clonerClone",
  support: "support",
  "portable-backing": "portableBacking",
  render: "render",
} as const satisfies Record<ActorLifecyclePhase, ActorLifecycleHookName>;

export interface ActorLifecycleContext<
  TTileId extends number = number,
  TActorId extends number = number,
  TPhase extends ActorLifecyclePhase = ActorLifecyclePhase,
> {
  readonly phase: TPhase;
  readonly actorId: TActorId;
  readonly tileId?: TTileId;
}

export type ActorLifecycleHandler<
  TTileId extends number = number,
  TActorId extends number = number,
  TPhase extends ActorLifecyclePhase = ActorLifecyclePhase,
> = (context: ActorLifecycleContext<TTileId, TActorId, TPhase>) => void;

export type ActorTestMoveContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "probe-move">;

export type ActorStartMoveContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "begin-move">;

export type ActorFinishMoveContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "complete-move">;

export type ActorBlockedMoveContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "blocked-move">;

export type ActorCollisionContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "collision">;

export type ActorArrivalContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "arrival">;

export type ActorHeldFloorContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "held-floor">;

export type ActorTrapReleaseContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "trap-release">;

export type ActorClonerEntryContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "cloner-entry">;

export type ActorClonerCloneContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "cloner-clone">;

export type ActorSupportContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "support">;

export type ActorPortableBackingContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "portable-backing">;

export type ActorRenderContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId, "render">;

export interface ActorLifecycleHooks<TTileId extends number = number, TActorId extends number = number> {
  readonly testMove?: ActorLifecycleHandler<TTileId, TActorId, "probe-move">;
  readonly startMove?: ActorLifecycleHandler<TTileId, TActorId, "begin-move">;
  readonly finishMove?: ActorLifecycleHandler<TTileId, TActorId, "complete-move">;
  readonly blockedMove?: ActorLifecycleHandler<TTileId, TActorId, "blocked-move">;
  readonly collision?: ActorLifecycleHandler<TTileId, TActorId, "collision">;
  readonly arrival?: ActorLifecycleHandler<TTileId, TActorId, "arrival">;
  readonly heldFloor?: ActorLifecycleHandler<TTileId, TActorId, "held-floor">;
  readonly trapRelease?: ActorLifecycleHandler<TTileId, TActorId, "trap-release">;
  readonly clonerEntry?: ActorLifecycleHandler<TTileId, TActorId, "cloner-entry">;
  readonly clonerClone?: ActorLifecycleHandler<TTileId, TActorId, "cloner-clone">;
  readonly support?: ActorLifecycleHandler<TTileId, TActorId, "support">;
  readonly portableBacking?: ActorLifecycleHandler<TTileId, TActorId, "portable-backing">;
  readonly render?: ActorLifecycleHandler<TTileId, TActorId, "render">;
}

const EMPTY_ACTOR_LIFECYCLE_HOOKS = Object.freeze({}) as Readonly<ActorLifecycleHooks<number, number>>;

export function createActorLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(
  hooks: Partial<ActorLifecycleHooks<TTileId, TActorId>> = {},
): ActorLifecycleHooks<TTileId, TActorId> {
  const filteredHooks: Partial<ActorLifecycleHooks<TTileId, TActorId>> = {};
  for (const [hook, handler] of Object.entries(hooks)) {
    if (handler !== undefined) {
      Object.assign(filteredHooks, { [hook]: handler });
    }
  }
  return filteredHooks;
}

export function noActorLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(): ActorLifecycleHooks<
  TTileId,
  TActorId
> {
  return EMPTY_ACTOR_LIFECYCLE_HOOKS as ActorLifecycleHooks<TTileId, TActorId>;
}

export function composeActorLifecycleHooks<TTileId extends number = number, TActorId extends number = number>(
  ...hooksList: ReadonlyArray<ActorLifecycleHooks<TTileId, TActorId> | undefined>
): ActorLifecycleHooks<TTileId, TActorId> | undefined {
  const hooks: Partial<ActorLifecycleHooks<TTileId, TActorId>> = {};
  let hasHook = false;
  for (const registeredHooks of hooksList) {
    if (!registeredHooks) {
      continue;
    }
    Object.assign(hooks, registeredHooks);
    hasHook ||= Object.keys(registeredHooks).length > 0;
  }
  return hasHook ? createActorLifecycleHooks(hooks) : undefined;
}

export function lookupActorLifecycleHook<TTileId extends number = number, TActorId extends number = number>(
  hooks: ActorLifecycleHooks<TTileId, TActorId>,
  hook: ActorLifecycleHookName,
): ActorLifecycleHooks<TTileId, TActorId>[typeof hook] | null {
  return hooks[hook] ?? null;
}

export function actorLifecycleHooksToPhaseMap<TTileId extends number = number, TActorId extends number = number>(
  hooks: ActorLifecycleHooks<TTileId, TActorId>,
): Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>> {
  const phases: Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>> = {};

  if (hooks.testMove) {
    phases["probe-move"] = hooks.testMove as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.startMove) {
    phases["begin-move"] = hooks.startMove as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.finishMove) {
    phases["complete-move"] = hooks.finishMove as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.blockedMove) {
    phases["blocked-move"] = hooks.blockedMove as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.collision) {
    phases.collision = hooks.collision as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.arrival) {
    phases.arrival = hooks.arrival as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.heldFloor) {
    phases["held-floor"] = hooks.heldFloor as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.trapRelease) {
    phases["trap-release"] = hooks.trapRelease as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.clonerEntry) {
    phases["cloner-entry"] = hooks.clonerEntry as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.clonerClone) {
    phases["cloner-clone"] = hooks.clonerClone as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.support) {
    phases.support = hooks.support as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.portableBacking) {
    phases["portable-backing"] = hooks.portableBacking as ActorLifecycleHandler<TTileId, TActorId>;
  }
  if (hooks.render) {
    phases.render = hooks.render as ActorLifecycleHandler<TTileId, TActorId>;
  }

  return phases;
}

export function actorLifecyclePhaseMapToHooks<TTileId extends number = number, TActorId extends number = number>(
  phases: Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>> = {},
): ActorLifecycleHooks<TTileId, TActorId> {
  return createActorLifecycleHooks({
    testMove: phases["probe-move"] as ActorLifecycleHooks<TTileId, TActorId>["testMove"],
    startMove: phases["begin-move"] as ActorLifecycleHooks<TTileId, TActorId>["startMove"],
    finishMove: phases["complete-move"] as ActorLifecycleHooks<TTileId, TActorId>["finishMove"],
    blockedMove: phases["blocked-move"] as ActorLifecycleHooks<TTileId, TActorId>["blockedMove"],
    collision: phases.collision as ActorLifecycleHooks<TTileId, TActorId>["collision"],
    arrival: phases.arrival as ActorLifecycleHooks<TTileId, TActorId>["arrival"],
    heldFloor: phases["held-floor"] as ActorLifecycleHooks<TTileId, TActorId>["heldFloor"],
    trapRelease: phases["trap-release"] as ActorLifecycleHooks<TTileId, TActorId>["trapRelease"],
    clonerEntry: phases["cloner-entry"] as ActorLifecycleHooks<TTileId, TActorId>["clonerEntry"],
    clonerClone: phases["cloner-clone"] as ActorLifecycleHooks<TTileId, TActorId>["clonerClone"],
    support: phases.support as ActorLifecycleHooks<TTileId, TActorId>["support"],
    portableBacking: phases["portable-backing"] as ActorLifecycleHooks<TTileId, TActorId>["portableBacking"],
    render: phases.render as ActorLifecycleHooks<TTileId, TActorId>["render"],
  });
}
