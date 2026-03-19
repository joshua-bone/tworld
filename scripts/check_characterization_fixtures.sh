#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    echo "usage: $0 <repo-root> <oracle-path>" >&2
    exit 2
fi

repo_root=$1
oracle_path=$2
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/tworld-characterization-check.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}

trap cleanup EXIT INT TERM

python3 "$repo_root/scripts/update_characterization_fixtures.py" \
    --repo-root "$repo_root" \
    --oracle "$oracle_path" \
    --skip-build \
    --fixture-root "$tmp_dir/fixtures/characterization/v1"

if ! diff -ru "$repo_root/fixtures/characterization" "$tmp_dir/fixtures/characterization"; then
    echo "characterization fixtures are out of date" >&2
    exit 1
fi
