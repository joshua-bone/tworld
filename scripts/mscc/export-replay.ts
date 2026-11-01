import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSolutionFile } from "../../web/src/content/api/solution-file.ts";

const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

export function exportReplay(dat: Uint8Array, tws: Uint8Array, level: number) {
  const file = parseSolutionFile(tws);
  if (file.ruleset !== "MS") throw new Error("MS replays only");
  const entries = file.entries.filter((entry) => entry.levelNumber === level && entry.expandedSolution);
  if (entries.length !== 1 || entries[0]!.bestTimeTicks === null) {
    throw new Error("expected exactly one solved record for the requested level");
  }
  const entry = entries[0]!;
  return {
    schemaVersion: 1,
    level,
    datSha256: sha256(dat),
    twsSha256: sha256(tws),
    replay: { ...entry.expandedSolution!, bestTimeTicks: entry.bestTimeTicks! },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [dat, tws, level, output] = process.argv.slice(2);
  if (!dat || !tws || !level || !output || !/^\d+$/.test(level)) {
    throw new Error("usage: export-replay.ts PACK.dat REPLAY.tws LEVEL OUTPUT.json");
  }
  const result = exportReplay(readFileSync(dat), readFileSync(tws), Number(level));
  writeFileSync(output, `${JSON.stringify(result)}\n`, { mode: 0o600, flag: "wx" });
  console.log(`Exported level ${level} to ${output}`);
}
