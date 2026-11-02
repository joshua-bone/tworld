"""Synthetic adapter tests; no original game assets or private routes are included."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
import unittest

from oracle import (MSCC, UnsupportedReplay, native_startup_milliseconds, parse_dat,
                    run_replay, validate_replay)


def level_bytes(tiles=None, fields=b"", chips=1, seconds=10, number=1, map_word=1):
    top = bytearray([1] * 1024)
    top[33:37] = bytes([0x6F, 0, 2, 0x15])
    for pos, tile in (tiles or {}).items():
        top[pos] = tile
    bottom = bytes(1024)
    body = struct.pack("<4H", number, seconds, chips, map_word)
    body += struct.pack("<H", 1024) + top
    body += struct.pack("<H", 1024) + bottom
    body += struct.pack("<H", len(fields)) + fields
    return struct.pack("<IH", 0x0002AAAC, 1) + struct.pack("<H", len(body)) + body


def replay(moves=None, **changes):
    value = {"stepping": 0, "randomSeed": 123, "bestTimeTicks": 8,
             "moves": moves if moves is not None else [
                 {"when": 0, "dir": 8}, {"when": 4, "dir": 8}, {"when": 8, "dir": 8}]}
    return {**value, **changes}


class FormatTests(unittest.TestCase):
    def test_research_seed_validation_precedes_executable_loading(self):
        for seed in (-1, 65536, True, 1.5, "1"):
            with self.subTest(seed=seed):
                with self.assertRaisesRegex(ValueError, "16-bit"):
                    MSCC("unused.exe", research_rng_seed=seed)
        with self.assertRaisesRegex(ValueError, "mutually exclusive"):
            MSCC("unused.exe", native_rng_startup_ms=1, research_rng_seed=1)
        with self.assertRaisesRegex(ValueError, "source"):
            MSCC("unused.exe", research_rng_seed=1, research_rng_source="clock")

    @unittest.skipUnless(hasattr(time, "CLOCK_MONOTONIC"), "requires the system monotonic clock")
    def test_native_startup_clock_uses_system_not_process_origin(self):
        before = time.clock_gettime_ns(time.CLOCK_MONOTONIC) // 1_000_000
        actual = native_startup_milliseconds()
        after = time.clock_gettime_ns(time.CLOCK_MONOTONIC) // 1_000_000
        self.assertLessEqual(before, actual)
        self.assertLessEqual(actual, after)

    def test_optional_time_and_chip_fields_override_header(self):
        fields = bytes([1, 2]) + struct.pack("<H", 513)
        fields += bytes([2, 2]) + struct.pack("<H", 257)
        level = parse_dat(level_bytes(fields=fields), 1)
        self.assertEqual(level["seconds"], 513)
        self.assertEqual(level["chips"], 257)

    def test_malformed_time_and_chip_overrides_rejected(self):
        for kind in (1, 2):
            for value in (b"", b"\x01", b"\x01\x00\x00"):
                with self.subTest(kind=kind, size=len(value)):
                    with self.assertRaises(ValueError):
                        parse_dat(level_bytes(fields=bytes([kind, len(value)]) + value), 1)

    def test_map_word_accepts_only_original_zero_or_one(self):
        for word in (0, 1):
            self.assertEqual(parse_dat(level_bytes(map_word=word), 1)["chips"], 1)
        for word in (2, 65535):
            with self.subTest(map_word=word):
                with self.assertRaises(ValueError):
                    parse_dat(level_bytes(map_word=word), 1)

    def test_reordered_level_numbers_are_not_searched_by_number(self):
        data = struct.pack("<IH", 0x0002AAAC, 2)
        data += level_bytes(number=2)[6:] + level_bytes(number=1)[6:]
        for number in (1, 2):
            with self.subTest(level=number):
                with self.assertRaises(ValueError):
                    parse_dat(data, number)

    def test_truncated_layers_and_out_of_range_levels_rejected(self):
        for data in (level_bytes()[:-1], level_bytes()[:30]):
            with self.assertRaises(ValueError):
                parse_dat(data, 1)
        with self.assertRaises(ValueError):
            parse_dat(level_bytes(), 2)

    def test_clone_records_keep_eight_byte_stride(self):
        links = struct.pack("<8H", 2, 3, 4, 5, 6, 7, 8, 9)
        level = parse_dat(level_bytes(fields=bytes([5, len(links)]) + links), 1)
        self.assertEqual(level["clones"], links)
        self.assertEqual(level["cloneCount"], 2)

    def test_ms_stepping_values_are_accepted(self):
        for stepping in range(8):
            with self.subTest(stepping=stepping):
                validate_replay(replay(stepping=stepping), 1000)

    def test_bad_inputs_and_unsupported_phase_fail_closed(self):
        invalid_phases = [replay(stepping=value) for value in
                          (None, True, -1, 8, 4.0, "4")]
        for value in (*invalid_phases, replay([{"when": 0, "dir": 3}]),
                      replay([{"when": 1, "dir": 8}, {"when": 1, "dir": 8}]),
                      replay(bestTimeTicks=2_000_000)):
            with self.assertRaises((ValueError, UnsupportedReplay)):
                validate_replay(value, 1000)


@unittest.skipUnless(os.environ.get("MSCC_EXE"), "set MSCC_EXE to a licensed executable")
class BinaryTests(unittest.TestCase):
    def setUp(self):
        self.engine = MSCC(os.environ["MSCC_EXE"])

    def test_collect_chip_and_win_without_ui_level_advance(self):
        result = run_replay(self.engine, level_bytes(), 1, replay())
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["pos"], 36)
        self.assertEqual(result["final"]["chips"], 0)
        self.assertEqual(result["final"]["time"], 10)
        self.assertEqual(result["final"]["tick"], 8)

    def test_optional_fields_control_runtime_counters(self):
        fields = bytes([1, 2, 27, 0, 2, 2, 1, 0])
        result = run_replay(self.engine, level_bytes(fields=fields, chips=99), 1, replay())
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["chips"], 0)
        self.assertEqual(result["final"]["time"], 27)

    def test_death_stops_before_windows_restart_dialog(self):
        result = run_replay(self.engine, level_bytes({34: 0x2A}), 1, replay())
        self.assertEqual(result["status"], "dead")
        self.assertEqual(result["final"]["dead"], 3)
        self.assertEqual(result["final"]["tick"], 0)

    def test_each_phase_preserves_full_first_and_later_seconds(self):
        for stepping in range(8):
            with self.subTest(stepping=stepping):
                engine = MSCC(os.environ["MSCC_EXE"])
                engine.load_bytes(level_bytes(), 1, stepping=stepping)
                for tick in range(41):
                    engine.advance(tick)
                    self.assertEqual(engine.snapshot()["time"],
                                     10 if tick < 20 else 9 if tick < 40 else 8)

    def test_phase_changes_teeth_turns_without_shifting_normal_monsters(self):
        tiles = {33: 1, 97: 0x6F, 104: 0x55, 136: 0x49}
        tiles.update({pos: 0 for pos in list(range(98, 104)) + list(range(129, 136))})
        fields = bytes([10, 4, 8, 3, 8, 4])
        data = level_bytes(tiles, fields=fields)
        for stepping in range(8):
            with self.subTest(stepping=stepping):
                engine = MSCC(os.environ["MSCC_EXE"])
                engine.load_bytes(data, 1, stepping=stepping)
                board = engine.ds * 16 + engine.gs
                positions = []
                for tick in range(17):
                    engine.advance(tick)
                    top = bytes(engine.u.mem_read(board, 1024))
                    if tick in (0, 4, 8, 12, 16):
                        positions.append((top.index(0x55), top.index(0x49)))
                expected_teeth = ([104, 104, 103, 103, 102] if stepping < 4 else
                                  [104, 103, 103, 102, 102])
                self.assertEqual(positions, list(zip(expected_teeth, [136, 135, 134, 133, 132])))

    def test_stepping_four_keyboard_win_preserves_countdown_order(self):
        moves = [{"when": 0, "dir": 8}, {"when": 4, "dir": 8}, {"when": 20, "dir": 8}]
        result = run_replay(self.engine, level_bytes(), 1,
                            replay(moves, bestTimeTicks=20, stepping=4))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["tick"], 20)
        self.assertEqual(result["final"]["time"], 9)

    def test_stepping_four_mouse_win_precedes_countdown(self):
        result = run_replay(self.engine, level_bytes(), 1,
                            replay([{"when": 8, "dir": 199}], bestTimeTicks=20, stepping=4))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["tick"], 20)
        self.assertEqual(result["final"]["time"], 10)

    def test_native_rng_runs_original_srand_and_rand_from_startup_clock_low_word(self):
        engine = MSCC(os.environ["MSCC_EXE"], native_rng_startup_ms=65537)
        self.assertEqual([engine.call(1, 0xDC) for _ in range(3)], [41, 18467, 6334])
        self.assertEqual(engine.rng_calls, 3)

    def test_research_seed_runs_original_rng_and_accepts_both_boundaries(self):
        for seed, first in ((0, 38), (1, 41), (65535, 17440)):
            with self.subTest(seed=seed):
                engine = MSCC(os.environ["MSCC_EXE"], research_rng_seed=seed)
                self.assertEqual(engine.call(1, 0xDC), first)
                if seed == 1:
                    self.assertEqual([engine.call(1, 0xDC) for _ in range(2)], [18467, 6334])

    def test_research_replay_repeats_and_stays_distinct_from_tws_rng(self):
        data = level_bytes({100: 0x5C}, fields=bytes([10, 2, 4, 3]))
        traces = []
        for tws_seed in (1, 987654321):
            engine = MSCC(os.environ["MSCC_EXE"], research_rng_seed=0)
            trace = []
            result = run_replay(engine, data, 1, replay(randomSeed=tws_seed), trace=trace)
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["rng"]["mode"], "research-fixed-seed")
            self.assertEqual(result["rng"]["seed"], 0)
            self.assertEqual(result["rng"]["seedSource"], "explicit")
            self.assertIsNone(result["rng"]["startupMilliseconds"])
            self.assertEqual(result["rng"]["twsRandomSeed"], tws_seed)
            self.assertGreater(result["rng"]["calls"], 0)
            self.assertEqual(result["validationPurpose"], "controlled-rng-research")
            self.assertIs(result["scoreboardEligible"], False)
            traces.append(trace)
        self.assertEqual(traces[0], traces[1])

    def run_cli(self, options, replay_value=None, data=None):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            dat = level_bytes() if data is None else data
            (root / "pack.dat").write_bytes(dat)
            request = {"schemaVersion": 1, "level": 1,
                       "datSha256": hashlib.sha256(dat).hexdigest(),
                       "twsSha256": "a" * 64,
                       "replay": replay() if replay_value is None else replay_value}
            (root / "input.json").write_text(json.dumps(request))
            output = root / "result.json"
            process = subprocess.run([
                sys.executable, str(Path(__file__).with_name("oracle.py")),
                "--exe", os.environ["MSCC_EXE"], "--dat", str(root / "pack.dat"),
                "--replay-json", str(root / "input.json"), "--output", str(output),
                *options], capture_output=True, text=True, timeout=15)
            return process, json.loads(output.read_text()) if output.exists() else None

    def test_cli_direct_research_seed_and_tws_seed_are_explicit_and_reproducible(self):
        for options, source in ((["--research-rng-seed", "0"], "explicit"),
                                (["--research-rng-from-tws"], "tws")):
            with self.subTest(source=source):
                process, result = self.run_cli(options, replay(randomSeed=0))
                self.assertEqual(process.returncode, 0, process.stderr)
                self.assertEqual(result["rng"]["seed"], 0)
                self.assertEqual(result["rng"]["seedSource"], source)
                self.assertIs(result["scoreboardEligible"], False)
                self.assertIs(json.loads(process.stdout)["scoreboardEligible"], False)
                self.assertEqual(result["twsSha256"], "a" * 64)

    def test_cli_research_does_not_truncate_or_default_invalid_tws_seeds(self):
        for seed in (None, -1, 65536, True, 1.5, "1"):
            with self.subTest(seed=seed):
                process, result = self.run_cli(["--research-rng-from-tws"], replay(randomSeed=seed))
                self.assertEqual(process.returncode, 1, process.stderr)
                self.assertEqual(result["status"], "error")
                self.assertIn("16-bit", result["error"])
                self.assertIs(result["scoreboardEligible"], False)

    def test_cli_research_failure_retains_provenance(self):
        process, result = self.run_cli(["--research-rng-seed", "12"],
                                       replay([{"when": 0, "dir": 3}]))
        self.assertEqual(process.returncode, 1)
        self.assertEqual(result["status"], "error")
        self.assertEqual(result["rng"]["seed"], 12)
        self.assertEqual(result["rng"]["seedSource"], "explicit")
        self.assertIs(result["scoreboardEligible"], False)
        self.assertEqual(result["datSha256"], hashlib.sha256(level_bytes()).hexdigest())
        self.assertEqual(result["level"], 1)

    def test_cli_rng_modes_are_mutually_exclusive(self):
        for options in (["--research-rng-seed", "1", "--native-rng"],
                        ["--research-rng-from-tws", "--native-rng-startup-ms", "1"],
                        ["--research-rng-seed", "1", "--research-rng-from-tws"]):
            with self.subTest(options=options):
                process, result = self.run_cli(options)
                self.assertEqual(process.returncode, 2)
                self.assertIn("not allowed with argument", process.stderr)
                self.assertIsNone(result)

    def test_native_rng_does_not_use_the_tws_random_seed(self):
        data = level_bytes({100: 0x5C}, fields=bytes([10, 2, 4, 3]))
        traces, counts = [], []
        for seed in (1, 987654321):
            engine = MSCC(os.environ["MSCC_EXE"], native_rng_startup_ms=65537)
            trace = []
            result = run_replay(engine, data, 1, replay(randomSeed=seed), trace=trace)
            self.assertEqual(result["status"], "completed")
            self.assertEqual(result["rng"]["mode"], "native-startup-clock")
            self.assertEqual(result["rng"]["seed"], 1)
            self.assertEqual(result["rng"]["twsRandomSeed"], seed)
            self.assertGreater(result["rng"]["calls"], 0)
            traces.append(trace)
            counts.append(result["rng"]["calls"])
        self.assertEqual(traces[0], traces[1])
        self.assertEqual(counts[0], counts[1])
        with self.assertRaisesRegex(UnsupportedReplay, "RNG"):
            run_replay(self.engine, data, 1, replay())

    def test_mouse_win_halts_before_same_tick_countdown(self):
        result = run_replay(self.engine, level_bytes(), 1,
                            replay([{"when": 8, "dir": 199}], bestTimeTicks=20))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["tick"], 20)
        self.assertEqual(result["final"]["time"], 10)

    def test_manual_win_follows_same_tick_countdown(self):
        moves = [{"when": 0, "dir": 8}, {"when": 4, "dir": 8},
                 {"when": 20, "dir": 8}]
        result = run_replay(self.engine, level_bytes(), 1,
                            replay(moves, bestTimeTicks=20))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["tick"], 20)
        self.assertEqual(result["final"]["time"], 9)

    def test_first_monster_move_is_on_replay_tick_four(self):
        fields = bytes([10, 2, 4, 3])
        self.engine.load_bytes(level_bytes({100: 0x48, 68: 0}, fields=fields), 1)
        board = self.engine.ds * 16 + self.engine.gs
        for tick in range(5):
            self.engine.advance(tick)
            monster_position = 100 if tick < 4 else 68
            self.assertEqual(bytes(self.engine.u.mem_read(board + monster_position, 1)), b"\x48")

    def test_mouse_click_clears_buffer_like_original_window_handler(self):
        self.engine.load_bytes(level_bytes(), 1)
        self.engine.advance(0, 8)
        self.engine.advance(1, 2)
        self.assertEqual(self.engine.snapshot()["buffered"], 1)
        self.engine.advance(2, 198)  # two tiles east of the current location
        self.assertEqual(self.engine.snapshot()["buffered"], 0)

    def test_mouse_follows_target_and_reaches_exit(self):
        result = run_replay(self.engine, level_bytes(), 1,
                            replay([{"when": 0, "dir": 199}], bestTimeTicks=12))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["final"]["tick"], 12)

    def test_random_behavior_is_explicitly_unsupported(self):
        self.engine.load_bytes(level_bytes(), 1)
        with self.assertRaisesRegex(UnsupportedReplay, "RNG"):
            self.engine.call(1, 0xDC)

    def test_wrong_executable_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "wrong.exe"
            path.write_bytes(b"not the original executable")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                MSCC(path)

    def test_two_clone_connections_survive_loading(self):
        links = struct.pack("<8H", 2, 3, 4, 5, 6, 7, 8, 9)
        self.engine.load_bytes(level_bytes(fields=bytes([5, len(links)]) + links), 1)
        self.assertEqual(self.engine.r16(self.engine.gs + 0x946), 2)
        segment = self.engine.r16(self.engine.gs + 0x94E)
        self.assertEqual(bytes(self.engine.u.mem_read(segment * 16, 16)), links)


if __name__ == "__main__":
    unittest.main()
