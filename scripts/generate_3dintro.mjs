#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 32;
const HEIGHT = 32;
const DAT_FILE_SIGNATURE = 0xaaac;
const MS_RULESET_SIGNATURE = 2;

const FILE = {
  Empty: 0,
  Wall: 1,
  Water: 3,
  Ice: 12,
  Slide_East: 19,
  Exit: 21,
  Door_Yellow: 25,
  BlueWall_Fake: 30,
  BlueWall_Real: 31,
  Air: 32,
  Socket: 34,
  Button_Red: 36,
  Button_Brown: 39,
  Teleport: 41,
  Beartrap: 43,
  HintButton: 47,
  CloneMachine: 49,
  Block_Static: 10,
  Block_East: 17,
  Elevator: 57,
  Ball_North: 72,
  Bug_West: 65,
  Key_Yellow: 103,
  Chip_East: 111,
};

const ACTOR_FILE_CODES = new Set([
  FILE.Block_Static,
  FILE.Block_East,
  FILE.Ball_North,
  FILE.Bug_West,
  FILE.Chip_East,
]);

function pos(x, y) {
  return y * WIDTH + x;
}

function encodeLatin1(text) {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function encodePassword(password) {
  return Array.from(password, (character) => character.charCodeAt(0) ^ 0x99);
}

function set(array, x, y, value) {
  array[pos(x, y)] = value;
}

function createLayer(hint = "") {
  return {
    top: Array(WIDTH * HEIGHT).fill(FILE.Empty),
    bottom: Array(WIDTH * HEIGHT).fill(FILE.Empty),
    traps: [],
    cloners: [],
    hint,
  };
}

function addBorderWalls(layer) {
  for (let x = 0; x < WIDTH; x += 1) {
    set(layer.top, x, 0, FILE.Wall);
    set(layer.top, x, HEIGHT - 1, FILE.Wall);
  }
  for (let y = 0; y < HEIGHT; y += 1) {
    set(layer.top, 0, y, FILE.Wall);
    set(layer.top, WIDTH - 1, y, FILE.Wall);
  }
}

function placeTop(layer, x, y, fileCode) {
  set(layer.top, x, y, fileCode);
}

function placeBottom(layer, x, y, fileCode) {
  set(layer.bottom, x, y, fileCode);
}

function placeActor(layer, x, y, topFileCode, bottomFileCode = FILE.Empty) {
  set(layer.top, x, y, topFileCode);
  set(layer.bottom, x, y, bottomFileCode);
}

function encodeRleLayer(values) {
  const encoded = [];
  for (let index = 0; index < values.length; ) {
    const value = values[index];
    let count = 1;
    while (index + count < values.length && values[index + count] === value && count < 255) {
      count += 1;
    }

    if (count >= 4 || value === 0xff) {
      encoded.push(0xff, count, value);
    } else {
      for (let repeat = 0; repeat < count; repeat += 1) {
        encoded.push(value);
      }
    }

    index += count;
  }
  return encoded;
}

function encodeTrapConnections(connections) {
  const bytes = [];
  for (const connection of connections) {
    bytes.push(connection.fromX, 0, connection.fromY, 0, connection.toX, 0, connection.toY, 0, 0, 0);
  }
  return bytes;
}

function encodeClonerConnections(connections) {
  const bytes = [];
  for (const connection of connections) {
    bytes.push(connection.fromX, 0, connection.fromY, 0, connection.toX, 0, connection.toY, 0);
  }
  return bytes;
}

function collectCreaturePositions(layer) {
  const positions = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const fileCode = layer.top[pos(x, y)];
      if (ACTOR_FILE_CODES.has(fileCode)) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

function encodeCreaturePositions(layer) {
  const bytes = [];
  for (const creature of collectCreaturePositions(layer)) {
    bytes.push(creature.x, creature.y);
  }
  return bytes;
}

function encodeMetadata(fields) {
  const bytes = [];
  for (const field of fields) {
    if (field.bytes.length === 0) {
      continue;
    }
    if (field.bytes.length > 255) {
      throw new Error(`metadata field ${field.id} exceeds 255 bytes`);
    }
    bytes.push(field.id, field.bytes.length, ...field.bytes);
  }
  return bytes;
}

function encodeLevel(levelNumber, title, password, timeLimitSeconds, chipsNeeded, layer) {
  const upperBytes = encodeRleLayer(layer.top);
  const lowerBytes = encodeRleLayer(layer.bottom);
  const metadata = encodeMetadata([
    { id: 3, bytes: encodeLatin1(title) },
    { id: 6, bytes: encodePassword(password) },
    { id: 7, bytes: encodeLatin1(layer.hint) },
    { id: 4, bytes: encodeTrapConnections(layer.traps) },
    { id: 5, bytes: encodeClonerConnections(layer.cloners) },
    { id: 10, bytes: encodeCreaturePositions(layer) },
  ]);

  return [
    levelNumber & 0xff,
    (levelNumber >> 8) & 0xff,
    timeLimitSeconds & 0xff,
    (timeLimitSeconds >> 8) & 0xff,
    chipsNeeded & 0xff,
    (chipsNeeded >> 8) & 0xff,
    0,
    0,
    upperBytes.length & 0xff,
    (upperBytes.length >> 8) & 0xff,
    ...upperBytes,
    lowerBytes.length & 0xff,
    (lowerBytes.length >> 8) & 0xff,
    ...lowerBytes,
    metadata.length & 0xff,
    (metadata.length >> 8) & 0xff,
    ...metadata,
  ];
}

function passwordFor(levelNumber) {
  return `A${String(levelNumber).padStart(3, "0")}`;
}

function buildTwoLayerLevel(baseTitle, lowerBuilder, upperBuilder, options = {}) {
  const lower = createLayer(options.lowerHint ?? "");
  const upper = createLayer(options.upperHint ?? "");
  addBorderWalls(lower);
  addBorderWalls(upper);
  lowerBuilder(lower);
  upperBuilder(upper);
  return {
    baseTitle,
    timeLimitSeconds: options.timeLimitSeconds ?? 0,
    chipsNeeded: options.chipsNeeded ?? 0,
    layers: [lower, upper],
  };
}

function buildShowcaseLevels() {
  return [
    buildTwoLayerLevel(
      "Air Key",
      (lower) => {
        placeTop(lower, 5, 5, FILE.Key_Yellow);
        placeTop(lower, 8, 5, FILE.Exit);
        placeTop(lower, 15, 5, FILE.Water);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.Air);
        placeActor(upper, 15, 5, FILE.Block_Static, FILE.Air);
      },
      {
        upperHint: "Chip starts in air and falls onto the key. The block at right falls into water.",
        lowerHint: "Walk east to the exit.",
      },
    ),
    buildTwoLayerLevel(
      "Ice Landing",
      (lower) => {
        placeTop(lower, 5, 5, FILE.Ice);
        placeTop(lower, 8, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.Air);
      },
      {
        upperHint: "Landing from air onto ice does not start sliding.",
      },
    ),
    buildTwoLayerLevel(
      "Force Landing",
      (lower) => {
        placeTop(lower, 5, 5, FILE.Slide_East);
        placeTop(lower, 6, 5, FILE.Slide_East);
        placeTop(lower, 7, 5, FILE.Slide_East);
        placeTop(lower, 8, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.Air);
      },
      {
        upperHint: "Falling onto a force floor starts forced movement immediately.",
      },
    ),
    buildTwoLayerLevel(
      "Door Socket Support",
      (lower) => {
        placeTop(lower, 5, 5, FILE.Door_Yellow);
        placeTop(lower, 10, 5, FILE.Socket);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.Air);
        placeTop(upper, 10, 5, FILE.Air);
        placeTop(upper, 14, 5, FILE.Exit);
      },
      {
        chipsNeeded: 1,
        upperHint: "Yellow doors and uncleared sockets support air above them.",
      },
    ),
    buildTwoLayerLevel(
      "Blue Walls",
      (lower) => {
        placeTop(lower, 5, 5, FILE.BlueWall_Real);
        placeTop(lower, 10, 5, FILE.BlueWall_Fake);
        placeTop(lower, 13, 5, FILE.Exit);
        placeTop(lower, 16, 5, FILE.Block_Static);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.Air);
        placeTop(upper, 10, 5, FILE.Air);
        placeActor(upper, 16, 5, FILE.Block_Static, FILE.Air);
      },
      {
        upperHint: "Real blue walls support Chip. Fake blue walls drop Chip. Blocks support blocks.",
      },
    ),
    buildTwoLayerLevel(
      "Chip On Monster",
      (lower) => {
        placeActor(lower, 10, 5, FILE.Bug_West);
        placeTop(lower, 9, 5, FILE.Wall);
        placeTop(lower, 11, 5, FILE.Wall);
        placeTop(lower, 10, 4, FILE.Wall);
        placeTop(lower, 10, 6, FILE.Wall);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East);
        placeTop(upper, 10, 5, FILE.Air);
        placeTop(upper, 14, 5, FILE.Exit);
      },
      {
        upperHint: "Walk east into the air hole to fall onto the monster below.",
      },
    ),
    buildTwoLayerLevel(
      "Monster On Chip",
      (lower) => {
        placeActor(lower, 5, 5, FILE.Chip_East);
        placeTop(lower, 8, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Bug_West, FILE.Air);
      },
      {
        upperHint: "A monster in unsupported air falls onto Chip and kills him.",
      },
    ),
    buildTwoLayerLevel(
      "Block On Chip",
      (lower) => {
        placeActor(lower, 5, 5, FILE.Chip_East);
        placeTop(lower, 8, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Block_Static, FILE.Air);
      },
      {
        upperHint: "A block in unsupported air falls onto Chip and kills him.",
      },
    ),
    buildTwoLayerLevel(
      "Elevator Rise",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Elevator);
        placeTop(lower, 10, 5, FILE.Elevator);
      },
      (upper) => {
        placeTop(upper, 5, 5, FILE.Wall);
        placeTop(upper, 10, 5, FILE.Air);
        placeTop(upper, 12, 5, FILE.Exit);
      },
      {
        upperHint: "The left elevator fails because a wall is above it. The right elevator rises into air.",
      },
    ),
    buildTwoLayerLevel(
      "Elevator Push",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 10, 5, FILE.Elevator);
      },
      (upper) => {
        placeActor(upper, 10, 5, FILE.Block_Static, FILE.Air);
        placeTop(upper, 14, 5, FILE.Exit);
      },
      {
        upperHint: "Approach the elevator from the west so Chip pushes the block east while rising.",
      },
    ),
    buildTwoLayerLevel(
      "Layer Hints",
      (lower) => {
        placeTop(lower, 8, 5, FILE.HintButton);
        placeTop(lower, 12, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 5, 5, FILE.Chip_East, FILE.HintButton);
        placeTop(upper, 8, 5, FILE.Air);
      },
      {
        upperHint: "This is the upper-layer hint. Fall through the air hole for a different hint below.",
        lowerHint: "This is the lower-layer hint. The active hint text follows Chip's z layer.",
      },
    ),
    buildTwoLayerLevel(
      "Layer Wiring",
      (lower) => {
        placeTop(lower, 10, 5, FILE.Teleport);
        placeTop(lower, 16, 5, FILE.Teleport);
        placeTop(lower, 24, 5, FILE.Exit);
        placeTop(lower, 5, 10, FILE.Button_Brown);
        placeActor(lower, 6, 10, FILE.Ball_North, FILE.Beartrap);
        placeTop(lower, 10, 10, FILE.Button_Red);
        placeActor(lower, 12, 10, FILE.Block_East, FILE.CloneMachine);
        lower.traps.push({ fromX: 5, fromY: 10, toX: 6, toY: 10 });
        lower.cloners.push({ fromX: 10, fromY: 10, toX: 12, toY: 10 });
      },
      (upper) => {
        placeActor(upper, 3, 5, FILE.Chip_East);
        placeTop(upper, 10, 5, FILE.Teleport);
        placeTop(upper, 14, 5, FILE.Teleport);
        placeTop(upper, 22, 5, FILE.Air);
        placeTop(upper, 5, 10, FILE.Button_Brown);
        placeActor(upper, 6, 10, FILE.Ball_North, FILE.Beartrap);
        placeTop(upper, 10, 10, FILE.Button_Red);
        placeActor(upper, 12, 10, FILE.Block_East, FILE.CloneMachine);
        upper.traps.push({ fromX: 5, fromY: 10, toX: 6, toY: 10 });
        upper.cloners.push({ fromX: 10, fromY: 10, toX: 12, toY: 10 });
      },
      {
        upperHint: "Upper teleports, traps, and cloners only target upper-layer devices. Fall at the far-right hole to reach z1.",
        lowerHint: "Lower teleports, traps, and cloners are independent from the ones above.",
      },
    ),
    buildTwoLayerLevel(
      "Block Over Air",
      (lower) => {
        placeTop(lower, 5, 5, FILE.Elevator);
        placeTop(lower, 6, 5, FILE.Elevator);
        placeTop(lower, 7, 5, FILE.Elevator);
        placeTop(lower, 8, 5, FILE.Elevator);
      },
      (upper) => {
        placeActor(upper, 4, 5, FILE.Chip_East);
        placeActor(upper, 5, 5, FILE.Block_Static, FILE.Air);
        placeTop(upper, 6, 5, FILE.Air);
        placeTop(upper, 7, 5, FILE.Air);
        placeTop(upper, 8, 5, FILE.Air);
        placeTop(upper, 10, 5, FILE.Exit);
      },
      {
        upperHint: "Push the block east across multiple supported air tiles.",
      },
    ),
    buildTwoLayerLevel(
      "Monster Over Air",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
        placeTop(lower, 8, 5, FILE.Elevator);
        placeTop(lower, 9, 5, FILE.Elevator);
        placeTop(lower, 10, 5, FILE.Elevator);
        placeTop(lower, 11, 5, FILE.Elevator);
      },
      (upper) => {
        placeTop(upper, 8, 5, FILE.Air);
        placeTop(upper, 9, 5, FILE.Air);
        placeTop(upper, 10, 5, FILE.Air);
        placeActor(upper, 11, 5, FILE.Bug_West, FILE.Air);
      },
      {
        upperHint: "The monster travels west across supported air tiles.",
        lowerHint: "Take the short walk to the exit while the monster moves overhead.",
      },
    ),
    buildTwoLayerLevel(
      "Monster Elevator Rise",
      (lower) => {
        placeActor(lower, 10, 5, FILE.Bug_West);
        placeTop(lower, 11, 5, FILE.Elevator);
        placeTop(lower, 14, 5, FILE.Exit);
      },
      (upper) => {
        placeActor(upper, 3, 5, FILE.Chip_East);
        placeTop(upper, 11, 5, FILE.Air);
      },
      {
        upperHint: "Watch the monster below step onto the elevator and rise to this layer.",
        lowerHint: "The monster starts on floor, walks onto the elevator, and rises into the air cell above.",
      },
    ),
    buildTwoLayerLevel(
      "Monster Air Fall",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
      },
      (upper) => {
        placeTop(upper, 9, 5, FILE.Air);
        placeActor(upper, 10, 5, FILE.Bug_West);
      },
      {
        upperHint: "The monster walks from floor onto unsupported air and then falls.",
      },
    ),
    buildTwoLayerLevel(
      "Monster Bomb Fall",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
        placeTop(lower, 10, 5, FILE.Bomb);
      },
      (upper) => {
        placeActor(upper, 10, 5, FILE.Bug_West, FILE.Air);
      },
      {
        upperHint: "An unsupported monster falls onto a bomb.",
      },
    ),
    buildTwoLayerLevel(
      "Monster Water Fall",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
        placeTop(lower, 10, 5, FILE.Water);
      },
      (upper) => {
        placeActor(upper, 10, 5, FILE.Bug_West, FILE.Air);
      },
      {
        upperHint: "An unsupported monster falls into water.",
      },
    ),
    buildTwoLayerLevel(
      "Block Bomb Fall",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
        placeTop(lower, 10, 5, FILE.Bomb);
      },
      (upper) => {
        placeActor(upper, 10, 5, FILE.Block_Static, FILE.Air);
      },
      {
        upperHint: "An unsupported block falls onto a bomb.",
      },
    ),
    buildTwoLayerLevel(
      "Block Water Fall",
      (lower) => {
        placeActor(lower, 3, 5, FILE.Chip_East);
        placeTop(lower, 5, 5, FILE.Exit);
        placeTop(lower, 10, 5, FILE.Water);
      },
      (upper) => {
        placeActor(upper, 10, 5, FILE.Block_Static, FILE.Air);
      },
      {
        upperHint: "An unsupported block falls into water.",
      },
    ),
    buildTwoLayerLevel(
      "Block To Elevator",
      (lower) => {
        placeActor(lower, 4, 5, FILE.Chip_East);
        placeActor(lower, 5, 5, FILE.Block_Static);
        placeTop(lower, 6, 5, FILE.Elevator);
        placeTop(lower, 10, 5, FILE.Exit);
      },
      (upper) => {
        placeTop(upper, 6, 5, FILE.Air);
      },
      {
        upperHint: "Push the lower-layer block east onto the elevator so it rises into the air cell above.",
      },
    ),
  ];
}

