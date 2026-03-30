import type { ActorLifecycleHookName, ActorLifecyclePhase } from "@game-core/api/ruleset";
import type { ActorLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { createActorLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { lookupMsActorDefinition, msActorDefinitions } from "@ruleset-ms/impl/catalogActors";

let msActorLifecycleRegistry: ActorLifecycleRegistry<number, number> | null = null;

export function getMsRegisteredActorLifecycleRegistry(): ActorLifecycleRegistry<number, number> {
  msActorLifecycleRegistry ??= createActorLifecycleRegistry(msActorDefinitions);
  return msActorLifecycleRegistry;
}

function normalizeMsActorLifecycleId(actorId: number): number | null {
  return lookupMsActorDefinition(actorId)?.id ?? null;
}

export function lookupMsActorLifecycleBehavior(actorId: number) {
  const normalizedActorId = normalizeMsActorLifecycleId(actorId);
  return normalizedActorId === null ? undefined : getMsRegisteredActorLifecycleRegistry().getBehavior(normalizedActorId);
}

export function lookupMsActorLifecyclePhase(actorId: number, phase: ActorLifecyclePhase) {
  const normalizedActorId = normalizeMsActorLifecycleId(actorId);
  return normalizedActorId === null ? null : getMsRegisteredActorLifecycleRegistry().getPhase(normalizedActorId, phase);
}

export function lookupMsActorLifecycleHook(actorId: number, hook: ActorLifecycleHookName) {
  const normalizedActorId = normalizeMsActorLifecycleId(actorId);
  return normalizedActorId === null ? null : getMsRegisteredActorLifecycleRegistry().getHook(normalizedActorId, hook);
}
