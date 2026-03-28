export interface StatefulActorRuntimeEntry<
  TKind extends string = string,
  TState extends object = Record<string, unknown>,
> {
  actorSerial: number;
  kind: TKind;
  state: TState;
}

export interface StatefulActorRuntimeStore<TEntry extends StatefulActorRuntimeEntry = StatefulActorRuntimeEntry> {
  byActorSerial: Map<number, TEntry>;
}

export function createStatefulActorRuntimeStore<
  TEntry extends StatefulActorRuntimeEntry = StatefulActorRuntimeEntry,
>(): StatefulActorRuntimeStore<TEntry> {
  return {
    byActorSerial: new Map<number, TEntry>(),
  };
}

export function cloneStatefulActorRuntimeStore<TEntry extends StatefulActorRuntimeEntry>(
  store: StatefulActorRuntimeStore<TEntry>,
): StatefulActorRuntimeStore<TEntry> {
  const cloned = createStatefulActorRuntimeStore<TEntry>();
  for (const [actorSerial, entry] of store.byActorSerial) {
    cloned.byActorSerial.set(actorSerial, structuredClone(entry));
  }
  return cloned;
}

export function findStatefulActorRuntime<TEntry extends StatefulActorRuntimeEntry>(
  store: StatefulActorRuntimeStore<TEntry>,
  actorSerial: number,
): TEntry | undefined {
  return store.byActorSerial.get(actorSerial);
}

export function setStatefulActorRuntime<TEntry extends StatefulActorRuntimeEntry>(
  store: StatefulActorRuntimeStore<TEntry>,
  entry: TEntry,
): TEntry {
  store.byActorSerial.set(entry.actorSerial, entry);
  return entry;
}

export function removeStatefulActorRuntime<TEntry extends StatefulActorRuntimeEntry>(
  store: StatefulActorRuntimeStore<TEntry>,
  actorSerial: number,
): void {
  store.byActorSerial.delete(actorSerial);
}

export function forkStatefulActorRuntime<TEntry extends StatefulActorRuntimeEntry>(
  store: StatefulActorRuntimeStore<TEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): TEntry | undefined {
  const source = findStatefulActorRuntime(store, sourceActorSerial);
  if (!source) {
    return undefined;
  }

  const clone = structuredClone(source);
  clone.actorSerial = targetActorSerial;
  setStatefulActorRuntime(store, clone);
  return clone;
}
