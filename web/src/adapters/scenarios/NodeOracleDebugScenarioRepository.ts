import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { OracleDebugSpec } from "@application/contracts/oracleDebug";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultOracleDebugSpecPath = resolve(currentDir, "../../../../scripts/oracle_debug_specs.json");

export class NodeOracleDebugScenarioRepository {
  constructor(private readonly specPath = defaultOracleDebugSpecPath) {}

  async loadSpecs(): Promise<OracleDebugSpec[]> {
    return JSON.parse(await readFile(this.specPath, "utf-8")) as OracleDebugSpec[];
  }
}
