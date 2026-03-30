# Ice Block Plan

## Motivation

Ice block is close to dirt block, but not close enough to justify copying dirt-block logic or scattering `if ice block` checks through the engines. The rollout should introduce a small block-species seam so that:

- dirt block behavior stays stable
- ice block behavior can differ in push compatibility, terrain entry, and fireball interactions
- future block-like elements can reuse the same structure

## Constraints

- Keep MS and Lynx ruleset quirks separate, but share seam shape where behavior is conceptually the same.
- Do not reuse internal runtime id `0x74` for ice block, because that is already `MS_TILE.BowlingBall`.
- Decode DAT file code `0x74` to a new internal ice-block tile id through level decode registration.
- Prefer policy/helpers in block, tile-lifecycle, floor-impact, and support seams over new raw tile-id branches in engine hot paths.
- Add focused tests before broad replay sweeps.

## PR Checklist

- [ ] IB1: Identity, decode, and rendering
  - Add internal `MS_TILE.IceBlock_Static` and moving `MS_TILE.IceBlock`.
  - Map DAT `0x74` to `IceBlock_Static` in builtin decode registration.
  - Register render ownership for the new artwork sprite.
  - Update decode/registration tests in both rulesets.

- [ ] IB2: Block-species seam
  - Extract a small block-species policy layer from the current single dirt-block assumption.
  - Teach registration how to map static tile id, moving actor id, and species traits.
  - Keep existing dirt-block behavior unchanged under the new seam.

- [ ] IB3: Push compatibility
  - Route Chip push, forced push, trap release, teleport exit push, and block-vs-block push through block-species policy.
  - Implement:
    - dirt cannot push blocks, unchanged from current behavior
    - ice can push ice
    - ice cannot push dirt
  - Add MS and Lynx characterization tests for successful and blocked chain pushes.

- [ ] IB4: Terrain-entry policy
  - Add ice-block arrival/floor-impact behavior through tile lifecycle and floor-impact seams.
  - Implement:
    - pickups: pass over, do not collect
    - dirt: remove dirt
    - gravel: pass
    - water: consume ice block, turn water to ice
    - fire: consume ice block, turn fire to water
    - popup wall: trigger and pass
    - cloud: normal floor on entry, turns to air on exit through existing leave hook
    - socket: enter only when `chipsNeeded === 0`, then remove socket
    - hint: floor only, no hint side effect
    - exit: floor only
    - thief: floor only
    - clone machine: can enter empty cloner
    - buttons: trigger and hold like other mobs

- [ ] IB5: Fireball melt exception
  - Add a dedicated helper for the special fireball-vs-ice-block rule.
  - Implement:
    - fireball move is denied when targeting an ice block
    - if underlying terrain would otherwise allow entry and underlying terrain is plain floor, consume ice block and turn floor to water
    - move still denied
  - Reuse the same helper for both rulesets.

- [ ] IB6: Vertical support exception
  - Reuse the fireball melt helper during vertical support / settling checks.
  - Implement:
    - ice block supports like dirt block by default
    - exception: fireball over ice block on plain floor melts the block, floor becomes water, fireball settles
  - Add focused support/fall tests in MS and Lynx.

- [ ] IB7: Special-floor and machine coverage
  - Verify ice block behavior across trap, teleport, ice, force floor, clone machine, cloud, and button interactions.
  - Add targeted tests for:
    - trap hold and release
    - teleport exit selection
    - clone-machine occupancy and cloning
    - button holding
    - cloud exit transform

- [ ] IB8: Replay and regression pass
  - Run focused MS/Lynx engine suites for all new ice-block behavior.
  - Run bounded replay smoke in both rulesets.
  - Only after targeted suites are green, expand to broader replay coverage if needed.

## Exit Criteria

- Ice block is decoded from DAT `0x74`.
- Ice block behavior matches the rules above in both MS and Lynx.
- New behavior is owned by block/tile/support policy seams rather than scattered engine conditionals.
- Dirt block behavior remains stable.
- Targeted tests and bounded replay smoke pass.
