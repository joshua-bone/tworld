interface StartClockMessage {
  intervalMs: number;
  type: "start";
}

interface StopClockMessage {
  type: "stop";
}

type ClockWorkerMessage = StartClockMessage | StopClockMessage;

let tickIntervalMs = 50;
let nextTickDueAtMs = 0;
let timeoutId: number | null = null;

function clearScheduledTick(): void {
  if (timeoutId !== null) {
    self.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

function scheduleNextTick(): void {
  clearScheduledTick();
  const delayMs = Math.max(0, nextTickDueAtMs - performance.now());
  timeoutId = self.setTimeout(() => {
    timeoutId = null;
    self.postMessage({
      dueAtMs: nextTickDueAtMs,
      nowMs: performance.now(),
      type: "due",
    });
    nextTickDueAtMs += tickIntervalMs;
    scheduleNextTick();
  }, delayMs);
}

self.onmessage = (event: MessageEvent<ClockWorkerMessage>) => {
  if (event.data.type === "stop") {
    clearScheduledTick();
    self.close();
    return;
  }

  tickIntervalMs = event.data.intervalMs;
  nextTickDueAtMs = performance.now() + tickIntervalMs;
  scheduleNextTick();
};
