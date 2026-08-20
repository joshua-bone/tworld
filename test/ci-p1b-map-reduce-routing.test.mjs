import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);
  const following = workflow.slice(start + marker.length);
  const next = following.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return workflow.slice(start, next === -1 ? undefined : start + marker.length + next);
}

function assertExactHeadCheckout(job, jobName) {
  assert.match(
    job,
    /uses: actions\/checkout@v4\n\s+with:\n(?:\s+[^\n]+\n)*?\s+ref: \$\{\{ github\.sha \}\}/,
    `${jobName} must explicitly check out the workflow SHA`,
  );
  assert.match(job, /git rev-parse HEAD/);
  assert.match(job, /GITHUB_SHA/);
  assert.match(job, /checked-out HEAD|checkout HEAD|workflow SHA/i);
}

test("routes heavy P1B through a fixed eight-way map/reduce graph", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const classify = workflowJob(workflow, "classify");
  const prepare = workflowJob(workflow, "ccsolver-p1b-prepare");
  const shard = workflowJob(workflow, "ccsolver-p1b-shard");
  const reducer = workflowJob(workflow, "ccsolver-p1b");
  const aggregate = workflowJob(workflow, "web-and-ccsolver");

  assert.match(classify, /ci-p1b-map-reduce-routing\.test\.mjs/);
  assert.match(classify, /trusted-merge-base: \$\{\{ steps\.gates\.outputs\.trusted_merge_base \}\}/);

  assert.match(prepare, /needs: classify/);
  assert.match(prepare, /outputs\['heavy-p1b'\] == 'true'/);
  assert.match(prepare, /shard-matrix: \$\{\{ steps\.[a-zA-Z0-9_-]+\.outputs\.shard_matrix \}\}/);
  assert.match(prepare, /shard-count: \$\{\{ steps\.[a-zA-Z0-9_-]+\.outputs\.shard_count \}\}/);
  assert.match(prepare, /needs-shards: \$\{\{ steps\.[a-zA-Z0-9_-]+\.outputs\.needs_shards \}\}/);
  assert.match(prepare, /timeout-minutes: 10/);
  assertExactHeadCheckout(prepare, "ccsolver-p1b-prepare");
  assert.match(prepare, /fetch-depth: 0/);
  assert.match(prepare, /ccsolver:corpus:check:prepared/);
  assert.match(prepare, /p1b-shards\.mjs prepare/);
  assert.match(prepare, /--head "?\$ACTUAL_HEAD"?/);
  assert.match(prepare, /--run-id "\$GITHUB_RUN_ID"/);
  assert.match(prepare, /--run-attempt "\$GITHUB_RUN_ATTEMPT"/);
  assert.match(prepare, /needs\.classify\.outputs\['trusted-merge-base'\]/);
  assert.match(prepare, /git worktree add --detach/);
  assert.match(prepare, /shard_count[^\n]*8|SHARD_COUNT[^\n]*8/);
  assert.match(prepare, /uses: actions\/upload-artifact@v4/);
  assert.match(prepare, /p1b-plan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ github\.sha \}\}/);

  assert.match(shard, /ccsolver-p1b-prepare/);
  assert.match(shard, /outputs\['heavy-p1b'\] == 'true'/);
  assert.match(shard, /fail-fast: true/);
  assert.match(shard, /max-parallel: 8/);
  assert.match(shard, /matrix: \$\{\{ fromJSON\(needs\.ccsolver-p1b-prepare\.outputs\['shard-matrix'\]\) \}\}/);
  assert.match(shard, /timeout-minutes: 45/);
  assertExactHeadCheckout(shard, "ccsolver-p1b-shard");
  assert.match(shard, /name: p1b-plan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ github\.sha \}\}/);
  assert.match(shard, /p1b-shards\.mjs run/);
  assert.match(shard, /if: \$\{\{ matrix\.measure \}\}/);
  assert.match(shard, /p1b-shards\.mjs forward/);
  assert.match(shard, /if: \$\{\{ !matrix\.measure \}\}/);
  assert.match(shard, /SHARD_ID: \$\{\{ matrix\.shard_id \}\}/);
  assert.match(shard, /--request[^\n]*\$\{SHARD_ID\}/);
  assert.match(shard, /--output[^\n]*\$\{SHARD_ID\}/);
  assert.match(shard, /name: \$\{\{ matrix\.artifact_name \}\}/);
  assert.match(shard, /if-no-files-found: error/);
  assert.match(shard, /overwrite: false/);

  assert.match(reducer, /needs:[\s\S]*classify[\s\S]*ccsolver-p1b-prepare[\s\S]*ccsolver-p1b-shard/);
  assert.match(reducer, /if: \$\{\{ always\(\)/);
  assert.match(reducer, /outputs\['heavy-p1b'\] == 'true'/);
  assert.match(reducer, /timeout-minutes: 15/);
  assertExactHeadCheckout(reducer, "ccsolver-p1b");
  assert.match(reducer, /p1b-shards\.mjs finalize/);
  assert.match(reducer, /--head "?\$ACTUAL_HEAD"?/);
  assert.match(reducer, /--check/);
  assert.doesNotMatch(reducer, /ccsolver:p1b:check:prepared/);
  assert.doesNotMatch(reducer, /TWORLD_P1B_ANALYSIS_JOBS/);

  assert.match(aggregate, /- ccsolver-p1b\n/);
  assert.doesNotMatch(aggregate, /- ccsolver-p1b-(?:prepare|shard)\n/);
  assert.match(aggregate, /require_gate ccsolver-p1b "\$P1B_SELECTED" "\$P1B_RESULT"/);
});

