import type { BrowserUiMode } from "@player-web/ports/BrowserProfileStore";

function normalizeBaseUrl(baseUrl: string): string {
  if (!baseUrl) {
    return "/";
  }

  const withLeadingSlash = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function basePathFromBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized === "/" ? "" : normalized.slice(0, -1);
}

export function appRelativePathname(pathname: string, baseUrl: string): string {
  const basePath = basePathFromBaseUrl(baseUrl);
  if (!basePath) {
    return pathname || "/";
  }

  if (!pathname || pathname === basePath) {
    return "/";
  }

  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || "/";
  }

  return pathname;
}

export function resolveShellModeFromPathname(pathname: string, baseUrl: string): BrowserUiMode {
  const appPath = appRelativePathname(pathname, baseUrl);
  return appPath === "/legacy" || appPath.startsWith("/legacy/") ? "classic" : "modern";
}

export function buildAppHref(appPath: "/" | "/legacy", baseUrl: string): string {
  const basePath = basePathFromBaseUrl(baseUrl);
  if (appPath === "/") {
    return basePath ? `${basePath}/` : "/";
  }

  return `${basePath}${appPath}`;
}

export function pathForShellMode(mode: BrowserUiMode, baseUrl: string): string {
  return buildAppHref(mode === "classic" ? "/legacy" : "/", baseUrl);
}
