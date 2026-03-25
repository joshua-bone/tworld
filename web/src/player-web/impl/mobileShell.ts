import { appRelativePathname, type AppShellMode } from "@player-web/impl/appPaths";

export const MOBILE_UI_DESKTOP_OVERRIDE_STORAGE_KEY = "tworld.mobile.desktop-override";

export type MobileShellQueryOverride = "desktop" | "mobile";

export interface MobileShellHeuristics {
  coarsePointer: boolean;
  noHover: boolean;
  userAgentMobile: boolean;
  viewportHeight: number;
  viewportWidth: number;
}

export interface MobileShellRedirectDecision {
  mode: AppShellMode;
  reason: "auto" | "query";
}

interface MobileShellRedirectOptions {
  baseUrl: string;
  desktopOverride: boolean;
  heuristics: MobileShellHeuristics;
  pathname: string;
  search: string;
}

interface MobileShellWindowLike {
  innerHeight: number;
  innerWidth: number;
  matchMedia: (query: string) => { matches: boolean };
  navigator: {
    userAgent?: string;
    userAgentData?: {
      mobile?: boolean;
    };
  };
}

const MOBILE_USER_AGENT_PATTERN =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk/i;
const MOBILE_MAX_SHORT_SIDE_PX = 1024;
const MOBILE_MAX_LONG_SIDE_PX = 1366;

export function parseMobileShellQueryOverride(search: string): MobileShellQueryOverride | null {
  const value = new URLSearchParams(search).get("ui");
  if (value === "mobile" || value === "desktop") {
    return value;
  }
  return null;
}

export function isLikelyMobileShellDevice(heuristics: MobileShellHeuristics): boolean {
  if (heuristics.userAgentMobile) {
    return true;
  }

  if (!heuristics.coarsePointer || !heuristics.noHover) {
    return false;
  }

  const shortSide = Math.min(heuristics.viewportWidth, heuristics.viewportHeight);
  const longSide = Math.max(heuristics.viewportWidth, heuristics.viewportHeight);
  if (shortSide <= 0 || longSide <= 0) {
    return false;
  }

  return shortSide <= MOBILE_MAX_SHORT_SIDE_PX && longSide <= MOBILE_MAX_LONG_SIDE_PX;
}

export function resolveMobileShellRedirect(
  options: MobileShellRedirectOptions,
): MobileShellRedirectDecision | null {
  const queryOverride = parseMobileShellQueryOverride(options.search);
  if (queryOverride === "mobile") {
    return { mode: "mobile", reason: "query" };
  }
  if (queryOverride === "desktop") {
    return { mode: "modern", reason: "query" };
  }

  const appPath = appRelativePathname(options.pathname, options.baseUrl);
  if (appPath !== "/" || options.desktopOverride) {
    return null;
  }

  return isLikelyMobileShellDevice(options.heuristics) ? { mode: "mobile", reason: "auto" } : null;
}

export function readBrowserMobileShellHeuristics(source: MobileShellWindowLike): MobileShellHeuristics {
  const userAgent = source.navigator.userAgent ?? "";
  const userAgentMobile =
    source.navigator.userAgentData?.mobile === true ||
    MOBILE_USER_AGENT_PATTERN.test(userAgent);

  return {
    coarsePointer: source.matchMedia("(pointer: coarse)").matches,
    noHover: source.matchMedia("(hover: none)").matches,
    userAgentMobile,
    viewportHeight: source.innerHeight,
    viewportWidth: source.innerWidth,
  };
}
