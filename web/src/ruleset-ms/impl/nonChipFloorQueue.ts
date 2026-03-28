export interface MsFloorQueueCreatureSlipEntry {
  serial: number;
  dir: number;
  slipOrder: number;
}

export interface MsFloorQueueTrackedCreature {
  serial: number;
  pos: number;
  hidden: boolean;
  cloning: boolean;
  floorMovement: string;
  floorMovementDir: number;
}

export interface MsFloorQueueTrackedBlock {
  pos: number;
  hidden: boolean;
  floorMovement: string;
  floorMovementDir: number;
  slipOrder: number;
}

export interface MsFloorQueueState {
  creatureSlipList: MsFloorQueueCreatureSlipEntry[];
  blocks: MsFloorQueueTrackedBlock[];
}

export type MsActiveNonChipFloorEntry =
  | { kind: "creature"; serial: number; dir: number; slipOrder: number }
  | { kind: "block"; blockIndex: number; slipOrder: number };

export interface MsNonChipFloorQueueTraceEvent {
  action: string;
  slipIndex: number;
  advance: number;
  entry: string | null;
  queue: string[];
}

interface MsNonChipFloorQueueOptions {
  state: MsFloorQueueState;
  findCreature(serial: number): MsFloorQueueTrackedCreature | undefined;
  reserveNextSlipOrder(): number;
  trace?(event: MsNonChipFloorQueueTraceEvent): void;
}

function creatureFloorMovementIsActive(creature: MsFloorQueueTrackedCreature | undefined): boolean {
  return Boolean(
    creature &&
      !creature.hidden &&
      !creature.cloning &&
      creature.floorMovement !== "none" &&
      creature.floorMovementDir !== 0,
  );
}

function blockFloorMovementIsActive(block: MsFloorQueueTrackedBlock | undefined): boolean {
  return Boolean(block && !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== 0);
}

function compareActiveNonChipFloorEntries(left: MsActiveNonChipFloorEntry, right: MsActiveNonChipFloorEntry): number {
  if (left.slipOrder === right.slipOrder) {
    if (left.kind === "creature" && right.kind === "creature") {
      return left.serial - right.serial;
    }
    if (left.kind === "block" && right.kind === "block") {
      return left.blockIndex - right.blockIndex;
    }
    return left.kind === "creature" ? -1 : 1;
  }
  return left.slipOrder - right.slipOrder;
}

export class MsNonChipFloorQueue {
  readonly entries: MsActiveNonChipFloorEntry[];
  private readonly state: MsFloorQueueState;
  private readonly findCreature: MsNonChipFloorQueueOptions["findCreature"];
  private readonly reserveNextSlipOrder: MsNonChipFloorQueueOptions["reserveNextSlipOrder"];
  private readonly traceHook: MsNonChipFloorQueueOptions["trace"];

  constructor({ state, findCreature, reserveNextSlipOrder, trace }: MsNonChipFloorQueueOptions) {
    this.state = state;
    this.findCreature = findCreature;
    this.reserveNextSlipOrder = reserveNextSlipOrder;
    this.traceHook = trace;
    this.entries = this.listActiveEntries();
  }

  private listActiveEntries(): MsActiveNonChipFloorEntry[] {
    return [
      ...this.state.creatureSlipList
        .filter((entry) => creatureFloorMovementIsActive(this.findCreature(entry.serial)))
        .map((entry) => ({
          kind: "creature" as const,
          serial: entry.serial,
          dir: entry.dir,
          slipOrder: entry.slipOrder,
        })),
      ...this.state.blocks
        .map((block, blockIndex) => ({ block, blockIndex }))
        .filter(({ block }) => blockFloorMovementIsActive(block))
        .map(({ blockIndex }) => ({
          kind: "block" as const,
          blockIndex,
          slipOrder: this.state.blocks[blockIndex]!.slipOrder,
        })),
    ].sort(compareActiveNonChipFloorEntries);
  }

