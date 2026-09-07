# Visual Play Lab

Run from the repository root with Node 22.18+ and the existing workspace dependencies:

```sh
codex login status
npm run play:lab
```

Open **http://127.0.0.1:5174/dev/play-lab** in a foreground browser tab. The default provider uses the installed Codex CLI and its existing login. Press **Start agent**. No separate API key is needed for that provider. A fresh level starts paused; once started, the game runs at its ordinary 20 ticks per second while the player decides.

The player sees PNGs of the existing 9×9 canvas and normal HUD, sampled twice per second. A decision receives the two most recent captures plus an optional recalled image. It receives its own concise notebook and input receipts. It never receives a tile array, actor list, camera/world coordinates, wiring, random seed, solver result, or solution replay.

The model returns JSON with directional key holds, viewport annotations, an observation-based notebook, and an optional explanation pause. Input goes through the existing MS/Lynx keyboard buffers. Each sequence lasts at most two seconds; after it ends, keys release and game time continues. Observation-based decisions older than 15 seconds cannot move the player. This protects against very late responses; it does not make a moving scene remain valid during inference.

**Pause & explain** freezes the game and preserves the current decision's annotated observation. The player can request this explicitly too. Select earlier thumbnails to review discovered areas. Annotation coordinates always refer to the pictured observation, avoiding misleading marks when the live camera has scrolled. **Take over**, or an arrow key outside a form control, cancels agent inputs immediately. **Restart** clears the session, notebook, and discovered image history. The level selector supports the existing MS and Lynx sets. Each Start runs for at most 30 decisions or five minutes; Start again to continue from memory.

**Export session** downloads the observations actually delivered to the model, its public decision summaries and annotations, requested input sequences, execution receipts, and measured decision latencies. Raw model reasoning is neither displayed nor exported. The journal stays in memory until restart or server shutdown. The development server binds only to loopback, requires same-origin JSON control requests, and exits after four hours by default. Keep one Play Lab tab open per server; this MVP hosts one session.

## Player boundary

The Codex provider launches each decision in a fresh temporary directory containing only supplied screenshots and the output schema. It ignores user configuration and project instructions, disables shell/image-file/browser/computer/search/plugin/app/memory/subagent tools, and uses ephemeral sessions. It retains the normal Codex authentication mechanism; it does not extract or copy login credentials. Only final structured decisions are accepted. The installed CLI's actual tool exposure can be checked against a loopback mock provider:

```sh
TWORLD_TEST_CODEX_ISOLATION=1 npm run test:play-lab
```

This audit sends no model request to OpenAI. Re-run it after upgrading Codex; its feature flags are version-dependent. The boundary is enforced through the runner's data contract and disabled tool configuration, not an OS virtual machine. The model can still misinterpret pixels or infer an incorrect map, so notes are beliefs rather than ground truth.

The optional API provider sends screenshots directly to the Responses API with **no tools**, using a server-side key:

```sh
export OPENAI_API_KEY=... # Set locally; never put it in a browser or commit it.
TWORLD_PLAY_PROVIDER=openai npm run play:lab
```

Optional settings: `TWORLD_PLAY_MODEL` selects the model; `TWORLD_CODEX_BIN` selects the CLI executable; `TWORLD_PLAY_PORT` changes port 5174; `TWORLD_PLAY_LIFETIME_MS` changes the bounded server lifetime. The default Codex model follows that CLI version's default, while the API default is `gpt-6-astra`.

## Validation and present limits

```sh
npm run test:play-lab
npm --workspace web run test -- src/player-web/impl/play-lab/PlayInputQueue.test.ts
npm run build
```

The route is available only in development; the agent server is not part of the public Pages build. Gameplay engines and public routes retain their existing implementation.

The first live trial collected three chips and three keys from the intro level through visual observations. Nine measured decisions took 8.6–18.0 seconds with the installed default model. These are trial observations, not a performance guarantee. One-off checks of other models did not establish a faster default. The game is real time; this MVP's decision loop is currently much slower than human reflexes. It can explore simple puzzles but is not yet a reliable player for timing-sensitive hazards. The API provider is implemented but requires a key for live validation. The MVP is silent; game audio is not captured or fed to the player.

References: [Codex non-interactive usage](https://developers.openai.com/codex/noninteractive), [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
