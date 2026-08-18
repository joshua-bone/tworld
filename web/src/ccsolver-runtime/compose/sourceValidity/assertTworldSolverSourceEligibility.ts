import {
  analyzeTworldLegacySourceValidity,
  type TworldLegacySourceValidityReportV1,
} from "./analyzeTworldLegacySourceValidity";
import {
  assertTworldSolverSourceScope,
  type AnalyzeTworldSolverSourceScopeInput,
  type TworldSolverSourceScopeReportV1,
} from "./analyzeTworldSolverSourceScope";

export class TworldSolverSourceValidityError extends Error {
  override readonly name = "TworldSolverSourceValidityError";
  readonly code = "solver-source.invalid-layout" as const;

  constructor(readonly report: TworldLegacySourceValidityReportV1) {
    const first = report.issues[0];
    super(first === undefined
      ? `source is invalid under ${report.policyRevision}`
      : `source has invalid ${first.reason} at z ${first.z}, x ${first.x}, y ${first.y}`);
  }
}

export interface TworldSolverSourceEligibility {
  readonly sourceScope: TworldSolverSourceScopeReportV1;
  readonly legacyValidity: TworldLegacySourceValidityReportV1;
}

/**
 * Enforces the complete CCSolver source admission policy in deliberate order.
 * Expanded Tile World elements own codes 0x70..0x75 even when their placement
 * would also violate the legacy DAT cell-shape rules.
 */
export function assertTworldSolverSourceEligibility(
  input: AnalyzeTworldSolverSourceScopeInput,
): TworldSolverSourceEligibility {
  const sourceScope = assertTworldSolverSourceScope(input);
  const legacyValidity = analyzeTworldLegacySourceValidity(input);
  if (legacyValidity.status !== "valid") {
    throw new TworldSolverSourceValidityError(legacyValidity);
  }
  return { sourceScope, legacyValidity };
}
