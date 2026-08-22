const BOARD_TILES = 9;
const TILE_SIZE = 32;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ATLAS_BYTES = 16 * 1024 * 1024;
const MAX_ELEMENTS = 512;
const MAX_STATES_PER_ELEMENT = 64;
const ROTATION_FIELDS = new Set(["facing", "direction", "orientation"]);
const ROTATION_ANGLES = Object.freeze({
  north: 0,
  northeast: 45,
  east: 90,
  southeast: 135,
  south: 180,
  southwest: 225,
  west: 270,
  northwest: 315,
});
const ARTWORK_MANIFEST_URL = new URL(
  "../assets/artwork/hybridcc-artwork-manifest.v1.json",
  import.meta.url,
).href;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${label} is outside its supported range`);
  }
  return value;
}

function safeName(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value)) {
    throw new TypeError(`${label} must be a safe lowercase name`);
  }
  return value;
}

function parseRotation(value, label) {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    !ROTATION_FIELDS.has(value.state_field) ||
    !Object.hasOwn(ROTATION_ANGLES, value.basis)
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return Object.freeze({ stateField: value.state_field, basis: value.basis });
}

function parseRectangle(value, label, atlases) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const atlas = safeName(value.atlas, `${label}.atlas`);
  const atlasRecord = Object.hasOwn(atlases, atlas) ? atlases[atlas] : null;
  if (!atlasRecord) throw new TypeError(`${label} references an unknown atlas`);
  const x = boundedInteger(value.x, 0, atlasRecord.width, `${label}.x`);
  const y = boundedInteger(value.y, 0, atlasRecord.height, `${label}.y`);
  const width = boundedInteger(value.width, 1, 256, `${label}.width`);
  const height = boundedInteger(value.height, 1, 256, `${label}.height`);
  if (x + width > atlasRecord.width || y + height > atlasRecord.height) {
    throw new TypeError(`${label} extends outside its atlas`);
  }
  return Object.freeze({ atlas, x, y, width, height });
}

function parseSelectorFields(value, label, hasStates) {
  if (value === undefined) {
    if (hasStates) throw new TypeError(`${label} is required when states are declared`);
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 16 || !hasStates) {
    throw new TypeError(`${label} is invalid`);
  }
  const fields = value.map((field, index) => safeName(field, `${label}[${index}]`));
  if (new Set(fields).size !== fields.length) {
    throw new TypeError(`${label} contains a duplicate field`);
  }
  return Object.freeze(fields);
}

function parseStateSprites(value, label, atlases, selectorFields) {
  if (value === undefined) return Object.freeze({});
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const entries = Object.entries(value);
  if (entries.length > MAX_STATES_PER_ELEMENT) {
    throw new TypeError(`${label} contains too many states`);
  }
  const result = {};
  for (const [state, record] of entries) {
    if (!/^[a-z0-9_=;:-]{1,96}$/.test(state) || !isRecord(record)) {
      throw new TypeError(`${label} contains an invalid state`);
    }
    const referencedFields = state.split(";").flatMap((component) => {
      const separator = component.indexOf("=");
      return separator > 0 ? [component.slice(0, separator)] : [];
    });
    if (
      (referencedFields.length === 0 && selectorFields.length !== 1) ||
      referencedFields.some((field) => !selectorFields.includes(field))
    ) {
      throw new TypeError(`${label}.${state} uses an undeclared selector field`);
    }
    result[state] = Object.freeze({
      sprite: parseRectangle(
        record.sprite,
        `${label}.${state}.sprite`,
        atlases,
      ),
      fallback:
        record.fallback === undefined
          ? null
          : parseRectangle(
              record.fallback,
              `${label}.${state}.fallback`,
              atlases,
            ),
    });
  }
  return Object.freeze(result);
}

/** Validate the bounded artwork description and resolve all atlas URLs. */
export function parseArtworkManifest(value, manifestUrl = ARTWORK_MANIFEST_URL) {
  if (
    !isRecord(value) ||
    value.schema !== "hybridcc.player-artwork.v1" ||
    value.version !== 1 ||
    !isRecord(value.tile_size) ||
    !isRecord(value.grid) ||
    !isRecord(value.atlases) ||
    !Array.isArray(value.elements)
  ) {
    throw new TypeError("Unsupported HybridCC artwork manifest");
  }
  if (value.elements.length === 0 || value.elements.length > MAX_ELEMENTS) {
    throw new TypeError("Artwork manifest has an invalid element count");
  }

  const tileWidth = boundedInteger(value.tile_size.width, 1, 256, "tile width");
  const tileHeight = boundedInteger(value.tile_size.height, 1, 256, "tile height");
  const columns = boundedInteger(value.grid.columns, 1, 64, "atlas columns");
  const rows = boundedInteger(value.grid.rows, 1, 64, "atlas rows");
  if (value.grid.symbol_count !== value.elements.length) {
    throw new TypeError("Artwork manifest symbol count does not match its elements");
  }
  const atlasWidth = tileWidth * columns;
  const atlasHeight = tileHeight * rows;

  const atlasEntries = Object.entries(value.atlases);
  const atlasEntryNames = atlasEntries.map(([name]) => name).sort();
  if (atlasEntryNames.join(",") !== "fallback,primary,variants") {
    throw new TypeError("Artwork manifest must declare the exact v1 atlas set");
  }
  const atlases = {};
  for (const [name, record] of atlasEntries) {
    safeName(name, "atlas name");
    if (
      !isRecord(record) ||
      typeof record.file !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.file) ||
      typeof record.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.sha256)
    ) {
      throw new TypeError(`Artwork atlas ${name} is invalid`);
    }
    const url = new URL(record.file, manifestUrl);
    if (url.origin !== new URL(manifestUrl).origin) {
      throw new TypeError(`Artwork atlas ${name} must remain same-origin`);
    }
    const width = boundedInteger(record.width, 1, 4096, `Artwork atlas ${name}.width`);
    const height = boundedInteger(record.height, 1, 4096, `Artwork atlas ${name}.height`);
    if (width % tileWidth !== 0 || height % tileHeight !== 0) {
      throw new TypeError(`Artwork atlas ${name} is not aligned to the tile grid`);
    }
    atlases[name] = Object.freeze({
      name,
      url: url.href,
      sha256: record.sha256,
      width,
      height,
    });
  }
  if (
    atlases.primary.width !== atlasWidth ||
    atlases.primary.height !== atlasHeight ||
    atlases.fallback.width !== atlasWidth ||
    atlases.fallback.height !== atlasHeight
  ) {
    throw new TypeError("Primary and fallback artwork atlases must match the catalog grid");
  }

  const elements = new Map();
  for (const [index, record] of value.elements.entries()) {
    if (!isRecord(record)) throw new TypeError(`Artwork element ${index} must be an object`);
    const symbol = safeName(record.symbol, `Artwork element ${index}.symbol`);
    const stratum = safeName(record.stratum, `Artwork element ${index}.stratum`);
    if (elements.has(symbol)) throw new TypeError(`Duplicate artwork symbol ${symbol}`);
    const sprite = parseRectangle(
      record.sprite,
      `Artwork element ${symbol}.sprite`,
      atlases,
    );
    const fallback = parseRectangle(
      record.fallback,
      `Artwork element ${symbol}.fallback`,
      atlases,
    );
    const hasStates = record.states !== undefined;
    const selectorFields = parseSelectorFields(
      record.selector_fields,
      `Artwork element ${symbol}.selector_fields`,
      hasStates,
    );
    elements.set(
      symbol,
      Object.freeze({
        symbol,
        stratum,
        sprite,
        fallback,
        rotation: parseRotation(record.rotation, `Artwork element ${symbol}.rotation`),
        selectorFields,
        states: parseStateSprites(
          record.states,
          `Artwork element ${symbol}.states`,
          atlases,
          selectorFields,
        ),
      }),
    );
  }

  return Object.freeze({
    schema: value.schema,
    version: value.version,
    tileWidth,
    tileHeight,
    atlasWidth,
    atlasHeight,
    atlases: Object.freeze(atlases),
    elements,
  });
}

function stateCandidates(state, selectorFields = null) {
  if (typeof state === "string" && state !== "") return [state.toLowerCase()];
  if (!isRecord(state)) return [];
  const fields = Object.entries(state)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .filter(([name]) => selectorFields === null || selectorFields.includes(name.toLowerCase()))
    .map(([name, value]) => [name.toLowerCase(), String(value).toLowerCase()])
    .sort(([left], [right]) => left.localeCompare(right));
  if (fields.length === 0) return [];
  const canonical = fields.map(([name, value]) => `${name}=${value}`).join(";");
  if (fields.length === 1 && fields[0][0] === "facing") {
    return [fields[0][1], `facing:${fields[0][1]}`, canonical];
  }
  return [canonical];
}

function atlasImage(images, name) {
  if (images instanceof Map) return images.get(name) ?? null;
  return isRecord(images) ? images[name] ?? null : null;
}

function resolvedSprite(artwork, element, rectangle, route) {
  if (!rectangle) return null;
  const image = atlasImage(artwork?.images, rectangle.atlas);
  if (!image) return null;
  return Object.freeze({ ...rectangle, image, route, symbol: element.symbol });
}

function normalizedRotationTarget(value) {
  const compact = String(value ?? "").toLowerCase().replaceAll(/[^a-z]/g, "");
  return {
    n: "north",
    ne: "northeast",
    e: "east",
    se: "southeast",
    s: "south",
    sw: "southwest",
    w: "west",
    nw: "northwest",
  }[compact] ?? (Object.hasOwn(ROTATION_ANGLES, compact) ? compact : null);
}

function rotatedPrimarySprite(artwork, symbol, state, stratum) {
  if (!isRecord(state) || !artwork?.catalog?.elements) return null;
  const element = artwork.catalog.elements.get(symbol);
  if (!element?.rotation || (stratum && element.stratum !== stratum)) return null;
  const target = normalizedRotationTarget(state[element.rotation.stateField]);
  if (!target) return null;
  const sprite = resolvedSprite(artwork, element, element.sprite, "primary-rotated");
  if (!sprite) return null;
  const degrees =
    (ROTATION_ANGLES[target] - ROTATION_ANGLES[element.rotation.basis] + 360) % 360;
  return Object.freeze({ sprite, radians: degrees * Math.PI / 180 });
}

/** Select a decoded primary or fallback sprite without embedding a tile mapping table. */
export function resolveArtworkSprite(artwork, symbol, state = null, stratum = null) {
  if (!artwork?.catalog?.elements || typeof symbol !== "string") return null;
  const element = artwork.catalog.elements.get(symbol);
  if (!element || (stratum && element.stratum !== stratum)) return null;

  const candidates = stateCandidates(state, element.selectorFields);
  if (candidates.length > 0) {
    const supported = candidates.map((key) => element.states[key]).find(Boolean);
    if (supported) {
      return (
        resolvedSprite(artwork, element, supported.sprite, "primary-state") ??
        resolvedSprite(artwork, element, supported.fallback ?? element.fallback, "fallback")
      );
    }
    return resolvedSprite(artwork, element, element.fallback, "fallback");
  }

  if (element.selectorFields.length > 0 && isRecord(state)) {
    return resolvedSprite(artwork, element, element.fallback, "fallback");
  }
  if (
    element.rotation &&
    isRecord(state) &&
    Object.hasOwn(state, element.rotation.stateField)
  ) {
    return resolvedSprite(artwork, element, element.fallback, "fallback");
  }

  return (
    resolvedSprite(artwork, element, element.sprite, "primary") ??
    resolvedSprite(artwork, element, element.fallback, "fallback")
  );
}

async function responseBytes(response, maximum, label) {
  if (!response || response.ok !== true || typeof response.arrayBuffer !== "function") {
    throw new Error(`${label} could not be loaded`);
  }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maximum) {
    throw new Error(`${label} exceeds its byte limit`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maximum) {
    throw new Error(`${label} has an invalid byte length`);
  }
  return bytes;
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable");
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function decodeBrowserImage(bytes) {
  const blob = new Blob([bytes], { type: "image/png" });
  if (typeof globalThis.createImageBitmap === "function") {
    return globalThis.createImageBitmap(blob);
  }
  if (
    typeof globalThis.Image !== "function" ||
    typeof globalThis.URL?.createObjectURL !== "function" ||
    typeof globalThis.URL?.revokeObjectURL !== "function"
  ) {
    throw new Error("PNG decoding is unavailable");
  }
  const url = globalThis.URL.createObjectURL(blob);
  try {
    const image = new globalThis.Image();
    image.src = url;
    if (typeof image.decode === "function") {
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("PNG decoding failed")), {
          once: true,
        });
      });
    }
    return image;
  } finally {
    globalThis.URL.revokeObjectURL(url);
  }
}

/** Load and integrity-check the bounded manifest plus each independent PNG atlas. */
export function createArtworkLoader({
  manifestUrl = ARTWORK_MANIFEST_URL,
  fetchImpl = typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null,
  digestImpl = sha256Hex,
  decodeImage = decodeBrowserImage,
} = {}) {
  let phase = "idle";
  let value = null;
  let failure = null;
  let promise = null;

  async function loadOnce() {
    if (typeof fetchImpl !== "function") throw new Error("Artwork fetching is unavailable");
    const manifestBytes = await responseBytes(
      await fetchImpl(manifestUrl),
      MAX_MANIFEST_BYTES,
      "Artwork manifest",
    );
    let manifest;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
      manifest = parseArtworkManifest(JSON.parse(text), manifestUrl);
    } catch (error) {
      const detail = error instanceof Error ? error.message : error;
      throw new Error(`Artwork manifest is invalid: ${detail}`);
    }

    const images = new Map();
    const errors = [];
    await Promise.all(
      Object.values(manifest.atlases).map(async (atlas) => {
        try {
          const bytes = await responseBytes(
            await fetchImpl(atlas.url),
            MAX_ATLAS_BYTES,
            `Artwork atlas ${atlas.name}`,
          );
          if ((await digestImpl(bytes)) !== atlas.sha256) {
            throw new Error("SHA-256 mismatch");
          }
          const image = await decodeImage(bytes, atlas);
          const width = image?.naturalWidth ?? image?.width;
          const height = image?.naturalHeight ?? image?.height;
          if (width !== atlas.width || height !== atlas.height) {
            image?.close?.();
            throw new Error("decoded dimensions do not match the manifest");
          }
          images.set(atlas.name, image);
        } catch (error) {
          errors.push(
            Object.freeze({
              atlas: atlas.name,
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }),
    );
    errors.sort((left, right) =>
      left.atlas < right.atlas ? -1 : left.atlas > right.atlas ? 1 : 0,
    );
    return Object.freeze({ catalog: manifest, images, errors: Object.freeze(errors) });
  }

  return Object.freeze({
    get status() {
      return phase;
    },
    get error() {
      return failure;
    },
    peek() {
      return value;
    },
    load() {
      if (promise) return promise;
      phase = "loading";
      promise = loadOnce().then(
        (loaded) => {
          value = loaded;
          phase = "ready";
          return loaded;
        },
        (error) => {
          failure = error;
          phase = "failed";
          return null;
        },
      );
      return promise;
    },
  });
}

const defaultArtworkLoader = createArtworkLoader();
const pendingArtworkRedraw = new WeakMap();

const TERRAIN = Object.freeze({
  floor: [57, 66, 70],
  wall: [42, 96, 124],
  water: [26, 102, 150],
  ice: [151, 219, 229],
  space: [5, 9, 18],
  exit: [34, 143, 79],
  fire: [179, 55, 29],
  dirt: [129, 88, 45],
  gravel: [119, 124, 117],
  socket: [124, 88, 137],
  force: [164, 116, 35],
});

const RESOURCE_COLORS = Object.freeze({
  red: [218, 75, 63],
  blue: [66, 137, 214],
  yellow: [235, 194, 68],
  green: [72, 174, 99],
  orange: [222, 129, 46],
  purple: [153, 91, 190],
});

function rgb(color, alpha = 1) {
  return alpha === 1 ? `rgb(${color.join(" ")})` : `rgb(${color.join(" ")} / ${alpha})`;
}

function cellMap(snapshot) {
  const cells = new Map();
  for (const cell of snapshot?.viewport?.cells ?? []) {
    if (Number.isInteger(cell?.x) && Number.isInteger(cell?.y)) {
      cells.set(`${cell.x},${cell.y}`, cell);
    }
  }
  return cells;
}

function drawFloor(ctx, x, y, color) {
  ctx.fillStyle = rgb(color);
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "rgb(255 255 255 / 0.05)";
  ctx.fillRect(x + 3, y + 3, 2, 2);
  ctx.fillRect(x + 24, y + 18, 2, 2);
  ctx.fillStyle = "rgb(0 0 0 / 0.12)";
  ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
}

function drawTerrain(ctx, cell, x, y, boundary) {
  const kind = cell?.terrain ?? "floor";
  const color = TERRAIN[kind] ?? TERRAIN.floor;
  drawFloor(ctx, x, y, color);

  if (kind === "wall") {
    ctx.strokeStyle = "rgb(145 205 224 / 0.48)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, 28, 28);
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 16);
    ctx.lineTo(x + 30, y + 16);
    ctx.moveTo(x + 10, y + 2);
    ctx.lineTo(x + 10, y + 16);
    ctx.moveTo(x + 22, y + 16);
    ctx.lineTo(x + 22, y + 30);
    ctx.stroke();
  } else if (kind === "water") {
    ctx.strokeStyle = "rgb(125 216 241 / 0.8)";
    ctx.lineWidth = 2;
    const offset = boundary % 8;
    for (let row = 0; row < 3; row += 1) {
      const yy = y + 7 + row * 9;
      ctx.beginPath();
      ctx.moveTo(x - 4 + offset, yy);
      ctx.lineTo(x + 4 + offset, yy - 2);
      ctx.lineTo(x + 12 + offset, yy);
      ctx.lineTo(x + 20 + offset, yy - 2);
      ctx.lineTo(x + 36 + offset, yy);
      ctx.stroke();
    }
  } else if (kind === "ice") {
    ctx.strokeStyle = "rgb(255 255 255 / 0.78)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 24);
    ctx.lineTo(x + 14, y + 8);
    ctx.lineTo(x + 19, y + 15);
    ctx.lineTo(x + 29, y + 4);
    ctx.moveTo(x + 18, y + 28);
    ctx.lineTo(x + 28, y + 18);
    ctx.stroke();
  } else if (kind === "space") {
    ctx.fillStyle = "rgb(217 229 255 / 0.75)";
    ctx.fillRect(x + 6, y + 8, 2, 2);
    ctx.fillRect(x + 23, y + 20, 2, 2);
    ctx.fillStyle = "rgb(103 169 220 / 0.7)";
    ctx.fillRect(x + 17, y + 5, 1, 1);
    ctx.fillRect(x + 9, y + 25, 1, 1);
  } else if (kind === "exit") {
    ctx.fillStyle = "rgb(12 34 25 / 0.85)";
    ctx.fillRect(x + 4, y + 4, 24, 24);
    ctx.strokeStyle = "rgb(130 255 173)";
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 7, y + 7, 18, 18);
    ctx.fillStyle = "rgb(130 255 173)";
    ctx.fillRect(x + 14, y + 11, 4, 10);
    ctx.fillRect(x + 11, y + 14, 10, 4);
  } else if (kind === "fire") {
    ctx.fillStyle = "rgb(255 196 54)";
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 3);
    ctx.lineTo(x + 26, y + 25);
    ctx.lineTo(x + 17, y + 29);
    ctx.lineTo(x + 7, y + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgb(216 55 30)";
    ctx.fillRect(x + 13, y + 16, 7, 11);
  } else if (kind === "socket") {
    ctx.fillStyle = "rgb(48 30 56)";
    ctx.fillRect(x + 4, y + 4, 24, 24);
    ctx.strokeStyle = "rgb(201 159 216)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 7, y + 7, 18, 18);
    ctx.fillStyle = "rgb(19 15 23)";
    ctx.fillRect(x + 12, y + 12, 8, 8);
  }
}

function drawChip(ctx, x, y) {
  ctx.fillStyle = "rgb(12 14 16)";
  ctx.fillRect(x + 8, y + 8, 16, 16);
  ctx.fillStyle = "rgb(229 210 104)";
  ctx.fillRect(x + 10, y + 10, 12, 12);
  ctx.fillStyle = "rgb(49 54 48)";
  ctx.fillRect(x + 13, y + 13, 6, 6);
  for (let offset = 9; offset <= 21; offset += 4) {
    ctx.fillRect(x + offset, y + 5, 2, 3);
    ctx.fillRect(x + offset, y + 24, 2, 3);
  }
}

function drawKey(ctx, x, y, colorName) {
  const color = RESOURCE_COLORS[colorName] ?? RESOURCE_COLORS.yellow;
  ctx.fillStyle = "rgb(8 12 16 / 0.42)";
  ctx.fillRect(x + 7, y + 8, 19, 19);
  ctx.strokeStyle = rgb(color);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x + 12, y + 12, 5, 0, Math.PI * 2);
  ctx.moveTo(x + 15, y + 15);
  ctx.lineTo(x + 25, y + 25);
  ctx.moveTo(x + 20, y + 20);
  ctx.lineTo(x + 24, y + 16);
  ctx.stroke();
}

function drawBoots(ctx, x, y, color) {
  ctx.fillStyle = rgb(color);
  ctx.fillRect(x + 7, y + 8, 7, 14);
  ctx.fillRect(x + 18, y + 8, 7, 14);
  ctx.fillRect(x + 5, y + 19, 11, 6);
  ctx.fillRect(x + 16, y + 19, 11, 6);
  ctx.fillStyle = "rgb(255 255 255 / 0.35)";
  ctx.fillRect(x + 9, y + 10, 3, 6);
  ctx.fillRect(x + 20, y + 10, 3, 6);
}

function drawItem(ctx, cell, x, y) {
  if (cell.item === "chip") {
    drawChip(ctx, x, y);
  } else if (cell.item === "key") {
    drawKey(ctx, x, y, cell.itemColor);
  } else if (cell.item === "flippers") {
    drawBoots(ctx, x, y, [67, 147, 222]);
  } else if (cell.item === "fire_boots") {
    drawBoots(ctx, x, y, [222, 83, 55]);
  } else if (cell.item === "ice_skates") {
    drawBoots(ctx, x, y, [186, 225, 234]);
  } else if (cell.item === "force_boots") {
    drawBoots(ctx, x, y, [202, 151, 48]);
  }
}

function drawOverlay(ctx, cell, x, y) {
  if (cell.overlay !== "door") return;
  const color = RESOURCE_COLORS[cell.overlayColor] ?? RESOURCE_COLORS.red;
  ctx.fillStyle = rgb(color);
  ctx.fillRect(x + 4, y + 3, 24, 28);
  ctx.strokeStyle = "rgb(10 14 18 / 0.72)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 7, y + 6, 18, 25);
  ctx.fillStyle = "rgb(255 255 255 / 0.55)";
  ctx.fillRect(x + 21, y + 17, 3, 3);
}

function drawPlayer(ctx, x, y) {
  ctx.fillStyle = "rgb(7 14 23 / 0.45)";
  ctx.fillRect(x + 8, y + 25, 18, 4);
  ctx.fillStyle = "rgb(246 205 62)";
  ctx.fillRect(x + 9, y + 5, 14, 10);
  ctx.fillRect(x + 7, y + 14, 18, 10);
  ctx.fillStyle = "rgb(37 75 134)";
  ctx.fillRect(x + 10, y + 15, 12, 9);
  ctx.fillStyle = "rgb(245 233 191)";
  ctx.fillRect(x + 12, y + 8, 3, 3);
  ctx.fillRect(x + 18, y + 8, 3, 3);
  ctx.fillStyle = "rgb(15 21 29)";
  ctx.fillRect(x + 13, y + 9, 1, 1);
  ctx.fillRect(x + 19, y + 9, 1, 1);
  ctx.fillStyle = "rgb(225 79 53)";
  ctx.fillRect(x + 8, y + 24, 7, 4);
  ctx.fillRect(x + 18, y + 24, 7, 4);
}

function drawActor(ctx, actor, x, y) {
  if (actor === "player") {
    drawPlayer(ctx, x, y);
    return;
  }
  if (!actor) return;
  ctx.fillStyle = "rgb(214 86 68)";
  ctx.fillRect(x + 7, y + 7, 18, 18);
  ctx.fillStyle = "rgb(21 25 29)";
  ctx.fillRect(x + 10, y + 11, 4, 4);
  ctx.fillRect(x + 18, y + 11, 4, 4);
}

function drawArtworkSprite(ctx, artwork, symbol, state, stratum, x, y) {
  let sprite = resolveArtworkSprite(artwork, symbol, state, stratum);
  const rotated = sprite?.route === "fallback"
    ? rotatedPrimarySprite(artwork, symbol, state, stratum)
    : null;
  if (rotated) sprite = rotated.sprite;
  if (!sprite || typeof ctx.drawImage !== "function") return false;
  try {
    if (rotated && rotated.radians !== 0) {
      if (
        typeof ctx.save !== "function" ||
        typeof ctx.translate !== "function" ||
        typeof ctx.rotate !== "function" ||
        typeof ctx.restore !== "function"
      ) {
        return false;
      }
      ctx.save();
      ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE / 2);
      ctx.rotate(rotated.radians);
      ctx.drawImage(
        sprite.image,
        sprite.x,
        sprite.y,
        sprite.width,
        sprite.height,
        -TILE_SIZE / 2,
        -TILE_SIZE / 2,
        TILE_SIZE,
        TILE_SIZE,
      );
      ctx.restore();
      return true;
    }
    ctx.drawImage(
      sprite.image,
      sprite.x,
      sprite.y,
      sprite.width,
      sprite.height,
      x,
      y,
      TILE_SIZE,
      TILE_SIZE,
    );
    return true;
  } catch {
    return false;
  }
}

function coloredState(explicit, color) {
  if (explicit !== undefined && explicit !== null) return explicit;
  return typeof color === "string" && color !== "" ? { color } : null;
}

function actorDescriptor(cell) {
  const actor = cell?.actor;
  if (typeof actor === "string") {
    return {
      symbol: actor,
      state:
        cell.actorState ??
        (typeof cell.actorFacing === "string" ? { facing: cell.actorFacing } : null),
    };
  }
  if (!isRecord(actor)) return null;
  const symbol = typeof actor.symbol === "string" ? actor.symbol : actor.kind;
  if (typeof symbol !== "string") return null;
  return {
    symbol,
    state:
      actor.state ??
      cell.actorState ??
      (typeof actor.facing === "string"
        ? { facing: actor.facing }
        : typeof cell.actorFacing === "string"
          ? { facing: cell.actorFacing }
          : null),
  };
}

function itemArtworkSymbol(symbol) {
  // The compact UI calls the classic required pickup "chip"; the native
  // catalog and artwork manifest call the same HybridCC element "ic_chip".
  return symbol === "chip" ? "ic_chip" : symbol;
}

const EDGE_SLOT_FACING = Object.freeze({
  northEdge: "north",
  eastEdge: "east",
  southEdge: "south",
  westEdge: "west",
});

function elementVariantState(element, additionalState = null) {
  const state = isRecord(additionalState) ? { ...additionalState } : {};
  if (typeof element?.appearance === "string") state.appearance = element.appearance;
  if (isRecord(element?.fields)) {
    for (const [name, value] of Object.entries(element.fields)) {
      if (["string", "number", "boolean"].includes(typeof value)) state[name] = value;
    }
  }
  if (Number.isFinite(element?.state?.stateFlags) && element.state.stateFlags !== 0) {
    state.stateFlags = Math.trunc(element.state.stateFlags);
  }
  if (Number.isFinite(element?.state?.remainingUses) && element.state.remainingUses !== 0) {
    state.remainingUses = Math.trunc(element.state.remainingUses);
  }
  if (
    Number.isFinite(element?.state?.revealUntilBoundary) &&
    element.state.revealUntilBoundary !== 0
  ) {
    state.revealUntilBoundary = Math.trunc(element.state.revealUntilBoundary);
  }
  if (typeof element?.channelOpen === "boolean") state.open = element.channelOpen;
  const edgeFacing = EDGE_SLOT_FACING[element?.slot];
  if (edgeFacing) state.facing = edgeFacing;
  return Object.keys(state).length > 0 ? state : null;
}

function presentationElements(cell, slots) {
  if (!Array.isArray(cell?.elements)) return [];
  return cell.elements.filter(
    (element) =>
      isRecord(element) &&
      typeof element.symbol === "string" &&
      slots.includes(element.slot),
  );
}

function drawManifestElement(ctx, artwork, element, stratum, x, y, additionalState = null) {
  return drawArtworkSprite(
    ctx,
    artwork,
    element.symbol,
    elementVariantState(element, additionalState),
    stratum,
    x,
    y,
  );
}

function scheduleArtworkRedraw(canvas, snapshot, artworkLoader) {
  if (!artworkLoader || artworkLoader.status === "failed" || artworkLoader.status === "ready") {
    return;
  }
  const pending = pendingArtworkRedraw.get(canvas);
  if (pending) {
    pending.snapshot = snapshot;
    return;
  }
  const record = { snapshot };
  pendingArtworkRedraw.set(canvas, record);
  artworkLoader.load().then(() => {
    if (pendingArtworkRedraw.get(canvas) !== record) return;
    pendingArtworkRedraw.delete(canvas);
    if (canvas.isConnected === false) return;
    drawBoard(canvas, record.snapshot, { artworkLoader, autoLoad: false });
  });
}

export function drawBoard(canvas, snapshot, options = {}) {
  const artworkLoader = options.artworkLoader ?? defaultArtworkLoader;
  const artwork = Object.hasOwn(options, "artwork") ? options.artwork : artworkLoader?.peek?.();
  if (!artwork && options.autoLoad !== false) {
    scheduleArtworkRedraw(canvas, snapshot, artworkLoader);
  }

  const scale = Math.max(1, Math.min(3, globalThis.devicePixelRatio ?? 1));
  const logicalSize = BOARD_TILES * TILE_SIZE;
  const physicalSize = logicalSize * scale;
  if (canvas.width !== physicalSize) canvas.width = physicalSize;
  if (canvas.height !== physicalSize) canvas.height = physicalSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, logicalSize, logicalSize);

  const cells = cellMap(snapshot);
  const boundary = Math.max(0, Math.trunc(snapshot?.boundary ?? 0));
  for (let y = 0; y < BOARD_TILES; y += 1) {
    for (let x = 0; x < BOARD_TILES; x += 1) {
      const cell = cells.get(`${x},${y}`) ?? { x, y, terrain: "floor" };
      const tileX = x * TILE_SIZE;
      const tileY = y * TILE_SIZE;

      // The original vector/pixel treatment remains underneath the atlas so a
      // missing, corrupt, or undecodable asset always has a deterministic view.
      drawTerrain(ctx, cell, tileX, tileY, boundary);
      const terrainElement = presentationElements(cell, ["terrain"])[0];
      const concealedDynamicTerrain =
        terrainElement?.symbol === "pop_up_wall" ||
        (terrainElement?.symbol === "trick_wall" &&
          (cell.terrain === "floor" ||
            terrainElement.fields?.rule === "permanently_invisible"));
      if (!terrainElement || concealedDynamicTerrain) {
        drawArtworkSprite(
          ctx,
          artwork,
          cell.terrain ?? "floor",
          cell.terrainState ?? null,
          "terrain",
          tileX,
          tileY,
        );
      } else {
        drawManifestElement(ctx, artwork, terrainElement, "terrain", tileX, tileY);
      }

      const overlayElements = presentationElements(cell, ["overlay"]).filter(
        (element) => !(element.symbol === "toggle_wall" && element.channelOpen === true),
      );
      const edgeElements = presentationElements(cell, [
        "northEdge",
        "eastEdge",
        "southEdge",
        "westEdge",
      ]);
      const cornerElements = presentationElements(cell, ["corner"]);
      const pickupElements = presentationElements(cell, ["pickup"]);
      if (overlayElements.length === 0 && cell.overlay) {
        if (
          !drawArtworkSprite(
            ctx,
            artwork,
            cell.overlay,
            coloredState(cell.overlayState, cell.overlayColor),
            "overlay",
            tileX,
            tileY,
          )
        ) {
          drawOverlay(ctx, cell, tileX, tileY);
        }
      } else {
        for (const element of overlayElements) {
          if (!drawManifestElement(ctx, artwork, element, "overlay", tileX, tileY)) {
            drawOverlay(ctx, cell, tileX, tileY);
          }
        }
      }

      for (const element of edgeElements) {
        drawManifestElement(ctx, artwork, element, "edge", tileX, tileY);
      }
      for (const element of cornerElements) {
        drawManifestElement(ctx, artwork, element, "corner", tileX, tileY);
      }

      if (pickupElements.length === 0 && cell.item) {
        if (
          !drawArtworkSprite(
            ctx,
            artwork,
            itemArtworkSymbol(cell.item),
            coloredState(cell.itemState, cell.itemColor),
            "pickup",
            tileX,
            tileY,
          )
        ) {
          drawItem(ctx, cell, tileX, tileY);
        }
      } else {
        for (const element of pickupElements) {
          if (!drawManifestElement(ctx, artwork, element, "pickup", tileX, tileY)) {
            drawItem(ctx, cell, tileX, tileY);
          }
        }
      }

      const actor = actorDescriptor(cell);
      if (
        actor &&
        !drawArtworkSprite(
          ctx,
          artwork,
          actor.symbol,
          actor.state,
          "actor",
          tileX,
          tileY,
        )
      ) {
        drawActor(ctx, actor.symbol, tileX, tileY);
      }
    }
  }

  ctx.strokeStyle = "rgb(0 0 0 / 0.18)";
  ctx.lineWidth = 1;
  for (let n = 1; n < BOARD_TILES; n += 1) {
    ctx.beginPath();
    ctx.moveTo(n * TILE_SIZE + 0.5, 0);
    ctx.lineTo(n * TILE_SIZE + 0.5, logicalSize);
    ctx.moveTo(0, n * TILE_SIZE + 0.5);
    ctx.lineTo(logicalSize, n * TILE_SIZE + 0.5);
    ctx.stroke();
  }
}
