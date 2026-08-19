export type MsNativeCausalEventKind =
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

export interface MsNativeCausalPosition {
  readonly pos: number;
  readonly z: number;
}

export interface MsNativeCausalResourceCounter {
  readonly slot: "keys" | "boots" | "tools" | "chips-needed";
  readonly index: number | null;
  readonly beforeCount: number;
  readonly afterCount: number;
}

/**
 * A target-native action record emitted only from the mutation seam that
 * performed the effect. It intentionally carries raw target identities; the
 * CCSolver adapter owns semantic identity projection.
 */
export interface MsNativeCausalEvent {
  readonly kind: MsNativeCausalEventKind;
  readonly actorId: number;
  readonly actorSerial: number | null;
  readonly actorRuntimeKey?: string | null;
  readonly tileId: number | null;
  readonly resultingTileId?: number | null;
  readonly sourceTileId?: number | null;
  readonly sourcePosition?: MsNativeCausalPosition | null;
  readonly sourceStratum?: "terrain" | "pickup" | "overlay";
  readonly targetStratum?: "terrain" | "pickup" | "overlay";
  readonly sourceActorId?: number | null;
  readonly sourceActorSerial?: number | null;
  readonly sourceActorRuntimeKey?: string | null;
  readonly direction?: number | null;
  readonly movementRole?: "self" | "push" | "forced";
  readonly resourceCounter?: MsNativeCausalResourceCounter | null;
  readonly action?: string | null;
  readonly beforeState?: string | null;
  readonly afterState?: string | null;
  readonly cause?: string | null;
  readonly failureReason?: string | null;
  readonly parentActorSerial?: number | null;
  readonly parentActorRuntimeKey?: string | null;
  readonly spawnOrdinal?: number | null;
  readonly before: MsNativeCausalPosition | null;
  readonly after: MsNativeCausalPosition | null;
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

export interface MsCausalEventOptions {
  readonly causalEventSink?: (event: MsNativeCausalEvent) => void;
}

export type MsNativeCausalEventSeed = Omit<
  MsNativeCausalEvent,
  "nativeTick" | "withinTickOrder"
>;

interface MsNativeCausalWriter {
  readonly nativeTick: number;
  readonly sink: (event: MsNativeCausalEvent) => void;
  nextWithinTickOrder: number;
}

const writers = new WeakMap<object, MsNativeCausalWriter>();

export function attachMsNativeCausalWriter(
  authority: object,
  nativeTick: number,
  options: MsCausalEventOptions | undefined,
): () => void {
  const sink = options?.causalEventSink;
  if (sink === undefined) return () => undefined;
  const writer: MsNativeCausalWriter = {
    nativeTick,
    sink,
    nextWithinTickOrder: 0,
  };
  writers.set(authority, writer);
  return () => {
    if (writers.get(authority) === writer) writers.delete(authority);
  };
}

function frozenPosition(position: MsNativeCausalPosition | null): MsNativeCausalPosition | null {
  return position === null ? null : Object.freeze({ ...position });
}

function frozenResourceCounter(
  counter: MsNativeCausalResourceCounter | null | undefined,
): MsNativeCausalResourceCounter | null | undefined {
  return counter == null ? counter : Object.freeze({ ...counter });
}

export function recordMsNativeCausalEvent(
  authority: object,
  seed: MsNativeCausalEventSeed,
): void {
  const writer = writers.get(authority);
  if (writer === undefined) return;
  const event: MsNativeCausalEvent = Object.freeze({
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
