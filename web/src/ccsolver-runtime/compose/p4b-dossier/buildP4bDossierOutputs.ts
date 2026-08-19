import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import {
  CHECKED_P5_ROOT,
  loadVerifiedP5DossierInput,
  type P5ReadBytes,
  type VerifiedP5DossierInput,
} from "./checkedP5DossierInput";
import {
  P4B_DOSSIER_CSS,
  P4B_DOSSIER_JS,
  renderP4bDossierIndex,
  renderP4bKeyPyramidPage,
} from "./p4bDossierPage";
import {
  renderExactBoundaryPanelSvg,
  renderKeyPyramidSegmentSvg,
  renderKeyPyramidWholeLevelSvg,
} from "./p4bDossierVisuals";
import {
  bindP4bLegacyArtworkHref,
  createP4bLegacyArtworkSheet,
  type P4bArtworkTarget,
  type P4bLegacyArtworkSheet,
} from "./p4bLegacyArtwork";

export const P4B_CHECKED_OUTPUT_ROOT = "ccsolver/fixtures/golden/p4b/cclp1-001" as const;
export const P4B_DIST_ROOT = "dev/ccsolver" as const;
export const P4B_LEVEL_ROUTE = `${P4B_DIST_ROOT}/levels/cclp1/001-key-pyramid` as const;

const encoder = new TextEncoder();

export type P4bDossierMediaType =
  | "application/json"
  | "application/javascript"
  | "application/vnd.tworld.tws"
  | "image/png"
  | "image/svg+xml"
  | "text/css"
  | "text/html"
  | "text/markdown";

export type P4bDossierOutput = {
  readonly path: string;
  readonly mediaType: P4bDossierMediaType;
  readonly content: Uint8Array;
};

export type P4bDossierBuild = {
  readonly checkedOutputs: readonly P4bDossierOutput[];
  readonly distOutputs: readonly P4bDossierOutput[];
  readonly sourceAudit: VerifiedP5DossierInput["sourceAudit"];
};

function json(value: unknown): Uint8Array {
  return encoder.encode(canonicalizeJson(value as CanonicalJsonValue));
}

function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

function rawCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(outputs: readonly P4bDossierOutput[]): readonly P4bDossierOutput[] {
  const paths = new Set<string>();
  for (const output of outputs) {
    if (paths.has(output.path)) throw new Error(`P4B duplicate output path: ${output.path}`);
    if (output.path.startsWith("/") || output.path.includes("..") || output.path.includes("\\")) {
      throw new Error(`P4B unsafe output path: ${output.path}`);
    }
    paths.add(output.path);
  }
  return [...outputs].sort((left, right) => rawCompare(left.path, right.path));
}

