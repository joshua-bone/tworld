import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  alignSemanticEvents,
  buildStrategyPortfolio,
} from "@tworld/ccsolver/alignment";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import type { SolverCausalEventV1 } from "@tworld/ccsolver/events";
import type {
  KeyPyramidP5RouteEventV1,
  KeyPyramidP5RouteV1,
} from "../p5-review/buildKeyPyramidP5Route";
import {
  assertP6aInputsUnchanged,
  loadVerifiedP6aInputs,
} from "./checkedP6aInputs";
import {
  buildKeyPyramidP6aTargetEvidence,
  primaryCausalEventForRouteEvent,
  type KeyPyramidP6aTargetEvidence,
} from "./buildKeyPyramidP6aCausalEvidence";
import {
  renderP6aReviewPage,
  type P6aReviewPageModel,
  type P6aReviewSubgoal,
} from "./p6aReviewPage";

export const P6A_CHECKED_OUTPUT_ROOT = "ccsolver/fixtures/golden/p6a/cclp1-001" as const;
export const P6A_LEVEL_ROUTE = "dev/ccsolver/levels/cclp1/001-key-pyramid/causal-alignment" as const;
export const P6A_TERMINAL_TRIGGER_TICK_HEADING = "Terminal trigger tick" as const;

const encoder = new TextEncoder();

function progress(stage: string): void {
  if (process.env.TWORLD_P6A_PROGRESS === "1") {
    process.stderr.write(`[p6a:build] ${stage}\n`);
  }
}

export type P6aReviewMediaType =
  | "application/json"
  | "text/html"
  | "text/markdown";

export type P6aReviewOutput = {
  readonly path: string;
  readonly mediaType: P6aReviewMediaType;
  readonly content: Uint8Array;
};

export type P6aReviewBuild = {
  readonly checkedOutputs: readonly P6aReviewOutput[];
  readonly distOutputs: readonly P6aReviewOutput[];
  readonly sourceAudit: {
    readonly checkedP5ManifestPath: string;
    readonly checkedP4bManifestPath: string;
    readonly checkedP5FilesDeclared: number;
    readonly checkedP5FilesVerified: number;
    readonly checkedP4bFilesRead: number;
    readonly checkedP4bP5ManifestBindingMatched: true;
    readonly checkedP5Mutations: 0;
    readonly checkedP4bInputsHeldByteStable: true;
    readonly donorReplayReads: 0;
  };
};

