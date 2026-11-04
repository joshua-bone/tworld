"""Opt-in search-only patch for pinned MVS 9.74; does not change gameplay."""
from pathlib import Path
import hashlib

EXPECTED = {
    "bf-common.c": "0d3ba9622ff84c36a7fc8b95bf5bda6e18f573b05e33037127b175a05892682c",
    "bf-common-hash.c": "09a84f6e2648ee7472c39bdac668ff2dc2268d39e8ca013c749ce30cd93b51b4",
}

PARSE = r'''
/* Optional search-only full-exit bound, in absolute MVS ticks. */
static int MVS_EXIT_TICK_LIMIT = 0xffff;
static int
read_exit_tick_limit (void)
{
  const char *p = getenv ("MVS_EXIT_TICK_LIMIT");
  if (p == NULL)
    return 0xffff;
  int n = 0;
  if (*p == '\0')
    goto INVALID;
  for (; *p; p++)
    {
      if (*p < '0' || *p > '9')
        goto INVALID;
      n = n * 10 + (*p - '0');
      if (n > 65535)
        goto INVALID;
    }
  if (n == 0)
    goto INVALID;
  printf ("Search full-exit bound: %d MVS ticks\n", n);
  return n;
INVALID:
  fprintf (stderr, "MVS_EXIT_TICK_LIMIT must be an integer from 1 to 65535\n");
  exit (2);
}
'''
JOIN = r'''boolean
improves_stored_win (tSTATE *S)
{
  boolean candidate = ((S->MAIN_HASH1 & BITS56) == TARGET_MH1_BITS56);
  int z = find_stored_win_hash (S);
  if (!candidate && z != -1)
    candidate = (S->tick < STORED_WIN[z].tick);
  if (!candidate || MVS_EXIT_TICK_LIMIT == 0xffff)
    return candidate;

  /* Reject only the stored suffix, not the search state. The caller may
     still expand this state and discover a different continuation. */
  tSTATE T[1];
  copy_state (T, S);
  boolean accepted = FALSE;
  while (T->tick <= MVS_EXIT_TICK_LIMIT)
    {
      int w = find_stored_win_hash (T);
      if (w == -1 || STORED_WIN[w].mv == 0xff)
        break;
      int previous_tick = T->tick;
      int r = move_routine (T, STORED_WIN[w].mv, 65536);
      if (r & bCHIP_DIES)
        break;
      if (r & bCHIP_WINS)
        {
          accepted = (T->tick <= MVS_EXIT_TICK_LIMIT);
          break;
        }
      if (T->tick <= previous_tick)
        break;
    }
  clear_state (T);
  return accepted;
}
'''

def apply(directory):
    root = Path(directory)
    original = {}
    for name, digest in EXPECTED.items():
        data = (root / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError("unrecognized MVS source: " + name)
        original[name] = data.decode("utf-8")

    common = original["bf-common.c"]
    common = common.replace("static volatile int WIN_TIME;",
                            "static volatile int WIN_TIME;\n" + PARSE)
    common = common.replace("  BEGIN = UNIX_TIME ();",
                            "  MVS_EXIT_TICK_LIMIT = read_exit_tick_limit ();\n"
                            "  BEGIN = UNIX_TIME ();")
    common = common.replace("  WIN_TIME = 0xffff;",
                            "  WIN_TIME = MVS_EXIT_TICK_LIMIT;")

    hashes = original["bf-common-hash.c"]
    start = hashes.index("boolean\nimproves_stored_win (tSTATE *S)")
    end = hashes.index("\nstatic boolean\nULDR_input_winpath", start)
    hashes = hashes[:start] + JOIN + hashes[end:]
    # Direct wins must honor the bound before upstream's missing-path early stop.
    start = hashes.index("void\nunwind_win (")
    where = hashes.index("  if (MAIN_HASH_HAS_BEEN_FLUSHED)\n", start)
    hashes = hashes[:where] + """  if (!TRANS && S->tick > MVS_EXIT_TICK_LIMIT)
    {
      clear_state (S);
      return;
    }
""" + hashes[where:]
    hashes = hashes.replace(
        "    WIN_TIME = MAXTICK;",
        "    WIN_TIME = (MAXTICK < MVS_EXIT_TICK_LIMIT) ? MAXTICK : MVS_EXIT_TICK_LIMIT;")

    records = []
    for name, source in [("bf-common.c", common), ("bf-common-hash.c", hashes)]:
        data = source.encode("utf-8")
        (root / name).write_bytes(data)
        records.append({"path": name, "beforeSha256": EXPECTED[name],
                        "afterSha256": hashlib.sha256(data).hexdigest()})
    return {"name": "optional-full-exit-bound-v2", "gameplaySourceChanged": False,
            "environment": "MVS_EXIT_TICK_LIMIT", "files": records}
