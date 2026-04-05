interface StartClockMessage {
  heartbeatMs: number;
  type: "start";
}

interface StopClockMessage {
  type: "stop";
}

type ClockWorkerMessage = StartClockMessage | StopClockMessage;

let tickIntervalMs = 50;
let timeoutId: number | null = null;

function clearScheduledTick(): void {
  if (timeoutId !== null) {
    self.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function scheduleNextTick(): void {
  clearScheduledTick();
  const delayMs = Math.max(0, tickIntervalMs);
  timeoutId = self.setTimeout(() => {
    timeoutId = null;
    self.postMessage({
      nowMs: performance.now(),
      type: "pulse",
    });
    scheduleNextTick();
  }, delayMs);
}

self.onmessage = (event: MessageEvent<ClockWorkerMessage>) => {
  if (event.data.type === "stop") {
    clearScheduledTick();
    self.close();
    return;
  }

  tickIntervalMs = event.data.heartbeatMs;
  scheduleNextTick();
};
