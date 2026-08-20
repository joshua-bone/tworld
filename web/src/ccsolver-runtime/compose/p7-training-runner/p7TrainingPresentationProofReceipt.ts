import { execFile } from "node:child_process";
import { resolve } from "node:path";

export const P7_TRAINING_PRESENTATION_PROOF_SPEC =
  "scripts/ci/proof-specs/p7-presentation.json" as const;
export const P7_TRAINING_PRESENTATION_PROOF_RECEIPT =
  "scripts/ci/proof-receipts/p7-presentation.receipt.json" as const;
export const P7_TRAINING_PRESENTATION_PROOF_TIMEOUT_MS = 120_000;

interface P7TrainingPresentationProofDecision {
  readonly currentValid: boolean;
  readonly proofId: string;
}

export type P7TrainingPresentationProofVerifier = (input: {
  readonly repositoryRoot: string;
  readonly scriptPath: string;
  readonly specPath: string;
  readonly receiptPath: string;
}) => Promise<P7TrainingPresentationProofDecision>;

export const verifyP7TrainingPresentationProofReceipt:
P7TrainingPresentationProofVerifier = (input) => new Promise((resolveDecision, reject) => {
  execFile(
    process.execPath,
    [
      input.scriptPath,
      "verify",
      "--root", input.repositoryRoot,
      "--spec", input.specPath,
      "--receipt", input.receiptPath,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: P7_TRAINING_PRESENTATION_PROOF_TIMEOUT_MS,
      windowsHide: true,
    },
    (error, stdout) => {
      if (error !== null) {
        reject(new Error("P7 presentation proof receipt verification failed", { cause: error }));
        return;
      }
      let decision: unknown;
      try {
        decision = JSON.parse(stdout) as unknown;
      } catch (cause) {
        reject(new Error("P7 presentation proof receipt returned invalid output", { cause }));
        return;
      }
      if (
        decision === null
        || typeof decision !== "object"
        || (decision as Record<string, unknown>).proofId !== "p7-presentation"
        || typeof (decision as Record<string, unknown>).currentValid !== "boolean"
      ) {
        reject(new Error("P7 presentation proof receipt returned an invalid decision"));
        return;
      }
      resolveDecision(decision as P7TrainingPresentationProofDecision);
    },
  );
});

export async function assertP7TrainingPresentationProofReceiptCurrent(input: {
  readonly repositoryRoot: string;
  readonly verifier?: P7TrainingPresentationProofVerifier;
  readonly scriptPath?: string;
  readonly specPath?: string;
  readonly receiptPath?: string;
}): Promise<void> {
  const decision = await (input.verifier ?? verifyP7TrainingPresentationProofReceipt)({
    repositoryRoot: input.repositoryRoot,
    scriptPath: input.scriptPath ?? resolve(input.repositoryRoot, "scripts/ci/proof-receipt.mjs"),
    specPath: input.specPath ?? P7_TRAINING_PRESENTATION_PROOF_SPEC,
    receiptPath: input.receiptPath ?? P7_TRAINING_PRESENTATION_PROOF_RECEIPT,
  });
  if (!decision.currentValid || decision.proofId !== "p7-presentation") {
    throw new Error("P7 presentation proof receipt is not currentValid for the current source closure");
  }
}
