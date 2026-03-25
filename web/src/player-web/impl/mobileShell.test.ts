import { describe, expect, it } from "vitest";
import {
  isLikelyMobileShellDevice,
  parseMobileShellQueryOverride,
  readBrowserMobileShellHeuristics,
  resolveMobileShellRedirect,
} from "@player-web/impl/mobileShell";

describe("mobileShell", () => {
  it("parses explicit ui query overrides", () => {
    expect(parseMobileShellQueryOverride("?ui=mobile")).toBe("mobile");
    expect(parseMobileShellQueryOverride("?ui=desktop")).toBe("desktop");
    expect(parseMobileShellQueryOverride("?ui=legacy")).toBeNull();
    expect(parseMobileShellQueryOverride("")).toBeNull();
  });

  it("recognizes likely mobile heuristic profiles", () => {
    expect(
      isLikelyMobileShellDevice({
        coarsePointer: true,
        noHover: true,
        userAgentMobile: false,
        viewportHeight: 844,
        viewportWidth: 390,
      }),
    ).toBe(true);

    expect(
      isLikelyMobileShellDevice({
        coarsePointer: false,
        noHover: false,
        userAgentMobile: false,
        viewportHeight: 800,
        viewportWidth: 500,
      }),
    ).toBe(false);

    expect(
      isLikelyMobileShellDevice({
        coarsePointer: true,
        noHover: true,
        userAgentMobile: false,
        viewportHeight: 1600,
        viewportWidth: 1200,
      }),
    ).toBe(false);
  });

  it("treats explicit ui query overrides as higher priority than heuristics", () => {
    expect(
      resolveMobileShellRedirect({
        baseUrl: "/",
        desktopOverride: true,
        heuristics: {
          coarsePointer: false,
          noHover: false,
          userAgentMobile: false,
          viewportHeight: 900,
          viewportWidth: 1440,
        },
        pathname: "/legacy",
        search: "?ui=mobile",
      }),
    ).toEqual({ mode: "mobile", reason: "query" });

    expect(
      resolveMobileShellRedirect({
        baseUrl: "/",
        desktopOverride: false,
        heuristics: {
          coarsePointer: true,
          noHover: true,
          userAgentMobile: true,
          viewportHeight: 844,
          viewportWidth: 390,
        },
        pathname: "/mobile",
        search: "?ui=desktop",
      }),
    ).toEqual({ mode: "modern", reason: "query" });
  });

  it("only auto-redirects root visits when a mobile profile is detected", () => {
    expect(
      resolveMobileShellRedirect({
        baseUrl: "/",
        desktopOverride: false,
        heuristics: {
          coarsePointer: true,
          noHover: true,
          userAgentMobile: false,
          viewportHeight: 1024,
          viewportWidth: 768,
        },
        pathname: "/",
        search: "",
      }),
    ).toEqual({ mode: "mobile", reason: "auto" });

    expect(
      resolveMobileShellRedirect({
        baseUrl: "/",
        desktopOverride: false,
        heuristics: {
          coarsePointer: true,
          noHover: true,
          userAgentMobile: false,
          viewportHeight: 1024,
          viewportWidth: 768,
        },
        pathname: "/legacy",
        search: "",
      }),
    ).toBeNull();

    expect(
      resolveMobileShellRedirect({
        baseUrl: "/",
        desktopOverride: true,
        heuristics: {
          coarsePointer: true,
          noHover: true,
          userAgentMobile: true,
          viewportHeight: 844,
          viewportWidth: 390,
        },
        pathname: "/",
        search: "",
      }),
    ).toBeNull();
  });

  it("reads browser-facing mobile heuristics from window-like inputs", () => {
    expect(
      readBrowserMobileShellHeuristics({
        innerHeight: 844,
        innerWidth: 390,
        matchMedia: (query) => ({ matches: query === "(pointer: coarse)" || query === "(hover: none)" }),
        navigator: {
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        },
      }),
    ).toEqual({
      coarsePointer: true,
      noHover: true,
      userAgentMobile: true,
      viewportHeight: 844,
      viewportWidth: 390,
    });
  });
});
