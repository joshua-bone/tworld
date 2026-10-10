import type { ConsoleEvent } from "@player-web/ports/aiProtocol.generated";

// Tactical telemetry remains in the companion journal/export. It must not
// crowd useful insights out of the on-screen history.
export function isStrategicInsight(event: ConsoleEvent): boolean {
  if (event.kind === "strategy") return event.payload.status !== "cancelled";
  if (event.kind === "feedback") return (event.payload.hudChanges?.length ?? 0) > 0;
  return false;
}

export function appendInsight(events: ConsoleEvent[], event: ConsoleEvent): ConsoleEvent[] {
  if (!isStrategicInsight(event)) return events;
  const previous = events.at(-1);
  if (previous?.source === event.source && previous.kind === event.kind
    && "message" in previous.payload && "message" in event.payload
    && previous.payload.message === event.payload.message) return events;
  return [...events.slice(-49), event];
}
