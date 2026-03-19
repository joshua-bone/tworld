#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    echo "usage: $0 <repo-root> <oracle-path>" >&2
    exit 2
fi

repo_root=$1
oracle_path=$2
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/tworld-oracle-debug-check.XXXXXX")

cleanup() {
    rm -rf "$tmp_dir"
}

trap cleanup EXIT INT TERM

python3 "$repo_root/scripts/update_oracle_debug_fixtures.py" \
    --repo-root "$repo_root" \
    --oracle "$oracle_path" \
    --skip-build \
    --fixture-root "$tmp_dir/fixtures/oracle-debug/v1"

python3 - "$repo_root/fixtures/oracle-debug" "$tmp_dir/fixtures/oracle-debug" <<'PY'
import gzip
import json
import sys
from pathlib import Path

left_root = Path(sys.argv[1])
right_root = Path(sys.argv[2])

left_files = sorted(path.relative_to(left_root) for path in left_root.rglob("*") if path.is_file())
right_files = sorted(path.relative_to(right_root) for path in right_root.rglob("*") if path.is_file())

failed = False

only_left = sorted(set(left_files) - set(right_files))
only_right = sorted(set(right_files) - set(left_files))
for rel_path in only_left:
    print(f"Only in {left_root}: {rel_path}")
    failed = True
for rel_path in only_right:
    print(f"Only in {right_root}: {rel_path}")
    failed = True

def load_payload(path: Path):
    if path.suffixes[-2:] == [".json", ".gz"]:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)
    if path.suffix == ".json":
        return json.loads(path.read_text(encoding="utf-8"))
    return path.read_bytes()

for rel_path in sorted(set(left_files) & set(right_files)):
    left_payload = load_payload(left_root / rel_path)
    right_payload = load_payload(right_root / rel_path)
    if left_payload != right_payload:
        print(f"Fixture mismatch: {rel_path}")
        failed = True

if failed:
    sys.exit(1)
PY

if [ "$?" -ne 0 ]; then
    echo "oracle debug fixtures are out of date" >&2
    exit 1
fi
