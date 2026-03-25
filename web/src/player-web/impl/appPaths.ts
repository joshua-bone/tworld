import type { BrowserUiMode } from "@player-web/ports/BrowserProfileStore";

export type AppShellMode = BrowserUiMode | "mobile";

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

export function resolveShellModeFromPathname(pathname: string, baseUrl: string): AppShellMode {
  const appPath = appRelativePathname(pathname, baseUrl);
  if (appPath === "/legacy" || appPath.startsWith("/legacy/")) {
    return "classic";
  }
  if (appPath === "/mobile" || appPath.startsWith("/mobile/")) {
    return "mobile";
  }
  return "modern";
}

export function buildAppHref(appPath: "/" | "/legacy" | "/mobile", baseUrl: string): string {
  const basePath = basePathFromBaseUrl(baseUrl);
  if (appPath === "/") {
    return basePath ? `${basePath}/` : "/";
  }

  return `${basePath}${appPath}`;
}

export function pathForShellMode(mode: AppShellMode, baseUrl: string): string {
  switch (mode) {
    case "classic":
      return buildAppHref("/legacy", baseUrl);
    case "mobile":
      return buildAppHref("/mobile", baseUrl);
    default:
      return buildAppHref("/", baseUrl);
  }
}
