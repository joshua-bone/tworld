export type MessageType = "win" | "die" | "time";

export interface MessageCatalog {
  messages: string[];
  indexes: Record<MessageType, number[]>;
}

export interface MessageCursor {
  win: number;
  die: number;
  time: number;
}

const MESSAGE_TYPES: MessageType[] = ["win", "die", "time"];

export function parseMessageCatalog(text: string): MessageCatalog {
  const messages: string[] = [];
  const indexes: Record<MessageType, number[]> = {
    win: [],
    die: [],
    time: [],
  };

  let active = new Set<MessageType>(["die"]);

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/\r/u, "");
    if (line.length === 0) {
      continue;
    }

    if (line.startsWith(":")) {
      active = new Set(
        line
          .slice(1)
          .trim()
          .split(/\s+/u)
          .filter((token): token is MessageType => MESSAGE_TYPES.includes(token as MessageType)),
      );
      continue;
    }

    const index = messages.length;
    messages.push(line.slice(0, 512));
    for (const messageType of active) {
      indexes[messageType].push(index);
    }
  }

  return { messages, indexes };
}

export function createMessageCursor(): MessageCursor {
  return {
    win: 0,
    die: 0,
    time: 0,
  };
}

export function getNextMessage(
  catalog: MessageCatalog,
  cursor: MessageCursor,
  type: MessageType,
): { message: string | null; cursor: MessageCursor } {
  const indexes = catalog.indexes[type];
  if (indexes.length === 0) {
    return {
      message: null,
      cursor,
    };
  }

  const current = cursor[type] % indexes.length;
  const nextCursor = {
    ...cursor,
    [type]: (current + 1) % indexes.length,
  } satisfies MessageCursor;

  return {
    message: catalog.messages[indexes[current]] ?? null,
    cursor: nextCursor,
  };
}
