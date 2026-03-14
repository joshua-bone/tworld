import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { decodeMsLevelGroupData, prepareMsLevel } from "@ruleset-ms/api/level";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const seriesFile = process.env.TWORLD_SERIES_FILE?.trim() || "";
const levelNumberText = process.env.TWORLD_LEVEL_NUMBER?.trim() || "";
const positionsText = process.env.TWORLD_POSITIONS?.trim() || "";

async function main(): Promise<void> {
  if (!seriesFile || !levelNumberText) {
    throw new Error("Set TWORLD_SERIES_FILE and TWORLD_LEVEL_NUMBER.");
  }

  const levelNumber = Number.parseInt(levelNumberText, 10);
  if (!Number.isFinite(levelNumber)) {
    throw new Error(`Invalid level number: ${levelNumberText}`);
  }

  const repository = new NodeLevelRepository(repoRoot);
  const loaded = await repository.loadLevel({
    seriesFile,
    levelNumber,
    ruleset: "MS",
  });
  const level = prepareMsLevel(decodeMsLevelGroupData(loaded.layerData));

  const positions = positionsText
    ? positionsText
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value))
    : [];

  const cells = positions.map((pos) => level.cells[pos] ?? null);
  console.log(
    JSON.stringify(
      {
        seriesFile,
        levelNumber,
        traps: level.traps,
        cloners: level.cloners,
        creaturePositions: level.creaturePositions,
        cells,
      },
      null,
      2,
    ),
  );
}

await main();
