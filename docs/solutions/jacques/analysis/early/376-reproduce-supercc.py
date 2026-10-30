"""Run the pinned public SuperCC source without modifying its engine.

Requires Python 3, Java/Javac 17, Git, and network access for json-simple 1.1.1.
First clone SuperCC into a temporary directory:
  git clone --depth 1 https://github.com/SicklySilverMoon/SuperCC.git /tmp/jacques-supercc-audit
  git -C /tmp/jacques-supercc-audit checkout 3e92380dabbae2dcf4e86ed5dc7572695311c8d4
Then run this script with --checkout /tmp/jacques-supercc-audit.
Each subprocess has a 45-second timeout; the dependency download has 30 seconds.
No source checkout or repository files are written. Logs go to --out.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--checkout", type=Path, default=Path("/tmp/jacques-supercc-audit"))
parser.add_argument("--dat", type=Path, default=Path.home() / "Downloads/Jacques.dat")
parser.add_argument("--out", type=Path, default=Path("/tmp/jacques-supercc-376-evidence"))
args = parser.parse_args()
here = Path(__file__).resolve().parent
root = here.parents[4]
replay = root / "web/public/dev/solutions/jacques/replays/376.tws"
commit = "3e92380dabbae2dcf4e86ed5dc7572695311c8d4"

def run(command, **kwargs):
    return subprocess.run([str(part) for part in command], check=True, timeout=45,
                          capture_output=True, text=True, **kwargs)

def checked_hash(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == expected, (str(path), actual, expected)
    return actual

dat_hash = checked_hash(args.dat, "c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f")
replay_hash = checked_hash(replay, "8c2cf373930654ef5eb252dba030359f838d2112680b77f8b51236f78a400fd9")
assert replay.stat().st_size == 147
assert run(["git", "-C", args.checkout, "rev-parse", "HEAD"]).stdout.strip() == commit
assert not run(["git", "-C", args.checkout, "status", "--porcelain", "--untracked-files=no"]).stdout.strip()
args.out.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="jacques-supercc-376-build-") as directory:
    build = Path(directory)
    jar = build / "json-simple-1.1.1.jar"
    with urllib.request.urlopen("https://repo.maven.apache.org/maven2/com/googlecode/json-simple/json-simple/1.1.1/json-simple-1.1.1.jar", timeout=30) as response:
        jar.write_bytes(response.read())
    checked_hash(jar, "4e69696892b88b41c55d49ab2fdcc21eead92bf54acc588c0050596c3b75199c")
    classes = build / "classes"
    classes.mkdir()
    source = build / "JacquesSuperCCProbe.java"
    shutil.copyfile(here / "376-supercc-probe.java", source)
    sources = sorted((args.checkout / "src/main/java").rglob("*.java"))
    run(["javac", "-cp", jar, "-d", classes, *sources, source])
    for name, options in [("relative", []), ("absolute", ["-DabsoluteClick=true"])]:
        result = run(["java", "-Djava.awt.headless=true", *options, "-cp", f"{classes}:{jar}",
                      "JacquesSuperCCProbe", args.dat.resolve(), replay], cwd=build)
        assert "FINAL half=375 pos=(1, 6) won=false dead=true" in result.stdout
        expected_goal = "352" if name == "relative" else "320"
        assert f"pos=(0, 12) dir=UP slide=true goal={expected_goal}" in result.stdout
        expected_after = "1025" if name == "relative" else "320"
        assert f"AFTER half=372 pos=(0, 11) dir=UP slide=true goal={expected_after}" in result.stdout
        (args.out / f"376-supercc-{name}.log").write_text(result.stdout)
        (args.out / f"376-supercc-{name}.stderr.log").write_text(result.stderr)
assert not run(["git", "-C", args.checkout, "status", "--porcelain", "--untracked-files=no"]).stdout.strip()
summary = {"commit": commit, "datSha256": dat_hash, "twsSha256": replay_hash,
           "twsBytes": 147, "sourceUnchanged": True, "bothExpectedFailuresReproduced": True}
(args.out / "376-supercc-run.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
