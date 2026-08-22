const CARDINAL_DIRECTIONS = new Set(["N", "E", "S", "W"]);

const KEYBOARD_DIRECTIONS = new Map([
  ["ArrowUp", "N"],
  ["KeyW", "N"],
  ["ArrowRight", "E"],
  ["KeyD", "E"],
  ["ArrowDown", "S"],
  ["KeyS", "S"],
  ["ArrowLeft", "W"],
  ["KeyA", "W"],
]);

const TOGGLE_ACTIONS = new Map([
  ["Space", "pause_toggle"],
  ["KeyR", "restart_level"],
  ["Escape", "back"],
  ["F1", "reveal_secrets_toggle"],
  ["AltLeft", "speed_max_toggle"],
  ["KeyT", "slowmo_toggle"],
  ["PageDown", "next_level"],
  ["PageUp", "prev_level"],
]);

const HELD_ACTIONS = new Map([["ShiftLeft", "speed_double_hold"]]);

function isCardinalDirection(direction) {
  return CARDINAL_DIRECTIONS.has(direction);
}

function isPerpendicular(left, right) {
  const leftIsVertical = left === "N" || left === "S";
  const rightIsVertical = right === "N" || right === "S";
  return leftIsVertical !== rightIsVertical;
}

function requireDirection(direction) {
  if (!isCardinalDirection(direction)) {
    throw new TypeError(`Unknown cardinal direction: ${String(direction)}`);
  }
  return direction;
}

function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (target.isContentEditable === true) return true;
  const tagName = String(target.tagName ?? "").toUpperCase();
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function keyboardPhysicalId(code) {
  return `keyboard:${code}`;
}

function touchPhysicalId(pointerId) {
  return `touch:${String(pointerId)}`;
}

function actionForKeyDown(event) {
  if (event.code === "KeyZ" && (event.ctrlKey === true || event.metaKey === true)) {
    return { kind: "undo" };
  }

  const kind = TOGGLE_ACTIONS.get(event.code);
  return kind ? { kind } : null;
}

/**
 * Convert ordered held directions to HybridCC's canonical boundary packet.
 * Opposite, duplicate, and third-or-later directions cannot become the
 * secondary field; the first perpendicular direction wins.
 */
export function normalizeDirections(directions) {
  let primary = null;
  let secondary = null;

  for (const rawDirection of directions) {
    const direction = requireDirection(rawDirection);
    if (primary === null) {
      primary = direction;
      continue;
    }
    if (secondary === null && direction !== primary && isPerpendicular(primary, direction)) {
      secondary = direction;
      break;
    }
  }

  return { primary, secondary };
}

/**
 * Exact four-subtick collector used by the earlier HybridCC players.
 *
 * The first capture in a window produces its boundary packet. A direction
 * first observed during captures 1, 2, or 3 is carried into the next boundary
 * even when it has already been released. Callers advance this object once per
 * host sample. Wall-clock scheduling and bounded catch-up are owned by the
 * separate BoundedSubtickClock below and never alter collector semantics.
 */
export class FourSubtickInputCollector {
  #pressedAtSubtick = new Map();

  #subtick = 0;

  capture(heldDirections) {
    if (this.#subtick === 4) this.#rollWindow();

    for (const rawDirection of heldDirections) {
      const direction = requireDirection(rawDirection);
      if (!this.#pressedAtSubtick.has(direction)) {
        this.#pressedAtSubtick.set(direction, this.#subtick);
      }
    }

    const isBoundary = this.#subtick === 0;
    this.#subtick += 1;
    return isBoundary ? normalizeDirections(this.#pressedAtSubtick.keys()) : null;
  }

  reset() {
    this.#pressedAtSubtick.clear();
    this.#subtick = 0;
  }

  debugSubtick() {
    return this.#subtick;
  }

  #rollWindow() {
    for (const [direction, firstSubtick] of this.#pressedAtSubtick) {
      if (firstSubtick === 0) {
        this.#pressedAtSubtick.delete(direction);
      } else {
        this.#pressedAtSubtick.set(direction, 0);
      }
    }
    this.#subtick = 0;
  }
}

/** HybridCC2025's bounded browser scheduling policy around 25 ms samples. */
export class BoundedSubtickClock {
  #intervalMs;

  #maxCatchUp;

  #lastNowMs = null;

  #carryMs = 0;