function createDatBytes(levels) {
  const bytes = [
    DAT_FILE_SIGNATURE & 0xff,
    (DAT_FILE_SIGNATURE >> 8) & 0xff,
    MS_RULESET_SIGNATURE & 0xff,
    (MS_RULESET_SIGNATURE >> 8) & 0xff,
    levels.length & 0xff,
    (levels.length >> 8) & 0xff,
  ];

  for (const level of levels) {
    bytes.push(level.length & 0xff, (level.length >> 8) & 0xff, ...level);
  }

  return Uint8Array.from(bytes);
}

function buildDatFile() {
  const rawLevels = [];
  let levelNumber = 1;
  for (const logicalLevel of buildShowcaseLevels()) {
    logicalLevel.layers.forEach((layer, layerIndex) => {
      const title = `${logicalLevel.baseTitle}\\${layerIndex + 1}`;
      const encoded = encodeLevel(
        levelNumber,
        title,
        passwordFor(levelNumber),
        logicalLevel.timeLimitSeconds,
        logicalLevel.chipsNeeded,
        layer,
      );
      rawLevels.push(encoded);
      levelNumber += 1;
    });
  }
  return createDatBytes(rawLevels);
}

async function main() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(currentDir, "..");
  const target = resolve(repoRoot, "data/3DINTRO.dat");
  await writeFile(target, buildDatFile());
  console.log(`wrote ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
