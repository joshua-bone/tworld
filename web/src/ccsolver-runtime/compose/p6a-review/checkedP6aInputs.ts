import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJsonValue,
  type SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import type { KeyPyramidP5RouteV1 } from "../p5-review/buildKeyPyramidP5Route";

export const CHECKED_P5_ROOT = "ccsolver/fixtures/golden/p5/cclp1-001" as const;
export const CHECKED_P4B_ROOT = "ccsolver/fixtures/golden/p4b/cclp1-001" as const;

type DeclaredFile = {
  readonly path: string;
  readonly mediaType: string;
  readonly content: { readonly digest: string; readonly byteLength: number };
};

type BaselineEntry = {
  readonly path: string;
  readonly bytes: Uint8Array;
};

export type VerifiedP6aInputs = {
  readonly routes: Readonly<Record<"ms" | "lynx", KeyPyramidP5RouteV1>>;
  readonly observerDisabledBaselines: Readonly<Record<"ms" | "lynx", {
    readonly source: "checked-p5-final-boundary-observation";
    readonly semanticFingerprint: string;
    readonly terminal: Exclude<SolverTerminalResult, { readonly kind: "running" }>;
  }>>;
  readonly baseline: readonly BaselineEntry[];
  readonly sourceAudit: {
    readonly checkedP5ManifestPath: `${typeof CHECKED_P5_ROOT}/manifest.json`;
    readonly checkedP4bManifestPath: `${typeof CHECKED_P4B_ROOT}/manifest.json`;
    readonly checkedP5FilesDeclared: number;
    readonly checkedP5FilesVerified: number;
    readonly checkedP4bFilesRead: 2;
    readonly checkedP4bP5ManifestBindingMatched: true;
    readonly donorReplayReads: 0;
  };
};

function rawCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeCheckedPath(repositoryRoot: string, checkedRoot: string, path: string): string {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`P6A source path is unsafe: ${path}`);
  }
  const root = resolve(repositoryRoot, checkedRoot);
  const target = resolve(repositoryRoot, path);
  const inside = relative(root, target);
  if (inside.length === 0 || inside === ".." || inside.startsWith("../")) {
    throw new Error(`P6A source path escapes ${checkedRoot}: ${path}`);
  }
  return target;
}

