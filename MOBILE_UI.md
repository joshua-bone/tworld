# Mobile UI PR Plan

## Assessment

The right shape is a dedicated mobile shell at `/mobile`, not a broad responsive rewrite of the existing desktop shells.

Reasons:

- Desktop and laptop users should notice nothing. A separate route keeps the current `/` and `/legacy` behavior stable.
- The gameplay core is already reusable. `PlayerApp` owns session startup, ticking, undo, replay, and ruleset switching; input is funneled through browser-side buffers rather than the engine.
- The current renderer is not truly size-flexible. The legacy map path is built around a fixed `48px` tile size, so the requested `48 / 32 / 24` presets need explicit renderer work rather than simple CSS scaling.

Auto-redirect is reasonable, but it should be heuristic and overridable.

Recommendations:

- Do not rely on viewport width alone. A narrow desktop window or iPad with keyboard can look "mobile" by width.
- Prefer a helper that combines signals such as coarse pointer, no hover, and a bounded viewport size.
- Treat UA or `userAgentData.mobile` as a hint, not the source of truth.
- Always provide manual escape hatches:
  - a visible "Open Mobile UI" link from desktop branding/help
  - a "Use Desktop UI" link from mobile
  - a query or local override to suppress future redirects

Default recommendation:

- Add `/mobile`
- Keep `/` as the main entry
- On the main entry only, auto-redirect first-time likely-mobile users to `/mobile`
- Skip redirect when an explicit override is present

That gives us safe discoverability without forcing mobile detection to be perfect.

## Goals

- Add a dedicated mobile web shell at `/mobile`
- Keep desktop and legacy shells behaviorally unchanged
- Make the game playable on phone and tablet with touch controls
- Support Lynx diagonal movement with multi-touch
- Do not change the game engines
- Do not wire MS absolute mouse-goal moves in mobile mode
- Keep the mobile shell loosely coupled from the current desktop layout

## Non-Goals

- Replacing `/` with a single universal responsive shell
- Changing engine input semantics
- Removing existing desktop controls or desktop chrome
- Reworking replay/history/settings UX outside what mobile needs

## Proposed Architecture

### Routing

Add a third shell route:

- `/` -> existing modern desktop shell
- `/legacy` -> existing classic shell
- `/mobile` -> new mobile shell

Implementation notes:

- Extend `appPaths` to recognize and build `/mobile`
- Do not make mobile the persisted default `uiMode` initially; route selection is sufficient
- Add a small bootstrap redirect helper in `App.tsx` that can redirect `/` to `/mobile`

### Mobile Detection

Add a pure helper, for example `shouldAutoOpenMobileShell(window)`, with logic along these lines:

- `matchMedia("(pointer: coarse)")`
- `matchMedia("(hover: none)")`
- viewport short side below a reasonable cutoff
- optional `navigator.userAgentData?.mobile` or UA fallback as a weak positive signal

Redirect only when all of the following are true:

- current route is `/`
- user has not explicitly chosen desktop for this browser
- no explicit query param forces desktop
- helper says "likely mobile"

Provide overrides:

- `?ui=desktop` blocks redirect
- `?ui=mobile` forces mobile
- mobile shell includes "Desktop UI"
- desktop help/branding includes "Mobile UI"
- choice can be remembered in local storage

### Shell Separation

Create a new shell component under `web/src/player-web/impl/mobile/`, for example:

- `MobilePlayerApp.tsx`
- mobile-only helpers as needed

Keep mobile-specific CSS namespaced and separate from current desktop classes as much as possible. Do not retrofit the current desktop grid into a dual-purpose layout if a mobile-only wrapper is cleaner.

### Gameplay Reuse

Reuse `PlayerApp` for gameplay/session state rather than duplicating game orchestration.

Recommended seam:

- extend `PlayerApp` with a new chrome mode, or a small set of props, for a mobile presentation
- keep gameplay, replay, history, sound, and persistence in `PlayerApp`
- keep mobile layout and controls in the mobile wrapper or in a dedicated mobile presentation branch

Avoid pushing mobile concerns into engine or ruleset code.

## UX Plan

### Layout

Portrait:

- board viewport takes the visual focus and fills most of the screen width
- top-left: set selector button
- top-right: level selector button
- one overflow button for settings/help/sound/replays
- inventory and status presented in compact strips above or below the board
- touch controls anchored over the left and right screen edges

Landscape:

- board remains centered
- edge controls remain large and thumb-reachable
- compact top overlay for set, level, overflow

### Controls

Touch controls should be large, mostly transparent edge buttons with multi-touch support:

