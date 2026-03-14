export type SettingsMap = Map<string, string>;

export function parseSettingsFile(text: string): SettingsMap {
  const settings = new Map<string, string>();

  for (const rawLine of text.split(/\r?\n/u)) {
    const separator = rawLine.indexOf("=");
    if (separator < 0) {
      continue;
    }

    settings.set(rawLine.slice(0, separator), rawLine.slice(separator + 1));
  }

  return settings;
}

export function serializeSettingsFile(settings: SettingsMap): string {
  return [...settings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
    .concat(settings.size > 0 ? "\n" : "");
}

export function getIntSetting(settings: SettingsMap, name: string): number {
  const value = settings.get(name);
  if (value === undefined) {
    return -1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

export function setIntSetting(settings: SettingsMap, name: string, value: number): SettingsMap {
  const next = new Map(settings);
  next.set(name, String(value));
  return next;
}

export function getStringSetting(settings: SettingsMap, name: string): string | null {
  return settings.get(name) ?? null;
}

export function setStringSetting(settings: SettingsMap, name: string, value: string): SettingsMap {
  const next = new Map(settings);
  next.set(name, value);
  return next;
}
