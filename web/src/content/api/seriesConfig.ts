import { type RulesetName } from "@content/api/ruleset";

export interface SeriesConfig {
  mapFile: string;
  finalLevel: number;
  ruleset: RulesetName;
  ignorePasswords: boolean;
  fixLynx: boolean;
  fileInSetsDir: boolean;
}

function hasPathname(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

export function parseSeriesConfig(text: string): SeriesConfig {
  const config: SeriesConfig = {
    mapFile: "",
    finalLevel: 0,
    ruleset: "None",
    ignorePasswords: false,
    fixLynx: false,
    fileInSetsDir: false,
  };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^([^=\s]+)\s*=\s*(.+)$/.exec(line);
    if (!match) {
      throw new Error(`invalid configuration file syntax: ${line}`);
    }

    const [, rawName, rawValue] = match;
    const name = rawName.toLowerCase();
    const value = rawValue.trim();

    switch (name) {
      case "file":
        if (hasPathname(value)) {
          throw new Error("levelset filename may not contain a path");
        }
        config.mapFile = value;
        break;
      case "lastlevel": {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`invalid lastlevel in configuration file: ${value}`);
        }
        config.finalLevel = parsed;
        break;
      }
      case "ruleset": {
        const normalized = value.toLowerCase();
        if (normalized !== "ms" && normalized !== "lynx") {
          throw new Error(`invalid ruleset in configuration file: ${value}`);
        }
        config.ruleset = normalized === "ms" ? "MS" : "Lynx";
        break;
      }
      case "usepasswords":
        config.ignorePasswords = value.toLowerCase().startsWith("n");
        break;
      case "fixlynx":
        config.fixLynx = !value.toLowerCase().startsWith("n");
        break;
      case "fileinsetsdir":
        config.fileInSetsDir = !value.toLowerCase().startsWith("n");
        break;
      default:
        throw new Error(`unrecognized setting in configuration file: ${name}`);
    }
  }

  if (!config.mapFile) {
    throw new Error("configuration file is missing a file= directive");
  }

  return config;
}
