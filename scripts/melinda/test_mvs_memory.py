"""Synthetic MVS resource tests; no private level data."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from mvs_memory import configure_input, memory_plan, inspect_log


PROTOCOL = """level synthetic
bfsearch statenum 1 bucketsM 100 bucketsBL 100 bucketsOH 100 maxtick 40 thr 1 delay 1.0 vic none target 0x0
bfoptions noslaps 1 nowaits 0
bfrecycle MAINflush 90 BLflush 90 OHflush 90 BLmb 1536 OHmb 1536
quit
"""


class MemoryTests(unittest.TestCase):
    def test_cli_preserves_line_endings_and_hashes_exact_input_bytes(self):
        original = PROTOCOL.replace("\n", "\r\n").encode()
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.input"
            output = Path(folder) / "budgeted.input"
            source.write_bytes(original)
            subprocess.run(
                [sys.executable, str(Path(__file__).with_name("mvs_memory.py")),
                 "configure", "--input", str(source), "--output", str(output),
                 "--memory-mib", "4096"],
                check=True, capture_output=True, timeout=10,
            )
            receipt = json.loads(Path(str(output) + ".memory.json").read_text())
            self.assertEqual(receipt["inputSha256"], hashlib.sha256(original).hexdigest())
            configured, _ = configure_input(original.decode(), 4096)
            self.assertEqual(output.read_bytes(), configured.encode())
            self.assertEqual(receipt["outputSha256"], hashlib.sha256(output.read_bytes()).hexdigest())

    def test_budget_includes_old_and_new_pagers_during_flush(self):
        for budget in (1024, 4096, 12288, 32768, 65536):
            plan = memory_plan(budget)
            peak = (plan["hashBytes"] + 2 * (plan["blockPagerMiB"]
                    + plan["otherPagerMiB"]) * 1048576
                    + plan["reserveMiB"] * 1048576)
            self.assertLessEqual(peak, budget * 1048576)
        self.assertGreater(memory_plan(12288)["otherPagerMiB"], 1536)

    def test_preserves_search_semantics_and_changes_only_memory(self):
        configured, plan = configure_input(PROTOCOL, 12288)
        self.assertIn("maxtick 40 thr 1 delay 1.0 vic none target 0x0", configured)
        self.assertIn("bfoptions noslaps 1 nowaits 0\n", configured)
        self.assertIn(f"OHmb {plan['otherPagerMiB']}", configured)
        self.assertIn("MAINflush 90 BLflush 90 OHflush 90", configured)
        self.assertEqual(configured.splitlines()[0], "level synthetic")

    def test_rejects_ambiguous_protocol_and_invalid_budgets(self):
        for text in (PROTOCOL + PROTOCOL, PROTOCOL.replace("bfrecycle", "other"),
                     PROTOCOL.replace("bucketsOH 100", "bucketsOH -1"),
                     PROTOCOL.replace("bfsearch", "dfsearch")):
            with self.subTest(text=text), self.assertRaises(ValueError):
                configure_input(text, 4096)
        for budget in (True, 0, 1000, 65537):
            with self.subTest(budget=budget), self.assertRaises(ValueError):
                memory_plan(budget)

    def test_low_table_occupancy_can_still_exceed_pager_limit(self):
        log = """Other hash will be flushed at 90.0% and 1000mb
OHnew:123 (1 buckets, 1mb, 20.0%) [overflow]
OHbytes: 60.00 pages [16mb each] (960mb 1000.0 bytes/entry)
Calculation stopped by Other Hash Overflow
bfsearch is complete
"""
        report = inspect_log(log, 0)
        self.assertFalse(report["completedNormally"])
        self.assertEqual(report["resourceCause"], "other-pager-live-frontier")
        self.assertEqual(report["otherTablePercent"], 20.0)
        self.assertEqual(report["otherPagerMiB"], 960)

    def test_table_limit_and_unknown_overflow_are_not_mislabeled(self):
        log = """Other hash will be flushed at 90.0% and 1000mb
OHnew:123 (1 buckets, 1mb, 85.0%) [overflow]
OHbytes: 1.00 pages [16mb each] (16mb 1000.0 bytes/entry)
Calculation stopped by Other Hash Overflow
"""
        self.assertEqual(inspect_log(log, 0)["resourceCause"], "other-table-live-frontier")
        unknown = inspect_log("Calculation stopped by Other Hash Overflow\n", 0)
        self.assertEqual(unknown["resourceCause"], "other-overflow-unspecified")

    def test_normal_text_requires_successful_process_exit(self):
        log = "Calculation ended normally\nbfsearch is complete\n"
        self.assertTrue(inspect_log(log, 0)["completedNormally"])
        self.assertFalse(inspect_log(log, 124)["completedNormally"])
        self.assertFalse(inspect_log(log, None)["completedNormally"])

    def test_previous_search_cannot_supply_final_completion_or_overflow(self):
        normal = "bfsearch: maxtick 40\nCalculation ended normally\nbfsearch is complete\n"
        stopped = "bfsearch: maxtick 50\nCalculation stopped by Other Hash Overflow\n"
        self.assertFalse(inspect_log(normal + stopped, 0)["completedNormally"])
        self.assertTrue(inspect_log(stopped + normal, 0)["completedNormally"])
        self.assertFalse(inspect_log(normal + "bfsearch: maxtick 60\n", 0)["completedNormally"])


if __name__ == "__main__":
    unittest.main()
