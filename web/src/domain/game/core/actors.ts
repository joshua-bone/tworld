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

export function findHiddenActorAtPosition<T extends HiddenPositionedActor>(
  actors: T[],
  pos: number,
  predicate: (actor: T) => boolean = () => true,
): T | undefined {
  return actors.find((actor) => actor.hidden && actor.pos === pos && predicate(actor));
}

export function findReusableHiddenActorIndex<T extends HiddenPositionedActor>(
  actors: T[],
  predicate: (actor: T) => boolean = () => true,
): number {
  return actors.findIndex((actor) => actor.hidden && predicate(actor));
}
