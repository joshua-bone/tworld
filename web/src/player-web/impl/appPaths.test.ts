import { describe, expect, it } from "vitest";
import {
  appRelativePathname,
  basePathFromBaseUrl,
  buildAppHref,
  pathForShellMode,
  resolveShellModeFromPathname,
} from "@player-web/impl/appPaths";

describe("appPaths", () => {
  it("derives the repo base path from a vite base url", () => {
    expect(basePathFromBaseUrl("/")).toBe("");
    expect(basePathFromBaseUrl("/tworld/")).toBe("/tworld");
    expect(basePathFromBaseUrl("tworld")).toBe("/tworld");
  });

  it("strips the repo base from the browser pathname", () => {
    expect(appRelativePathname("/legacy", "/")).toBe("/legacy");
    expect(appRelativePathname("/tworld/legacy", "/tworld/")).toBe("/legacy");
    expect(appRelativePathname("/tworld", "/tworld/")).toBe("/");
  });

  it("resolves shell mode relative to the repo base path", () => {
    expect(resolveShellModeFromPathname("/legacy", "/")).toBe("classic");
    expect(resolveShellModeFromPathname("/tworld/legacy", "/tworld/")).toBe("classic");
    expect(resolveShellModeFromPathname("/tworld/", "/tworld/")).toBe("modern");
  });

  it("builds repo-relative hrefs for both shells", () => {
    expect(buildAppHref("/", "/")).toBe("/");
    expect(buildAppHref("/legacy", "/")).toBe("/legacy");
    expect(buildAppHref("/", "/tworld/")).toBe("/tworld/");
    expect(buildAppHref("/legacy", "/tworld/")).toBe("/tworld/legacy");
    expect(pathForShellMode("classic", "/tworld/")).toBe("/tworld/legacy");
    expect(pathForShellMode("modern", "/tworld/")).toBe("/tworld/");
  });
});
