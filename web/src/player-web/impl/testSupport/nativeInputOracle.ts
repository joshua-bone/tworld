import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function compileNativeInputOracle() {
  const support = dirname(fileURLToPath(import.meta.url));
  const native = resolve(support, "../../../../../legacy_c/generic");
  const directory = mkdtempSync(join(tmpdir(), "tworld-native-input-"));
  const executable = join(directory, "input-oracle");
  // The headless binding supplies distinct hardware key IDs and display types.
  // Selection priority and every state transition still come from actual in.c.
  const keyNames = [...new Set(readFileSync(join(native, "in.c"), "utf8").match(/\bTWK_\w+/g))]
    .filter((name) => name !== "TWK_LAST").sort();
  writeFileSync(join(directory, "oshwbind.h"), `
#include <stdint.h>
enum { TWK_FIRST = 256, ${keyNames.join(", ")}, TWK_LAST };
enum { TW_BUTTON_LEFT = 1, TW_BUTTON_WHEELUP = 4, TW_BUTTON_WHEELDOWN = 5 };
typedef struct { int x, y, w, h; } TW_Rect;
typedef struct { int unused; } TW_Surface;
uint8_t *TW_GetKeyState(int *count);
`);
  try {
    execFileSync("cc", ["-std=c99", "-I", directory, "-I", native,
      join(support, "nativeInputOracle.c"), "-o", executable], { timeout: 15_000 });
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    poll(events: readonly string[]): number[] {
      const output = execFileSync(executable, [], {
        input: `${events.map((event) => event || "-").join("\n")}\n`, encoding: "utf8", timeout: 5_000,
      });
      return output.trim().split("\n").map(Number);
    },
    dispose() { rmSync(directory, { recursive: true, force: true }); },
  };
}
