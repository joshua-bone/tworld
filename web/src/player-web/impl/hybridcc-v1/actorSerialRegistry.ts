/**
 * Browser render identifiers are safe JavaScript numbers, while Hybrid actor
 * IDs are unsigned 64-bit values. Keep a stable per-session bijection instead
 * of narrowing authoritative IDs and silently colliding above 2^53.
 */
export class HybridCcV1ActorSerialRegistry {
  private readonly serials = new Map<bigint, number>();
  private nextSerial = 1;

  serial(actorId: bigint): number {
    const existing = this.serials.get(actorId);
    if (existing !== undefined) return existing;
    if (!Number.isSafeInteger(this.nextSerial)) {
      throw new Error("Hybrid v1 exhausted browser actor serials.");
    }
    const serial = this.nextSerial;
    this.nextSerial += 1;
    this.serials.set(actorId, serial);
    return serial;
  }
}
