import type { ActorLifecycleHookName, ActorLifecyclePhase } from "@game-core/api/ruleset";
import type { ActorLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { createActorLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { lookupLynxActorDefinition, lynxActorDefinitions } from "@ruleset-lynx/impl/catalogActors";

let lynxActorLifecycleRegistry: ActorLifecycleRegistry<number, number> | null = null;

export function getLynxRegisteredActorLifecycleRegistry(): ActorLifecycleRegistry<number, number> {
  lynxActorLifecycleRegistry ??= createActorLifecycleRegistry(lynxActorDefinitions);
  return lynxActorLifecycleRegistry;
}

function normalizeLynxActorLifecycleId(actorId: number): number | null {
  return lookupLynxActorDefinition(actorId)?.id ?? null;
}

export function lookupLynxActorLifecycleBehavior(actorId: number) {
  const normalizedActorId = normalizeLynxActorLifecycleId(actorId);
  return normalizedActorId === null ? undefined : getLynxRegisteredActorLifecycleRegistry().getBehavior(normalizedActorId);
}

export function lookupLynxActorLifecyclePhase(actorId: number, phase: ActorLifecyclePhase) {
  const normalizedActorId = normalizeLynxActorLifecycleId(actorId);
  return normalizedActorId === null ? null : getLynxRegisteredActorLifecycleRegistry().getPhase(normalizedActorId, phase);
}

export function lookupLynxActorLifecycleHook(actorId: number, hook: ActorLifecycleHookName) {
  const normalizedActorId = normalizeLynxActorLifecycleId(actorId);
  return normalizedActorId === null ? null : getLynxRegisteredActorLifecycleRegistry().getHook(normalizedActorId, hook);
}
