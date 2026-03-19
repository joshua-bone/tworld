import type {
  InteractiveGameSessionEndCause,
  InteractiveGameSessionResultSummary,
} from "@game-runtime/ports/InteractiveGameEngine";

const GENERIC_DEATH_HEADLINES = [
  "Whoops... Let's try again.",
  "Why don't ya watch where you're going?",
  "Getting killed can be injurious to Chip's health!",
  "Uh-oh: Chip performed a fatal operation and was terminated.",
  "Hey, are you doing that on purpose?",
  "Great, now look what you did!",
] as const;

const TIMEOUT_HEADLINES = [
  "Well, that was an untimely demise.",
  "You do know there's a time limit on this level, right?",
  "Look, we don't have all the time in the world!",
  "Alert: The system has determined that you are either moving or thinking too slowly.",
] as const;

const ANY_FAILURE_HEADLINE = "The idea here is to win the level, not lose it!" as const;

const SPECIFIC_FAILURE_HEADLINES = {
  bomb: "Ooops! Don't touch the bombs!",
  fire: "Ooops! Don't step in the fire without fire boots!",
  monster: "Ooops! Look out for creatures!",
  movingBlock: "Ooops! Watch out for moving blocks!",
  timeout: "Ooops! Out of time!",
  water: "Ooops! Chip can't swim without flippers!",
} as const;

type FailureHeadlineKind = "bomb" | "fire" | "monster" | "movingBlock" | "other" | "timeout" | "water";

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickStableHeadline(candidates: readonly string[], entropyKey: string): string {
  return candidates[hashString(entropyKey) % candidates.length] ?? candidates[0] ?? ANY_FAILURE_HEADLINE;
}

function classifyFailureHeadlineKind(cause: InteractiveGameSessionEndCause | null): FailureHeadlineKind {
  if (!cause) {
    return "other";
  }

  if (cause.kind === "timeout") {
    return "timeout";
  }

  if (cause.kind === "bomb") {
    return "bomb";
  }

  if (cause.kind === "fire") {
    return "fire";
  }

  if (cause.kind === "water") {
    return "water";
  }

  if (
    cause.actorName === "block" ||
    cause.message.toLowerCase().includes("crushed by block")
  ) {
    return "movingBlock";
  }

  if (cause.kind === "monster") {
    return "monster";
  }

  return "other";
}

export function buildFailureHeadlineCandidates(cause: InteractiveGameSessionEndCause | null): readonly string[] {
  const kind = classifyFailureHeadlineKind(cause);

  switch (kind) {
    case "timeout":
      return [
        SPECIFIC_FAILURE_HEADLINES.timeout,
        ...TIMEOUT_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    case "bomb":
      return [
        SPECIFIC_FAILURE_HEADLINES.bomb,
        ...GENERIC_DEATH_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    case "fire":
      return [
        SPECIFIC_FAILURE_HEADLINES.fire,
        ...GENERIC_DEATH_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    case "water":
      return [
        SPECIFIC_FAILURE_HEADLINES.water,
        ...GENERIC_DEATH_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    case "movingBlock":
      return [
        SPECIFIC_FAILURE_HEADLINES.movingBlock,
        ...GENERIC_DEATH_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    case "monster":
      return [
        SPECIFIC_FAILURE_HEADLINES.monster,
        ...GENERIC_DEATH_HEADLINES,
        ANY_FAILURE_HEADLINE,
      ];
    default:
      return [...GENERIC_DEATH_HEADLINES, ANY_FAILURE_HEADLINE];
  }
}

export function selectWinHeadline(attemptCount: number): string {
  if (attemptCount <= 1) {
    return "Yowser! First Try!";
  }

  if (attemptCount <= 3) {
    return "Go Bit Buster!";
  }

  if (attemptCount <= 5) {
    return "Finished! Good Work!";
  }

  return "At last! You did it!";
}

export function selectResultHeadline(params: {
  attemptCount: number;
  entropyKey: string;
  result: InteractiveGameSessionResultSummary;
}): string {
  if (params.result.outcome === "completed-clean" || params.result.outcome === "completed-with-undo") {
    return selectWinHeadline(params.attemptCount);
  }

  return pickStableHeadline(buildFailureHeadlineCandidates(params.result.cause), params.entropyKey);
}
