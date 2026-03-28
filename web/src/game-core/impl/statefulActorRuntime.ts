export interface StatefulActorPortableBacking<TPortableFamily extends string = string> {
  family: TPortableFamily;
  portableItemSerial: number;
}

export interface StatefulActorRuntimeEntry<
  TKind extends string = string,
  TState extends object = Record<string, unknown>,
  TPortableFamily extends string = string,
> {
  actorSerial: number;
  kind: TKind;
  state: TState;
  portableBacking?: StatefulActorPortableBacking<TPortableFamily> | null;
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

export interface StatefulActorRuntimeFamilyAdapter<
  TEntry extends StatefulActorRuntimeEntry,
  TSpawnContext,
  TPortableFamily extends string = string,
> {
  kind: TEntry["kind"];
  find(store: StatefulActorRuntimeStore<TEntry>, actorSerial: number): TEntry | undefined;
  spawn(store: StatefulActorRuntimeStore<TEntry>, actorSerial: number, context: TSpawnContext): TEntry | null;
  restore(store: StatefulActorRuntimeStore<TEntry>, entry: TEntry): TEntry;
  clone(store: StatefulActorRuntimeStore<TEntry>, sourceActorSerial: number, targetActorSerial: number): TEntry | undefined;
  destroy(store: StatefulActorRuntimeStore<TEntry>, actorSerial: number): void;
  attachPortableBacking(
    store: StatefulActorRuntimeStore<TEntry>,
    actorSerial: number,
    portableBacking: StatefulActorPortableBacking<TPortableFamily>,
  ): TEntry | undefined;
  detachPortableBacking(store: StatefulActorRuntimeStore<TEntry>, actorSerial: number): TEntry | undefined;
}

export interface StatefulActorRuntimeFamilyHooks<
  TEntry extends StatefulActorRuntimeEntry,
  TSpawnContext,
  TPortableFamily extends string = string,
> {
  kind: TEntry["kind"];
  createSpawnEntry(actorSerial: number, context: TSpawnContext): TEntry | null;
  cloneEntry?(entry: TEntry, targetActorSerial: number): TEntry;
  restoreEntry?(entry: TEntry): TEntry;
  attachPortableBacking?(
    entry: TEntry,
    portableBacking: StatefulActorPortableBacking<TPortableFamily>,
  ): void;
  detachPortableBacking?(entry: TEntry): void;
}

export function createStatefulActorRuntimeFamilyAdapter<
  TEntry extends StatefulActorRuntimeEntry,
  TSpawnContext,
  TPortableFamily extends string = string,
>(
  hooks: StatefulActorRuntimeFamilyHooks<TEntry, TSpawnContext, TPortableFamily>,
): StatefulActorRuntimeFamilyAdapter<TEntry, TSpawnContext, TPortableFamily> {
  return {
    kind: hooks.kind,
    find(store, actorSerial) {
      const entry = findStatefulActorRuntime(store, actorSerial);
      return entry?.kind === hooks.kind ? entry : undefined;
    },
    spawn(store, actorSerial, context) {
      const entry = hooks.createSpawnEntry(actorSerial, context);
      return entry ? this.restore(store, entry) : null;
    },
    restore(store, entry) {
      const restored = hooks.restoreEntry ? hooks.restoreEntry(entry) : entry;
      return setStatefulActorRuntime(store, restored);
    },
    clone(store, sourceActorSerial, targetActorSerial) {
      const source = this.find(store, sourceActorSerial);
      if (!source) {
        return undefined;
      }

      const cloned = hooks.cloneEntry
        ? hooks.cloneEntry(source, targetActorSerial)
        : ({
            ...structuredClone(source),
            actorSerial: targetActorSerial,
          } as TEntry);
      return this.restore(store, cloned);
    },
    destroy(store, actorSerial) {
      if (!this.find(store, actorSerial)) {
        return;
      }
      removeStatefulActorRuntime(store, actorSerial);
    },
    attachPortableBacking(store, actorSerial, portableBacking) {
      const entry = this.find(store, actorSerial);
      if (!entry) {
        return undefined;
      }

      if (hooks.attachPortableBacking) {
        hooks.attachPortableBacking(entry, portableBacking);
      } else {
        entry.portableBacking = portableBacking;
      }
      return entry;
    },
    detachPortableBacking(store, actorSerial) {
      const entry = this.find(store, actorSerial);
      if (!entry) {
        return undefined;
      }

      if (hooks.detachPortableBacking) {
        hooks.detachPortableBacking(entry);
      } else {
        entry.portableBacking = null;
      }
      return entry;
    },
  };
}
