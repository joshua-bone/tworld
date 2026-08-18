import { resolve } from "node:path";
import {
  canonicalizeJson,
  type CanonicalJsonValue,
  type SolverCoordinate,
  type SolverRenderProjection,
} from "@tworld/ccsolver/domain";
import {
  buildKeyPyramidRedKeyWitness,
  type KeyPyramidRedKeyWitnessReviewV1,
} from "./buildKeyPyramidRedKeyWitness";
import {
  buildKeyPyramidTerminalPlan,
  type BuiltKeyPyramidTerminalPlan,
} from "./buildKeyPyramidTerminalPlan";
import {
  loadKeyPyramidRuntimeSource,
  loadKeyPyramidStaticSource,
} from "./keyPyramidP3Source";

export type P3ReviewOutput = {
  readonly path: string;
  readonly content: string;
  readonly mediaType: "application/json" | "text/markdown";
};

type TargetReview = {
  readonly terminal: BuiltKeyPyramidTerminalPlan;
  readonly witness: KeyPyramidRedKeyWitnessReviewV1;
};

const outputCache = new Map<string, Promise<readonly P3ReviewOutput[]>>();

function coordinateKey({ x, y, z }: SolverCoordinate): string {
  return `${z}:${y}:${x}`;
}

function cellToken(
  witness: KeyPyramidRedKeyWitnessReviewV1,
  projection: SolverRenderProjection,
  playerCoordinate: SolverCoordinate | null,
  keyPlacementPresent: boolean,
  coordinate: SolverCoordinate,
): string {
  if (
    playerCoordinate !== null
    && coordinateKey(playerCoordinate) === coordinateKey(coordinate)
  ) {
    return "P";
  }
  const point = witness.visualReview.pointsOfInterest.find(
    (candidate) => coordinateKey(candidate.coordinate) === coordinateKey(coordinate),
  );
  if (point?.role === "selected-target" && keyPlacementPresent) return "R";
  if (point?.role === "retained-alternative") return "B";
  if (point?.role === "later-gate") return "D";
  const cell = projection.cells.find(
    (candidate) => coordinateKey(candidate.coordinate) === coordinateKey(coordinate),
  );
  const types = cell?.items.map(({ semanticType }) => semanticType) ?? [];
  if (types.some((type) => type.includes("wall"))) return "#";
  if (types.some((type) => type.includes("door-yellow"))) return "Y";
  if (types.some((type) => type.includes("hint"))) return "H";
  if (types.some((type) => type.includes("water"))) return "~";
  if (types.some((type) => type.includes("fire"))) return "^";
  if (types.some((type) => type.includes("force") || type.includes("ice"))) return ">";
  if (types.some((type) => type.includes("floor"))) return ".";
  return "?";
}

function renderAnnotatedSection(
  witness: KeyPyramidRedKeyWitnessReviewV1,
  phase: "entry" | "stop",
): string {
  const boundary = phase === "entry" ? witness.entry : witness.stop;
  const projection = phase === "entry"
    ? witness.visualReview.entryRender
    : witness.visualReview.stopRender;
  const { minimum, maximum } = witness.renderViewport;
  const lines = [
    `      x ${Array.from(
      { length: maximum.x - minimum.x + 1 },
      (_, index) => String(minimum.x + index).padStart(2, " "),
    ).join(" ")}`,
  ];
  for (let y = minimum.y; y <= maximum.y; y += 1) {
    const tokens: string[] = [];
    for (let x = minimum.x; x <= maximum.x; x += 1) {
      tokens.push(cellToken(
        witness,
        projection,
        boundary.player.coordinate,
        boundary.keyPlacementPresent,
        { x, y, z: minimum.z },
      ));
    }
    lines.push(`y ${String(y).padStart(2, " ")}  ${tokens.map((token) => token.padStart(2, " ")).join(" ")}`);
  }
  return ["```text", ...lines, "```"].join("\n");
}

function decisionsText(witness: KeyPyramidRedKeyWitnessReviewV1): string {
  return witness.execution.decisions.map((decision) => (
    `${decision.decisionOrder}:${decision.kind === "manual-poll" ? decision.inputCode : "replay"}`
  )).join(", ");
}

