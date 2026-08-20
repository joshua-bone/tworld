import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readRepositoryFile(relativePath) {
  return readFile(resolve(repositoryRoot, relativePath), "utf8");
}

test("pins the native CI toolchain and records its provenance", async () => {
  const dockerfile = await readRepositoryFile(".github/ci/Dockerfile");

  assert.match(
    dockerfile,
    /^FROM ubuntu:24\.04@sha256:[a-f0-9]{64}$/m,
    "the moving Ubuntu tag must be paired with an immutable OCI digest",
  );
  for (const dependency of [
    "build-essential",
    "ca-certificates",
    "cmake",
    "git",
    "libgl1-mesa-dev",
    "libsdl1.2-dev",
    "libsdl2-dev",
    "qt6-base-dev",
    "qtbase5-dev",
  ]) {
    assert.match(dockerfile, new RegExp(`^    ${dependency} \\\\$`, "m"));
  }
  assert.match(dockerfile, /apt-get install -y --no-install-recommends/);
  assert.match(dockerfile, /rm -rf \/var\/lib\/apt\/lists\/\*/);
  assert.match(dockerfile, /org\.opencontainers\.image\.source="\$\{SOURCE_URL\}"/);
  assert.match(dockerfile, /org\.opencontainers\.image\.revision="\$\{VCS_REF\}"/);
  assert.doesNotMatch(dockerfile, /\bsudo\b/);
});

test("publishes only deliberate master builds and exposes an immutable reference", async () => {
  const workflow = await readRepositoryFile(".github/workflows/ci-image.yml");

  assert.match(workflow, /^name: Publish CI Image$/m);
  assert.match(workflow, /^  workflow_dispatch:$/m);
  assert.match(workflow, /^      - master$/m);
  assert.match(workflow, /^      - \.github\/ci\/\*\*$/m);
  assert.match(workflow, /^      - \.github\/workflows\/ci-image\.yml$/m);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.match(workflow, /^  contents: read$/m);
  assert.match(workflow, /^  packages: write$/m);
  assert.match(workflow, /^    runs-on: ubuntu-24\.04$/m);
  assert.match(workflow, /^    timeout-minutes: 30$/m);

  assert.match(workflow, /registry: ghcr\.io/);
  assert.match(workflow, /password: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.match(workflow, /context: \.github\/ci/);
  assert.match(workflow, /platforms: linux\/amd64/);
  assert.match(workflow, /push: true/);
  assert.match(workflow, /type=sha,prefix=sha-,format=long/);
  assert.match(workflow, /VCS_REF=\$\{\{ github\.sha \}\}/);
  assert.match(workflow, /SOURCE_URL=\$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}/);

  assert.match(
    workflow,
    /ghcr\.io\/token\?scope=repository:\$\{IMAGE_NAME\}:pull/,
    "publication must obtain an anonymous pull token from GHCR",
  );
  assert.match(workflow, /ghcr\.io\/v2\/\$\{IMAGE_NAME\}\/manifests\/\$\{IMAGE_DIGEST\}/);
  assert.match(workflow, /application\/vnd\.oci\.image\.index\.v1\+json/);
  assert.match(workflow, /anonymously pullable by immutable digest/);
  assert.doesNotMatch(workflow, /api\.github\.com\/users\/.*\/packages/);
  assert.doesNotMatch(
    workflow,
    /PATCH.*packages|packages.*visibility=public/,
    "GitHub does not document a package-visibility mutation endpoint",
  );

  assert.match(workflow, /steps\.build\.outputs\.digest/);
  assert.match(workflow, /ci-image-reference\.txt/);
  assert.match(workflow, /\$GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /if-no-files-found: error/);

  for (const action of [
    "actions/checkout",
    "actions/upload-artifact",
    "docker/setup-buildx-action",
    "docker/login-action",
    "docker/metadata-action",
    "docker/build-push-action",
  ]) {
    assert.match(
      workflow,
      new RegExp(`uses: ${action.replace("/", "\\/")}@[a-f0-9]{40}`),
      `${action} must be pinned to a commit SHA`,
    );
  }
});
