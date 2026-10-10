# Tile World / Tile World Online

This repository contains two closely related things:

- The historical Tile World / Tile World 2 codebase and resources.
- Tile World Online, a browser-based TypeScript port with a modern UI built on top of the same legacy rulesets.

Tile World emulates the classic Chip's Challenge engines: the Atari Lynx ruleset and the Microsoft Windows ruleset. Tile World Online brings those same rulesets into a modern browser experience with improved level browsing, progress tracking, undo history, replay tools, ruleset switching, and support for 3D levels.

## Tile World Online

Tile World Online is a static website. All progress, scores, imported sets, and replays are stored locally in the browser.

The modern browser UI lives under [`web/`](./web). It keeps the legacy interface available at `/legacy`, while the default experience is the modern dashboard and embedded player.

### Browser UI development

```sh
npm ci --include=optional
npm run dev
```

Useful browser build commands:

```sh
npm run test
npm run typecheck
npm run build
```

The root `package-lock.json` is authoritative for browser development. Run
dependency installation from the repository root rather than from `web/`.

## Engine Parity

Core gameplay logic has been verified on over 2,500 replays per ruleset in an attempt to ensure exact behavior parity with legacy Tile World. That said, the TypeScript port runs in a fundamentally different runtime environment than the original C implementation, and there are likely to be subtle differences between the engines. There may also be outright bugs remaining in the code that will only be uncovered through further playtesting.

## URL Launches

The browser UI supports direct play by URL.

- Built-in or curated packs can be opened with query parameters such as:
  - `?set=CCLP1&level=3&ruleset=Lynx`
- Custom DAT packs can be embedded directly in the URL with:
  - `#dat=<base64url(gzip(datBytes))>`
- Optional parameters:
  - `level`
  - `ruleset`
  - `slot`

Example:

```text
?level=3&ruleset=MS&slot=3D_CHIPS.dat#dat=<base64url(gzip(datBytes))>
```

Notes:

- `ruleset` defaults to `Lynx`.
- `slot` controls overwrite-by-name behavior for local work-in-progress packs.
- Progress is still keyed by gameplay data, so unchanged levels keep their progress when a pack is replaced.

## Profile backup

The modern Settings dialog can download and upload a full browser profile backup.

- Backups include imported sets, replays, progress, recent selections, preferences, and local browser gameplay settings.
- Uploading a backup replaces the current local browser profile for Tile World Online and reloads the page.
- The backup file uses a structured versioned JSON wrapper so it can be extended over time without guessing at raw storage internals.

## Important note about CHIPS.dat

Tile World does not ship with `CHIPS.dat`, the original Microsoft Chip's Challenge levelset. That file is copyrighted and cannot be freely redistributed. If you have your own copy, you can use it with the native build or import it into the browser UI locally.

If you do not have a copy of `CHIPS.dat`, Tile World can still be used with freely available community levelsets.

## Levelsets

This repository includes official community sets such as the CCLP series, the Lynx-compatible CCLXP2 companion pack, curated browser-first content, and historical/supporting content used for testing and compatibility work.

Tile World Online also supports:

- importing local DAT files into browser storage
- sharing custom DATs by URL
- restoring browser progress across duplicated levels when gameplay data matches

Community levelsets can be found at:

- https://sets.bitbusters.club

## Historical native build

The original native Tile World / Tile World 2 codebase is still present in this repository.

### Native build requirements

Before building the native application, ensure you have:

- CMake
- a C compiler
- SDL2
- Qt5 or Qt6 development libraries

### Native build steps

```sh
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build .
```

Running `make install` as root will install a `tworld2` binary and the required resources.

## Resources

- Bit Busters Club: https://bitbusters.club
- Chip Wiki: https://wiki.bitbusters.club
- Scores: https://scores.bitbusters.club
- Tile World 2 homepage: https://tw2.bitbusters.club
- Original Tile World 1 homepage: http://muppetlabs.com/~breadbox/software/tworld
- Optimized TWS solutions: https://davidstolp.com/old/chips/tws/
- Tile World port list: https://wiki.bitbusters.club/Tile_World#Ports

## License and credits

Tile World Online (TWO) is a browser-based TypeScript port of Tile World / Tile World 2, and includes code derived from the original Tile World codebase.

Copyright (C) 2026 Joshua Bone  
Portions Copyright (C) 2001-2025 Brian Raiter, Madhav Shanbhag, and Eric Schmidt

Released under the GNU General Public License, version 2 or later.

Original Tile World was written by Brian Raiter. Tile World 2 was developed by Madhav Shanbhag, with later releases and maintenance by Eric Schmidt, Michael Hansen (Zrax), ChosenID, David Stolp (pieguy), A Sickly Silver Moon, G lander, and Eevee. Chip's Challenge was designed by Chuck Sommerville.

Additional historical credits from the original project:

- sound effects were created by Brian Raiter with assistance from SoX, and were placed in the public domain
- tile images were created by Anders Kaseorg with assistance from POV-Ray, and were placed in the public domain
- the introductory native levelset was created by Brian Raiter and placed in the public domain
- Thomas Harte and Michael Hansen developed macOS ports of Tile World and Tile World 2 respectively

"Chip's Challenge" is a registered trademark of Alpha Omega Publications.

## Bug reports

For browser-port bugs, report them to `jbone` in the Bit Busters Discord so they can be reproduced against the current modern UI and replay corpus.

## Making levels

New levels for Tile World can be made using external level editors. Two popular editors are:

- CCEdit, part of [CCTools](https://cctools.zrax.net/)
- [CCCreator](https://cccreator.bitbusters.club/)

## Local AI play lab (experimental)

Add `?ai=1` to the public TWO URL (or `&ai=1` to an existing level link).
The lab uses the ordinary built-in/imported level loader and displays the classic
9×9 view and HUD. `set`, `level`, `ruleset`, and `#dat` launches remain supported.

1. In [ai-plays-chips-challenge](https://github.com/joshua-bone/ai-plays-chips-challenge), use Node 22.22.0, run `npm ci`, then `npm start`.
2. Keep that terminal open. Paste its single-use pairing token into the lab and click **Connect**.
3. If Chrome asks for local-network access, allow it for this site to reach your companion at `127.0.0.1:5175`. Denial leaves normal human play available. Use Chrome's site permission controls to retry after a denial; no browser security flags are needed.
4. Load a live MS or Lynx level, choose a mock direction, and press **Start AI**. Each Start executes one two-tick action. **Stop**, **Take over**, manual movement, focus loss, and disconnection release AI input.
5. **Export run** downloads delivered screenshots and public decision/receipt events. **Exit AI lab** returns to ordinary play. Restart the companion for a new token after disconnecting.

This batch has **no Jev or Astra integration and no paid inference**. All events
are labelled System. AI testing runs never save ordinary scores, progress, or
replays, including after human takeover. Undo and fast-forward are disabled in
the lab. Stopping the agent does not pause game time. Normal routes do not connect
to the companion. The old `/dev/play-lab` remains available in development.

The checked-in `aiProtocol.generated.ts` is generated by the companion repository's
`npm run export:protocol -- <destination>` and includes its source commit and hash.
Do not hand-edit it. Runtime imports across the repositories are not required.
