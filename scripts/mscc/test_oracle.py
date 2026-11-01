"""Synthetic adapter tests; no original game assets or private routes are included."""
import os
from pathlib import Path
import struct
import tempfile
import unittest

from oracle import MSCC, UnsupportedReplay, parse_dat, run_replay, validate_replay


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

    def test_bad_inputs_and_unsupported_phase_fail_closed(self):
        for value in (replay(stepping=4), replay([{"when": 0, "dir": 3}]),
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

    def test_first_second_is_exactly_twenty_replay_ticks(self):
        self.engine.load_bytes(level_bytes(), 1)
        for tick in range(21):
            self.engine.advance(tick)
            self.assertEqual(self.engine.snapshot()["time"], 10 if tick < 20 else 9)

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
