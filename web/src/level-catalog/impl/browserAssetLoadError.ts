function assetLabel(pathOrLabel: string): string {
  const normalized = pathOrLabel.replace(/^.*\//u, "");
  return normalized || pathOrLabel;
}

function isDynamicModuleFetchFailure(message: string): boolean {
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

export function normalizeBrowserAssetLoadError(error: unknown, pathOrLabel: string): Error {
  if (error instanceof Error && isDynamicModuleFetchFailure(error.message)) {
    return new Error(
      `Built-in game data for ${assetLabel(pathOrLabel)} could not be loaded. ` +
        "The site was probably updated while this tab was open. Reload the page and try again.",
      { cause: error },
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
