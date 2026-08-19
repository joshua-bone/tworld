export const P4B_STATIC_DOCUMENTS = Object.freeze({
  "ccsolver/": "ccsolver/index.html",
  "ccsolver/levels/cclp1/001-key-pyramid/":
    "ccsolver/levels/cclp1/001-key-pyramid/index.html",
} as const);

export type P4bStaticRouteResolution =
  | { readonly kind: "document"; readonly documentPath: string }
  | { readonly kind: "redirect"; readonly location: string }
  | { readonly kind: "dossier-not-found" }
  | { readonly kind: "not-dossier" };

function normalizedBasePath(basePath: string): string {
  if (!basePath.startsWith("/") || basePath.includes("?") || basePath.includes("#")) {
    throw new Error("P4B static route base must be an absolute pathname");
  }
  const trimmed = basePath.replace(/^\/+|\/+$/gu, "");
  return trimmed.length === 0 ? "" : `${trimmed}/`;
}

export function resolveP4bStaticRoute(
  pathname: string,
  basePath: string,
): P4bStaticRouteResolution {
  const normalizedBase = normalizedBasePath(basePath);
  const absoluteBase = `/${normalizedBase}`;
  if (!pathname.startsWith(absoluteBase)) return { kind: "not-dossier" };
  const relative = pathname.slice(absoluteBase.length);
  if (relative !== "ccsolver" && !relative.startsWith("ccsolver/")) {
    return { kind: "not-dossier" };
  }
  const exact = P4B_STATIC_DOCUMENTS[relative as keyof typeof P4B_STATIC_DOCUMENTS];
  if (exact !== undefined) return { kind: "document", documentPath: exact };
  const withSlash = `${relative}/`;
  if (withSlash in P4B_STATIC_DOCUMENTS) {
    return { kind: "redirect", location: `${absoluteBase}${withSlash}` };
  }
  return { kind: "dossier-not-found" };
}

/**
 * Inline before the player bundle in the root 404 document. Known dossier
 * paths get their directory URL; unknown dossier paths stop before the player
 * boot and render a bounded, noindex static response. Other SPA URLs fall
 * through unchanged.
 */
export function createP4bStaticFallbackScript(): string {
  return `(()=>{const p=location.pathname;const known=["/ccsolver","/ccsolver/levels/cclp1/001-key-pyramid"];const hit=known.find((suffix)=>p.endsWith(suffix));if(hit!==undefined){location.replace(p+"/"+location.search+location.hash);return}const marker="/ccsolver/";const at=p.indexOf(marker);if(at<0&& !p.endsWith("/ccsolver"))return;document.open();document.write(${JSON.stringify([
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<meta name=\"robots\" content=\"noindex,nofollow\"><title>Dossier not found</title>",
    "<style>body{max-width:48rem;margin:4rem auto;padding:0 1.25rem;font:1rem/1.6 system-ui,sans-serif;color:#17202a;background:#f7f4ec}a{color:#174f78}</style>",
    "</head><body><main><h1>Dossier not found</h1><p>This URL is not a published CCSolver review route.</p>",
    "<p><a href=\"./\">Open the dossier index</a></p></main></body></html>",
  ].join(""))});document.close()})();`;
}
