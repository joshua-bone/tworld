"""Budget stock MVS 9.74 breadth-search memory and explain stopped searches."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re

from setup import outside_git


MIB = 1048576


def memory_plan(memory_mib):
    """Plan one process, including simultaneous old/new pagers during recycling.

    This is an allocation plan, not an OS memory limit. Queues, reconstruction,
    TSP and a single breadth layer can exceed the reserve; bound the process too.
    """
    if type(memory_mib) is not int or not 1024 <= memory_mib <= 65536:
        raise ValueError("per-process memory must be 1024..65536 MiB")
    reserve = max(256, memory_mib // 4)
    main_buckets = (memory_mib // 16) * MIB // (4096 * 12)
    block_buckets = max(16, memory_mib // 256) * 16
    other_buckets = max(32, memory_mib // 64) * 16
    hashes = (main_buckets * 4096 * 12
              + (block_buckets + other_buckets) * 4096 * 16)
    pager_mib = ((memory_mib - reserve) * MIB - hashes) // (2 * MIB)
    block_mib = max(16, (pager_mib // 8) // 16 * 16)
    other_mib = (pager_mib - block_mib) // 16 * 16
    return {
        "perProcessMiB": memory_mib, "reserveMiB": reserve,
        "mainBuckets": main_buckets, "blockBuckets": block_buckets,
        "otherBuckets": other_buckets, "hashBytes": hashes,
        "blockPagerMiB": block_mib, "otherPagerMiB": other_mib,
        "pagerCopiesReserved": 2, "hardLimitEnforced": False,
    }


def configure_input(text, memory_mib):
    """Change capacity fields only, preserving one complete search protocol."""
    plan = memory_plan(memory_mib)
    lines = text.splitlines(keepends=True)
    searches = [i for i, line in enumerate(lines) if line.startswith("bfsearch ")]
    recycles = [i for i, line in enumerate(lines) if line.startswith("bfrecycle ")]
    if len(searches) != 1 or len(recycles) != 1 or recycles[0] <= searches[0]:
        raise ValueError("expected one bfsearch followed by one bfrecycle")
    fields = {
        searches[0]: {"bucketsM": plan["mainBuckets"],
                      "bucketsBL": plan["blockBuckets"],
                      "bucketsOH": plan["otherBuckets"]},
        recycles[0]: {"BLmb": plan["blockPagerMiB"],
                     "OHmb": plan["otherPagerMiB"]},
    }
    for index, replacements in fields.items():
        for field, value in replacements.items():
            pattern = rf"(?<!\S){field} ([0-9]+)(?=\s|$)"
            if len(re.findall(pattern, lines[index])) != 1:
                raise ValueError(f"missing or invalid {field}")
            lines[index] = re.sub(pattern, f"{field} {value}", lines[index])
    return "".join(lines), plan


def inspect_log(text, exit_code=None):
    """Report evidence for the final breadth search, never infer exhaustion.

    Upstream OH_OVER also means that a recycled live frontier exceeds 90% of
    the pager limit. The generic 'Hash Overflow' message alone is ambiguous.
    """
    text = text[text.rfind("bfsearch: maxtick "):] if "bfsearch: maxtick " in text else text
    stops = re.findall(r"Calculation stopped by ([^\r\n]+)", text)
    reason = stops[-1] if stops else None
    report = {
        "exitCode": exit_code, "stopReason": reason, "resourceCause": None,
        "completedNormally": (exit_code == 0 and reason is None
                              and "Calculation ended normally" in text
                              and "bfsearch is complete" in text),
    }
    if reason != "Other Hash Overflow":
        return report
    report["resourceCause"] = "other-overflow-unspecified"
    settings = re.findall(r"Other hash will be flushed at ([\d.]+)% and (\d+)mb", text)
    # An [overflow] line is emitted only by the post-recycle live-frontier check.
    flushed = re.findall(
        r"OHnew:[^\n]*, ([\d.]+)%\) \[overflow\]\s*"
        r"OHbytes:[^\n]*\((\d+)mb [^\n]*\)", text)
    if settings and flushed:
        flush_percent, pager_limit = map(float, settings[-1])
        table_percent, pager_mib = map(float, flushed[-1])
        report.update(otherTablePercent=table_percent, otherPagerMiB=int(pager_mib),
                      configuredOtherPagerMiB=int(pager_limit))
        # Logs round percentages to 0.1; use a margin before attributing a cause.
        table = table_percent > flush_percent * 0.9 + 0.05
        pager = pager_mib > pager_limit * 0.9
        if table and pager:
            report["resourceCause"] = "other-table-and-pager-live-frontier"
        elif pager:
            report["resourceCause"] = "other-pager-live-frontier"
        elif table:
            report["resourceCause"] = "other-table-live-frontier"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    configure = commands.add_parser("configure")
    configure.add_argument("--input", type=Path, required=True)
    configure.add_argument("--output", type=Path, required=True)
    configure.add_argument("--memory-mib", type=int, required=True,
                           help="planning budget for ONE process, not the whole VM")
    inspect = commands.add_parser("inspect")
    inspect.add_argument("--log", type=Path, required=True)
    inspect.add_argument("--exit-code", type=int)
    args = parser.parse_args()
    if args.command == "inspect":
        print(json.dumps(inspect_log(args.log.read_text(), args.exit_code), indent=2))
        return
    os.umask(0o077)
    output = outside_git(args.output)
    receipt = output.with_name(output.name + ".memory.json")
    if output.exists() or receipt.exists():
        raise FileExistsError("output and memory receipt must be new")
    original = args.input.read_text()
    configured, plan = configure_input(original, args.memory_mib)
    plan.update(inputSha256=hashlib.sha256(original.encode()).hexdigest(),
                outputSha256=hashlib.sha256(configured.encode()).hexdigest())
    with output.open("x") as target:
        target.write(configured)
    with receipt.open("x") as target:
        target.write(json.dumps(plan, indent=2) + "\n")
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
