import assert from "node:assert/strict";
import { test } from "node:test";
import { exportReplay } from "./export-replay.ts";

function syntheticTws(ruleset = 2): Buffer {
  const file = Buffer.alloc(29);
  file.writeUInt32LE(0x999b3335, 0);
  file[4] = ruleset;
  file.writeUInt32LE(17, 8);
  file.writeUInt16LE(1, 12);
  file.write("AAAA", 14);
  file[28] = 0x0d; // east at tick zero
  return file;
}

test("exports exact decoded input and pins both source files", () => {
  const result = exportReplay(Buffer.from("synthetic DAT"), syntheticTws(), 1);
  assert.equal(result.level, 1);
  assert.deepEqual(result.replay.moves, [{ when: 0, dir: 8 }]);
  assert.equal(result.replay.bestTimeTicks, 0);
  assert.match(result.datSha256, /^[a-f0-9]{64}$/);
  assert.match(result.twsSha256, /^[a-f0-9]{64}$/);
  assert.notEqual(result.datSha256, result.twsSha256);
});

test("rejects Lynx inputs and absent levels", () => {
  assert.throws(() => exportReplay(Buffer.alloc(0), syntheticTws(1), 1), /MS/);
  assert.throws(() => exportReplay(Buffer.alloc(0), syntheticTws(), 2), /record/);
});
