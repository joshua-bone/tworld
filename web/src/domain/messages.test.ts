import { describe, expect, it } from "vitest";
import { createMessageCursor, getNextMessage, parseMessageCatalog } from "@domain/messages";

describe("messages", () => {
  it("parses the message catalog and rotates within a message type", () => {
    const catalog = parseMessageCatalog(":die\nNope\nStill nope\n:win\nYes\n");
    let cursor = createMessageCursor();

    const first = getNextMessage(catalog, cursor, "die");
    cursor = first.cursor;
    const second = getNextMessage(catalog, cursor, "die");
    cursor = second.cursor;
    const third = getNextMessage(catalog, cursor, "die");

    expect(first.message).toBe("Nope");
    expect(second.message).toBe("Still nope");
    expect(third.message).toBe("Nope");
    expect(getNextMessage(catalog, cursor, "win").message).toBe("Yes");
  });
});
