#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    echo "usage: $0 <repo-root> <oracle-path>" >&2
    exit 2
fi

repo_root=$1
oracle_path=$2

python3 - "$repo_root" "$oracle_path" <<'PY'
import json
import subprocess
import sys

repo_root = sys.argv[1]
oracle_path = sys.argv[2]

base_args = [
    oracle_path,
    "--root",
    repo_root,
    "replay-trace-solution-debug",
    "CCLP1-MS.dac",
    "26",
    "32",
    "549",
    "0",
    "1",
    "0",
    "1241255036",
    "0:1,4:1,8:1,12:1,17:2,19:1,21:2,22:1,24:2,27:2,28:2,32:2,36:2,40:2,44:2,48:2,52:1,56:1,60:1,64:1",
]

window_args = [
    oracle_path,
    "--root",
    repo_root,
    "replay-trace-solution-debug-window",
    "CCLP1-MS.dac",
    "26",
    "32",
    "549",
    "0",
    "1",
    "0",
    "1241255036",
    "4",
    "9",
    "0:1,4:1,8:1,12:1,17:2,19:1,21:2,22:1,24:2,27:2,28:2,32:2,36:2,40:2,44:2,48:2,52:1,56:1,60:1,64:1",
]

full = json.loads(subprocess.run(base_args, check=True, capture_output=True, text=True).stdout)
window = json.loads(subprocess.run(window_args, check=True, capture_output=True, text=True).stdout)

assert window["stepWindowStart"] == 4, window.get("stepWindowStart")
assert window["stepWindowEndExclusive"] == 9, window.get("stepWindowEndExclusive")
assert window["initialDebugState"] == full["initialDebugState"]
assert window["result"] == full["result"]
assert window["steps"] == full["steps"][4:9]
PY
