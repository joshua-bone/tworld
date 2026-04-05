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
      cloneMedianMs: 0.15,
      interactiveTickMedianMs: 1.58,
      payloadBytesMedian: 3070,
      rawTickMedianMs: 0.83,
      workerUpdateMedianMs: 0.05,
    },
    "3d-ms": {
      cloneMedianMs: 0.17,
      interactiveTickMedianMs: 9.19,
      payloadBytesMedian: 2982,
      rawTickMedianMs: 5.76,
      workerUpdateMedianMs: 0.06,
    },
    "dense-lynx": {
      cloneMedianMs: 2.13,
      interactiveTickMedianMs: 32.15,
      payloadBytesMedian: 96156,
      rawTickMedianMs: 20.05,
      workerUpdateMedianMs: 0.03,
    },
    "dense-ms": {
      cloneMedianMs: 2.45,
      interactiveTickMedianMs: 3.47,
      payloadBytesMedian: 105020,
      rawTickMedianMs: 1.75,
      workerUpdateMedianMs: 0.03,
    },
    "typical-lynx": {
      cloneMedianMs: 0.25,
      interactiveTickMedianMs: 2.97,
      payloadBytesMedian: 10854,
      rawTickMedianMs: 1.4,
      workerUpdateMedianMs: 0.04,
    },
    "typical-ms": {
      cloneMedianMs: 0.17,
      interactiveTickMedianMs: 2.99,
      payloadBytesMedian: 4568,
      rawTickMedianMs: 1.46,
      workerUpdateMedianMs: 0.04,
    },
  },
  version: 1,
};
