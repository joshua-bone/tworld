interface EditableKeyboardTargetLike {
  isContentEditable?: boolean;
  tagName?: string | null;
}

function normalizeTagName(tagName: string | null | undefined): string | null {
  if (typeof tagName !== "string") {
    return null;
  }

  const normalized = tagName.trim();
  return normalized === "" ? null : normalized.toUpperCase();
}

export function isEditableKeyTarget(target: EventTarget | EditableKeyboardTargetLike | null): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }

  const editableTarget = target as EditableKeyboardTargetLike;
  if (editableTarget.isContentEditable === true) {
    return true;
  }

  const tagName = normalizeTagName(editableTarget.tagName);
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function shouldBypassPlayerHotkeys(
  eventTarget: EventTarget | EditableKeyboardTargetLike | null,
  activeElement: EventTarget | EditableKeyboardTargetLike | null,
): boolean {
  return isEditableKeyTarget(eventTarget) || isEditableKeyTarget(activeElement);
}