test("moves P1B plan and results only through exact immutable artifacts", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const prepare = workflowJob(workflow, "ccsolver-p1b-prepare");
  const shard = workflowJob(workflow, "ccsolver-p1b-shard");
  const reducer = workflowJob(workflow, "ccsolver-p1b");
  const p1bGraph = `${prepare}\n${shard}\n${reducer}`;

  assert.doesNotMatch(p1bGraph, /actions\/cache@/);
  assert.doesNotMatch(p1bGraph, /continue-on-error:/);
  assert.doesNotMatch(p1bGraph, /merge-multiple:/);
  assert.doesNotMatch(p1bGraph, /pattern:/);
  assert.doesNotMatch(shard, /^\s+outputs:/m, "matrix outputs have last-writer semantics");

  for (const upload of p1bGraph.matchAll(/uses: actions\/upload-artifact@v4[\s\S]*?(?=\n\s+- (?:name:|uses:)|$)/g)) {
    assert.match(upload[0], /if-no-files-found: error/);
    assert.match(upload[0], /overwrite: false/);
    assert.match(upload[0], /retention-days: 1/);
  }

  const downloads = reducer.match(/uses: actions\/download-artifact@v4/g) ?? [];
  assert.equal(downloads.length, 9, "reducer must exact-download one plan and eight shard artifacts");
  for (let index = 0; index < 8; index += 1) {
    assert.match(
      reducer,
      new RegExp(`fromJSON\\(needs\\.ccsolver-p1b-prepare\\.outputs\\['shard-matrix'\\]\\)\\.include\\[${index}\\]\\.artifact_name`),
      `missing exact artifact identity for shard ${index}`,
    );
    assert.match(
      reducer,
      new RegExp(`results/\\$\\{\\{ fromJSON\\(needs\\.ccsolver-p1b-prepare\\.outputs\\['shard-matrix'\\]\\)\\.include\\[${index}\\]\\.shard_id \\}\\}`),
      `missing isolated result directory for shard ${index}`,
    );
  }

  assert.match(reducer, /needs\.ccsolver-p1b-prepare\.result/);
  assert.match(reducer, /needs\.ccsolver-p1b-shard\.result/);
  assert.match(reducer, /finished with disallowed result|must succeed|did not succeed/i);
});
