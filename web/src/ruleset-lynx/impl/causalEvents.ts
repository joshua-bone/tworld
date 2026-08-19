export type LynxNativeCausalEventKind =
  | "movement-started"
  | "movement-blocked"
  | "move-completed"
  | "teleport"
  | "collect"
  | "open-door"
  | "open-socket"
  | "inventory-changed"
  | "map-mutated"
  | "device-activated"
  | "device-state-changed"
  | "actor-spawned"
  | "actor-destroyed"
  | "player-died"
  | "terminal-failed"
  | "complete-level";

export interface LynxNativeCausalPosition {
  readonly pos: number;
  readonly z: number;
}

export interface LynxNativeCausalResourceCounter {
  readonly slot: "keys" | "boots" | "tools" | "chips-needed";
  readonly index: number | null;
  readonly beforeCount: number;
  readonly afterCount: number;
}

/** Raw Lynx action authority; semantic identities are projected by CCSolver. */
export interface LynxNativeCausalEvent {
  readonly kind: LynxNativeCausalEventKind;
  readonly actorId: number;
  readonly actorSerial: number | null;
  readonly actorRuntimeKey?: string | null;
  readonly tileId: number | null;
  readonly resultingTileId?: number | null;
  readonly sourceTileId?: number | null;
  readonly sourcePosition?: LynxNativeCausalPosition | null;
  readonly sourceStratum?: "terrain" | "pickup" | "overlay";
  readonly targetStratum?: "terrain" | "pickup" | "overlay";
  readonly sourceActorId?: number | null;
  readonly sourceActorSerial?: number | null;
  readonly sourceActorRuntimeKey?: string | null;
  readonly direction?: number | null;
  readonly movementRole?: "self" | "push" | "forced";
  readonly decisionSource?: "current-input" | "queued-input" | "forced";
  readonly resourceCounter?: LynxNativeCausalResourceCounter | null;
  readonly action?: string | null;
  readonly beforeState?: string | null;
  readonly afterState?: string | null;
  readonly cause?: string | null;
  readonly failureReason?: string | null;
  readonly parentActorSerial?: number | null;
  readonly spawnOrdinal?: number | null;
  readonly before: LynxNativeCausalPosition | null;
  readonly after: LynxNativeCausalPosition | null;
  readonly nativeTick: number;
  readonly withinTickOrder: number;
  readonly phase:
    | "movement-commit"
    | "teleport-resolution"
    | "arrival-effect"
    | "device-action"
    | "actor-lifecycle"
    | "terminal-latch";
}

export interface LynxCausalEventOptions {
  readonly causalEventSink?: (event: LynxNativeCausalEvent) => void;
}

export type LynxNativeCausalEventSeed = Omit<
  LynxNativeCausalEvent,
  "nativeTick" | "withinTickOrder"
>;

interface LynxNativeCausalWriter {
  readonly nativeTick: number;
  readonly sink: (event: LynxNativeCausalEvent) => void;
  nextWithinTickOrder: number;
}

const writers = new WeakMap<object, LynxNativeCausalWriter>();

export function attachLynxNativeCausalWriter(
  authority: object,
  nativeTick: number,
  options: LynxCausalEventOptions | undefined,
): () => void {
  const sink = options?.causalEventSink;
  if (sink === undefined) return () => undefined;
  const writer: LynxNativeCausalWriter = {
    nativeTick,
    sink,
    nextWithinTickOrder: 0,
  };
  writers.set(authority, writer);
  return () => {
    if (writers.get(authority) === writer) writers.delete(authority);
  };
}

function frozenPosition(position: LynxNativeCausalPosition | null): LynxNativeCausalPosition | null {
  return position === null ? null : Object.freeze({ ...position });
}

function frozenResourceCounter(
  counter: LynxNativeCausalResourceCounter | null | undefined,
): LynxNativeCausalResourceCounter | null | undefined {
  return counter == null ? counter : Object.freeze({ ...counter });
}

export function recordLynxNativeCausalEvent(
  authority: object,
  seed: LynxNativeCausalEventSeed,
): void {
  const writer = writers.get(authority);
  if (writer === undefined) return;
  const event: LynxNativeCausalEvent = Object.freeze({
    ...seed,
    before: frozenPosition(seed.before),
    after: frozenPosition(seed.after),
    sourcePosition: frozenPosition(seed.sourcePosition ?? null),
    resourceCounter: frozenResourceCounter(seed.resourceCounter),
    nativeTick: writer.nativeTick,
    withinTickOrder: writer.nextWithinTickOrder,
  });
  writer.nextWithinTickOrder += 1;
  writer.sink(event);
}