async function digestHex(bytes: Uint8Array, sha256: WebCryptoSha256): Promise<string> {
  const digest = await sha256.digestBytes(bytes);
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function contentAddressedAsset(input: {
  readonly stem: string;
  readonly extension: string;
  readonly mediaType: P4bDossierMediaType;
  readonly content: Uint8Array;
  readonly sha256: WebCryptoSha256;
}): Promise<{ readonly output: P4bDossierOutput; readonly filename: string }> {
  const digest = await digestHex(input.content, input.sha256);
  const filename = `${input.stem}-${digest}.${input.extension}`;
  return {
    filename,
    output: {
      path: `${P4B_DIST_ROOT}/assets/${filename}`,
      mediaType: input.mediaType,
      content: input.content,
    },
  };
}

function p5DataPath(sourcePath: string): string {
  const prefix = `${CHECKED_P5_ROOT}/`;
  if (!sourcePath.startsWith(prefix)) {
    throw new Error(`P4B cannot publish non-P5 checked path: ${sourcePath}`);
  }
  return `${P4B_DIST_ROOT}/data/p5/${sourcePath.slice(prefix.length)}`;
}

async function outputReference(output: P4bDossierOutput, sha256: WebCryptoSha256) {
  return {
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(output.content, sha256),
  };
}

function renderCheckedReview(source: VerifiedP5DossierInput, distFileCount: number): string {
  const targetRows = source.targets.map((target) => {
    const trigger = target.terminalTriggerTick;
    const settled = target.traceSettledTerminalTick;
    return `| ${target.target.toUpperCase()} | 162 | 6 | 7 | ${trigger} | ${settled} | ${target.files.tws.content.digest} |`;
  });
  return [
    "# Key Pyramid P4B whole-level dossier",
    "",
    "## Big-picture checkpoint",
    "",
    "P4B turns the checked P5 proof into a static-first human review surface. Machine verification is complete; human review remains `unreviewed` until a person checks the paired artwork maps, all 12 cropped and numbered route segments, and all 24 exact boundary records.",
    "",
    "## Evidence boundary",
    "",
    `P4B verified all ${source.sourceAudit.checkedP5FilesVerified} files listed by \`${source.manifestPath}\` by exact byte length and SHA-256 before composition. It read no P1 or P3 file and ran no engine. Gameplay evidence comes only from checked P5 bytes; presentation artwork is digest-bound from \`res/tiles.bmp\` and \`res/atiles.bmp\`, with expanded artwork excluded. The full route line is plan intent; observed evidence is restricted to exact boundary captures.`,
    "",
    "| Target | Route steps | Capsules | Unique boundaries | Trigger tick | Trace-settled tick | Complete TWS digest |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...targetRows,
    "",
    "## Human review checkpoints",
    "",
    "1. Compare both 32×32 initial maps rendered with their corresponding standard MS/Lynx artwork and evidence overlays.",
    "2. Use the target tabs and six-step navigator; each cropped segment shows its complete plan-intent line and local ordered visits.",
    "3. Review six adjacent start/end pairs for MS and six for Lynx; each pair is an exact same-run join.",
    "4. Check the literal cell stacks, remaining-chip counts, resource/gate route events, socket, and won exit boundary.",
    "5. Confirm the MS 644/644 and Lynx 647/660 trigger/trace-settlement distinction.",
    "6. Download both complete TWS files and follow their digests to the checked certificate/report bytes.",
    "7. Retain the paired/full-input/manual-assisted donor disclosure; this is not donor-blind.",
    "",
    `The generated static bundle contains ${distFileCount} bounded files and uses relative links for both root and repository Pages bases. JavaScript is optional display enhancement only.`,
    "",
  ].join("\n");
}

export async function buildP4bDossierOutputs(
  repositoryRoot: string,
  options: {
    readonly readBytes?: P5ReadBytes;
    readonly readArtworkBytes?: P5ReadBytes;
    readonly sha256?: WebCryptoSha256;
  } = {},
): Promise<P4bDossierBuild> {
  const sha256 = options.sha256 ?? new WebCryptoSha256();
  const source = await loadVerifiedP5DossierInput(repositoryRoot, {
    readBytes: options.readBytes,
    sha256,
  });
  const cssAsset = await contentAddressedAsset({
    stem: "dossier",
    extension: "css",
    mediaType: "text/css",
    content: utf8(P4B_DOSSIER_CSS),
    sha256,
  });
  const jsAsset = await contentAddressedAsset({
    stem: "dossier-progressive",
    extension: "js",
    mediaType: "application/javascript",
    content: utf8(P4B_DOSSIER_JS),
    sha256,
  });
  const assetOutputs: P4bDossierOutput[] = [cssAsset.output, jsAsset.output];
  const artworkSheets = new Map<P4bArtworkTarget, P4bLegacyArtworkSheet>();
  const artworkAssets = new Map<P4bArtworkTarget, string>();
  const artworkSources = new Map<P4bArtworkTarget, {
    readonly sourcePath: "res/tiles.bmp" | "res/atiles.bmp";
    readonly sourceContent: Awaited<ReturnType<typeof referenceSourceBytes>>;
    readonly publishedContent: Awaited<ReturnType<typeof referenceSourceBytes>>;
  }>();
  const readArtworkBytes = options.readArtworkBytes ?? (async (path: string) => (
    new Uint8Array(await readFile(path))
  ));
  for (const artworkSource of [
    { target: "ms", sourcePath: "res/tiles.bmp" },
    { target: "lynx", sourcePath: "res/atiles.bmp" },
  ] as const) {
    const sourceBytes = await readArtworkBytes(resolve(repositoryRoot, artworkSource.sourcePath));
    const sheet = createP4bLegacyArtworkSheet({ ...artworkSource, bytes: sourceBytes });
    const asset = await contentAddressedAsset({
      stem: `standard-artwork-${artworkSource.target}`,
      extension: "png",
      mediaType: "image/png",
      content: sheet.pngBytes,
      sha256,
    });
    artworkSheets.set(artworkSource.target, sheet);
    artworkAssets.set(artworkSource.target, asset.filename);
    artworkSources.set(artworkSource.target, {
      sourcePath: artworkSource.sourcePath,
      sourceContent: await referenceSourceBytes(sourceBytes, sha256),
      publishedContent: await referenceSourceBytes(sheet.pngBytes, sha256),
    });
    assetOutputs.push(asset.output);
  }
  const fullMapSvgs = new Map<string, string>();
  const fullMapAssets = new Map<string, string>();
  const panelAssets = new Map<string, string>();
  const segmentSvgs = new Map<string, string>();
  const segmentAssets = new Map<string, string>();
  for (const target of source.targets) {
    const artworkSheet = artworkSheets.get(target.target);
    const artworkAssetName = artworkAssets.get(target.target);
    if (artworkSheet === undefined || artworkAssetName === undefined) {
      throw new Error(`${target.target} P4B standard artwork asset missing`);
    }
    const standaloneArtwork = bindP4bLegacyArtworkHref(artworkSheet, artworkAssetName);
    const embeddedArtwork = bindP4bLegacyArtworkHref(
      artworkSheet,
      `../../../assets/${artworkAssetName}`,
    );
    const fullMapSvg = renderKeyPyramidWholeLevelSvg(target, embeddedArtwork);
    const standaloneFullMapSvg = renderKeyPyramidWholeLevelSvg(target, standaloneArtwork);
    const fullMapAsset = await contentAddressedAsset({
      stem: `key-pyramid-${target.target}`,
      extension: "svg",
      mediaType: "image/svg+xml",
      content: utf8(standaloneFullMapSvg),
      sha256,
    });
    fullMapSvgs.set(target.target, fullMapSvg);
    fullMapAssets.set(target.target, fullMapAsset.filename);
    assetOutputs.push(fullMapAsset.output);
    for (let subgoalOrder = 0; subgoalOrder < 6; subgoalOrder += 1) {
      const key = `${target.target}:${subgoalOrder}`;
      const segmentSvg = renderKeyPyramidSegmentSvg(target, subgoalOrder, embeddedArtwork);
      const standaloneSegmentSvg = renderKeyPyramidSegmentSvg(
        target,
        subgoalOrder,
        standaloneArtwork,
      );
      const segmentAsset = await contentAddressedAsset({
        stem: `segment-${target.target}-${String(subgoalOrder + 1).padStart(2, "0")}`,
        extension: "svg",
        mediaType: "image/svg+xml",
        content: utf8(standaloneSegmentSvg),
        sha256,
      });
      segmentSvgs.set(key, segmentSvg);
      segmentAssets.set(key, segmentAsset.filename);
      assetOutputs.push(segmentAsset.output);
    }
    for (let boundaryOrder = 0; boundaryOrder < 7; boundaryOrder += 1) {
      const panelSvg = renderExactBoundaryPanelSvg(target, boundaryOrder, standaloneArtwork);
      const panelAsset = await contentAddressedAsset({
        stem: `boundary-${target.target}-${String(boundaryOrder).padStart(2, "0")}`,
        extension: "svg",
        mediaType: "image/svg+xml",
        content: utf8(panelSvg),
        sha256,
      });
      panelAssets.set(`${target.target}:${boundaryOrder}`, panelAsset.filename);
      assetOutputs.push(panelAsset.output);
    }
  }

  const dataOutputs: P4bDossierOutput[] = [{
    path: `${P4B_DIST_ROOT}/data/p5/manifest.json`,
    mediaType: "application/json",
    content: source.manifestBytes,
  }];
  for (const file of source.files) {
    dataOutputs.push({
      path: p5DataPath(file.path),
      mediaType: file.mediaType as P4bDossierMediaType,
      content: file.bytes,
    });
  }
  const twsDownloads = new Map<string, string>();
  const downloadOutputs: P4bDossierOutput[] = [];
  for (const target of source.targets) {
    const digest = target.files.tws.content.digest.slice("sha256:".length);
    const filename = `key-pyramid-${target.target}-${digest}.tws`;
    twsDownloads.set(target.target, filename);
    downloadOutputs.push({
      path: `${P4B_DIST_ROOT}/downloads/${filename}`,
      mediaType: "application/vnd.tworld.tws",
      content: target.files.tws.bytes,
    });
  }
  const routes = {
    routesType: "p4b-static-routes",
    routesVersion: 1,
    routes: [
      { route: "/dev/ccsolver/", document: `${P4B_DIST_ROOT}/index.html` },
      { route: "/dev/ccsolver/levels/cclp1/001-key-pyramid/", document: `${P4B_LEVEL_ROUTE}/index.html` },
    ],
    basePolicy: "relative-links-support-root-and-repository-pages",
    unknownDossierRoute: "noindex-static-404",
  } as const;
  const pageHtml = renderP4bKeyPyramidPage({
    source,
    cssAsset: cssAsset.filename,
    jsAsset: jsAsset.filename,
    fullMapSvgs,
    fullMapAssets,
    panelAssets,
    segmentSvgs,
    segmentAssets,
    twsDownloads,
  });
  const pageOutput: P4bDossierOutput = {
    path: `${P4B_LEVEL_ROUTE}/index.html`,
    mediaType: "text/html",
    content: utf8(pageHtml),
  };
  const initialDist = sorted([
    ...assetOutputs,
    ...dataOutputs,
    ...downloadOutputs,
    {
      path: `${P4B_DIST_ROOT}/index.html`,
      mediaType: "text/html",
      content: utf8(renderP4bDossierIndex({ cssAsset: cssAsset.filename })),
    },
    { path: `${P4B_DIST_ROOT}/routes.v1.json`, mediaType: "application/json", content: json(routes) },
    pageOutput,
  ]);
  const initialReferences = await Promise.all(initialDist.map((output) => outputReference(output, sha256)));
  const sourceManifestContent = await referenceSourceBytes(source.manifestBytes, sha256);
  const artworkReferences = (["ms", "lynx"] as const).map((target) => {
    const sourceReference = artworkSources.get(target);
    const assetName = artworkAssets.get(target);
    if (sourceReference === undefined || assetName === undefined) {
      throw new Error(`${target} P4B artwork provenance missing`);
    }
    return {
      target,
      source: {
        path: sourceReference.sourcePath,
        content: sourceReference.sourceContent,
      },
      published: {
        path: `${P4B_DIST_ROOT}/assets/${assetName}`,
        mediaType: "image/png",
        content: sourceReference.publishedContent,
      },
      role: "standard-runtime-artwork-presentation-only",
      expandedArtworkIncluded: false,
    } as const;
  });
  const bundleManifestValue = {
    manifestType: "p4b-static-dossier-bundle",
    manifestVersion: 1,
    reviewState: { status: "unreviewed", humanApproved: false },
    source: {
      checkedP5Manifest: { path: source.manifestPath, content: sourceManifestContent },
      checkedFilesDeclared: 32,
      checkedFilesVerified: 32,
      p1Reads: 0,
      p3Reads: 0,
      engineRuns: 0,
      gameplayEvidence: "checked-p5-only",
      artwork: artworkReferences,
    },
    counts: {
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      uniqueBoundaryPanels: 14,
      fullMapViews: 2,
      segmentRouteViews: 12,
      artworkAtlases: 2,
      filesExcludingManifest: initialDist.length,
    },
    routes: routes.routes,
    files: initialReferences,
  } as const;
  const bundleManifestOutput: P4bDossierOutput = {
    path: `${P4B_DIST_ROOT}/manifest.v1.json`,
    mediaType: "application/json",
    content: json(bundleManifestValue),
  };
  const distOutputs = sorted([...initialDist, bundleManifestOutput]);
  const distReferences = await Promise.all(distOutputs.map((output) => outputReference(output, sha256)));
  const checkedManifest = {
    manifestType: "p4b-key-pyramid-dossier-manifest",
    manifestVersion: 1,
    caseId: "cclp1-001",
    reviewState: { status: "unreviewed", humanApproved: false },
    sourceAudit: source.sourceAudit,
    source: {
      checkedP5Manifest: { path: source.manifestPath, content: sourceManifestContent },
      donorAvailability: "paired",
      donorExposure: "full-input",
      constructionMethod: "manual-assisted",
      donorBlind: false,
      generatedReplayBytesCopiedFromDonor: false,
      donorReplayInputReadByGenerator: false,
      gameplayEvidence: "checked-p5-only",
      artwork: artworkReferences,
    },
    evidencePolicy: {
      routeLine: "plan-intent-not-per-step-observed",
      observedWitness: "exact-captured-boundary-endpoints-only",
      staticTopologyDoesNotEstablishRuntimeCausality: true,
      rendererInventsNoTiles: true,
      artworkProjection: "standard-runtime-atlas-presentation-only",
      artworkDoesNotAlterSemanticStack: true,
      expandedArtworkIncluded: false,
    },
    counts: {
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      uniqueBoundaryPanels: 14,
      fullMapViews: 2,
      segmentRouteViews: 12,
      artworkAtlases: 2,
      distFiles: distOutputs.length,
    },
    targets: source.targets.map((target) => ({
      target: target.target,
      planStatus: "candidate",
      solveStatus: "solved-current",
      humanReviewStatus: "unreviewed",
      routeSteps: 162,
      subgoalCapsules: 6,
      uniqueBoundaries: 7,
      terminalTriggerTick: target.terminalTriggerTick,
      traceSettledTerminalTick: target.traceSettledTerminalTick,
      completeTws: {
        path: target.files.tws.path,
        mediaType: target.files.tws.mediaType,
        content: target.files.tws.content,
      },
    })),
    routes: routes.routes,
    files: distReferences,
  } as const;
  const review = renderCheckedReview(source, distOutputs.length);
  const checkedOutputs = sorted([
    {
      path: `${P4B_CHECKED_OUTPUT_ROOT}/manifest.json`,
      mediaType: "application/json",
      content: json(checkedManifest),
    },
    {
      path: `${P4B_CHECKED_OUTPUT_ROOT}/review.md`,
      mediaType: "text/markdown",
      content: utf8(review),
    },
  ]);
  return { checkedOutputs, distOutputs, sourceAudit: source.sourceAudit };
}
