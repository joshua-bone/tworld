export interface InteractiveLoadPerfScenarioBaseline {
  coldInitialProjectionMedianMs: number;
  coldLevelLoadMedianMs: number;
  coldPrepareLevelMedianMs: number;
  coldStartMedianMs: number;
  warmInitialProjectionMedianMs: number;
  warmLevelLoadMedianMs: number;
  warmPrepareLevelMedianMs: number;
  warmStartMedianMs: number;
}

export interface InteractiveLoadPerfBaseline {
  scenarios: Record<string, InteractiveLoadPerfScenarioBaseline>;
  version: number;
}

export const interactiveLoadPerfBaseline: InteractiveLoadPerfBaseline = {
  scenarios: {
    "3d-lynx": {
      coldInitialProjectionMedianMs: 380.75,
      coldLevelLoadMedianMs: 21.24,
      coldPrepareLevelMedianMs: 2.34,
      coldStartMedianMs: 399.72,
      warmInitialProjectionMedianMs: 333.81,
      warmLevelLoadMedianMs: 0.05,
      warmPrepareLevelMedianMs: 2.15,
      warmStartMedianMs: 336.04,
    },
    "3d-ms": {
      coldInitialProjectionMedianMs: 179.39,
      coldLevelLoadMedianMs: 18.46,
      coldPrepareLevelMedianMs: 1.43,
      coldStartMedianMs: 233.1,
      warmInitialProjectionMedianMs: 256,
      warmLevelLoadMedianMs: 0.05,
      warmPrepareLevelMedianMs: 1.43,
      warmStartMedianMs: 257.39,
    },
    "dense-lynx": {
      coldInitialProjectionMedianMs: 162.49,
      coldLevelLoadMedianMs: 30.41,
      coldPrepareLevelMedianMs: 1.16,
      coldStartMedianMs: 174.07,
      warmInitialProjectionMedianMs: 136.04,
      warmLevelLoadMedianMs: 0.05,
      warmPrepareLevelMedianMs: 2.1,
      warmStartMedianMs: 147.88,
    },
    "dense-ms": {
      coldInitialProjectionMedianMs: 68.25,
      coldLevelLoadMedianMs: 117.37,
      coldPrepareLevelMedianMs: 0.74,
      coldStartMedianMs: 192.05,
      warmInitialProjectionMedianMs: 78.24,
      warmLevelLoadMedianMs: 0.04,
      warmPrepareLevelMedianMs: 0.62,
      warmStartMedianMs: 83.49,
    },
    "typical-lynx": {
      coldInitialProjectionMedianMs: 125.05,
      coldLevelLoadMedianMs: 39.87,
      coldPrepareLevelMedianMs: 0.95,
      coldStartMedianMs: 170.07,
      warmInitialProjectionMedianMs: 239.04,
      warmLevelLoadMedianMs: 0.04,
      warmPrepareLevelMedianMs: 0.84,
      warmStartMedianMs: 240.39,
    },
    "typical-ms": {
      coldInitialProjectionMedianMs: 85.35,
      coldLevelLoadMedianMs: 35.03,
      coldPrepareLevelMedianMs: 0.61,
      coldStartMedianMs: 125.54,
      warmInitialProjectionMedianMs: 53.68,
      warmLevelLoadMedianMs: 0.04,
      warmPrepareLevelMedianMs: 0.64,
      warmStartMedianMs: 61.17,
    },
  },
  version: 1,
};
