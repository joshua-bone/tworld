export interface InteractivePerfScenarioBaseline {
  cloneMedianMs: number;
  interactiveTickMedianMs: number;
  payloadBytesMedian: number;
  rawTickMedianMs: number;
  workerUpdateMedianMs: number;
}

export interface InteractivePerfBaseline {
  scenarios: Record<string, InteractivePerfScenarioBaseline>;
  version: number;
}

export const interactivePerfBaseline: InteractivePerfBaseline = {
  scenarios: {
    "3d-lynx": {
      cloneMedianMs: 0.13,
      interactiveTickMedianMs: 1.59,
      payloadBytesMedian: 3070,
      rawTickMedianMs: 0.79,
      workerUpdateMedianMs: 0.06,
    },
    "3d-ms": {
      cloneMedianMs: 0.13,
      interactiveTickMedianMs: 5.15,
      payloadBytesMedian: 2982,
      rawTickMedianMs: 3.41,
      workerUpdateMedianMs: 0.06,
    },
    "dense-lynx": {
      cloneMedianMs: 1.41,
      interactiveTickMedianMs: 31.68,
      payloadBytesMedian: 96156,
      rawTickMedianMs: 17.61,
      workerUpdateMedianMs: 0.03,
    },
    "dense-ms": {
      cloneMedianMs: 2.05,
      interactiveTickMedianMs: 3.41,
      payloadBytesMedian: 105020,
      rawTickMedianMs: 1.55,
      workerUpdateMedianMs: 0.03,
    },
    "typical-lynx": {
      cloneMedianMs: 0.23,
      interactiveTickMedianMs: 2.34,
      payloadBytesMedian: 10854,
      rawTickMedianMs: 1.01,
      workerUpdateMedianMs: 0.04,
    },
    "typical-ms": {
      cloneMedianMs: 0.16,
      interactiveTickMedianMs: 1.59,
      payloadBytesMedian: 4568,
      rawTickMedianMs: 1.11,
      workerUpdateMedianMs: 0.04,
    },
  },
  version: 2,
};
