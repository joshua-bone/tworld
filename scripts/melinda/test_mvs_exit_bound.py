"""Synthetic search-policy tests; no game assets or private routes."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from mvs_exit_bound import EXPECTED, JOIN, PARSE, apply


HARNESS = r'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
typedef int boolean;
#define TRUE 1
#define FALSE 0
#define BITS56 0xffffffffffffffULL
#define bCHIP_DIES 1
#define bCHIP_WINS 2
typedef struct { uint64_t MAIN_HASH1; int tick, node; } tSTATE;
static uint64_t TARGET_MH1_BITS56 = 999;
static struct { int tick, mv; } STORED_WIN[4] = {{10, 0}, {20, 1}, {30, 2}, {40, 3}};
static int copies, mode;
static int find_stored_win_hash(tSTATE *s) { return s->node < 4 ? s->node : -1; }
static void copy_state(tSTATE *to, tSTATE *from) { *to = *from; copies++; }
static void clear_state(tSTATE *s) { (void)s; copies--; }
static int move_routine(tSTATE *s, int mv, int limit) {
    (void)mv; (void)limit;
    if (mode == 3) return 0; /* non-progressing stored suffix */
    s->tick += 2;
    if (mode == 2) return 0; /* repeated world with increasing clock */
    if (mode == 1) return bCHIP_DIES | bCHIP_WINS;
    s->node++;
    return s->node == 2 ? bCHIP_WINS : 0;
}
'''
MAIN = r'''
int main(int argc, char **argv) {
    MVS_EXIT_TICK_LIMIT = read_exit_tick_limit();
    if (argc == 1) { printf("value=%d\n", MVS_EXIT_TICK_LIMIT); return 0; }
    mode = atoi(argv[1]);
    tSTATE s = {123, 6, 0}, original = s;
    int accepted = improves_stored_win(&s);
    if (memcmp(&s, &original, sizeof s) || copies != 0) return 3;
    printf("accepted=%d\n", accepted);
    return 0;
}
'''


@unittest.skipUnless(shutil.which("cc"), "C compiler required")
class BoundPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        source = root / "policy.c"
        source.write_text(HARNESS + PARSE + JOIN + MAIN)
        cls.binary = root / "policy"
        subprocess.run(["cc", "-std=c99", "-Wall", "-Wextra", "-Werror",
                        str(source), "-o", str(cls.binary)], check=True, timeout=20)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_policy(self, limit=None, mode=None):
        env = dict(os.environ)
        env.pop("MVS_EXIT_TICK_LIMIT", None)
        if limit is not None:
            env["MVS_EXIT_TICK_LIMIT"] = str(limit)
        args = [str(self.binary)] + ([] if mode is None else [str(mode)])
        return subprocess.run(args, env=env, capture_output=True, text=True, timeout=3)

    def test_strict_limit_and_unset_default(self):
        for value, expected in [(None, 65535), (1, 1), (10, 10), (65535, 65535)]:
            with self.subTest(value=value):
                result = self.run_policy(value)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f"value={expected}\n", result.stdout)
        for value in ["", "0", "-1", "65536", "10x", "1.5", " 10", "9" * 100]:
            with self.subTest(value=value):
                result = self.run_policy(value)
                self.assertEqual(result.returncode, 2)
                self.assertIn("must be an integer", result.stderr)

    def test_full_suffix_bound_and_candidate_isolation(self):
        # The same early join exits at10: reject9, accept the inclusive10.
        for limit, expected in [(None, 1), (9, 0), (10, 1), (11, 1)]:
            with self.subTest(limit=limit):
                result = self.run_policy(limit, 0)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(f"accepted={expected}\n", result.stdout)

    def test_dead_cyclic_and_nonprogressing_suffixes_rejected(self):
        for mode in (1, 2, 3):
            with self.subTest(mode=mode):
                result = self.run_policy(12, mode)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("accepted=0\n", result.stdout)


class SourceGuardTests(unittest.TestCase):
    def test_unknown_sources_are_rejected_without_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in EXPECTED:
                (root / name).write_bytes(b"unknown source")
            with self.assertRaisesRegex(ValueError, "unrecognized MVS source"):
                apply(root)
            for name in EXPECTED:
                self.assertEqual((root / name).read_bytes(), b"unknown source")
