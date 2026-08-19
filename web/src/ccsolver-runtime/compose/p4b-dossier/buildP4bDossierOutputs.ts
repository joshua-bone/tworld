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
  renderKeyPyramidWholeLevelSvg,
} from "./p4bDossierVisuals";

export const P4B_CHECKED_OUTPUT_ROOT = "ccsolver/fixtures/golden/p4b/cclp1-001" as const;
export const P4B_LEVEL_ROUTE = "ccsolver/levels/cclp1/001-key-pyramid" as const;

const encoder = new TextEncoder();

export type P4bDossierMediaType =
  | "application/json"
  | "application/javascript"
  | "application/vnd.tworld.tws"
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
      path: `ccsolver/assets/${filename}`,
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
  return `ccsolver/data/p5/${sourcePath.slice(prefix.length)}`;
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
    "P4B turns the checked P5 proof into a static-first human review surface. Machine verification is complete; human review remains `unreviewed` until a person checks the paired maps, all 12 target-specific subgoal capsules, and all 24 start/end panel instances.",
    "",
    "## Evidence boundary",
    "",
    `P4B verified all ${source.sourceAudit.checkedP5FilesVerified} files listed by \`${source.manifestPath}\` by exact byte length and SHA-256 before composition. It read no P1 or P3 file and ran no engine. The full route line is plan intent; observed evidence is restricted to exact boundary captures.`,
    "",
    "| Target | Route steps | Capsules | Unique boundaries | Trigger tick | Trace-settled tick | Complete TWS digest |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...targetRows,
    "",
    "## Human review checkpoints",
    "",
    "1. Compare both literal 32×32 initial maps and their evidence-basis legends.",
    "2. Review six adjacent start/end pairs for MS and six for Lynx; each pair is an exact same-run join.",
    "3. Check the literal cell stacks, remaining-chip counts, resource/gate route events, socket, and won exit boundary.",
    "4. Confirm the MS 644/644 and Lynx 647/660 trigger/trace-settlement distinction.",
    "5. Download both complete TWS files and follow their digests to the checked certificate/report bytes.",
    "6. Retain the paired/full-input/manual-assisted donor disclosure; this is not donor-blind.",
    "",
    `The generated static bundle contains ${distFileCount} bounded files and uses relative links for both root and repository Pages bases. JavaScript is optional display enhancement only.`,
    "",
  ].join("\n");
}

export async function buildP4bDossierOutputs(
  repositoryRoot: string,
  options: {
    readonly readBytes?: P5ReadBytes;
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
  const fullMapSvgs = new Map<string, string>();
  const fullMapAssets = new Map<string, string>();
  const panelAssets = new Map<string, string>();
  for (const target of source.targets) {
    const fullMapSvg = renderKeyPyramidWholeLevelSvg(target);
    const fullMapAsset = await contentAddressedAsset({
      stem: `key-pyramid-${target.target}`,
      extension: "svg",
      mediaType: "image/svg+xml",
      content: utf8(fullMapSvg),
      sha256,
    });
    fullMapSvgs.set(target.target, fullMapSvg);
    fullMapAssets.set(target.target, fullMapAsset.filename);
    assetOutputs.push(fullMapAsset.output);
    for (let boundaryOrder = 0; boundaryOrder < 7; boundaryOrder += 1) {
      const panelSvg = renderExactBoundaryPanelSvg(target, boundaryOrder);
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
    path: "ccsolver/data/p5/manifest.json",
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
      path: `ccsolver/downloads/${filename}`,
      mediaType: "application/vnd.tworld.tws",
      content: target.files.tws.bytes,
    });
  }
  const routes = {
    routesType: "p4b-static-routes",
    routesVersion: 1,
    routes: [
      { route: "/ccsolver/", document: "ccsolver/index.html" },
      { route: "/ccsolver/levels/cclp1/001-key-pyramid/", document: `${P4B_LEVEL_ROUTE}/index.html` },
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
    twsDownloads,
  }).replace(
    "<h2 id=\"checkpoint-title\">What can be human-checked here</h2>",
    "<h2 id=\"checkpoint-title\">What can be human-checked here</h2>"
      + "<p>Twelve target-specific capsules contain 24 exact start/end panel instances "
      + "backed by 14 unique checked boundary scenes.</p>",
  );
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
      path: "ccsolver/index.html",
      mediaType: "text/html",
      content: utf8(renderP4bDossierIndex({ cssAsset: cssAsset.filename })),
    },
    { path: "ccsolver/routes.v1.json", mediaType: "application/json", content: json(routes) },
    pageOutput,
  ]);
  const initialReferences = await Promise.all(initialDist.map((output) => outputReference(output, sha256)));
  const sourceManifestContent = await referenceSourceBytes(source.manifestBytes, sha256);
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
    },
    counts: {
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      uniqueBoundaryPanels: 14,
      fullMapViews: 2,
      filesExcludingManifest: initialDist.length,
    },
    routes: routes.routes,
    files: initialReferences,
  } as const;
  const bundleManifestOutput: P4bDossierOutput = {
    path: "ccsolver/manifest.v1.json",
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
    },
    evidencePolicy: {
      routeLine: "plan-intent-not-per-step-observed",
      observedWitness: "exact-captured-boundary-endpoints-only",
      staticTopologyDoesNotEstablishRuntimeCausality: true,
      rendererInventsNoTiles: true,
    },
    counts: {
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      uniqueBoundaryPanels: 14,
      fullMapViews: 2,
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