type PrimaryMilestone = {
  readonly routeEvent: KeyPyramidP5RouteEventV1;
  readonly ms: SolverCausalEventV1;
  readonly lynx: SolverCausalEventV1;
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

function sorted(outputs: readonly P6aReviewOutput[]): readonly P6aReviewOutput[] {
  const paths = new Set<string>();
  for (const output of outputs) {
    if (
      paths.has(output.path)
      || output.path.startsWith("/")
      || output.path.includes("..")
      || output.path.includes("\\")
    ) {
      throw new Error(`P6A duplicate or unsafe output path: ${output.path}`);
    }
    paths.add(output.path);
  }
  return [...outputs].sort((left, right) => rawCompare(left.path, right.path));
}

function primaryMilestones(
  route: KeyPyramidP5RouteV1,
  ms: KeyPyramidP6aTargetEvidence,
  lynx: KeyPyramidP6aTargetEvidence,
): readonly PrimaryMilestone[] {
  return route.events.map((routeEvent) => {
    const left = primaryCausalEventForRouteEvent(ms.page.events, routeEvent);
    const right = primaryCausalEventForRouteEvent(lynx.page.events, routeEvent);
    if (
      left.source?.placementId === null
      || left.source?.placementId === undefined
      || left.source.placementId !== right.source?.placementId
    ) {
      throw new Error(`semantic milestone ${routeEvent.eventOrder} lacks paired placement authority`);
    }
    return { routeEvent, ms: left, lynx: right };
  });
}

function buildPairedAlignment(
  ms: KeyPyramidP6aTargetEvidence,
  lynx: KeyPyramidP6aTargetEvidence,
  milestones: readonly PrimaryMilestone[],
) {
  const semanticAlignment = alignSemanticEvents({
    alignmentVersion: 1,
    left: ms.page,
    right: lynx.page,
    limits: {
      maxEventsPerTrace: 1_024,
      maxMatrixCells: 1_100_000,
      maxMovementSpan: 4,
    },
  });
  const hardAnchors = milestones.map(({ routeEvent, ms: left, lynx: right }) => ({
    anchorOrder: routeEvent.eventOrder,
    milestoneKind: routeEvent.kind,
    semanticType: routeEvent.semanticType,
    basis: "stable-placement-authority" as const,
    leftPlacementId: left.source!.placementId!,
    rightPlacementId: right.source!.placementId!,
    leftSequence: left.sequence,
    rightSequence: right.sequence,
    leftNativeTick: left.boundary.nativeTick,
    rightNativeTick: right.boundary.nativeTick,
    occurrenceOrdinal: left.occurrenceOrdinal,
  }));
  const nativeTimingDifferences = hardAnchors.filter(
    ({ leftNativeTick, rightNativeTick }) => leftNativeTick !== rightNativeTick,
  ).length;
  if (
    hardAnchors.length !== 29
    || semanticAlignment.summary.divergentHardAnchors !== 0
    || semanticAlignment.summary.unmatchedHardAnchors !== 0
    || !semanticAlignment.summary.terminalAnchorsMatched
  ) {
    throw new Error("Key Pyramid causal journals did not produce a complete hard-anchor alignment");
  }
  return {
    alignmentType: "p6a-key-pyramid-causal-alignment" as const,
    alignmentVersion: 1 as const,
    caseId: "cclp1-001" as const,
    leftTarget: "ms" as const,
    rightTarget: "lynx" as const,
    status: "aligned" as const,
    overflow: null,
    firstCausalDivergence: null,
    hardAnchorsOrder: "route-event-order" as const,
    hardAnchors,
    summary: {
      ...semanticAlignment.summary,
      primaryMilestonesMatched: hardAnchors.length,
      nativeTimingDifferences,
      attributionGaps: milestones.filter(
        ({ ms: left, lynx: right }) => left.commandId === null || right.commandId === null,
      ).length,
    },
    capabilities: {
      hardMediumSoftAnchors: true,
      oneToManySpans: true,
      repeatedCoordinateOrdinals: true,
      coordinateOnlyHardAnchors: false,
      explicitDivergence: true,
    },
    semanticAlignment,
  };
}

function labelMilestones(
  milestones: readonly PrimaryMilestone[],
): ReadonlyMap<number, string> {
  const labels = new Map<number, string>();
  let chipOrdinal = 0;
  for (const { routeEvent } of milestones) {
    const color = routeEvent.semanticType.split("-").at(-1) ?? "colored";
    let label: string;
    switch (routeEvent.kind) {
      case "collect-key":
        label = `Collect the ${color} key`;
        break;
      case "collect-chip":
        chipOrdinal += 1;
        label = `Collect chip ${chipOrdinal} of 10`;
        break;
      case "open-door":
        label = `Open the ${color} door`;
        break;
      case "open-socket":
        label = "Open the chip socket";
        break;
      case "reach-exit":
        label = "Reach the exit";
        break;
    }
    labels.set(routeEvent.eventOrder, label);
  }
  return labels;
}

function pageModel(input: {
  readonly route: KeyPyramidP5RouteV1;
  readonly milestones: readonly PrimaryMilestone[];
  readonly alignment: ReturnType<typeof buildPairedAlignment>;
  readonly portfolio: ReturnType<typeof buildStrategyPortfolio>;
  readonly ms: KeyPyramidP6aTargetEvidence;
  readonly lynx: KeyPyramidP6aTargetEvidence;
}): P6aReviewPageModel {
  const labels = labelMilestones(input.milestones);
  const byOrder = new Map(input.milestones.map((milestone) => (
    [milestone.routeEvent.eventOrder, milestone] as const
  )));
  const subgoals: P6aReviewSubgoal[] = input.route.subgoals.map((subgoal, subgoalOrder) => ({
    subgoalOrder,
    title: subgoal.title,
    description: subgoal.description,
    milestones: subgoal.eventOrders.map((eventOrder) => {
      const milestone = byOrder.get(eventOrder);
      if (milestone === undefined) throw new Error(`missing causal milestone ${eventOrder}`);
      return {
        milestoneOrder: eventOrder,
        label: labels.get(eventOrder) ?? `Route milestone ${eventOrder + 1}`,
        kind: milestone.routeEvent.kind,
        coordinate: milestone.routeEvent.coordinate,
        ms: {
          nativeTick: milestone.ms.boundary.nativeTick,
          sequence: milestone.ms.sequence,
          attributed: milestone.ms.commandId !== null,
        },
        lynx: {
          nativeTick: milestone.lynx.boundary.nativeTick,
          sequence: milestone.lynx.sequence,
          attributed: milestone.lynx.commandId !== null,
        },
      };
    }),
  }));
  const family = input.portfolio.families[0]!;
  return {
    subgoals,
    milestoneCount: input.milestones.length,
    matchedHardAnchors: input.alignment.hardAnchors.length,
    nativeTimingDifferences: input.alignment.summary.nativeTimingDifferences,
    attributionGapCount: input.alignment.summary.attributionGaps,
    alignmentStatus: input.alignment.status,
    strategyLabel: family.planShape.replaceAll("-", " "),
    strategyResolution: family.resolution.replaceAll("-", " "),
    msEventCount: input.ms.journal.events.length,
    lynxEventCount: input.lynx.journal.events.length,
  };
}

function renderReviewMarkdown(input: {
  readonly alignment: ReturnType<typeof buildPairedAlignment>;
  readonly portfolio: ReturnType<typeof buildStrategyPortfolio>;
  readonly ms: KeyPyramidP6aTargetEvidence;
  readonly lynx: KeyPyramidP6aTargetEvidence;
  readonly checkedP5FilesVerified: number;
}): string {
  const family = input.portfolio.families[0]!;
  return [
    "# Key Pyramid P2B/P6A causal alignment",
    "",
    "## Result",
    "",
    `The checked route realized 29 placement-authoritative semantic milestones in both targets. ${input.alignment.summary.nativeTimingDifferences} milestones retain different native ticks; raw tick equality was never used as a hard anchor.`,
    "",
    `| Target | Retained events | ${P6A_TERMINAL_TRIGGER_TICK_HEADING} | Deterministic rerun | Checkpoint suffix | Observer parity |`,
    "|---|---:|---:|---|---|---|",
    `| MS | ${input.ms.journal.events.length} | ${input.ms.journal.terminal.nativeTick} | equal | equal | equal |`,
    `| Lynx | ${input.lynx.journal.events.length} | ${input.lynx.journal.terminal.nativeTick} | equal | equal | equal |`,
    "",
    "## Evidence boundary",
    "",
    `The generator digest-verified ${input.checkedP5FilesVerified} non-TWS checked P5 files. It read the canonical checked P4B manifest and compact review, then held both checked P4B input files byte-stable through composition. It never opened donor TWS bytes: the replay was rebuilt from the checked 162-step route. Causal capture was an explicit 1,024-event sidecar, remained complete, and its final semantic fingerprint and terminal result equal the checked P5 observer-disabled boundary.`,
    "",
    `The first strategy family is **${family.planShape.replaceAll("-", " ")}** with **${family.resolution.replaceAll("-", " ")}** status. Hard anchors use native semantic action authority and stable placement identity. Coordinates appear only as human context.`,
    "",
    "## Human review checkpoints",
    "",
    "1. Open each of the six subgoals and compare the paired MS/Lynx native tick for all 29 milestones.",
    "2. Confirm the resource collections, inventory effects, door/socket mutations, and terminal event appear in route order.",
    "3. Inspect any attribution-gap badge; an authoritative action without a command link is disclosed rather than inferred.",
    "4. Use the machine JSON for full event sequences, causal parents, occurrence ordinals, and alignment spans.",
    "5. Retain the paired/full-input/manual-assisted donor disclosure from P5; this evidence is not donor-blind.",
    "",
  ].join("\n");
}

async function outputReferences(
  outputs: readonly P6aReviewOutput[],
  sha256: WebCryptoSha256,
) {
  return Promise.all(outputs.map(async (output) => ({
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(output.content, sha256),
  })));
}

async function buildUncached(repositoryRoot: string): Promise<P6aReviewBuild> {
  const sha256 = new WebCryptoSha256();
  const source = await loadVerifiedP6aInputs(repositoryRoot, sha256);
  progress("checked inputs verified");
  const [ms, lynx] = await Promise.all([
    buildKeyPyramidP6aTargetEvidence({
      repositoryRoot,
      target: "ms",
      route: source.routes.ms,
      observerDisabledBaseline: source.observerDisabledBaselines.ms,
      sha256,
    }),
    buildKeyPyramidP6aTargetEvidence({
      repositoryRoot,
      target: "lynx",
      route: source.routes.lynx,
      observerDisabledBaseline: source.observerDisabledBaselines.lynx,
      sha256,
    }),
  ]);
  progress("target runtime proofs completed");
  const milestones = primaryMilestones(source.routes.ms, ms, lynx);
  progress("primary milestones bound");
  const alignment = buildPairedAlignment(ms, lynx, milestones);
  progress("semantic alignment completed");
  const portfolio = buildStrategyPortfolio({
    portfolioVersion: 1,
    portfolioId: "portfolio:key-pyramid:cross-ruleset",
    familyId: "strategy:key-pyramid:checked-route",
    title: "Checked Key Pyramid route",
    alignment: alignment.semanticAlignment,
    traceEvidence: {
      ms: "evidence:p2b:key-pyramid:ms",
      lynx: "evidence:p2b:key-pyramid:lynx",
    },
    dependencies: [{
      dependencyId: "dependency:key-pyramid:native-timing",
      kind: "timing",
      targetRulesets: ["ms", "lynx"],
      evidenceIds: ["evidence:p2b:key-pyramid:ms", "evidence:p2b:key-pyramid:lynx"],
    }],
  });
  const model = pageModel({
    route: source.routes.ms,
    milestones,
    alignment,
    portfolio,
    ms,
    lynx,
  });
  const reviewHtml = renderP6aReviewPage(model);
  const reviewMarkdown = renderReviewMarkdown({
    alignment,
    portfolio,
    ms,
    lynx,
    checkedP5FilesVerified: source.sourceAudit.checkedP5FilesVerified,
  });
  const withoutManifest = sorted([
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/alignment.json`,
      mediaType: "application/json",
      content: json(alignment),
    },
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/lynx/causal-journal.json`,
      mediaType: "application/json",
      content: json(lynx.journal),
    },
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/ms/causal-journal.json`,
      mediaType: "application/json",
      content: json(ms.journal),
    },
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/portfolio.json`,
      mediaType: "application/json",
      content: json(portfolio),
    },
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/review.html`,
      mediaType: "text/html",
      content: utf8(reviewHtml),
    },
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/review.md`,
      mediaType: "text/markdown",
      content: utf8(reviewMarkdown),
    },
  ] satisfies readonly P6aReviewOutput[]);
  const sourceAudit = {
    ...source.sourceAudit,
    checkedP5Mutations: 0 as const,
    checkedP4bInputsHeldByteStable: true as const,
  };
  const manifest = {
    manifestType: "p6a-key-pyramid-causal-review-manifest",
    manifestVersion: 1,
    caseId: "cclp1-001",
    reviewState: "unreviewed",
    route: `/${P6A_LEVEL_ROUTE}/`,
    counts: {
      targets: 2,
      subgoals: 6,
      primaryMilestones: 29,
      msEvents: ms.journal.events.length,
      lynxEvents: lynx.journal.events.length,
      hardAnchors: alignment.hardAnchors.length,
      nativeTimingDifferences: alignment.summary.nativeTimingDifferences,
    },
    proof: {
      causalCapture: "explicit-opt-in-1024",
      retention: "complete",
      deterministicRerun: true,
      checkpointRestoreSuffix: true,
      observerGameplayParity: true,
      observerParitySource: "checked-p5-final-boundary-observation",
      coordinateOnlyHardAnchors: false,
    },
    sourceAudit,
    filesOrder: "path",
    files: await outputReferences(withoutManifest, sha256),
  };
  const checkedOutputs = sorted([
    ...withoutManifest,
    {
      path: `${P6A_CHECKED_OUTPUT_ROOT}/manifest.json`,
      mediaType: "application/json",
      content: json(manifest),
    },
  ]);
  const distOutputs = sorted(checkedOutputs.map((output) => {
    const suffix = output.path.slice(`${P6A_CHECKED_OUTPUT_ROOT}/`.length);
    return {
      ...output,
      path: `${P6A_LEVEL_ROUTE}/${suffix === "review.html" ? "index.html" : suffix}`,
    };
  }));
  await assertP6aInputsUnchanged(repositoryRoot, source.baseline);
  progress("outputs composed and source baselines unchanged");
  return { checkedOutputs, distOutputs, sourceAudit };
}

const builds = new Map<string, Promise<P6aReviewBuild>>();

export function buildP6aReviewOutputs(repositoryRoot: string): Promise<P6aReviewBuild> {
  const key = repositoryRoot;
  const existing = builds.get(key);
  if (existing !== undefined) return existing;
  const built = buildUncached(repositoryRoot);
  builds.set(key, built);
  void built.catch(() => builds.delete(key));
  return built;
}