function renderTargetReview(review: TargetReview): string {
  const { packet } = review.terminal;
  const { witness } = review;
  const label = packet.target === "ms" ? "MS" : "Lynx";
  return [
    `## ${label}: adjacent red-key leaf`,
    "",
    `Parent theory: \`${packet.content.digest}\` (unresolved).`,
    `Contextual leaf segment: \`${packet.witnessLeaf.content.digest}\` (`
      + `candidate-for-contextual-verification; unresolved parent step ${packet.witnessLeaf.segment.startStepOrder}).`,
    "Verification scope: `selected-segment-only`; this result does not change the parent plan status.",
    `Plan effect: red-key inventory expected +${witness.planEffectValidation[0]?.expectedDelta ?? "?"}, `
      + `observed +${witness.planEffectValidation[0]?.observedDelta ?? "?"}, `
      + `${witness.planEffectValidation[0]?.passed === true ? "passed" : "failed"}.`,
    `Runtime result: **verified** at native tick ${witness.stop.nativeTick}; fixed-seed manual decisions \`${decisionsText(witness)}\`.`,
    "",
    "The arrow `P (15,19) -> R (16,19)` is a one-step plan-intent annotation for review. It is not a claim that a full exit route was observed.",
    "",
    `### Segment start — native tick ${witness.entry.nativeTick}`,
    "",
    renderAnnotatedSection(witness, "entry"),
    "",
    "### Segment end — verified stop boundary",
    "",
    renderAnnotatedSection(witness, "stop"),
    "",
    "Legend: `P` player, `R` selected red key, `B` retained blue-key alternative, `D` later red door, `Y` yellow door, `H` hint, `#` wall, `.` floor. The render is cropped for human review; contract predicates use the full observation.",
  ].join("\n");
}

function renderReviewMarkdown(ms: TargetReview, lynx: TargetReview): string {
  return [
    "# Key Pyramid P3 terminal-first review",
    "",
    "## Big-picture checkpoint",
    "",
    "P3A now has a content-addressed terminal-first parent theory for Key Pyramid. It works backward from the exit through the socket and ten exact chip placements, but remains deliberately **unresolved** because P1 does not prove dynamic terminal entry or joint route feasibility.",
    "",
    "P3B verifies one bounded child leaf in both rulesets: from the fixed manual seed-0 start, collect the placement-bound red key one cell east. This verified leaf does **not** upgrade the unresolved parent plan. P4A can later consume the included semantic renders and plan-intent annotations for richer overlays or animation.",
    "",
    "## Human review checkpoints",
    "",
    "1. Confirm the parent explanation is useful: exit at (15,7), socket at (15,8), ten exact chips, and an explicitly provisional red-door branch.",
    "2. Compare each annotated start/end crop below. The selected red key is immediate; the blue key remains visible as an equally immediate alternative.",
    "3. Check target-native cadence: MS reaches the stop after one decision; Lynx reaches the same semantic stop after east plus three neutral polls.",
    "4. Confirm the evidence boundary: this is one donor-independent leaf witness, not a whole-level solution or proof that the red-first branch is uniquely required.",
    "",
    "## Cross-ruleset result",
    "",
    "The exact terminal theory, selected placement, start state, and semantic stop state agree across MS and Lynx. The intentional difference is native movement cadence and therefore native tick/fingerprint history.",
    "",
    renderTargetReview(ms),
    "",
    renderTargetReview(lynx),
    "",
  ].join("\n");
}

async function buildTargetReview(
  repositoryRoot: string,
  target: "ms" | "lynx",
): Promise<TargetReview> {
  const [staticSource, runtimeSource] = await Promise.all([
    loadKeyPyramidStaticSource(repositoryRoot, target),
    loadKeyPyramidRuntimeSource(repositoryRoot, target),
  ]);
  const terminal = await buildKeyPyramidTerminalPlan(staticSource);
  const witness = await buildKeyPyramidRedKeyWitness(runtimeSource, terminal);
  return { terminal, witness };
}

async function buildUncached(repositoryRoot: string): Promise<readonly P3ReviewOutput[]> {
  const [ms, lynx] = await Promise.all([
    buildTargetReview(repositoryRoot, "ms"),
    buildTargetReview(repositoryRoot, "lynx"),
  ]);
  const json = (value: unknown): string => canonicalizeJson(
    value as CanonicalJsonValue,
  );
  return [
    {
      path: "ccsolver/fixtures/golden/p3/cclp1-001/lynx/red-key-witness.json",
      content: json(lynx.witness),
      mediaType: "application/json",
    },
    {
      path: "ccsolver/fixtures/golden/p3/cclp1-001/lynx/terminal-plan.json",
      content: json(lynx.terminal.packet),
      mediaType: "application/json",
    },
    {
      path: "ccsolver/fixtures/golden/p3/cclp1-001/ms/red-key-witness.json",
      content: json(ms.witness),
      mediaType: "application/json",
    },
    {
      path: "ccsolver/fixtures/golden/p3/cclp1-001/ms/terminal-plan.json",
      content: json(ms.terminal.packet),
      mediaType: "application/json",
    },
    {
      path: "ccsolver/fixtures/golden/p3/cclp1-001/review.md",
      content: renderReviewMarkdown(ms, lynx),
      mediaType: "text/markdown",
    },
  ];
}

export function buildP3ReviewOutputs(
  repositoryRoot: string,
): Promise<readonly P3ReviewOutput[]> {
  const key = resolve(repositoryRoot);
  const cached = outputCache.get(key);
  if (cached !== undefined) return cached;
  const building = buildUncached(key).catch((error: unknown) => {
    outputCache.delete(key);
    throw error;
  });
  outputCache.set(key, building);
  return building;
}
