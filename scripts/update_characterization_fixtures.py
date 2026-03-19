#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional


SCHEMA_VERSION = 1
FIXTURE_ROOT = Path("fixtures/characterization/v1")
ORACLE_COMMANDS = (
    "series-list",
    "level-info",
    "score-table",
    "times-table",
    "solution-list",
    "input-trace",
    "replay-trace",
    "replay-trace-solution",
    "solution-roundtrip",
)
TRACE_SPECS_PATH = Path("scripts/characterization_trace_specs.json")
REPLAY_TRACE_SPECS_PATH = Path("scripts/characterization_replay_specs.json")
SOLUTION_SPECS_PATH = Path("scripts/characterization_solution_specs.json")
SERIES_LIST_PATH = Path("scripts/characterization_series.json")


def run(cmd: list[str], cwd: Optional[Path] = None, capture_output: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture_output else None,
        stderr=subprocess.PIPE if capture_output else None,
    )


def repo_root_from_script() -> Path:
    return Path(__file__).resolve().parent.parent


def tracked_paths(repo_root: Path, *pathspecs: str) -> list[Path]:
    result = run(["git", "ls-files", "-z", "--", *pathspecs], cwd=repo_root)
    return [Path(path) for path in result.stdout.split("\0") if path]


def ensure_oracle(
    repo_root: Path,
    build_dir: Path,
    explicit_oracle: Optional[Path],
    skip_build: bool,
) -> Path:
    if explicit_oracle is not None:
        return explicit_oracle

    oracle_path = build_dir / "legacy_c" / "tworld-oracle"
    if skip_build:
        if not oracle_path.exists():
            raise SystemExit(f"oracle not found at {oracle_path}")
        return oracle_path

    run(
        [
            "cmake",
            "-S",
            str(repo_root),
            "-B",
            str(build_dir),
            "-DOSHW=sdl",
            "-DCMAKE_BUILD_TYPE=Debug",
        ],
        capture_output=False,
    )
    run(
        ["cmake", "--build", str(build_dir), "--target", "tworld-oracle", "-j4"],
        capture_output=False,
    )

    if not oracle_path.exists():
        raise SystemExit(f"oracle not found at {oracle_path}")
    return oracle_path


def export_workspace(repo_root: Path, workspace_root: Path) -> None:
    for root_name in ("data", "sets", "res", "docs"):
        source_root = repo_root / root_name
        if not source_root.exists():
            continue
        for source_path in sorted(path for path in source_root.rglob("*") if path.is_file()):
            rel_path = source_path.relative_to(repo_root)
            destination = workspace_root / rel_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)

    (workspace_root / "save").mkdir(parents=True, exist_ok=True)


def parse_json_output(oracle: Path, workspace_root: Path, *args: str) -> dict:
    result = run([str(oracle), *args], cwd=workspace_root)
    stderr = result.stderr.strip()
    if stderr:
        lines = [line for line in stderr.splitlines() if line.strip()]
        if any("CHIPS.dat unavailable" not in line for line in lines):
            raise SystemExit(f"unexpected stderr from {' '.join(args)}:\n{stderr}")
    return json.loads(result.stdout)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def load_included_series(repo_root: Path) -> Optional[list[str]]:
    series_list_path = repo_root / SERIES_LIST_PATH
    if not series_list_path.exists():
        return None

    loaded = json.loads(series_list_path.read_text(encoding="utf-8"))
    if not isinstance(loaded, list) or any(not isinstance(item, str) for item in loaded):
        raise SystemExit(f"invalid series allowlist in {series_list_path}")

    return loaded


