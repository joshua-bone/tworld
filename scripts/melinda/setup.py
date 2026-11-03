"""Build pinned upstream Melinda helpers outside Git; no game logic patches."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import subprocess
import tarfile


SOURCES = {
    "mr": {
        "archive": "MELINDA-ROUTER-3.12.tar.bz2",
        "sha256": "311c259f558e18b629df523b33e1bdec208b826505cff9f7b2c2e088c0c66f5d",
        "helper": "MR-Helper-MS-3.12-linux",
        "version": "3.12",
    },
    "mvs": {
        "archive": "MVS-SOURCE-9.74.tar.bz2",
        "sha256": "74182d429e0b57df5cff50c7440dea17aff167e2461b0b9336bed07c6012f5f6",
        "helper": "MVS-Helper-MS-9.74-linux",
        "version": "9.74",
    },
}


def outside_git(path):
    path = Path(path).expanduser().resolve()
    if any((p / ".git").exists() for p in (path, *path.parents)):
        raise ValueError("tool builds and replay evidence must be outside Git")
    return path


def extract_verified(blob, expected_sha256, target):
    if hashlib.sha256(blob).hexdigest() != expected_sha256:
        raise ValueError("upstream archive SHA256 mismatch")
    target = Path(target).resolve()
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:bz2") as archive:
        members = archive.getmembers()
        for entry in members:
            relative = Path(entry.name)
            if (relative.is_absolute() or ".." in relative.parts
                    or not (entry.isfile() or entry.isdir())):
                raise ValueError("unsafe upstream archive member")
        target.mkdir(parents=True, exist_ok=False)
        # Every member is a relative regular file/directory; links are rejected.
        archive.extractall(target, members=members)


def build(tool, archives, output, jobs):
    source = SOURCES[tool]
    if tool == "mvs" and (platform.system() != "Linux"
                          or platform.machine() not in ("x86_64", "AMD64")):
        raise ValueError("stock MVS search requires Linux x86_64; use a Linux worker")
    target = outside_git(output / tool)
    extract_verified((archives / source["archive"]).read_bytes(), source["sha256"], target)
    with (target / "build.log").open("w") as log:
        subprocess.run(["make", f"-j{jobs}", source["helper"]], cwd=target,
                       stdout=log, stderr=subprocess.STDOUT, timeout=600, check=True)
        if tool == "mr":
            subprocess.run(["make", "ExecName.java", "Version.java"], cwd=target,
                           stdout=log, stderr=subprocess.STDOUT, timeout=30, check=True)
            (target / "classes").mkdir()
            subprocess.run(["javac", "-d", "classes",
                            *[p.name for p in sorted(target.glob("*.java"))],
                            str(Path(__file__).with_name("MRExport.java").resolve())],
                           cwd=target, stdout=log, stderr=subprocess.STDOUT,
                           timeout=120, check=True)
    manifest = {
        "tool": tool, **source,
        "url": "http://cc-optimization.byethost12.com/" + source["archive"],
        "helperSha256": hashlib.sha256((target / source["helper"]).read_bytes()).hexdigest(),
        "platform": platform.platform(), "sourcePatches": [],
    }
    (target / "build-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archives", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tool", choices=["mr", "mvs", "both"], default="both")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.jobs <= 64:
        parser.error("--jobs must be between 1 and 64")
    os.umask(0o077)
    output = outside_git(args.output)
    for tool in (SOURCES if args.tool == "both" else [args.tool]):
        print(json.dumps(build(tool, args.archives, output, args.jobs)), flush=True)


if __name__ == "__main__":
    main()
