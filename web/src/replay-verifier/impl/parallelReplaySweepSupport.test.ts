import { describe, expect, it } from "vitest";
import {
  partitionReplaySweepFiles,
  resolveReplaySweepJobs,
} from "@replay-verifier/impl/parallelReplaySweepSupport";

describe("partitionReplaySweepFiles", () => {
  it("balances heavier files across shards", () => {
    const shards = partitionReplaySweepFiles(
      [
        { path: "/tmp/a.tws", label: "a.tws", weight: 10 },
        { path: "/tmp/b.tws", label: "b.tws", weight: 9 },
        { path: "/tmp/c.tws", label: "c.tws", weight: 8 },
        { path: "/tmp/d.tws", label: "d.tws", weight: 1 },
        { path: "/tmp/e.tws", label: "e.tws", weight: 1 },
      ],
      2,
    );

    expect(shards).toHaveLength(2);
    expect(shards.map((shard) => shard.totalWeight)).toEqual([12, 17]);
    expect(shards[0]?.files.map((file) => file.label)).toEqual(["a.tws", "d.tws", "e.tws"]);
    expect(shards[1]?.files.map((file) => file.label)).toEqual(["b.tws", "c.tws"]);
  });
});

describe("resolveReplaySweepJobs", () => {
  it("caps explicit job counts to the number of files", () => {
    expect(resolveReplaySweepJobs(3, "8")).toBe(3);
  });

  it("falls back to one worker for single-file sweeps", () => {
    expect(resolveReplaySweepJobs(1, "8")).toBe(1);
    expect(resolveReplaySweepJobs(1, null)).toBe(1);
  });

  it("ignores invalid job counts", () => {
    const jobs = resolveReplaySweepJobs(4, "not-a-number");
    expect(jobs).toBeGreaterThanOrEqual(1);
    expect(jobs).toBeLessThanOrEqual(4);
  });
});