- left side: up/down
- right side: left/right
- simultaneous orthogonal touches produce diagonals in Lynx via the existing input buffer behavior

Implementation expectations:

- use pointer events, not click handlers
- track active pointers per direction
- call the same `keyDown` / `keyUp` paths already used by keyboard control
- add `touch-action: none` on the control surfaces to prevent browser scrolling/zoom gestures from interfering

### MS Mouse Moves

In mobile mode, do not wire map click handling for MS absolute mouse-goal movement.

Preferred implementation:

- mobile presentation simply does not pass or invoke the `onMapClick` movement path
- engine support remains intact for desktop

### Navigation and Secondary UI

Selectors:

- set selector in one corner
- level selector in the other
- modal sheets or drawers are acceptable on mobile

Settings and help:

- place in an overflow sheet rather than dedicated always-visible buttons
- include links to switch between mobile and desktop UI

## Tile Size and Viewport Plan

The requested `48 / 32 / 24` sizes should be implemented as real render presets, not just CSS width changes.

Why:

- current render math, sprite extraction, overlays, and inventory strips assume `48px`
- CSS downscaling would work as a prototype, but it is not the same as a native `32px` or `24px` render

Recommended staging:

1. First mobile PR uses the current renderer with controlled CSS scaling so the shell and controls can land safely.
2. Follow-up work introduces a render-size parameter and true `48 / 32 / 24` presets.

If the team wants the tile presets in the first PR, expect a materially larger PR and more renderer risk.

## PR Sequence

### PR 1: Route, Detection, and Entry Points

Purpose:

- land the `/mobile` route and mobile redirect behavior without changing desktop gameplay

Checklist:

- [ ] Extend `appPaths.ts` and `appPaths.test.ts` to support `/mobile`
- [ ] Update `App.tsx` to render a mobile shell route
- [ ] Add a mobile-detection helper based on coarse pointer, hover, and bounded viewport size
- [ ] Add first-visit auto-redirect from `/` to `/mobile` for likely-mobile devices
- [ ] Add query-string overrides such as `?ui=mobile` and `?ui=desktop`
- [ ] Add a local override so a user can opt out of future redirects
- [ ] Add a visible "Mobile UI" entry point from desktop branding and/or help
- [ ] Add a visible "Desktop UI" exit point from the mobile route
- [ ] Keep `/` and `/legacy` unchanged for non-mobile users

Acceptance criteria:

- desktop and laptop users notice no change on normal entry paths
- likely-mobile users can reach `/mobile` automatically
- redirect mistakes are recoverable without clearing browser state

### PR 2: Mobile Shell Skeleton and Full-Screen Viewport

Purpose:

- introduce a dedicated mobile shell with a viewport-first layout while reusing existing gameplay/session code

Checklist:

- [ ] Add `web/src/player-web/impl/mobile/MobilePlayerApp.tsx`
- [ ] Keep mobile-specific CSS and helpers under a mobile-specific namespace
- [ ] Reuse catalog/profile/selection services from the existing modern shell
- [ ] Reuse `PlayerApp` gameplay/session logic rather than duplicating orchestration
- [ ] Add a mobile presentation mode or mobile-facing props on `PlayerApp`
- [ ] Render the gameplay viewport as the visual focus in portrait and landscape
- [ ] Make the board area stable and full-screen on phone/tablet
- [ ] Scale the current board to fit the viewport without touching true tile-size rendering yet
- [ ] Add compact inventory/status presentation suitable for mobile

Acceptance criteria:

- `/mobile` is a usable dedicated shell rather than a desktop page shrunk by media queries
- desktop layout code remains separate enough that desktop behavior is unaffected

### PR 3: Mobile Navigation Chrome

Purpose:

- make the mobile shell self-contained and navigable without depending on desktop controls

Checklist:

- [ ] Add set selector UI in one corner
- [ ] Add level selector UI in the opposite corner
- [ ] Add an overflow sheet or drawer for settings/help/sound/replays
- [ ] Add a desktop/mobile switch link in the overflow or header
- [ ] Ensure selectors and overflow are reachable in portrait and landscape
- [ ] Keep always-visible chrome minimal so the board remains dominant

Acceptance criteria:

- a mobile user can choose a set, change level, open settings, and open help without desktop UI
- the viewport remains the primary focus of the screen

### PR 4: Touch Controls and Mobile Input Rules

Purpose:

- make levels fully playable on phone and tablet using touch

Checklist:

