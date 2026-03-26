export const GAME_INPUT_CODES = {
  none: 0,
  north: 1,
  west: 2,
  south: 4,
  east: 8,
  preserve: 1568,
} as const;

export const GAME_INPUT_MODIFIER_MASKS = {
  action1: 1 << 0,
} as const;

export const GAME_INPUT_RUNTIME_MODIFIER_FLAGS = {
  action1: 1 << 12,
} as const;

export type GameInputName = keyof typeof GAME_INPUT_CODES;
export type GameInputModifierName = keyof typeof GAME_INPUT_MODIFIER_MASKS;
export type InteractiveInput = GameInputName | number;

const GAME_INPUT_RUNTIME_MODIFIER_FLAG_MASK = Object.values(GAME_INPUT_RUNTIME_MODIFIER_FLAGS).reduce(
  (mask, value) => mask | value,
  0,
);

const GAME_INPUT_NAMES_BY_CODE = new Map<number, GameInputName>(
  Object.entries(GAME_INPUT_CODES).map(([name, code]) => [code, name as GameInputName]),
);

const GAME_INPUT_ALIASES: Record<string, GameInputName> = {
  "": "none",
  "-": "none",
  down: "south",
  e: "east",
  east: "east",
  hold: "preserve",
  left: "west",
  n: "north",
  none: "none",
  north: "north",
  preserve: "preserve",
  right: "east",
  s: "south",
  south: "south",
  up: "north",
  w: "west",
  west: "west",
};

export function isGameInputName(value: string): value is GameInputName {
  return Object.hasOwn(GAME_INPUT_CODES, value);
}

export function normalizeGameInputName(value: string): GameInputName | null {
  const normalized = value.trim().toLowerCase();
  return GAME_INPUT_ALIASES[normalized] ?? null;
}

export function getGameInputCode(name: GameInputName): number {
  return GAME_INPUT_CODES[name];
}

export function normalizeGameInputModifierMask(mask: number): number {
  let normalized = 0;
  if ((mask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0) {
    normalized |= GAME_INPUT_MODIFIER_MASKS.action1;
  }
  return normalized;
}

export function encodeRuntimeInputCode(baseCode: number, modifierMask = 0): number {
  let nextCode = stripRuntimeInputModifiers(baseCode);
  const normalizedMask = normalizeGameInputModifierMask(modifierMask);
  if ((normalizedMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0) {
    nextCode |= GAME_INPUT_RUNTIME_MODIFIER_FLAGS.action1;
  }
  return nextCode;
}

export function stripRuntimeInputModifiers(code: number): number {
  return code & ~GAME_INPUT_RUNTIME_MODIFIER_FLAG_MASK;
}

export function decodeRuntimeInputCode(code: number): { baseCode: number; modifierMask: number } {
  let modifierMask = 0;
  if ((code & GAME_INPUT_RUNTIME_MODIFIER_FLAGS.action1) !== 0) {
    modifierMask |= GAME_INPUT_MODIFIER_MASKS.action1;
  }
  return {
    baseCode: stripRuntimeInputModifiers(code),
    modifierMask,
  };
}

export function resolveGameInputCode(input: InteractiveInput): number {
  return typeof input === "number" ? input : getGameInputCode(input);
}

export function getGameInputNameFromCode(code: number): GameInputName | null {
  return GAME_INPUT_NAMES_BY_CODE.get(code) ?? null;
}
