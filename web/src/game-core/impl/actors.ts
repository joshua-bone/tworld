export interface HiddenPositionedActor {
  pos: number;
  hidden: boolean;
}

export function findVisibleActorAtPosition<T extends HiddenPositionedActor>(
  actors: T[],
  pos: number,
  predicate: (actor: T) => boolean = () => true,
): T | undefined {
  return actors.find((actor) => !actor.hidden && actor.pos === pos && predicate(actor));
}

export function hasVisibleActorAtPosition<T extends HiddenPositionedActor>(
  actors: T[],
  pos: number,
  predicate: (actor: T) => boolean = () => true,
): boolean {
  return findVisibleActorAtPosition(actors, pos, predicate) !== undefined;
}

export function findHiddenActorAtPosition<T extends HiddenPositionedActor>(
  actors: T[],
  pos: number,
  predicate: (actor: T) => boolean = () => true,
): T | undefined {
  return actors.find((actor) => actor.hidden && actor.pos === pos && predicate(actor));
}

export function findExistingActorAtPosition<T extends HiddenPositionedActor>(
  actors: T[],
  pos: number,
  predicate: (actor: T) => boolean = () => true,
): T | undefined {
  return findVisibleActorAtPosition(actors, pos, predicate) ?? findHiddenActorAtPosition(actors, pos, predicate);
}

export function findReusableHiddenActorIndex<T extends HiddenPositionedActor>(
  actors: T[],
  predicate: (actor: T) => boolean = () => true,
): number {
  return actors.findIndex((actor) => actor.hidden && predicate(actor));
}

export function storeActorInReusableHiddenSlot<T extends HiddenPositionedActor>(
  actors: T[],
  actor: T,
  predicate: (actor: T) => boolean = () => true,
): T {
  const hiddenIndex = findReusableHiddenActorIndex(actors, predicate);
  if (hiddenIndex < 0) {
    actors.push(actor);
    return actor;
  }

  actors[hiddenIndex] = actor;
  return actor;
}
