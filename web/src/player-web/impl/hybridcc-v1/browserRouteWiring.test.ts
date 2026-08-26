import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HybridCC v1 browser bootstrap wiring", () => {
  it("mounts v1 at its dedicated route without replacing v0 or the main app", async () => {
    const source = await readFile(
      new URL("../../../bootstrap/browser/main.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import { HybridCcV1App } from "@player-web/impl/hybridcc-v1/HybridCcV1App";');
    expect(source).toContain('import { isHybridCcV1Path } from "@player-web/impl/hybridcc-v1/route";');
    expect(source).toContain("isHybridCcV1Path(window.location.pathname, import.meta.env.BASE_URL)");
    expect(source).toContain("? HybridCcV1App");
    expect(source).toContain("? HybridCcV0App");
    expect(source).toContain(": App;");
  });
});
