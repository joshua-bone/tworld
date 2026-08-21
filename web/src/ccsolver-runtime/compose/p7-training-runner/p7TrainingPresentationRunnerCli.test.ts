import { describe, expect, it } from "vitest";
import {
  P7_TRAINING_ENGINE_RUNNER_FILENAME,
  P7_TRAINING_PRESENTATION_RUNNER_FILENAME,
  parseP7TrainingPresentationRunnerArguments,
} from "./p7TrainingPresentationRunnerCli";

describe("P7 presentation and player-graph CLI", () => {
  it("keeps graph and pack operations explicit and strictly parsed", () => {
    const head = "a".repeat(40);
    const transport = [
      "--root", "/repo",
      "--head", head,
      "--presentation-artifacts", "/presentation-artifacts",
      "--run-id", "123",
      "--run-attempt", "2",
    ];
    expect(parseP7TrainingPresentationRunnerArguments([
      "prepare", ...transport,
    ])).toMatchObject({ command: "prepare", presentationArtifactRoot: "/presentation-artifacts" });
    expect(parseP7TrainingPresentationRunnerArguments([
      "graph-write",
      ...transport,
    ])).toMatchObject({ command: "graph-write" });
    expect(() => parseP7TrainingPresentationRunnerArguments([
      "graph-write", ...transport, "--source-revision", "operator-selected",
    ])).toThrow("unsupported");
    expect(() => parseP7TrainingPresentationRunnerArguments([
      "graph-write", ...transport, "--toolchain-revision", "operator-selected",
    ])).toThrow("unsupported");
    const pack = [
      ...transport,
      "--artifacts", "/artifacts",
    ];
    for (const command of ["build", "check", "write"] as const) {
      expect(parseP7TrainingPresentationRunnerArguments([command, ...pack]).command).toBe(command);
    }
    expect(parseP7TrainingPresentationRunnerArguments([
      "attest", ...transport, "--packs", "cclp1,cclp5",
    ])).toMatchObject({ command: "attest", artifactRoot: null, packIds: ["cclp1", "cclp5"] });
    expect(() => parseP7TrainingPresentationRunnerArguments([
      "graph-check", ...transport, "--artifacts", "/artifacts",
    ])).toThrow("unsupported");
    expect(() => parseP7TrainingPresentationRunnerArguments([
      "write", ...pack, "--run-attempt", "3",
    ])).toThrow("duplicate");
    expect(P7_TRAINING_ENGINE_RUNNER_FILENAME).toBe("p7-training-engine-runner.mjs");
    expect(P7_TRAINING_PRESENTATION_RUNNER_FILENAME).toBe(
      "p7-training-presentation-runner.mjs",
    );
  });
});
