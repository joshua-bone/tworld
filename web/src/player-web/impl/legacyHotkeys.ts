export interface LegacyKeyboardEventLike {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

function hasCommandModifier(event: LegacyKeyboardEventLike): boolean {
  return Boolean(event.metaKey || event.ctrlKey);
}

function hasPlainModifiers(event: LegacyKeyboardEventLike): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function isProceedKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

export function isHelpToggleKey(key: string): boolean {
  return key === "?" || key === "F1";
}

export function isUndoKey(event: LegacyKeyboardEventLike): boolean {
  return hasPlainModifiers(event) && !event.shiftKey && (event.key === "z" || event.key === "Z");
}

export function isFineUndoKey(event: LegacyKeyboardEventLike): boolean {
  return !event.altKey && !event.shiftKey && hasCommandModifier(event) && (event.key === "z" || event.key === "Z");
}

export function isUndoCheckpointKey(event: LegacyKeyboardEventLike): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && Boolean(event.shiftKey) && (event.key === "z" || event.key === "Z");
}

export function isPrevLevelKey(event: LegacyKeyboardEventLike): boolean {
  return hasPlainModifiers(event) && (event.key === "PageUp" || event.key === "p" || event.key === "P");
}

export function isNextLevelKey(event: LegacyKeyboardEventLike): boolean {
  return hasPlainModifiers(event) && (event.key === "PageDown" || event.key === "n" || event.key === "N");
}

export function isFirstLevelKey(event: LegacyKeyboardEventLike): boolean {
  return (hasPlainModifiers(event) && event.key === "Home") || (hasCommandModifier(event) && !event.altKey && (event.key === "," || event.key === "<"));
}

export function isLastLevelKey(event: LegacyKeyboardEventLike): boolean {
  return (hasPlainModifiers(event) && event.key === "End") || (hasCommandModifier(event) && !event.altKey && (event.key === "." || event.key === ">"));
}

export function hasBlockedMovementModifier(event: LegacyKeyboardEventLike): boolean {
  return Boolean(event.altKey || event.ctrlKey || event.metaKey);
}

export function isSystemModifierKey(key: string): boolean {
  return key === "Meta" || key === "Control" || key === "Alt";
}
