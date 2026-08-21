export type Cclp1FoundationCanary = "stepping" | "ms-mouse";

export interface Cclp1FoundationSelection {
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly caseId: `case:sha256:${string}`;
  readonly normalizedGameplaySha256: string;
  readonly canaries: readonly Cclp1FoundationCanary[];
}

/**
 * The first visible P7B cohort is deliberately small, fixed, and real. The
 * first ten levels establish ordinary pack flow; 042 and 137 keep two known
 * replay-portability hazards from disappearing behind aggregate counts.
 */
export const CCLP1_FOUNDATION_COHORT = [
  { occurrenceId: "cclp1/001", levelNumber: 1, title: "Key Pyramid", caseId: "case:sha256:35751e31472d608d0285a1cbdb9966b0920e92da6a250a40de33b65c8976719f", normalizedGameplaySha256: "aa69eb1de0ee692a272820c1c67c0d86371856506cfdb1827ab2bf04e8ec8f4e", canaries: [] },
  { occurrenceId: "cclp1/002", levelNumber: 2, title: "Slip and Slide", caseId: "case:sha256:6ab62aebd5293b3d0a6d43b7d184bb8948fe1bf2890cd0eb38ceacc0434c6c96", normalizedGameplaySha256: "0fb3d7cfa105a3073e3a3d0eede7e82e940ffb4fa95831170ad9367b2c15bb49", canaries: [] },
  { occurrenceId: "cclp1/003", levelNumber: 3, title: "Present Company", caseId: "case:sha256:232e1d2ed8043562ca25a0d66406f991c631bb3b7162f2504176ea4eef2fd77f", normalizedGameplaySha256: "7b794e234d9cc39600306de7dcc1cbd243908353292c841d327beac9c76e7c90", canaries: [] },
  { occurrenceId: "cclp1/004", levelNumber: 4, title: "Block Party", caseId: "case:sha256:f60dfade7ad4e79319d83ac27f23cfb278d96b9e45faff2df4a4f185a0020058", normalizedGameplaySha256: "27526c966f4d5b32dd24b13f1a285cfdd55cd69f06b7064653c90ef58586fbac", canaries: [] },
  { occurrenceId: "cclp1/005", levelNumber: 5, title: "Facades", caseId: "case:sha256:5e9d3398b85d77354dd5336ed7e51b3d746a34bdfd2a4f2862919f8ca75183dd", normalizedGameplaySha256: "19a82a674bb70ed427535ffb08a786376f8e51260e88666842103d1b5969004b", canaries: [] },
  { occurrenceId: "cclp1/006", levelNumber: 6, title: "When Insects Attack", caseId: "case:sha256:0911aa6622bbc00fe743178a0011a444051625c5db95b0a8cbece126e4407e83", normalizedGameplaySha256: "7aeab2e51f4affcef105c16a576afc168e83d07c4cd558fa204e111810b54acd", canaries: [] },
  { occurrenceId: "cclp1/007", levelNumber: 7, title: "Under Pressure", caseId: "case:sha256:50ca1f7c6d966420bae8910a90b9ff29ec92f4f5b777b7771631680e678d50b9", normalizedGameplaySha256: "1d12b98f7cd36903e522e578b9adf64b3f9a54b93ad3b34e8f7e9e87f3f13778", canaries: [] },
  { occurrenceId: "cclp1/008", levelNumber: 8, title: "Switcheroo", caseId: "case:sha256:4b7ebe4b9209efe8d7d7fc149bf0889c3539e6d2e39036c116ba60921a78cbe8", normalizedGameplaySha256: "f114a1c23abf062a92d0cbe3142412eb4eee2db47d452ea9a1a89e8a619dca05", canaries: [] },
  { occurrenceId: "cclp1/009", levelNumber: 9, title: "Swept Away", caseId: "case:sha256:7d1636bee0b542fb0d47bf2dc5f93ba6ecbebfaafd07db795a05e2b1bb7e2ed7", normalizedGameplaySha256: "ac9fc929ad814ca1756c80912ff9748f3696647343abb487f7aa0bcf1cc21613", canaries: [] },
  { occurrenceId: "cclp1/010", levelNumber: 10, title: "Graduation", caseId: "case:sha256:3f7ae36356c77f196ccb3046fc88861562cf55e569c6a1b7a816e266fb38d4cf", normalizedGameplaySha256: "037a5c835ee71d56e50464f40cb62a46b6d2d07139fb391818b4e1376a95bb2b", canaries: [] },
  { occurrenceId: "cclp1/042", levelNumber: 42, title: "Mughfe", caseId: "case:sha256:0eba09050866b05aabe97daeb0e23a425e9b36d3ada494468aae186e2302514c", normalizedGameplaySha256: "b840ce689fcfb6bb335806f4093c5d62fa52a272661708600dd9b5771de79733", canaries: ["stepping"] },
  { occurrenceId: "cclp1/137", levelNumber: 137, title: "Thief Street", caseId: "case:sha256:392f5014020f5fac59a616464b2b7a2f5543bd4e0f15c1065abbea2c30c56bbe", normalizedGameplaySha256: "9992b52d6def2fa3a97841419fe421657b815b130786e50102dfa07c12ca34a1", canaries: ["ms-mouse"] },
] as const satisfies readonly Cclp1FoundationSelection[];

/** Hard bounds used by both the loader and processor; scope growth is a code change. */
export const CCLP1_FOUNDATION_LIMITS = {
  levelCount: 12,
  targetCount: 24,
  sourceFileCount: 5,
  maximumSelectedReplayBytes: 4_240,
  maximumDonorTicks: 20_196,
  replayTickSlackPerTarget: 40,
  maximumAdvanceTicks: 21_156,
  maximumRetainedEventsPerTarget: 131_072,
  maximumEventStreamCanonicalBytes: 32 * 1024 * 1024,
} as const;

export const CCLP1_FOUNDATION_SOURCE_PATHS = [
  "data/CCLP1.dat",
  "sets/CCLP1-MS.dac",
  "sets/CCLP1-Lynx.dac",
  "save/CCLP1.dac.tws",
  "save/CCLP1-lynx.dac.tws",
] as const;
