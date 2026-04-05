import type { InteractiveInput } from "@game-core/api/command";
import type { GameRequest } from "@game-core/api/types";

export type InteractivePerfScenarioFamily = "typical" | "dense" | "3d";

export interface InteractivePerfScenario {
  family: InteractivePerfScenarioFamily;
  id: string;
  inputPattern: readonly InteractiveInput[];
  label: string;
  measuredTickCount: number;
  notes: string;
  request: GameRequest;
  warmupTickCount: number;
}

const NO_INPUT_PATTERN = ["none"] as const satisfies readonly InteractiveInput[];

export const interactivePerfScenarios = [
  {
    family: "typical",
    id: "typical-ms",
    inputPattern: NO_INPUT_PATTERN,
    label: "Typical MS",
    measuredTickCount: 120,
    notes: "CCLP1 level 71 (Tree), chosen from the CCLP1 MS actor-count median scan.",
    request: {
      levelNumber: 71,
      randomSeed: 123456789,
      ruleset: "MS",
      seriesFile: "CCLP1-MS.dac",
    },
    warmupTickCount: 24,
  },
  {
    family: "typical",
    id: "typical-lynx",
    inputPattern: NO_INPUT_PATTERN,
    label: "Typical Lynx",
    measuredTickCount: 120,
    notes: "CCLP1 level 71 (Tree), matched to the MS median-scan scenario.",
    request: {
      levelNumber: 71,
      randomSeed: 123456789,
      ruleset: "Lynx",
      seriesFile: "CCLP1-Lynx.dac",
    },
    warmupTickCount: 24,
  },
  {
    family: "dense",
    id: "dense-ms",
    inputPattern: NO_INPUT_PATTERN,
    label: "Dense MS",
    measuredTickCount: 90,
    notes: "CCLP1 level 94 (Slime Forest), chosen from the highest-actor CCLP1 MS scan result.",
    request: {
      levelNumber: 94,
      randomSeed: 123456789,
      ruleset: "MS",
      seriesFile: "CCLP1-MS.dac",
    },
    warmupTickCount: 16,
  },
  {
    family: "dense",
    id: "dense-lynx",
    inputPattern: NO_INPUT_PATTERN,
    label: "Dense Lynx",
    measuredTickCount: 90,
    notes: "CCLP1 level 94 (Slime Forest), matched to the MS dense scenario.",
    request: {
      levelNumber: 94,
      randomSeed: 123456789,
      ruleset: "Lynx",
      seriesFile: "CCLP1-Lynx.dac",
    },
    warmupTickCount: 16,
  },
  {
    family: "3d",
    id: "3d-ms",
    inputPattern: NO_INPUT_PATTERN,
    label: "3D MS",
    measuredTickCount: 120,
    notes: "3DINTRO level 3 (Hills and Valleys), chosen because it starts with two visible layers.",
    request: {
      levelNumber: 3,
      randomSeed: 123456789,
      ruleset: "MS",
      seriesFile: "3DINTRO-MS.dac",
    },
    warmupTickCount: 24,
  },
  {
    family: "3d",
    id: "3d-lynx",
    inputPattern: NO_INPUT_PATTERN,
    label: "3D Lynx",
    measuredTickCount: 120,
    notes: "3DINTRO level 3 (Hills and Valleys), chosen because it starts with two visible layers.",
    request: {
      levelNumber: 3,
      randomSeed: 123456789,
      ruleset: "Lynx",
      seriesFile: "3DINTRO-Lynx.dac",
    },
    warmupTickCount: 24,
  },
] as const satisfies readonly InteractivePerfScenario[];

export function interactivePerfScenarioById(id: string): InteractivePerfScenario | null {
  return interactivePerfScenarios.find((scenario) => scenario.id === id) ?? null;
}
