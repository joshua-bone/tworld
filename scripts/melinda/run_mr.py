"""Check an exported MS replay in stock Melinda Router 3.12."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

from setup import SOURCES, outside_git


def integer(value, lower, upper):
    return type(value) is int and lower <= value <= upper


def validate_input(value, dat):
    if not integer(value.get("schemaVersion"), 1, 1) or not integer(value.get("level"), 1, 65535):
        raise ValueError("expected exported replay schemaVersion 1 and a level number")
    if value.get("datSha256") != hashlib.sha256(dat).hexdigest():
        raise ValueError("replay DAT SHA256 mismatch")
    if not re.fullmatch(r"[0-9a-f]{64}", value.get("twsSha256", "")):
        raise ValueError("missing replay TWS SHA256")
    replay = value.get("replay", {})
    for key, upper in [("randomSeed", 0xffffffff), ("stepping", 7),
                       ("bestTimeTicks", 10_000_000)]:
        if not integer(replay.get(key), 0, upper):
            raise ValueError("invalid replay " + key)
    if (type(replay.get("randomSlideDirection")) is not int
            or replay["randomSlideDirection"] not in (1, 2, 4, 8)):
        raise ValueError("invalid replay randomSlideDirection")
    moves = replay.get("moves")
    if not isinstance(moves, list):
        raise ValueError("expected replay moves")
    previous = -1
    for move in moves:
        when, direction = move.get("when"), move.get("dir")
        if not integer(when, previous + 1, replay["bestTimeTicks"]):
            raise ValueError("move ticks must be increasing and within the recorded time")
        if not (integer(direction, 0, 376) or integer(direction, 512, 1535)):
            raise ValueError("unsupported MR input code")
        previous = when


def replay_commands(replay, final_tick, *, use_tsg, nonadj_traps):
    seed = replay["randomSeed"]
    if seed >= 0x80000000:
        seed -= 0x100000000
    lines = [f"params seed {seed} stepping {replay['stepping']} "
             f"slidedir {replay['randomSlideDirection']} use_tsg {int(use_tsg)} "
             f"nonadj_traps {int(nonadj_traps)}", "from 1 0"]
    lines.extend(f"tick {move['when']} {move['dir']}" for move in replay["moves"])
    return "\n".join([*lines, f"final {final_tick} 0", "quit", ""])


def parse_result(log, recorded_ticks):
    if not log.startswith("MR-CC Helper (MS) version 3.12\n"):
        raise ValueError("unexpected MR helper version")
    if "donestates" not in log.splitlines():
        raise ValueError("incomplete MR protocol response")
    states = re.findall(r"^tick (\d+) state (\d+) status (\S+) ", log, re.MULTILINE)
    if not states:
        raise ValueError("MR returned no replay states")
    wins = [int(tick) for tick, _, status in states if status == "win"]
    # MR labels post-advance states with the next tick; TWS records the input tick.
    win_tick = wins[0] - 1 if wins else None
    return {
        "status": "completed" if wins else "incomplete",
        "winTick": win_tick, "mrWinStateTick": wins[0] if wins else None,
        "recordedTimeMatches": win_tick == recorded_ticks,
        "lastStateTick": int(states[-1][0]), "lastStateStatus": states[-1][2],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tools", type=Path, required=True, help="setup output directory")
    parser.add_argument("--dat", type=Path, required=True)
    parser.add_argument("--tws", type=Path, required=True)
    parser.add_argument("--replay-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="new directory outside Git")
    parser.add_argument("--timeout", type=float, default=30)
    parser.add_argument("--no-tsg", action="store_true")
    parser.add_argument("--nonadj-traps", action="store_true", help="MR non-default trap variant")
    args = parser.parse_args()
    if not 0 < args.timeout <= 600:
        parser.error("--timeout must be between 0 and 600 seconds")
    os.umask(0o077)
    value = json.loads(args.replay_json.read_text())
    validate_input(value, args.dat.read_bytes())
    if hashlib.sha256(args.tws.read_bytes()).hexdigest() != value["twsSha256"]:
        raise ValueError("replay TWS SHA256 mismatch")
    mr = args.tools.resolve() / "mr"
    source = SOURCES["mr"]
    manifest = json.loads((mr / "build-manifest.json").read_text())
    helper = mr / source["helper"]
    helper_sha = hashlib.sha256(helper.read_bytes()).hexdigest()
    if manifest.get("sha256") != source["sha256"] or manifest.get("helperSha256") != helper_sha:
        raise ValueError("MR build manifest does not match the pinned helper")
    output = outside_git(args.output)
    output.mkdir(parents=True, exist_ok=False)
    # Hashing TWS bytes alone does not bind a separately editable JSON envelope.
    # Decode the exact file again through the repository's authoritative codec.
    repo = Path(__file__).resolve().parents[2]
    decoded_path = output / "decoded-replay.json"
    decoded = subprocess.run([
        "npm", "exec", "--yes", "--package=tsx@4.23.13", "--", "tsx",
        "--tsconfig", str(repo / "web/tsconfig.json"),
        str(repo / "scripts/mscc/export-replay.ts"), str(args.dat.resolve()),
        str(args.tws.resolve()), str(value["level"]), str(decoded_path)],
        cwd=repo, capture_output=True, text=True, timeout=args.timeout, check=True)
    (output / "decode.log").write_text(decoded.stdout + decoded.stderr)
    if json.loads(decoded_path.read_text()) != value:
        raise ValueError("replay JSON does not match the decoded TWS")
    imported = subprocess.run(["java", "-Djava.awt.headless=true", "-cp", str(mr / "classes"),
                               "MRExport", str(args.dat.resolve()), str(value["level"])],
                              capture_output=True, text=True, timeout=args.timeout, check=True)
    protocol = imported.stdout + replay_commands(
        value["replay"], value["replay"]["bestTimeTicks"] + 100,
        use_tsg=not args.no_tsg, nonadj_traps=args.nonadj_traps)
    (output / "input.txt").write_text(protocol)
    (output / "import.log").write_text(imported.stderr)
    process = subprocess.run([str(helper)], input=protocol, capture_output=True,
                             text=True, timeout=args.timeout)
    (output / "trace.log").write_text(process.stdout)
    (output / "stderr.log").write_text(process.stderr)
    process.check_returncode()
    result = {
        "adapterVersion": 1, "engine": "Melinda Router MS", "version": "3.12",
        "level": value["level"], "datSha256": value["datSha256"],
        "twsSha256": value["twsSha256"], "helperSha256": helper_sha,
        "sourceArchiveSha256": source["sha256"],
        "replayDecodeVerified": True,
        "options": {"useTsg": not args.no_tsg, "nonadjTraps": args.nonadj_traps},
        **parse_result(process.stdout, value["replay"]["bestTimeTicks"]),
    }
    (output / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    return 0 if result["status"] == "completed" and result["recordedTimeMatches"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
