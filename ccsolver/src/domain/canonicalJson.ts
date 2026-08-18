declare const canonicalJsonBrand: unique symbol;

export type CanonicalJson = string & {
  readonly [canonicalJsonBrand]: "CanonicalJson";
};

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type CanonicalJsonErrorCode =
  | "canonical.accessor-property"
  | "canonical.cyclic-reference"
  | "canonical.invalid-json"
  | "canonical.invalid-number"
  | "canonical.invalid-unicode"
  | "canonical.maximum-depth"
  | "canonical.non-canonical"
  | "canonical.non-plain-object"
  | "canonical.sparse-array"
  | "canonical.unsupported-type";

export const CANONICAL_JSON_MAX_DEPTH = 128;

export class CanonicalJsonError extends Error {
  override readonly name = "CanonicalJsonError";

  constructor(
    readonly code: CanonicalJsonErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

function childPath(path: string, token: string | number): string {
  const escaped = String(token).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${path}/${escaped}`;
}

function throwCanonicalError(
  code: CanonicalJsonErrorCode,
  path: string,
  message: string,
): never {
  throw new CanonicalJsonError(code, path, message);
}

function assertUnicodeScalarString(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        throwCanonicalError(
          "canonical.invalid-unicode",
          path,
          `canonical JSON string contains an unpaired high surrogate at UTF-16 index ${index}`,
        );
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throwCanonicalError(
        "canonical.invalid-unicode",
        path,
        `canonical JSON string contains an unpaired low surrogate at UTF-16 index ${index}`,
      );
    }
  }
}

function compareUtf16(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftCodeUnit = left.charCodeAt(index);
    const rightCodeUnit = right.charCodeAt(index);
    if (leftCodeUnit < rightCodeUnit) {
      return -1;
    }
    if (leftCodeUnit > rightCodeUnit) {
      return 1;
    }
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

function quoteString(value: string): string {
  // Strings have already been checked for lone surrogates, so the ECMAScript
  // primitive serializer produces the RFC 8785 representation.
  const quoted = JSON.stringify(value);
  if (quoted === undefined) {
    throwCanonicalError(
      "canonical.unsupported-type",
      "",
      "canonical JSON could not serialize a string value",
    );
  }
  return quoted;
}

function assertDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
  path: string,
): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!descriptor || "get" in descriptor || "set" in descriptor) {
    throwCanonicalError(
      "canonical.accessor-property",
      path,
      "canonical JSON cannot evaluate accessor properties",
    );
  }
  if (!descriptor.enumerable) {
    throwCanonicalError(
      "canonical.unsupported-type",
      path,
      "canonical JSON objects cannot contain hidden data properties",
    );
  }
}

function arrayIndex(key: string): number | undefined {
  if (key === "0") {
    return 0;
  }
  if (!/^[1-9][0-9]*$/u.test(key)) {
    return undefined;
  }
  const value = Number(key);
  return Number.isSafeInteger(value) ? value : undefined;
}

function serializeValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  output: string[],
  depth: number,
): void {
  if (value === null) {
    output.push("null");
    return;
  }

  switch (typeof value) {
    case "boolean":
      output.push(value ? "true" : "false");
      return;
    case "number":
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throwCanonicalError(
          "canonical.invalid-number",
          path,
          "canonical JSON numbers must be safe integers and cannot be negative zero",
        );
      }
      output.push(String(value));
      return;
    case "string":
      assertUnicodeScalarString(value, path);
      output.push(quoteString(value));
      return;
    case "object":
      break;
    default:
      throwCanonicalError(
        "canonical.unsupported-type",
        path,
        `canonical JSON does not support ${typeof value} values`,
      );
  }

  if (depth >= CANONICAL_JSON_MAX_DEPTH) {
    throwCanonicalError(
      "canonical.maximum-depth",
      path,
      `canonical JSON permits at most ${CANONICAL_JSON_MAX_DEPTH} nested arrays or objects`,
    );
  }

  if (ancestors.has(value)) {
    throwCanonicalError(
      "canonical.cyclic-reference",
      path,
      "canonical JSON cannot represent cyclic object graphs",
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throwCanonicalError(
          "canonical.non-plain-object",
          path,
          "canonical JSON arrays must use the built-in Array prototype",
        );
      }

      const indexedDescriptors = new Map<number, PropertyDescriptor & { value: unknown }>();
      for (const key of Reflect.ownKeys(value)) {
        if (key === "length") {
          continue;
        }
        if (typeof key !== "string") {
          throwCanonicalError(
            "canonical.unsupported-type",
            path,
            "canonical JSON arrays cannot contain symbol properties",
          );
        }
        const index = arrayIndex(key);
        if (index === undefined || index >= value.length) {
          throwCanonicalError(
            "canonical.unsupported-type",
            childPath(path, key),
            "canonical JSON arrays cannot contain non-index properties",
          );
        }
        const propertyPath = childPath(path, index);
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        assertDataDescriptor(descriptor, propertyPath);
        indexedDescriptors.set(index, descriptor);
      }

      output.push("[");
      for (let index = 0; index < value.length; index += 1) {
        if (index > 0) {
          output.push(",");
        }
        const descriptor = indexedDescriptors.get(index);
        if (!descriptor) {
          throwCanonicalError(
            "canonical.sparse-array",
            childPath(path, index),
            "canonical JSON arrays must contain every indexed element",
          );
        }
        serializeValue(descriptor.value, childPath(path, index), ancestors, output, depth + 1);
      }
      output.push("]");
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throwCanonicalError(
        "canonical.non-plain-object",
        path,
        "canonical JSON objects must have Object.prototype or a null prototype",
      );
    }

    const entries: Array<readonly [string, PropertyDescriptor & { value: unknown }]> = [];
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        throwCanonicalError(
          "canonical.unsupported-type",
          path,
          "canonical JSON objects cannot contain symbol properties",
        );
      }
      const propertyPath = childPath(path, key);
      assertUnicodeScalarString(key, propertyPath);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      assertDataDescriptor(descriptor, propertyPath);
      entries.push([key, descriptor]);
    }
    entries.sort(([left], [right]) => compareUtf16(left, right));

    output.push("{");
    entries.forEach(([key, descriptor], index) => {
      if (index > 0) {
        output.push(",");
      }
      output.push(quoteString(key), ":");
      serializeValue(descriptor.value, childPath(path, key), ancestors, output, depth + 1);
    });
    output.push("}");
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeJson(value: unknown): CanonicalJson {
  const output: string[] = [];
  serializeValue(value, "", new WeakSet<object>(), output, 0);
  return output.join("") as CanonicalJson;
}

export function parseCanonicalJson(source: string): CanonicalJsonValue {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new CanonicalJsonError(
      "canonical.invalid-json",
      "",
      "canonical JSON input is not valid JSON",
      { cause: error },
    );
  }

  const canonical = canonicalizeJson(value);
  if (canonical !== source) {
    throw new CanonicalJsonError(
      "canonical.non-canonical",
      "",
      "JSON input does not match its canonical representation",
    );
  }
  return value as CanonicalJsonValue;
}
