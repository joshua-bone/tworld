"""Experimental headless adapter for a user-supplied, unmodified MSCC executable.

Runs original 16-bit instructions. Only Win16 allocation, presentation and terminal
UI boundaries are substituted. See README.md for timing and validation limits.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import time

from unicorn import Uc, UC_ARCH_X86, UC_MODE_16, UC_HOOK_CODE, UC_HOOK_MEM_INVALID
from unicorn.x86_const import (UC_X86_REG_AX, UC_X86_REG_BP, UC_X86_REG_CS,
                              UC_X86_REG_DS, UC_X86_REG_DX, UC_X86_REG_ES,
                              UC_X86_REG_IP, UC_X86_REG_SP, UC_X86_REG_SS)

EXE_SHA256 = "8e26acd67cf120bd5b512de4b4e78b80aca1579413cd04f3b2b68909a375866c"
VERSION = "experimental-3"
CARDINALS = {1: (0, -1), 2: (-1, 0), 4: (0, 1), 8: (1, 0)}


class UnsupportedReplay(ValueError):
    """The adapter cannot establish a result for this replay."""


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def take(self, size):
        if size < 0 or self.pos + size > len(self.data):
            raise ValueError("truncated binary data")
        value = self.data[self.pos:self.pos + size]
        self.pos += size
        return value

    def word(self):
        return struct.unpack("<H", self.take(2))[0]


def parse_dat(data, number):
    reader = Reader(data)
    if reader.take(4) != bytes.fromhex("acaa0200"):
        raise ValueError("expected an original MS DAT file")
    count = reader.word()
    if not isinstance(number, int) or not 1 <= number <= count:
        raise ValueError("level number out of range")
    selected = None
    for ordinal in range(1, count + 1):
        body = Reader(reader.take(reader.word()))
        level, seconds, chips, map_word = struct.unpack("<4H", body.take(8))
        if level != ordinal:
            raise ValueError("stored level number does not match record ordinal")
        if level != number:
            continue
        if map_word not in (0, 1):
            raise ValueError("unsupported original DAT map word")
        layers = []
        for _ in range(2):
            compressed = Reader(body.take(body.word()))
            layer = bytearray()
            while compressed.pos < len(compressed.data):
                tile = compressed.take(1)[0]
                if tile == 255:
                    run, tile = compressed.take(2)
                    if run == 0:
                        raise ValueError("zero-length DAT run")
                else:
                    run = 1
                if tile > 0x6F or len(layer) + run > 1024:
                    raise ValueError("invalid original DAT layer")
                layer.extend([tile] * run)
            if len(layer) != 1024:
                raise ValueError("DAT layer must contain 1024 tiles")
            layers.append(bytes(layer))
        fields = Reader(body.take(body.word()))
        selected = {"number": number, "count": count, "seconds": seconds,
                    "chips": chips, "layers": layers, "monsters": b"",
                    "traps": b"", "clones": b""}
        seen = set()
        while fields.pos < len(fields.data):
            kind, size = fields.take(2)
            value = fields.take(size)
            if kind in (1, 2):
                if size != 2:
                    raise ValueError("time/chip override must contain one word")
                selected["seconds" if kind == 1 else "chips"] = struct.unpack("<H", value)[0]
            elif kind in (4, 5, 10):
                if kind in seen:
                    raise ValueError("duplicate connection/monster field")
                seen.add(kind)
                key, stride = {4: ("traps", 10), 5: ("clones", 8),
                               10: ("monsters", 2)}[kind]
                if size % stride:
                    raise ValueError("misaligned connection/monster field")
                coordinates = value if kind == 10 else b"".join(
                    value[i:i + 8] for i in range(0, size, stride))
                values = coordinates if kind == 10 else struct.unpack(
                    "<" + "H" * (len(coordinates) // 2), coordinates)
                if any(v >= 32 for v in values):
                    raise ValueError("coordinate outside level")
                selected[key] = value
        selected["cloneCount"] = len(selected["clones"]) // 8
    if selected is None:
        raise ValueError("level not found")
    return selected


def native_startup_milliseconds():
    # Python 3.9 on macOS makes monotonic_ns process-relative. Read the system
    # monotonic clock directly where available, as Win16 GetCurrentTime did.
    if hasattr(time, "CLOCK_MONOTONIC"):
        return time.clock_gettime_ns(time.CLOCK_MONOTONIC) // 1_000_000
    return time.monotonic_ns() // 1_000_000


def timer_start_for_stepping(stepping):
    if type(stepping) is not int or not 0 <= stepping <= 7:
        raise UnsupportedReplay("MS stepping must be an integer from 0 to 7")
    # Original DoTick gates monsters by mod 2, Teeth/Blobs by mod 4, and
    # countdown by mod 10. Starting at 10 flips only the half-speed phase
    # while preserving a full first second. MS uses only stepping's bit 2.
    return 10 if stepping & 4 else 0


def validate_research_seed(seed):
    if type(seed) is not int or not 0 <= seed <= 65535:
        raise ValueError("research RNG seed must be a 16-bit integer from 0 to 65535")
    return seed


def research_rng_metadata(seed, source, tws_seed, calls):
    return {"mode": "research-fixed-seed", "seed": seed, "seedSource": source,
            "startupMilliseconds": None, "calls": calls, "twsRandomSeed": tws_seed}


def validate_replay(replay, max_ticks):
    timer_start_for_stepping(replay.get("stepping"))
    best = replay.get("bestTimeTicks")
    if type(best) is not int or not 0 <= best <= max_ticks:
        raise ValueError("replay time exceeds configured tick bound")
    previous = -1
    for move in replay["moves"]:
        tick, command = move["when"], move["dir"]
        if type(tick) is not int or not previous < tick <= max_ticks:
            raise ValueError("inputs must have increasing, bounded ticks")
        if type(command) is not int or (command not in CARDINALS and not 16 <= command <= 376):
            raise UnsupportedReplay("only cardinal keys and mouse targets are supported")
        previous = tick


class MSCC:
    # Ordinals and offsets are for EXE_SHA256 only, researched with magical/CHIPS.EXE.
    IMPORT_NAMES = {
        ("KERNEL", 15): "GlobalAlloc", ("KERNEL", 16): "GlobalReAlloc",
        ("KERNEL", 17): "GlobalFree", ("KERNEL", 18): "GlobalLock",
        ("KERNEL", 19): "GlobalUnlock", ("USER", 66): "GetDC",
        ("USER", 68): "ReleaseDC", ("USER", 124): "UpdateWindow",
        ("USER", 125): "InvalidateRect",
    }
    PRESENTATION = {(2, 0xC4), (2, 0x1CA), (2, 0x232), (2, 0x2B2),
                    (2, 0x306), (2, 0x56E), (2, 0xC1A), (2, 0xC7E),
                    (2, 0xCBE), (8, 0x56C)}

    def __init__(self, exe, native_rng_startup_ms=None, *, research_rng_seed=None,
                 research_rng_source="explicit"):
        if native_rng_startup_ms is not None and (
                type(native_rng_startup_ms) is not int or native_rng_startup_ms < 0):
            raise ValueError("native RNG startup milliseconds must be a nonnegative integer")
        if research_rng_seed is not None:
            validate_research_seed(research_rng_seed)
            if native_rng_startup_ms is not None:
                raise ValueError("native and research RNG modes are mutually exclusive")
        if research_rng_source not in ("explicit", "tws"):
            raise ValueError("research RNG source must be explicit or tws")
        self.native_rng_startup_ms = native_rng_startup_ms
        self.research_rng_seed = research_rng_seed
        self.research_rng_source = research_rng_source
        self.rng_calls = 0
        self.timer_start = 0
        data = Path(exe).read_bytes()
        if hashlib.sha256(data).hexdigest() != EXE_SHA256:
            raise ValueError("unsupported CHIPS.EXE SHA-256")
        self.u = Uc(UC_ARCH_X86, UC_MODE_16)
        self.u.mem_map(0, 0x200000)
        self.imports = {}
        self.calls = {}
        self.allocations = {}
        self.alloc_next = 0xB0000
        self.ds, self.gs, self.stop = 0xA000, 0x2000, 0xFFF00
        self.won, self.loaded, self.tick = False, False, -1
        self._load_executable(data)
        self.u.hook_add(UC_HOOK_CODE, self._hook)
        self.u.hook_add(UC_HOOK_MEM_INVALID, self._invalid_memory)
        for register, value in ((UC_X86_REG_DS, self.ds), (UC_X86_REG_ES, self.ds),
                                (UC_X86_REG_SS, self.ds), (UC_X86_REG_SP, 0xF000)):
            self.u.reg_write(register, value)
        self.w16(0x1680, self.gs)
        self.w16(0x22, 0)
        self.w16(0x24, 0)
        self.w16(0x64E, 0)
        if research_rng_seed is not None:
            # Deliberate, non-scoreboard seed control. Execute original srand/rand.
            self.call(1, 0xC4, [research_rng_seed])
        elif native_rng_startup_ms is not None:
            # CreateWindowsAndInitGame passes GetCurrentTime's low word to srand.
            # Run that original function; never interpret a TWS seed as its state.
            self.call(1, 0xC4, [native_rng_startup_ms & 0xFFFF])

    def _load_executable(self, data):
        ne = struct.unpack_from("<I", data, 0x3C)[0]
        table = ne + struct.unpack_from("<H", data, ne + 0x22)[0]
        align = struct.unpack_from("<H", data, ne + 0x32)[0]
        modules = ["KERNEL", "GDI", "USER", "WEP4UTIL"]
        by_name = {}
        for index in range(10):
            offset, size, _flags, _capacity = struct.unpack_from("<4H", data, table + 8 * index)
            offset <<= align
            segment = bytearray(data[offset:offset + size])
            relocations = struct.unpack_from("<H", data, offset + size)[0]
            for relocation in range(relocations):
                kind, flags, source, module, ordinal = struct.unpack_from(
                    "<BBHHH", data, offset + size + 2 + 8 * relocation)
                if flags == 0 and kind == 2:
                    value = struct.pack("<H", module * 0x1000)
                elif flags == 1 and kind in (3, 5):
                    library = modules[module - 1]
                    name = library + "." + self.IMPORT_NAMES.get((library, ordinal), str(ordinal))
                    if name not in by_name:
                        stub = 0xF0000 + len(by_name) * 16
                        by_name[name] = stub
                        self.imports[stub] = name
                        self.u.mem_write(stub, b"\xCB")
                    stub = by_name[name]
                    value = (struct.pack("<HH", stub - 0xF0000, 0xF000) if kind == 3
                             else struct.pack("<H", stub - 0xF0000))
                else:
                    raise ValueError("unsupported NE relocation")
                visited = set()
                while source != 0xFFFF:
                    if source in visited or source + len(value) > len(segment):
                        raise ValueError("invalid NE relocation chain")
                    visited.add(source)
                    link = struct.unpack_from("<H", segment, source)[0]
                    segment[source:source + len(value)] = value
                    source = link
            self.u.mem_write((index + 1) * 0x10000, bytes(segment))

    def _invalid_memory(self, _u, access, address, size, _value, _data):
        raise RuntimeError(f"invalid emulated memory access {access}: {address:#x}, {size}")

    def r16(self, offset):
        return struct.unpack("<H", self.u.mem_read(self.ds * 16 + offset, 2))[0]

    def w16(self, offset, value):
        self.u.mem_write(self.ds * 16 + offset, struct.pack("<H", value & 0xFFFF))

    def _allocate(self, size):
        address = self.alloc_next
        self.alloc_next += ((size + 15) // 16) * 16 + 16
        if self.alloc_next >= 0xEF000:
            raise RuntimeError("emulated allocation limit exceeded")
        handle = address >> 4
        self.allocations[handle] = (address, size)
        return handle

    def _return(self, cleanup=0, ax=1, dx=None):
        stack = self.u.reg_read(UC_X86_REG_SP)
        segment = self.u.reg_read(UC_X86_REG_SS)
        ip, cs = struct.unpack("<HH", self.u.mem_read(segment * 16 + stack, 4))
        self.u.reg_write(UC_X86_REG_SP, (stack + 4 + cleanup) & 0xFFFF)
        self.u.reg_write(UC_X86_REG_AX, ax & 0xFFFF)
        if dx is not None:
            self.u.reg_write(UC_X86_REG_DX, dx & 0xFFFF)
        self.u.reg_write(UC_X86_REG_CS, cs)
        self.u.reg_write(UC_X86_REG_IP, ip)

    def _halt_call(self):
        self.u.reg_write(UC_X86_REG_CS, self.stop >> 4)
        self.u.reg_write(UC_X86_REG_IP, 0)
        self.u.emu_stop()

    def _hook(self, _u, address, _size, _data):
        if address == self.stop:
            self.u.emu_stop()
            return
        location = divmod(address, 65536)
        if location == (1, 0xDC):
            if self.native_rng_startup_ms is None and self.research_rng_seed is None:
                raise UnsupportedReplay("MSCC RNG called; TWS seed translation is not supported; "
                                        "choose native RNG or controlled research RNG explicitly")
            self.rng_calls += 1  # Continue into the original rand instructions.
        if location == (7, 0xCCA):
            self.won = True
            self._halt_call()
            return
        if location == (2, 0xB9A):
            self._halt_call()  # Autopsy has already been set; do not run restart UI.
            return
        if location in self.PRESENTATION:
            self._return()
            return
        if address not in self.imports:
            return
        name = self.imports[address]
        self.calls[name] = self.calls.get(name, 0) + 1
        stack = self.u.reg_read(UC_X86_REG_SP)
        segment = self.u.reg_read(UC_X86_REG_SS)
        args = struct.unpack("<8H", self.u.mem_read(segment * 16 + stack + 4, 16))
        cleanup = {"USER.GetDC": 2, "USER.ReleaseDC": 4, "USER.InvalidateRect": 8,
                   "USER.UpdateWindow": 2, "KERNEL.GlobalUnlock": 2}
        if name in cleanup:
            self._return(cleanup[name])
        elif name == "KERNEL.GlobalAlloc":
            self._return(6, ax=self._allocate(args[0] + (args[1] << 16)))
        elif name == "KERNEL.GlobalLock":
            if args[0] not in self.allocations:
                raise RuntimeError("locking an unknown allocation")
            self._return(2, ax=0, dx=args[0])
        elif name == "KERNEL.GlobalFree":
            self.allocations.pop(args[0], None)
            self._return(2, ax=0)
        elif name == "KERNEL.GlobalReAlloc":
            size, old = args[1] + (args[2] << 16), args[3]
            new = self._allocate(size)
            old_address, old_size = self.allocations.pop(old)
            self.u.mem_write(new * 16, bytes(self.u.mem_read(old_address, min(size, old_size))))
            self._return(8, ax=new)
        else:
            raise UnsupportedReplay(f"unsupported Win16 import: {name}")

    def call(self, segment, offset, args=()):
        self.u.reg_write(UC_X86_REG_SP, 0xF000)
        self.u.reg_write(UC_X86_REG_BP, 0)

        def push(value):
            stack = (self.u.reg_read(UC_X86_REG_SP) - 2) & 0xFFFF
            self.u.reg_write(UC_X86_REG_SP, stack)
            self.w16(stack, value)

        for arg in reversed(args):
            push(arg)
        push(self.stop >> 4)
        push(0)
        self.u.reg_write(UC_X86_REG_CS, segment * 0x1000)
        self.u.reg_write(UC_X86_REG_IP, offset)
        self.u.emu_start(segment * 0x10000 + offset, 0, timeout=2_000_000, count=2_000_000)
        address = self.u.reg_read(UC_X86_REG_CS) * 16 + self.u.reg_read(UC_X86_REG_IP)
        if address != self.stop:
            raise RuntimeError("emulated instruction/time bound exceeded")
        return self.u.reg_read(UC_X86_REG_AX)

    def load_bytes(self, data, number, stepping=0):
        timer_start = timer_start_for_stepping(stepping)
        if self.loaded:
            raise ValueError("create a fresh MSCC instance for each replay")
        level = parse_dat(data, number)
        self.u.mem_write(self.ds * 16 + self.gs, bytes(0xA42))
        self.u.mem_write(self.ds * 16 + self.gs, b"".join(level["layers"]))
        for offset, value in ((0x800, number), (0x802, level["count"]),
                              (0x804, level["seconds"]), (0x806, level["chips"]),
                              (0xA28, 9), (0xA2A, 9),
                              (0x81C, len(level["monsters"]) // 2)):
            self.w16(self.gs + offset, value)
        self.u.mem_write(self.ds * 16 + self.gs + 0x81E, level["monsters"])
        for key, base, stride in (("traps", 0x93C, 10), ("clones", 0x946, 8)):
            payload = level[key]
            if not payload:
                continue
            count = len(payload) // stride
            handle = self._allocate(len(payload))
            self.u.mem_write(handle * 16, payload)
            for delta, value in ((0, count), (2, count), (4, handle), (6, 0), (8, handle)):
                self.w16(self.gs + base + delta, value)
        self.call(3, 0x1734, [0])  # ResetInventory
        self.call(3, 0x54C)        # InitBoard
        self.w16(0x1692, level["chips"])
        self.w16(0x1694, level["seconds"])
        self.timer_start = timer_start
        self.w16(0x64E, timer_start)
        self.loaded = True

    def advance(self, tick, command=None):
        if not self.loaded or tick != self.tick + 1:
            raise ValueError("advance requires consecutive replay ticks after loading")
        self.tick = tick
        if tick and tick % 2 == 0:
            timer_tick = self.timer_start + tick // 2
            self.w16(0x64E, timer_tick)
            self.call(7, 0, [timer_tick])  # WM_TIMER before input at this instant
        if self.won or self.r16(self.gs + 0x816) or command is None:
            return
        if command in CARDINALS:
            x, y = CARDINALS[command]
            self.call(7, 0x1184, [1, x, y, 1, 1])  # WM_KEYDOWN -> MoveChip
        elif 16 <= command <= 376:
            pos = self.snapshot()["pos"]
            x = pos % 32 + (command - 16) % 19 - 9
            y = pos // 32 + (command - 16) // 19 - 9
            if not 0 <= x < 32 or not 0 <= y < 32:
                raise UnsupportedReplay("mouse target outside map")
            # BOARDWNDPROC WM_LBUTTONDOWN, after pixel-to-map conversion.
            self.w16(self.gs + 0xA38, 1)
            self.w16(self.gs + 0xA3A, x)
            self.w16(self.gs + 0xA3C, y)
            self.w16(self.gs + 0x80E, 0)
        else:
            raise UnsupportedReplay("unsupported input")

    def snapshot(self):
        return {"tick": self.tick, "timerCounter": self.r16(0x64E), "pos": self.r16(self.gs + 0x808) + 32 * self.r16(self.gs + 0x80A),
                "dead": self.r16(self.gs + 0x816), "chips": self.r16(0x1692),
                "time": self.r16(0x1694), "sliding": self.r16(self.gs + 0x80C),
                "buffered": self.r16(self.gs + 0x80E), "won": self.won}


def run_replay(engine, data, level, replay, max_ticks=200_000, wall_seconds=60, trace=None):
    validate_replay(replay, max_ticks)
    started = time.monotonic()
    engine.load_bytes(data, level, stepping=replay["stepping"])
    commands = {move["when"]: move["dir"] for move in replay["moves"]}
    limit = min(max_ticks, replay["bestTimeTicks"] + 100)
    for tick in range(limit + 1):
        if time.monotonic() - started > wall_seconds:
            raise TimeoutError("MSCC replay wall-time limit exceeded")
        engine.advance(tick, commands.get(tick))
        state = engine.snapshot()
        if trace is not None:
            trace.append(state)
        if state["won"] or state["dead"]:
            break
    result = {"adapterVersion": VERSION, "exeSha256": EXE_SHA256,
            "datSha256": hashlib.sha256(data).hexdigest(), "level": level,
            "status": "completed" if state["won"] else "dead" if state["dead"] else "incomplete",
            "final": state, "recordedTicks": replay["bestTimeTicks"],
            "elapsedSeconds": time.monotonic() - started, "imports": engine.calls,
            "stepping": replay["stepping"], "initialTimerCounter": engine.timer_start,
            "rng": {"mode": "reject" if engine.native_rng_startup_ms is None else "native-startup-clock",
                    "startupMilliseconds": engine.native_rng_startup_ms,
                    "seed": None if engine.native_rng_startup_ms is None else engine.native_rng_startup_ms & 0xFFFF,
                    "calls": engine.rng_calls, "twsRandomSeed": replay.get("randomSeed")},
            "limitations": ["experimental adapter, not full Windows execution",
                            "mouse targets do not verify screen click visibility",
                            "engine completion does not establish scoreboard eligibility"] +
                           (["native RNG uses a separate startup clock; TWS RNG seed is not reproduced"]
                            if engine.native_rng_startup_ms is not None else [])}
    if engine.research_rng_seed is not None:
        result.update(validationPurpose="controlled-rng-research", scoreboardEligible=False)
        result["rng"] = research_rng_metadata(engine.research_rng_seed,
                                              engine.research_rng_source,
                                              replay.get("randomSeed"), engine.rng_calls)
        result["limitations"].append("deliberate RNG control: not scoreboard eligible; "
                                     "does not reproduce Tile World random outcomes")
    return result


def private_json(path, value):
    # O_EXCL avoids overwriting evidence or following an existing symlink.
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
        json.dump(value, out, indent=2)
        out.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exe", required=True)
    parser.add_argument("--dat", required=True)
    parser.add_argument("--replay-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--trace")
    parser.add_argument("--max-ticks", type=int, default=200_000)
    parser.add_argument("--wall-seconds", type=float, default=60)
    rng = parser.add_mutually_exclusive_group()
    rng.add_argument("--native-rng", action="store_true",
                     help="run original RNG seeded once from the local monotonic startup clock")
    rng.add_argument("--native-rng-startup-ms", type=int,
                     help="reproduce a previously recorded native startup clock, not a TWS seed")
    rng.add_argument("--research-rng-seed", type=int,
                     help="NON-SCOREBOARD research: seed original MSCC srand with 0..65535")
    rng.add_argument("--research-rng-from-tws", action="store_true",
                     help="NON-SCOREBOARD research: interpret the exported TWS seed as a "
                          "16-bit MSCC seed (not a translation of TW random outcomes)")
    args = parser.parse_args()
    if args.max_ticks < 0 or not 0 < args.wall_seconds <= 3600:
        parser.error("invalid execution bounds")
    source = Path(args.replay_json).read_bytes()
    request = json.loads(source)
    data = Path(args.dat).read_bytes()
    if request.get("datSha256") != hashlib.sha256(data).hexdigest():
        parser.error("exported replay DAT hash does not match --dat")
    rows = [] if args.trace else None
    startup_ms = (native_startup_milliseconds() if args.native_rng else
                  args.native_rng_startup_ms)
    research_requested = args.research_rng_seed is not None or args.research_rng_from_tws
    research_seed = (request["replay"].get("randomSeed") if args.research_rng_from_tws
                     else args.research_rng_seed)
    research_source = "tws" if args.research_rng_from_tws else "explicit"
    engine = None
    try:
        if research_requested:
            validate_research_seed(research_seed)
        engine = MSCC(args.exe, native_rng_startup_ms=startup_ms,
                      research_rng_seed=research_seed, research_rng_source=research_source)
        result = run_replay(engine, data, request["level"], request["replay"],
                            args.max_ticks, args.wall_seconds, rows)
    except (UnsupportedReplay, ValueError, RuntimeError, TimeoutError) as error:
        result = {"adapterVersion": VERSION, "status": "error", "error": str(error),
                  "nativeRngStartupMilliseconds": startup_ms}
        if research_requested:
            result["rng"] = research_rng_metadata(research_seed, research_source,
                                                  request["replay"].get("randomSeed"),
                                                  engine.rng_calls if engine else None)
    if research_requested:
        result.update(validationPurpose="controlled-rng-research", scoreboardEligible=False)
    result["datSha256"] = hashlib.sha256(data).hexdigest()
    result["level"] = request["level"]
    result["replayJsonSha256"] = hashlib.sha256(source).hexdigest()
    result["twsSha256"] = request.get("twsSha256")
    private_json(args.output, result)
    if args.trace:
        private_json(args.trace, rows)
    summary = {"status": result["status"], "output": args.output}
    if research_requested:
        summary.update(validationPurpose="controlled-rng-research", scoreboardEligible=False)
    print(json.dumps(summary))
    return 0 if result["status"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
