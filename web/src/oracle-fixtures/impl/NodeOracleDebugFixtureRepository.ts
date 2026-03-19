import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import type { OracleDebugFixtureManifest, OracleDebugTraceFixture } from "@oracle-fixtures/impl/contracts/oracleDebugContract";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultFixtureRoot = resolve(currentDir, "../../../../fixtures/oracle-debug/v1");

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

async function readGzipJson<T>(path: string): Promise<T> {
  return JSON.parse(gunzipSync(await readFile(path)).toString("utf-8")) as T;
}

export class NodeOracleDebugFixtureRepository {
  constructor(private readonly fixtureRoot = defaultFixtureRoot) {}

  loadManifest(): Promise<OracleDebugFixtureManifest> {
    return readJson(resolve(this.fixtureRoot, "manifest.json"));
  }

  loadTrace(name: string): Promise<OracleDebugTraceFixture> {
    const gzipPath = resolve(this.fixtureRoot, "trace-debug", `${name}.json.gz`);
    if (existsSync(gzipPath)) {
      return readGzipJson(gzipPath);
    }
    return readJson(resolve(this.fixtureRoot, "trace-debug", `${name}.json`));
  }
}