  private queueContainsEntry(entry: MsActiveNonChipFloorEntry): boolean {
    return this.entries.some((candidate) => {
      if (candidate.kind !== entry.kind) {
        return false;
      }
      if (candidate.kind === "creature" && entry.kind === "creature") {
        return candidate.serial === entry.serial;
      }
      if (candidate.kind === "block" && entry.kind === "block") {
        return candidate.blockIndex === entry.blockIndex;
      }
      return false;
    });
  }

  private entryLabel(entry: MsActiveNonChipFloorEntry | undefined): string | null {
    if (!entry) {
      return null;
    }
    if (entry.kind === "creature") {
      const creature = this.findCreature(entry.serial);
      return `creature:${entry.serial}:${creature?.pos ?? -1}`;
    }
    const block = this.state.blocks[entry.blockIndex];
    return `block:${entry.blockIndex}:${block?.pos ?? -1}`;
  }

  private queueLabels(): string[] {
    return this.entries.map((entry) => this.entryLabel(entry) ?? "unknown");
  }

  trace(action: string, slipIndex: number, advance: number, entry?: MsActiveNonChipFloorEntry): void {
    this.traceHook?.({
      action,
      slipIndex,
      advance,
      entry: this.entryLabel(entry),
      queue: this.queueLabels(),
    });
  }

  isEntryActive(entry: MsActiveNonChipFloorEntry): boolean {
    if (entry.kind === "creature") {
      return creatureFloorMovementIsActive(this.findCreature(entry.serial));
    }
    return blockFloorMovementIsActive(this.state.blocks[entry.blockIndex]);
  }

  updateEntry(entry: MsActiveNonChipFloorEntry): void {
    if (entry.kind === "creature") {
      entry.dir = this.findCreature(entry.serial)?.floorMovementDir ?? 0;
    }
  }

  removeEntry(index: number): void {
    this.entries.splice(index, 1);
  }

  requeueEntry(index: number): void {
    const entry = this.entries[index];
    if (!entry || !this.isEntryActive(entry)) {
      this.removeEntry(index);
      return;
    }

    this.updateEntry(entry);
    entry.slipOrder = this.reserveNextSlipOrder();
    this.entries.splice(index, 1);
    this.entries.push(entry);
  }

  appendNewActiveEntries(): void {
    for (const entry of this.state.creatureSlipList) {
      const creature = this.findCreature(entry.serial);
      if (!creatureFloorMovementIsActive(creature)) {
        continue;
      }

      const activeEntry: MsActiveNonChipFloorEntry = {
        kind: "creature",
        serial: entry.serial,
        dir: entry.dir,
        slipOrder: entry.slipOrder,
      };
      if (!this.queueContainsEntry(activeEntry)) {
        this.entries.push(activeEntry);
      }
    }

    this.state.blocks.forEach((block, blockIndex) => {
      if (!blockFloorMovementIsActive(block)) {
        return;
      }

      const activeEntry: MsActiveNonChipFloorEntry = {
        kind: "block",
        blockIndex,
        slipOrder: block.slipOrder,
      };
      if (!this.queueContainsEntry(activeEntry)) {
        this.entries.push(activeEntry);
      }
    });

    this.entries.sort(compareActiveNonChipFloorEntries);
  }

  syncBackToState(): void {
    this.state.creatureSlipList = [];
    for (const block of this.state.blocks) {
      block.slipOrder = -1;
    }

    for (const entry of this.entries) {
      if (!this.isEntryActive(entry)) {
        continue;
      }

      if (entry.kind === "creature") {
        const creature = this.findCreature(entry.serial);
        if (!creature) {
          continue;
        }
        this.state.creatureSlipList.push({
          serial: creature.serial,
          dir: entry.dir,
          slipOrder: entry.slipOrder,
        });
        continue;
      }

      const block = this.state.blocks[entry.blockIndex];
      if (block) {
        block.slipOrder = entry.slipOrder;
      }
    }
  }
}
