import {
  verifyLevelFactsIdentities,
  verifyLevelFactsSourceBytes,
} from "@tworld/ccsolver/application";
import type { RulesetTargetV1 } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { TworldLevelFactsBundle } from "../impl/buildTworldLevelFacts";
import type { ProjectedTworldLevel } from "../impl/tworldLevelProjection";

interface VerifiedProjectionInput<TProjected extends ProjectedTworldLevel> {
  readonly factsBundle: TworldLevelFactsBundle;
  readonly target: RulesetTargetV1;
  readonly targetLabel: string;
  readonly catalogId: string;
  readonly project: (input: {
    readonly catalogRevision: string;
    readonly containerBytes: Uint8Array;
    readonly loaded: {
      readonly levelData: Uint8Array;
      readonly layerData: readonly Uint8Array[];
    };
  }) => TProjected;
}

function catalogRevisionForFacts(
  factsBundle: TworldLevelFactsBundle,
  expectedCatalogId: string,
  targetLabel: string,
): string {
  const revisions = new Set<string>();
  for (const placement of factsBundle.facts.payload.placements) {
    if (placement.sourceElement.catalogId !== expectedCatalogId) {
      throw new Error(`${targetLabel} level facts use an unexpected source catalog`);
    }
    revisions.add(placement.sourceElement.catalogRevision);
  }
  if (revisions.size !== 1) {
    throw new Error(`${targetLabel} level facts must use exactly one catalog revision`);
  }
  const revision = revisions.values().next().value;
  if (revision === undefined || revision.length === 0 || revision.includes("\r")) {
    throw new Error(`${targetLabel} level facts use an invalid catalog revision`);
  }
  return revision;
}

function assertSourceMemberCoordinates(
  factsBundle: TworldLevelFactsBundle,
  targetLabel: string,
): void {
  const members = factsBundle.facts.payload.provenance.occurrence.members;
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!;
    if (
      member.ordinal !== index
      || member.role !== (index === 0 ? "level" : "layer")
      || member.z !== index
    ) {
      throw new Error(`${targetLabel} level facts use invalid source member coordinates`);
    }
  }
}

export async function projectVerifiedTworldLevelFacts<
  TProjected extends ProjectedTworldLevel,
>(
  input: VerifiedProjectionInput<TProjected>,
  sha256: Sha256Port,
): Promise<TProjected> {
  if (input.factsBundle.facts.payload.target !== input.target) {
    throw new Error(`Tile World ${input.targetLabel} topology evidence requires ${input.targetLabel} facts`);
  }
  await verifyLevelFactsIdentities(input.factsBundle.facts, sha256);
  await verifyLevelFactsSourceBytes(
    input.factsBundle.facts,
    input.factsBundle.sourceBytes,
    sha256,
  );
  assertSourceMemberCoordinates(input.factsBundle, input.targetLabel);
  const catalogRevision = catalogRevisionForFacts(
    input.factsBundle,
    input.catalogId,
    input.targetLabel,
  );
  const members = input.factsBundle.sourceBytes.members;
  const levelData = members[0];
  if (levelData === undefined) {
    throw new Error(`${input.targetLabel} level facts have no primary source member`);
  }
  return input.project({
    catalogRevision,
    containerBytes: input.factsBundle.sourceBytes.container,
    loaded: { levelData, layerData: members },
  });
}