- [ ] Add large, mostly transparent directional control surfaces at the screen edges
- [ ] Use pointer events rather than click events
- [ ] Track active pointers per direction for held movement
- [ ] Support simultaneous orthogonal presses so Lynx diagonals work
- [ ] Route touch presses through the existing MS/Lynx input buffers
- [ ] Add `touch-action: none` where needed to prevent browser scroll/zoom conflicts
- [ ] Do not wire MS absolute mouse-goal movement in mobile mode
- [ ] Ensure touch overlays do not break intended taps on mobile chrome
- [ ] Add tests around any new touch-to-input helper logic

Acceptance criteria:

- both MS and Lynx are playable by touch
- Lynx diagonals work with multi-touch
- MS mouse-goal moves remain available on desktop but absent in mobile UI

### PR 5: True Tile-Size Presets and Viewport Preset Selection

Purpose:

- replace prototype CSS fitting with real `48 / 32 / 24` render presets

Checklist:

- [ ] Refactor render math so tile size is configurable instead of fixed at `48`
- [ ] Thread render size through the relevant legacy sprite, tileset, and canvas code
- [ ] Add true `48`, `32`, and `24` render presets
- [ ] Choose a default preset automatically from viewport size
- [ ] Add an override if we decide users should be able to change the preset manually
- [ ] Update renderer tests impacted by size-dependent math
- [ ] Verify overlays, inventory strips, and hit-testing still align correctly

Acceptance criteria:

- `48 / 32 / 24` are real render presets, not just CSS downscales
- overlay alignment and input hit regions remain correct at all supported presets

### Optional PR 6: Mobile Polish and Cleanup

Purpose:

- reduce coupling and clean up any temporary scaffolding left from earlier PRs

Checklist:

- [ ] Remove any temporary mobile-only hacks used to land earlier slices
- [ ] Simplify any `PlayerApp` conditionals that became awkward during rollout
- [ ] Tighten CSS ownership between desktop and mobile shells
- [ ] Revisit whether mobile shell choice should become a persisted preference
- [ ] Document final mobile routing and override behavior in user-facing docs if needed

Acceptance criteria:

- the mobile shell is maintainable without spreading mobile-specific logic across unrelated desktop code paths

## Likely Files

- `web/src/player-web/compose/App.tsx`
- `web/src/player-web/impl/appPaths.ts`
- `web/src/player-web/impl/appPaths.test.ts`
- `web/src/player-web/ports/BrowserProfileStore.ts` only if we later decide to persist a mobile shell mode
- `web/src/player-web/impl/PlayerApp.tsx`
- `web/src/player-web/impl/legacyInput.ts`
- `web/src/player-web/impl/legacyInput.test.ts`
- `web/src/player-web/impl/styles.css`
- `web/src/player-web/impl/mobile/*`

If true tile presets land in the same effort:

- `web/src/player-web/impl/legacySprites.ts`
- `web/src/player-web/impl/legacyTileset.ts`
- `web/src/player-web/impl/LegacyCanvasScreen.tsx`
- related renderer tests

## Testing Plan

Automated:

- extend `appPaths.test.ts` for `/mobile`
- add unit tests for mobile redirect helper and override behavior
- add input-buffer tests for touch-driven hold/release combinations if new helper logic is introduced

Manual:

- desktop `/` remains unchanged on laptop/desktop browsers
- `/legacy` remains unchanged
- `/mobile` loads directly on phone and tablet
- likely-mobile first visit to `/` redirects to `/mobile`
- explicit desktop override prevents redirect
- mobile shell can return to desktop shell
- MS movement works with touch controls and does not expose mouse-goal movement
- Lynx diagonals work with simultaneous orthogonal touches
- pause/help/settings/selectors are reachable in portrait and landscape

## Acceptance Criteria

- Desktop and legacy users see no behavioral regression in normal entry paths
- `/mobile` is a dedicated, usable shell for phone and tablet
- likely-mobile users can be auto-redirected from `/` without trapping them there
- mobile controls are sufficient to complete levels in both MS and Lynx
- MS absolute mouse-goal movement is absent from mobile UI
- mobile code is isolated enough that future desktop work does not need to route through mobile-specific layout code

## Open Decisions

- Whether true `48 / 32 / 24` render presets are required in the first PR or can land in a follow-up
- Whether mobile selection should be route-only or also saved as a persistent preference
- Exact mobile detection thresholds for tablet vs small laptop edge cases

## Recommended Call

For the first PR:

- ship `/mobile`
- ship auto-redirect with override
- ship touch controls
- ship mobile selectors/overflow
- disable MS map-click movement in mobile mode
- keep tile-size presets out of scope unless we explicitly want a larger renderer refactor now

That keeps the PR bounded and protects desktop users, while giving us a real mobile entry point that can be iterated safely.
