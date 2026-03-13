#!/usr/bin/env python3

from __future__ import annotations

import argparse
import gzip
import json
import shutil
import sys
import tempfile
from pathlib import Path

from update_characterization_fixtures import (
    ensure_oracle,
    export_workspace,
    parse_json_output,
    repo_root_from_script,
    write_json,
)

SCHEMA_VERSION = 2
FIXTURE_ROOT = Path("fixtures/oracle-debug/v1")
DEBUG_SPECS_PATH = Path("scripts/oracle_debug_specs.json")


def write_gzip_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def generate_debug_fixtures(repo_root: Path, oracle: Path, fixture_root: Path) -> None:
    specs = json.loads((repo_root / DEBUG_SPECS_PATH).read_text(encoding="utf-8"))

    with tempfile.TemporaryDirectory(prefix="tworld-oracle-debug-") as temp_dir:
        workspace_root = Path(temp_dir)
        export_workspace(repo_root, workspace_root)

        if fixture_root.exists():
            shutil.rmtree(fixture_root)
        fixture_root.mkdir(parents=True, exist_ok=True)

        commands: set[str] = set()
        for spec in specs:
            command = spec["command"]
            commands.add(command)
            if command == "input-trace-debug":
                payload = parse_json_output(
                    oracle,
                    workspace_root,
                    command,
                    spec["series"],
                    str(spec["levelNumber"]),
                    spec["inputs"],
                    str(spec["maxTicks"]),
                    str(spec["randomSeed"]),
                )
            elif command == "replay-trace-solution-debug":
                replay = spec["replay"]
                payload = parse_json_output(
                    oracle,
                    workspace_root,
                    command,
                    spec["series"],
                    str(spec["levelNumber"]),
                    str(spec["maxTicks"]),
                    str(replay["bestTimeTicks"]),
                    str(replay["flags"]),
                    str(replay["randomSlideDirection"]),
                    str(replay["stepping"]),
                    str(replay["randomSeed"]),
                    replay["moves"],
                )
            else:
                raise SystemExit(f"unsupported oracle debug command: {command}")

            write_gzip_json(fixture_root / "trace-debug" / f"{spec['name']}.json.gz", payload)

        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "generatedBy": "scripts/update_oracle_debug_fixtures.py",
            "commandRoot": "tworld-oracle",
            "commands": sorted(commands),
            "specs": specs,
        }
        write_json(fixture_root / "manifest.json", manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate oracle debug fixtures.")
    parser.add_argument("--repo-root", type=Path, default=repo_root_from_script())
    parser.add_argument("--build-dir", type=Path)
    parser.add_argument("--oracle", type=Path)
    parser.add_argument("--fixture-root", type=Path)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    build_dir = (args.build_dir or (repo_root / "build-oracle-debug")).resolve()
    fixture_root = (args.fixture_root or (repo_root / FIXTURE_ROOT)).resolve()
    oracle = ensure_oracle(
        repo_root,
        build_dir,
        args.oracle.resolve() if args.oracle else None,
        args.skip_build,
    )

    generate_debug_fixtures(repo_root, oracle, fixture_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
