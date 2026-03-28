export type BowlingBallScenarioCategory =
  | "activation"
  | "movement"
  | "collision"
  | "trap-cloner"
  | "air-support";

export type BowlingBallScenarioRuleset = "ms" | "lynx" | "both";

export interface BowlingBallCharacterizationScenario {
  readonly id: string;
  readonly category: BowlingBallScenarioCategory;
  readonly ruleset: BowlingBallScenarioRuleset;
  readonly label: string;
}

export const BOWLING_BALL_CHARACTERIZATION_SCENARIOS: readonly BowlingBallCharacterizationScenario[] = [
  {
    id: "carried-action1-activates-moving-ball",
    category: "activation",
    ruleset: "both",
    label: "throws from carried special-item state into moving actor state on Action1",
  },
  {
    id: "map-force-floor-activates-moving-ball",
    category: "activation",
    ruleset: "both",
    label: "activates from still map state when starting on force floor",
  },
  {
    id: "blocked-move-reverts-to-still-and-keeps-inventory",
    category: "movement",
    ruleset: "both",
    label: "reverts blocked movement to still portable state while preserving local keys and boots",
  },
  {
    id: "moving-ball-destroys-still-portable-item",
    category: "collision",
    ruleset: "both",
    label: "destroys both moving bowling ball and still portable item on contact",
  },
  {
    id: "chip-chasing-behind-moving-ball-denies-entry",
    category: "collision",
    ruleset: "both",
    label: "denies Chip entry when Chip enters from behind in the bowling ball's moving direction",
  },
  {
    id: "trap-holds-moving-ball-and-release-resumes-or-reverts",
    category: "trap-cloner",
    ruleset: "both",
    label: "holds moving bowling balls in traps and resumes direction or reverts to still on blocked release",
  },
  {
    id: "cloner-deep-clones-local-inventory",
    category: "trap-cloner",
    ruleset: "both",
    label: "keeps moving mode on clone machines and deep-clones local inventory on release",
  },
  {
    id: "unsupported-air-drop-preserves-directional-consequences",
    category: "air-support",
    ruleset: "both",
    label: "drops from unsupported air and applies the same collision consequences as moving-floor contact",
  },
] as const;
