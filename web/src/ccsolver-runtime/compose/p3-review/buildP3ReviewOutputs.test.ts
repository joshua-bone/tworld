import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { buildP3ReviewOutputs } from "./buildP3ReviewOutputs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

const RED_KEY_PLACEMENT =
  "placement:sha256:d00e6d868291293c03d17bf6908414aaf16f4335d5b1cd46aebe8b77b9dcfec6";
const BLUE_KEY_PLACEMENT =
  "placement:sha256:a086d1108843a67ee7cc7ba9f9d16c22b023b05f396406d3d9950601cf1de132";
const EXIT_PLACEMENT =
  "placement:sha256:d383dda76f9ee238c0b972626e9be47bae95a383dc2afb9a520373548faf5879";
const SOCKET_PLACEMENT =
  "placement:sha256:dbebc2e26f982d92d6630a8af7dca8d0b361718b44b9ccb5f18967898e2ee406";

describe("checked P3 Key Pyramid review outputs", () => {
  it("builds exactly four canonical target packets and one compact paired review", async () => {
    const outputs = await buildP3ReviewOutputs(repositoryRoot);

    expect(outputs.map(({ path }) => path)).toEqual([
      "ccsolver/fixtures/golden/p3/cclp1-001/lynx/red-key-witness.json",
      "ccsolver/fixtures/golden/p3/cclp1-001/lynx/terminal-plan.json",
      "ccsolver/fixtures/golden/p3/cclp1-001/ms/red-key-witness.json",
      "ccsolver/fixtures/golden/p3/cclp1-001/ms/terminal-plan.json",
      "ccsolver/fixtures/golden/p3/cclp1-001/review.md",
    ]);

    for (const output of outputs.filter(({ mediaType }) => mediaType === "application/json")) {
      expect(canonicalizeJson(JSON.parse(output.content))).toBe(output.content);
    }
  }, 60_000);

  it("keeps the terminal theory conservative and the first leaf placement-bound", async () => {
    const outputs = await buildP3ReviewOutputs(repositoryRoot);
    const plans = outputs
      .filter(({ path }) => path.endsWith("terminal-plan.json"))
      .map(({ content }) => JSON.parse(content) as Record<string, any>);

    expect(plans.map(({ target }) => target).sort()).toEqual(["lynx", "ms"]);
    for (const plan of plans) {
      expect(plan).toMatchObject({
        previewType: "p3a-terminal-plan-review",
        previewVersion: 1,
        caseId: "cclp1-001",
        target: expect.stringMatching(/^(?:lynx|ms)$/u),
        source: {
          occurrenceId: "tworld:cclp1:001",
          normalizedGameplayDigest:
            "sha256:aa69eb1de0ee692a272820c1c67c0d86371856506cfdb1827ab2bf04e8ec8f4e",
        },
        wholePlan: {
          status: "unresolved",
          reason: "p1-candidate-evidence-does-not-prove-dynamic-or-joint-reachability",
        },
        terminalTheory: {
          exit: { placementId: EXIT_PLACEMENT, coordinate: { x: 15, y: 7, z: 0 } },
          socket: { placementId: SOCKET_PLACEMENT, coordinate: { x: 15, y: 8, z: 0 } },
          requiredChipCount: 10,
        },
        selectedFirstSubgoal: {
          kind: "collect-placement",
          placementId: RED_KEY_PLACEMENT,
          resourceType: "cc1:key-red",
          coordinate: { x: 16, y: 19, z: 0 },
          selectionStatus: "selected-safe-candidate-not-uniquely-required",
        },
      });
      expect(plan.terminalTheory.chipPlacements).toHaveLength(10);
      expect(new Set(plan.terminalTheory.chipPlacements.map(
        ({ placementId }: { placementId: string }) => placementId,
      )).size).toBe(10);
      expect(plan.retainedAlternatives).toContainEqual(expect.objectContaining({
        placementId: BLUE_KEY_PLACEMENT,
        resourceType: "cc1:key-blue",
        coordinate: { x: 14, y: 19, z: 0 },
      }));
      expect(plan.planning.expandedPlans[0].status).toBe("unresolved");
      expect(plan.witnessLeaf).toMatchObject({
        reviewType: "p3b-selected-segment-review",
        reviewVersion: 1,
        status: "candidate-for-contextual-verification",
        parentPlan: { content: plan.content, status: "unresolved" },
        verificationScope: {
          kind: "selected-segment-only",
          verificationDoesNotUpgradeParent: true,
        },
        content: { digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) },
        selectedStep: {
          operatorId: expect.stringContaining("collect-adjacent-red-key"),
          achieves: { sourcePlacementId: RED_KEY_PLACEMENT },
        },
      });
      expect(plan.witnessLeaf).not.toHaveProperty("planning");
      expect(plan.witnessLeaf.segment.startStepOrder).toBe(
        plan.witnessLeaf.selectedStep.stepOrder,
      );
      expect(plan.witnessLeaf.segment.endStepOrder).toBe(
        plan.witnessLeaf.selectedStep.stepOrder,
      );
      expect(plan.staticEvidence.unknownCount).toBe(0);
      expect(plan.staticEvidence.nonPlayerActorCount).toBe(0);
    }

    expect(plans[0]!.terminalTheory).toEqual(plans[1]!.terminalTheory);
    expect(plans[0]!.selectedFirstSubgoal).toEqual(plans[1]!.selectedFirstSubgoal);
  }, 60_000);

  it("proves the fixed-seed red-key contract with exact target-native cadence", async () => {
    const outputs = await buildP3ReviewOutputs(repositoryRoot);
    const witnesses = outputs
      .filter(({ path }) => path.endsWith("red-key-witness.json"))
      .map(({ content }) => JSON.parse(content) as Record<string, any>);
    const ms = witnesses.find(({ target }) => target === "ms")!;
    const lynx = witnesses.find(({ target }) => target === "lynx")!;

    for (const witness of witnesses) {
      expect(witness).toMatchObject({
        previewType: "p3b-contextual-witness-review",
        previewVersion: 1,
        caseId: "cclp1-001",
        source: {
          randomSeed: 0,
          randomSeedSemantics: "manual-fixed-zero-donor-independent",
          replay: null,
        },
        subgoal: {
          kind: "collect-placement",
          placementId: RED_KEY_PLACEMENT,
          resourceType: "cc1:key-red",
          amount: 1,
        },
        contractValidation: { status: "passed", firstFailure: null },
        entry: {
          nativeTick: -1,
          player: { coordinate: { x: 15, y: 19, z: 0 } },
          inventory: { "cc1:key-red": 0 },
          remainingRequirements: { "cc1:icchip": 10 },
          keyPlacementPresent: true,
          terminal: { kind: "running" },
        },
        stop: {
          player: {
            coordinate: { x: 16, y: 19, z: 0 },
            facing: "east",
            movement: "stationary",
            inputInfluence: "eligible",
          },
          inventory: { "cc1:key-red": 1 },
          remainingRequirements: { "cc1:icchip": 10 },
          keyPlacementPresent: false,
          terminal: { kind: "running" },
        },
        proof: {
          restoredExecutionEqualsUninterrupted: true,
          rebuiltPrefixEqualsEntry: true,
          croppedRenderUsedAsCorrectnessEvidence: false,
        },
        parentPlanStatus: "unresolved",
        verifiedLeafDoesNotUpgradeParent: true,
        planVerificationScope: {
          kind: "selected-segment-only",
          parentPlanStatus: "unresolved",
        },
        planEffectValidation: [{
          axis: "inventory",
          resourceType: "cc1:key-red",
          expectedDelta: 1,
          observedDelta: 1,
          passed: true,
        }],
        visualReview: {
          annotationBasis: "plan-intent-review-preview",
          observedFullRoute: false,
        },
      });
      expect(witness.plan.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(witness.entry.exactFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(witness.stop.exactFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(witness.delta.inventoryChanges).toEqual([
        { resourceType: "cc1:key-red", before: 0, after: 1 },
      ]);
      expect(witness.delta.remainingRequirementChanges).toEqual([]);
      expect(witness.renderViewport).toEqual({
        minimum: { x: 13, y: 16, z: 0 },
        maximum: { x: 17, y: 20, z: 0 },
      });
    }

    expect(ms.execution.decisions).toEqual([
      { decisionOrder: 0, kind: "manual-poll", inputCode: 8 },
    ]);
    expect(ms.stop.nativeTick).toBe(0);
    expect(ms.execution.maximumAdvanceTicks).toBe(1);
    expect(ms.execution.observedAfterAdvanceTicks).toBe(1);

    expect(lynx.execution.decisions).toEqual([
      { decisionOrder: 0, kind: "manual-poll", inputCode: 8 },
      { decisionOrder: 1, kind: "manual-poll", inputCode: 0 },
      { decisionOrder: 2, kind: "manual-poll", inputCode: 0 },
      { decisionOrder: 3, kind: "manual-poll", inputCode: 0 },
    ]);
    expect(lynx.stop.nativeTick).toBe(3);
    expect(lynx.execution.maximumAdvanceTicks).toBe(4);
    expect(lynx.execution.observedAfterAdvanceTicks).toBe(4);
    expect(lynx.execution.intermediateBoundaries.map(
      ({ nativeTick, contractSatisfied }: Record<string, any>) => ({ nativeTick, contractSatisfied }),
    )).toEqual([
      { nativeTick: 0, contractSatisfied: false },
      { nativeTick: 1, contractSatisfied: false },
      { nativeTick: 2, contractSatisfied: false },
    ]);
  }, 60_000);

  it("contains no replay/donor source and binds each witness to its exact plan", async () => {
    const outputs = await buildP3ReviewOutputs(repositoryRoot);
    const all = outputs.map(({ content }) => content).join("\n");
    expect(all).not.toContain(".tws");
    expect(all).not.toContain("save/");
    expect(all).not.toContain(
      "2ace452b2857b9a9a74b3895c50396e4885641a9fbf2e19b0667d4fb75bde12f",
    );
    expect(all).not.toContain(
      "5bda2f73f3be57d93761aa891a361f57c71f34be03fc364a3f718b9b3339c109",
    );

    for (const target of ["ms", "lynx"] as const) {
      const planOutput = outputs.find(({ path }) => path.endsWith(`${target}/terminal-plan.json`))!;
      const witnessOutput = outputs.find(({ path }) => path.endsWith(`${target}/red-key-witness.json`))!;
      const plan = JSON.parse(planOutput.content) as Record<string, any>;
      const witness = JSON.parse(witnessOutput.content) as Record<string, any>;
      expect(witness.levelFacts).toEqual(plan.artifacts.levelFacts);
      expect(witness.plan).toEqual(plan.content);
      expect(witness.witnessLeaf).toEqual(plan.witnessLeaf.content);
      expect(witness.selectedSegment).toEqual(plan.witnessLeaf.segment);
      expect(witness.witness.planVerificationScope).toEqual(witness.planVerificationScope);
      expect(witness.witness.planEffectValidation).toEqual(witness.planEffectValidation);
      expect(witness.witness.planIntent).toEqual([plan.witnessLeaf.selectedStep]);
    }

    const review = outputs.find(({ path }) => path.endsWith("review.md"))!.content;
    expect(review).toContain("Parent theory:");
    expect(review).toContain("Contextual leaf segment:");
    expect(review).toContain("Verification scope: `selected-segment-only`");
    expect(review).toContain("Plan effect: red-key inventory expected +1, observed +1, passed.");
    expect(review).toContain("does **not** upgrade the unresolved parent plan");
    expect(review).toContain("not a claim that a full exit route was observed");
  }, 60_000);
});
