"""Synthetic format tests; no private routes or upstream game assets."""
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tarfile
import tempfile
import unittest

from run_mr import replay_commands, parse_result, validate_input
from setup import extract_verified


def envelope(**changes):
    return {
        "schemaVersion": 1, "level": 1,
        "datSha256": hashlib.sha256(b"synthetic dat").hexdigest(),
        "twsSha256": "a" * 64,
        "replay": {"flags": 0, "randomSeed": 0xffffffff, "stepping": 0,
                   "randomSlideDirection": 1, "bestTimeTicks": 8,
                   "moves": [{"when": 0, "dir": 8}, {"when": 3, "dir": 269}]},
        **changes,
    }


class ReplayTests(unittest.TestCase):
    def test_retains_quarter_ticks_mouse_and_unsigned_seed(self):
        value = envelope()
        validate_input(value, b"synthetic dat")
        commands = replay_commands(value["replay"], 108, use_tsg=True, nonadj_traps=False)
        self.assertIn("seed -1 stepping 0 slidedir 1 use_tsg 1 nonadj_traps 0\n", commands)
        self.assertIn("tick 3 269\n", commands)
        self.assertTrue(commands.endswith("final 108 0\nquit\n"))

    def test_rejects_wrong_dat_hash_and_bad_provenance(self):
        for value, dat in [(envelope(), b"other"),
                           (envelope(twsSha256="bad"), b"synthetic dat"),
                           (envelope(schemaVersion=2), b"synthetic dat")]:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    validate_input(value, dat)

    def test_rejects_ambiguous_or_unsupported_commands(self):
        for moves in [[{"when": 0, "dir": 377}],
                      [{"when": 0, "dir": 1536}],
                      [{"when": 0, "dir": True}],
                      [{"when": -1, "dir": 1}],
                      [{"when": 2, "dir": 1}, {"when": 2, "dir": 8}],
                      [{"when": 9, "dir": 8}]]:
            value = envelope()
            value["replay"]["moves"] = moves
            with self.subTest(moves=moves):
                with self.assertRaises(ValueError):
                    validate_input(value, b"synthetic dat")

    def test_rejects_boolean_scalar_fields(self):
        value = envelope(schemaVersion=True)
        with self.assertRaises(ValueError):
            validate_input(value, b"synthetic dat")
        value = envelope()
        value["replay"]["randomSlideDirection"] = True
        with self.assertRaises(ValueError):
            validate_input(value, b"synthetic dat")

    def test_requires_complete_protocol_and_exact_recorded_time(self):
        log = "MR-CC Helper (MS) version 3.12\ntick 9 state 10 status win inputtohere 8\ndonestates\n"
        result = parse_result(log, 8)
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["winTick"], 8)
        self.assertTrue(result["recordedTimeMatches"])
        self.assertFalse(parse_result(log, 7)["recordedTimeMatches"])
        with self.assertRaises(ValueError):
            parse_result(log.replace("donestates\n", ""), 8)
        with self.assertRaises(ValueError):
            parse_result(log.replace("3.12", "0.0"), 8)
        incomplete = log.replace("status win", "status ok")
        self.assertEqual(parse_result(incomplete, 8)["status"], "incomplete")


class ArchiveTests(unittest.TestCase):
    def archive(self, name, kind=tarfile.REGTYPE):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w:bz2") as archive:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            entry.size = 1 if kind == tarfile.REGTYPE else 0
            entry.linkname = "outside"
            archive.addfile(entry, io.BytesIO(b"x") if entry.size else None)
        return output.getvalue()

    def test_rejects_wrong_digest_and_escaping_or_link_members(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "source"
            blob = self.archive("fine.c")
            with self.assertRaises(ValueError):
                extract_verified(blob, "0" * 64, target)
            for name, kind in [("../escape", tarfile.REGTYPE),
                               ("/absolute", tarfile.REGTYPE),
                               ("link", tarfile.SYMTYPE)]:
                blob = self.archive(name, kind)
                with self.subTest(name=name):
                    with self.assertRaises(ValueError):
                        extract_verified(blob, hashlib.sha256(blob).hexdigest(), target)
            self.assertFalse(target.exists())

    def test_verified_source_extracted_once(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / "source"
            blob = self.archive("source.c")
            digest = hashlib.sha256(blob).hexdigest()
            extract_verified(blob, digest, target)
            self.assertEqual((target / "source.c").read_bytes(), b"x")
            with self.assertRaises(FileExistsError):
                extract_verified(blob, digest, target)


@unittest.skipUnless(os.environ.get("MR_TOOLS"), "set MR_TOOLS to run stock MR")
class NativeTests(unittest.TestCase):
    def test_synthetic_corridor_has_exact_win_tick(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            top = bytearray([1] * 1024)
            top[33:37] = bytes([0x6f, 0, 2, 0x15])  # Chip east, floor, chip, exit
            body = struct.pack("<4H", 1, 100, 1, 1)
            body += struct.pack("<H", 1024) + top
            body += struct.pack("<H", 1024) + bytes(1024) + struct.pack("<H", 0)
            dat = struct.pack("<IH", 0x0002aaac, 1) + struct.pack("<H", len(body)) + body
            (root / "level.dat").write_bytes(dat)
            # A valid three-input MS TWS: east at ticks 0, 4, and 8.
            record = struct.pack("<H4sBBII", 1, b"AAAA", 0, 0, 0xffffffff, 8)
            record += bytes([0x0d, 0x6d, 0x6d])
            tws = struct.pack("<IBHBI", 0x999b3335, 2, 0, 0, len(record)) + record
            (root / "replay.tws").write_bytes(tws)
            value = envelope(datSha256=hashlib.sha256(dat).hexdigest(),
                             twsSha256=hashlib.sha256(tws).hexdigest())
            value["replay"]["moves"] = [{"when": tick, "dir": 8} for tick in (0, 4, 8)]
            (root / "replay.json").write_text(json.dumps(value))
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("run_mr.py")),
                "--tools", os.environ["MR_TOOLS"], "--dat", str(root / "level.dat"),
                "--tws", str(root / "replay.tws"), "--replay-json", str(root / "replay.json"),
                "--output", str(root / "result")], capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            evidence = json.loads((root / "result/result.json").read_text())
            self.assertEqual(evidence["winTick"], 8)
            self.assertTrue(evidence["recordedTimeMatches"])
            # Retaining the correct TWS digest must not let independently edited
            # replay JSON claim a check of those exact TWS bytes.
            value["replay"]["randomSeed"] = 123
            (root / "replay.json").write_text(json.dumps(value))
            altered = subprocess.run([
                sys.executable, str(Path(__file__).with_name("run_mr.py")),
                "--tools", os.environ["MR_TOOLS"], "--dat", str(root / "level.dat"),
                "--tws", str(root / "replay.tws"), "--replay-json", str(root / "replay.json"),
                "--output", str(root / "altered")], capture_output=True, text=True, timeout=20)
            self.assertNotEqual(altered.returncode, 0)
            self.assertIn("decoded TWS", altered.stderr)


if __name__ == "__main__":
    unittest.main()