def generate_fixtures(repo_root: Path, oracle: Path, fixture_root: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="tworld-characterization-") as temp_dir:
        workspace_root = Path(temp_dir)
        export_workspace(repo_root, workspace_root)

        if fixture_root.exists():
            shutil.rmtree(fixture_root)
        fixture_root.mkdir(parents=True, exist_ok=True)

        series_list = parse_json_output(oracle, workspace_root, "series-list")
        included_series = load_included_series(repo_root)
        if included_series is not None:
            available_series = {
                entry["filebase"]: entry
                for entry in series_list["series"]
            }
            missing_series = [series_name for series_name in included_series if series_name not in available_series]
            if missing_series:
                raise SystemExit(f"series missing from oracle export: {', '.join(missing_series)}")
            series_list["series"] = [available_series[series_name] for series_name in included_series]
            if "table" in series_list and isinstance(series_list["table"], dict):
                table_data = series_list["table"].get("data")
                if isinstance(table_data, list) and table_data:
                    header_row = table_data[0]
                    filtered_rows = [
                        row
                        for row in table_data[1:]
                        if isinstance(row, list)
                        and row
                        and isinstance(row[0], dict)
                        and row[0].get("text") in available_series
                        and row[0].get("text") in included_series
                    ]
                    series_list["table"]["data"] = [header_row, *filtered_rows]
                    series_list["table"]["rows"] = len(series_list["table"]["data"])
        write_json(fixture_root / "series-list.json", series_list)
        series = [entry["filebase"] for entry in series_list["series"]]

        for series_name in series:
            write_json(
                fixture_root / "level-info" / f"{series_name}.json",
                parse_json_output(oracle, workspace_root, "level-info", series_name),
            )
            write_json(
                fixture_root / "score-table" / f"{series_name}.json",
                parse_json_output(oracle, workspace_root, "score-table", series_name),
            )
            write_json(
                fixture_root / "times-table" / f"{series_name}.json",
                parse_json_output(oracle, workspace_root, "times-table", series_name),
            )
            write_json(
                fixture_root / "solution-list" / f"{series_name}.json",
                parse_json_output(oracle, workspace_root, "solution-list", series_name),
            )

        trace_specs = json.loads((repo_root / TRACE_SPECS_PATH).read_text(encoding="utf-8"))
        for trace_spec in trace_specs:
            write_json(
                fixture_root / "input-trace" / f"{trace_spec['name']}.json",
                parse_json_output(
                    oracle,
                    workspace_root,
                    "input-trace",
                    trace_spec["series"],
                    str(trace_spec["levelNumber"]),
                    trace_spec["inputs"],
                    str(trace_spec["maxTicks"]),
                    str(trace_spec["randomSeed"]),
                ),
            )

        replay_trace_specs = json.loads((repo_root / REPLAY_TRACE_SPECS_PATH).read_text(encoding="utf-8"))
        for trace_spec in replay_trace_specs:
            replay = trace_spec["replay"]
            write_json(
                fixture_root / "replay-trace" / f"{trace_spec['name']}.json",
                parse_json_output(
                    oracle,
                    workspace_root,
                    "replay-trace-solution",
                    trace_spec["series"],
                    str(trace_spec["levelNumber"]),
                    str(trace_spec["maxTicks"]),
                    str(replay["bestTimeTicks"]),
                    str(replay["flags"]),
                    str(replay["randomSlideDirection"]),
                    str(replay["stepping"]),
                    str(replay["randomSeed"]),
                    replay["moves"],
                ),
            )

        solution_specs = json.loads((repo_root / SOLUTION_SPECS_PATH).read_text(encoding="utf-8"))
        for solution_spec in solution_specs:
            write_json(
                fixture_root / "solution-roundtrip" / f"{solution_spec['name']}.json",
                parse_json_output(
                    oracle,
                    workspace_root,
                    "solution-roundtrip",
                    solution_spec["ruleset"],
                    str(solution_spec["levelNumber"]),
                    solution_spec["password"],
                    str(solution_spec["bestTimeTicks"]),
                    str(solution_spec["flags"]),
                    str(solution_spec["randomSlideDirection"]),
                    str(solution_spec["stepping"]),
                    str(solution_spec["randomSeed"]),
                    solution_spec["moves"],
                ),
            )

        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "generatedBy": "scripts/update_characterization_fixtures.py",
            "commandRoot": "tworld-oracle",
            "commands": list(ORACLE_COMMANDS),
            "includedSeries": series,
            "traceSpecs": trace_specs,
            "replayTraceSpecs": replay_trace_specs,
            "solutionSpecs": solution_specs,
            "excludedSeries": [
                path.name
                for path in tracked_paths(repo_root, "sets")
                if path.suffix == ".dac" and path.name.startswith("cc-")
            ],
        }
        write_json(fixture_root / "manifest.json", manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate characterization fixtures.")
    parser.add_argument("--repo-root", type=Path, default=repo_root_from_script())
    parser.add_argument("--build-dir", type=Path)
    parser.add_argument("--oracle", type=Path)
    parser.add_argument("--fixture-root", type=Path)
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    build_dir = (args.build_dir or (repo_root / "build-characterization")).resolve()
    fixture_root = (args.fixture_root or (repo_root / FIXTURE_ROOT)).resolve()
    oracle = ensure_oracle(
        repo_root,
        build_dir,
        args.oracle.resolve() if args.oracle else None,
        args.skip_build,
    )

    generate_fixtures(repo_root, oracle, fixture_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