async function readCanonicalJson(
  repositoryRoot: string,
  path: string,
): Promise<{ readonly bytes: Uint8Array; readonly value: Record<string, any> }> {
  const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
  const text = new TextDecoder().decode(bytes);
  const value: unknown = JSON.parse(text);
  if (canonicalizeJson(value as CanonicalJsonValue) !== text) {
    throw new Error(`checked JSON is not canonical: ${path}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`checked JSON root is not an object: ${path}`);
  }
  return { bytes, value: value as Record<string, any> };
}

async function verifyReference(
  bytes: Uint8Array,
  expected: DeclaredFile["content"],
  path: string,
  sha256: WebCryptoSha256,
): Promise<void> {
  const actual = await referenceSourceBytes(bytes, sha256);
  if (actual.digest !== expected.digest || actual.byteLength !== expected.byteLength) {
    throw new Error(`checked source bytes drifted: ${path}`);
  }
}

function assertRoute(route: Record<string, any>, target: "ms" | "lynx"): KeyPyramidP5RouteV1 {
  if (
    route.routeType !== "p5-key-pyramid-route"
    || route.routeVersion !== 1
    || route.target !== target
    || route.tileSteps?.length !== 162
    || route.events?.length !== 29
    || route.subgoals?.length !== 6
  ) {
    throw new Error(`${target} checked P5 route does not match the Key Pyramid vertical slice`);
  }
  return route as KeyPyramidP5RouteV1;
}

function parseCanonicalRecord(bytes: Uint8Array, path: string): Record<string, any> {
  const text = new TextDecoder().decode(bytes);
  const parsed: unknown = JSON.parse(text);
  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || canonicalizeJson(parsed as CanonicalJsonValue) !== text
  ) {
    throw new Error(`checked JSON is not a canonical object: ${path}`);
  }
  return parsed as Record<string, any>;
}

export async function loadVerifiedP6aInputs(
  repositoryRoot: string,
  sha256 = new WebCryptoSha256(),
): Promise<VerifiedP6aInputs> {
  const p5ManifestPath = `${CHECKED_P5_ROOT}/manifest.json` as const;
  const p4bManifestPath = `${CHECKED_P4B_ROOT}/manifest.json` as const;
  const [p5ManifestRead, p4bManifestRead, p4bReviewBytes] = await Promise.all([
    readCanonicalJson(repositoryRoot, p5ManifestPath),
    readCanonicalJson(repositoryRoot, p4bManifestPath),
    readFile(resolve(repositoryRoot, `${CHECKED_P4B_ROOT}/review.md`)).then(
      (bytes) => new Uint8Array(bytes),
    ),
  ]);
  const p5Manifest = p5ManifestRead.value;
  const p4bManifest = p4bManifestRead.value;
  if (
    p5Manifest.manifestType !== "p5-key-pyramid-review-manifest"
    || p5Manifest.caseId !== "cclp1-001"
    || !Array.isArray(p5Manifest.files)
  ) {
    throw new Error("checked P5 manifest does not describe Key Pyramid");
  }
  if (
    p4bManifest.manifestType !== "p4b-key-pyramid-dossier-manifest"
    || p4bManifest.caseId !== "cclp1-001"
    || p4bManifest.sourceAudit?.checkedP5ManifestPath !== p5ManifestPath
  ) {
    throw new Error("checked P4B manifest is not bound to the checked P5 dossier input");
  }
  const p4bP5Binding = p4bManifest.source?.checkedP5Manifest;
  if (
    p4bP5Binding?.path !== p5ManifestPath
    || typeof p4bP5Binding.content?.digest !== "string"
    || typeof p4bP5Binding.content?.byteLength !== "number"
  ) {
    throw new Error("checked P4B manifest lacks its exact checked P5 manifest binding");
  }
  const actualP5Manifest = await referenceSourceBytes(p5ManifestRead.bytes, sha256);
  if (
    p4bP5Binding.content.digest !== actualP5Manifest.digest
    || p4bP5Binding.content.byteLength !== actualP5Manifest.byteLength
  ) {
    throw new Error("checked P4B manifest has a stale P5 manifest binding");
  }

  const declared = (p5Manifest.files as DeclaredFile[]).slice().sort(
    (left, right) => rawCompare(left.path, right.path),
  );
  const baseline: BaselineEntry[] = [
    { path: p5ManifestPath, bytes: p5ManifestRead.bytes },
    { path: p4bManifestPath, bytes: p4bManifestRead.bytes },
    { path: `${CHECKED_P4B_ROOT}/review.md`, bytes: p4bReviewBytes },
  ];
  const routes = new Map<"ms" | "lynx", KeyPyramidP5RouteV1>();
  let checkedP5FilesVerified = 0;
  for (const file of declared) {
    if (!file.path.startsWith(`${CHECKED_P5_ROOT}/`)) {
      throw new Error(`checked P5 manifest path escapes its root: ${file.path}`);
    }
    // Donor TWS bytes are deliberately neither opened nor decoded. P6A
    // replays the checked route model through a fresh runtime instead.
    if (file.mediaType === "application/vnd.tworld.tws" || file.path.endsWith(".tws")) {
      continue;
    }
    const absolute = safeCheckedPath(repositoryRoot, CHECKED_P5_ROOT, file.path);
    const bytes = new Uint8Array(await readFile(absolute));
    await verifyReference(bytes, file.content, file.path, sha256);
    baseline.push({ path: file.path, bytes });
    checkedP5FilesVerified += 1;
    const routeTarget = file.path.endsWith("/ms/route.json")
      ? "ms"
      : file.path.endsWith("/lynx/route.json")
        ? "lynx"
        : null;
    if (routeTarget !== null) {
      const text = new TextDecoder().decode(bytes);
      const parsed: unknown = JSON.parse(text);
      if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
        throw new Error(`${routeTarget} checked route is not canonical JSON`);
      }
      routes.set(routeTarget, assertRoute(parsed as Record<string, any>, routeTarget));
    }
  }
  const ms = routes.get("ms");
  const lynx = routes.get("lynx");
  if (ms === undefined || lynx === undefined) {
    throw new Error("checked P5 manifest is missing one or both Key Pyramid routes");
  }
  for (let index = 0; index < ms.events.length; index += 1) {
    const left = ms.events[index];
    const right = lynx.events[index];
    if (
      left === undefined
      || right === undefined
      || left.eventOrder !== right.eventOrder
      || left.kind !== right.kind
      || left.placementId !== right.placementId
      || left.afterStepOrder !== right.afterStepOrder
    ) {
      throw new Error(`checked P5 routes disagree at semantic milestone ${index}`);
    }
  }
  const observerDisabledBaselines = Object.fromEntries(
    (["ms", "lynx"] as const).map((target) => {
      const witnessPath = `${CHECKED_P5_ROOT}/${target}/execution-witness.json`;
      const witnessEntry = baseline.find(({ path }) => path === witnessPath);
      if (witnessEntry === undefined) throw new Error(`${target} checked P5 witness is missing`);
      const witness = parseCanonicalRecord(witnessEntry.bytes, witnessPath);
      const supportPath = witness.boundaries?.at(-1)?.support?.path;
      if (typeof supportPath !== "string") {
        throw new Error(`${target} checked P5 witness lacks its final boundary support`);
      }
      const boundaryEntry = baseline.find(({ path }) => path === supportPath);
      if (boundaryEntry === undefined) {
        throw new Error(`${target} checked P5 final boundary support is not verified`);
      }
      const boundary = parseCanonicalRecord(boundaryEntry.bytes, supportPath);
      const semanticFingerprint = boundary.observation?.fingerprints?.semantic;
      const terminal = boundary.observation?.terminal;
      if (
        typeof semanticFingerprint !== "string"
        || terminal?.kind !== "won"
        || canonicalizeJson(terminal) !== canonicalizeJson(witness.terminal)
      ) {
        throw new Error(`${target} checked P5 final observer-disabled baseline is invalid`);
      }
      return [target, {
        source: "checked-p5-final-boundary-observation" as const,
        semanticFingerprint,
        terminal: terminal as Exclude<SolverTerminalResult, { readonly kind: "running" }>,
      }];
    }),
  ) as VerifiedP6aInputs["observerDisabledBaselines"];
  return {
    routes: { ms, lynx },
    observerDisabledBaselines,
    baseline: baseline.sort((left, right) => rawCompare(left.path, right.path)),
    sourceAudit: {
      checkedP5ManifestPath: p5ManifestPath,
      checkedP4bManifestPath: p4bManifestPath,
      checkedP5FilesDeclared: declared.length,
      checkedP5FilesVerified,
      // P4B has no independent trusted digest manifest for these two checked
      // inputs. Their authority is canonical/structural reading plus the
      // build-level byte-stability assertion, not digest verification.
      checkedP4bFilesRead: 2,
      checkedP4bP5ManifestBindingMatched: true,
      donorReplayReads: 0,
    },
  };
}

export async function assertP6aInputsUnchanged(
  repositoryRoot: string,
  baseline: readonly BaselineEntry[],
): Promise<void> {
  for (const entry of baseline) {
    const current = new Uint8Array(await readFile(resolve(repositoryRoot, entry.path)));
    if (
      current.byteLength !== entry.bytes.byteLength
      || !current.every((byte, index) => byte === entry.bytes[index])
    ) {
      throw new Error(`checked P5/P4B baseline mutated during P6A composition: ${entry.path}`);
    }
  }
}
