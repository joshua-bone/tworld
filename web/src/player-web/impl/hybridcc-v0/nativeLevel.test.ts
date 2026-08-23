import { describe, expect, it } from "vitest";
import { decodeHybridCcNativeLevel } from "./nativeLevel";

function nativeFixture(): Uint8Array {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >>> 8);
  };
  const text = (value: string) => {
    const encoded = new TextEncoder().encode(value);
    u16(encoded.length);
    bytes.push(...encoded);
  };
  const element = (
    id: number,
    color = 0,
    direction = 4,
    rule = 0,
    channel = 0,
    count = 0,
  ) => {
    u8(id);
    u8(color);
    u8(direction);
    u8(rule);
    u16(channel);
    u16(count);
  };
  const cell = (actorId = 0, actorDirection = 4) => {
    element(1);
    element(0);
    element(0);
    element(actorId, 0, actorDirection);
    u8(0);
    u8(0);
  };

  bytes.push(0x48, 0x43, 0x4c, 0x56);
  u16(1);
  u16(2);
  u16(1);
  u16(1);
  u16(7);
  u16(3);
  u16(90);
  text("A Tiny Test");
  text("Tile Builder");
  text("Try east.");
  text("ABCD");
  u16(1);
  u16(0);
  cell(41, 1);
  cell();
  return new Uint8Array(bytes);
}

describe("decodeHybridCcNativeLevel", () => {
  it("decodes canonical metadata, actor order, and cell layers", () => {
    const encoded = nativeFixture();
    const level = decodeHybridCcNativeLevel(encoded);

    expect(level).toMatchObject({
      width: 2,
      height: 1,
      depth: 1,
      number: 7,
      requiredChips: 3,
      timeLimitSeconds: 90,
      title: "A Tiny Test",
      author: "Tile Builder",
      hint: "Try east.",
      password: "ABCD",
      actorOrder: [0],
    });
    expect(level.cells).toHaveLength(2);
    expect(level.cells[0]?.terrain.id).toBe(1);
    expect(level.cells[0]?.actor).toMatchObject({ id: 41, direction: 1 });
    expect(level.encoded).toEqual(encoded);
    expect(level.encoded).not.toBe(encoded);
  });

  it("rejects malformed boundaries instead of reading partial records", () => {
    const encoded = nativeFixture();
    expect(() => decodeHybridCcNativeLevel(encoded.subarray(0, encoded.length - 1))).toThrow(
      "truncated",
    );

    const wrongMagic = new Uint8Array(encoded);
    wrongMagic[0] = 0;
    expect(() => decodeHybridCcNativeLevel(wrongMagic)).toThrow("magic");

    const trailing = new Uint8Array(encoded.length + 1);
    trailing.set(encoded);
    expect(() => decodeHybridCcNativeLevel(trailing)).toThrow("trailing");
  });
});