  constructor({ intervalMs = 25, maxCatchUp = 8 } = {}) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new TypeError("Subtick interval must be positive");
    }
    if (!Number.isInteger(maxCatchUp) || maxCatchUp <= 0) {
      throw new TypeError("Subtick catch-up bound must be a positive integer");
    }
    this.#intervalMs = intervalMs;
    this.#maxCatchUp = maxCatchUp;
  }

  reset(nowMs = null) {
    if (nowMs !== null && !Number.isFinite(nowMs)) {
      throw new TypeError("Subtick clock time must be finite");
    }
    this.#lastNowMs = nowMs;
    this.#carryMs = 0;
  }

  due(nowMs, running = true) {
    if (!Number.isFinite(nowMs)) {
      throw new TypeError("Subtick clock time must be finite");
    }
    if (this.#lastNowMs === null) {
      this.#lastNowMs = nowMs;
      return 0;
    }
    const delta = Math.max(0, nowMs - this.#lastNowMs);
    this.#lastNowMs = nowMs;
    if (!running) {
      this.#carryMs = 0;
      return 0;
    }
    this.#carryMs += delta;
    const due = Math.min(Math.floor(this.#carryMs / this.#intervalMs), this.#maxCatchUp);
    this.#carryMs -= due * this.#intervalMs;
    return due;
  }
}

/**
 * Event-facing input source for the browser player. Keyboard and touch inputs
 * share one physical-input registry so aliases release independently while
 * direction order continues to reflect the player's press order.
 */
export class BrowserInputCollector {
  #collector = new FourSubtickInputCollector();

  #physicalDirections = new Map();

  #directionCounts = new Map();

  #heldDirectionOrder = new Map();

  #heldActionCodes = new Set();

  #actions = [];

  handleKeyDown(event) {
    if (isTypingTarget(event.target)) return;

    const direction = KEYBOARD_DIRECTIONS.get(event.code);
    if (direction) {
      this.#pressPhysical(keyboardPhysicalId(event.code), direction);
      event.preventDefault?.();
      return;
    }

    const heldAction = HELD_ACTIONS.get(event.code);
    if (heldAction) {
      event.preventDefault?.();
      if (event.repeat === true || this.#heldActionCodes.has(event.code)) return;
      this.#heldActionCodes.add(event.code);
      this.#actions.push({ kind: heldAction, isDown: true });
      return;
    }

    const action = actionForKeyDown(event);
    if (action) {
      event.preventDefault?.();
      if (event.repeat !== true) this.#actions.push(action);
    }
  }

  handleKeyUp(event) {
    const direction = KEYBOARD_DIRECTIONS.get(event.code);
    if (direction) {
      const released = this.#releasePhysical(keyboardPhysicalId(event.code));
      if (released || !isTypingTarget(event.target)) event.preventDefault?.();
      return;
    }

    const heldAction = HELD_ACTIONS.get(event.code);
    if (heldAction && this.#heldActionCodes.delete(event.code)) {
      event.preventDefault?.();
      this.#actions.push({ kind: heldAction, isDown: false });
    }
  }

  pressTouchDirection(pointerId, direction) {
    this.#pressPhysical(touchPhysicalId(pointerId), requireDirection(direction));
  }

  releaseTouchDirection(pointerId) {
    this.#releasePhysical(touchPhysicalId(pointerId));
  }

  heldDirections() {
    return [...this.#heldDirectionOrder.keys()];
  }

  sampleSubtick() {
    return this.#collector.capture(this.#heldDirectionOrder.keys());
  }

  drainActions() {
    return this.#actions.splice(0, this.#actions.length);
  }

  reset(_reason = "host") {
    this.#collector.reset();
    this.#physicalDirections.clear();
    this.#directionCounts.clear();
    this.#heldDirectionOrder.clear();
    this.#heldActionCodes.clear();
    this.#actions.length = 0;
  }

  bind(target, { visibilityTarget = globalThis.document } = {}) {
    if (!target || typeof target.addEventListener !== "function") {
      throw new TypeError("Browser input target must support addEventListener");
    }

    const onKeyDown = (event) => this.handleKeyDown(event);
    const onKeyUp = (event) => this.handleKeyUp(event);
    const onBlur = () => this.reset("blur");
    const onVisibilityChange = () => {
      if (visibilityTarget?.hidden === true) this.reset("hidden");
    };

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    target.addEventListener("blur", onBlur);
    visibilityTarget?.addEventListener?.("visibilitychange", onVisibilityChange);

    let isBound = true;
    return () => {
      if (!isBound) return;
      isBound = false;
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      visibilityTarget?.removeEventListener?.("visibilitychange", onVisibilityChange);
      this.reset("unbind");
    };
  }

  #pressPhysical(physicalId, direction) {
    const previousDirection = this.#physicalDirections.get(physicalId);
    if (previousDirection === direction) return false;
    if (previousDirection !== undefined) this.#releasePhysical(physicalId);

    this.#physicalDirections.set(physicalId, direction);
    const previousCount = this.#directionCounts.get(direction) ?? 0;
    this.#directionCounts.set(direction, previousCount + 1);
    if (previousCount === 0) this.#heldDirectionOrder.set(direction, true);
    return true;
  }

  #releasePhysical(physicalId) {
    const direction = this.#physicalDirections.get(physicalId);
    if (direction === undefined) return false;

    this.#physicalDirections.delete(physicalId);
    const nextCount = (this.#directionCounts.get(direction) ?? 1) - 1;
    if (nextCount <= 0) {
      this.#directionCounts.delete(direction);
      this.#heldDirectionOrder.delete(direction);
    } else {
      this.#directionCounts.set(direction, nextCount);
    }
    return true;
  }
}
