import { describe, expect, it } from "vitest";
import {
  createP4bStaticFallbackScript,
  resolveP4bStaticRoute,
} from "./p4bStaticRoutes";

describe("P4B static route support", () => {
  it("resolves canonical direct routes under both root and repository Pages bases", () => {
    expect(resolveP4bStaticRoute("/dev/ccsolver/", "/")).toEqual({
      kind: "document",
      documentPath: "dev/ccsolver/index.html",
    });
    expect(resolveP4bStaticRoute("/tworld/dev/ccsolver/levels/cclp1/001-key-pyramid/", "/tworld/"))
      .toEqual({
        kind: "document",
        documentPath: "dev/ccsolver/levels/cclp1/001-key-pyramid/index.html",
      });
  });

  it("redirects only known missing-trailing-slash routes and gives unknown dossier URLs a noindex 404", () => {
    expect(resolveP4bStaticRoute("/dev/ccsolver", "/")).toEqual({
      kind: "redirect",
      location: "/dev/ccsolver/",
    });
    expect(resolveP4bStaticRoute("/tworld/dev/ccsolver/levels/cclp1/001-key-pyramid", "/tworld/"))
      .toEqual({
        kind: "redirect",
        location: "/tworld/dev/ccsolver/levels/cclp1/001-key-pyramid/",
      });
    expect(resolveP4bStaticRoute("/dev/ccsolver/not-a-level", "/"))
      .toEqual({ kind: "dossier-not-found" });
    expect(resolveP4bStaticRoute("/ccsolver/", "/")).toEqual({ kind: "not-dossier" });
    expect(resolveP4bStaticRoute("/levels/1", "/")).toEqual({ kind: "not-dossier" });

    const script = createP4bStaticFallbackScript();
    expect(script).toContain("noindex,nofollow");
    expect(script).toContain("001-key-pyramid");
    expect(script).not.toContain("eval(");
  });
});
