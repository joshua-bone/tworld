# Pet Carrier Plan

## Motivation

Pet Carrier is close to the existing portable special items, but it is the first one that needs to persist a captured mob payload and then re-materialize that mob through gameplay movement rules. The rollout should reuse the current portable-item, occupancy, portable-backing, and render seams so that:

- sandbag, hook, and bowling ball behavior stay stable
- Pet Carrier gets stateful capture/release behavior without ad hoc engine branches
- future mob-carrying or mob-embedding special items can reuse the same snapshot/release structure

## Constraints

- Keep MS and Lynx ruleset quirks separate, but share seam shape where behavior is conceptually the same.
- Treat Pet Carrier as part of the existing portable special-item class alongside sandbag, hook, and bowling ball.
- Decode DAT file code `0x75` to the internal Pet Carrier tile id through built-in decode registration.
- A DAT cell with Pet Carrier on top and an eligible mob on bottom should load as an occupied carrier, with the lower terrain normalized to floor.
- Excluded occupants are anything in the special-item class. Eligible occupants are monsters, dirt/ice blocks, and future non-special-item mobs.
- The carrier must preserve its payload while carried, primed for drop, dropped on the map, restored through undo, and otherwise flowing through existing portable-item state transitions.
- Release probing should go through the same movement/probe seam as teleport and clone exits rather than inventing a separate placement path.
- Occupied rendering must draw terrain first, then a half-scale occupant centered 8 px below tile center, then the carrier sprite, with caching where the renderer already caches derived sprites.

## PR Checklist

- [ ] PC1: Identity, artwork, and decode registration
  - Add internal tile identity for Pet Carrier and map DAT `0x75` through the built-in decode registrations.
  - Add `pet_carrier.png` into `res/expansion_artwork/expanded.png`, extend `res/expansion_artwork/expanded.json` with the `pet_carrier` sprite key, and update artwork-frame tests.
  - Register Pet Carrier render ownership in MS and Lynx the same way the other portable special items are registered.
  - Update decode, catalog, and render-registration tests in both rulesets.

- [ ] PC2: Portable-item family and state model
  - Extend the portable-item family enums and registrations in MS and Lynx with `pet-carrier`.
  - Add persistent Pet Carrier item state that can store an optional captured-mob snapshot rather than just a bare tile id.
  - Introduce a small “special item class” / occupant-eligibility helper so capture, decode-load, and future behaviors share the same exclusion rule.
  - Keep existing sandbag, hook, and bowling-ball state flow unchanged under the new portable family.

- [ ] PC3: Captured-mob snapshot seam
  - Add a reusable mob snapshot shape for Pet Carrier payloads that can represent at least actor id, direction, and any family-specific runtime state needed to restore the mob correctly.
  - Route snapshot creation/restoration through actor lifecycle or stateful-actor seams instead of hard-coding per-mob copies in the engines.
  - Ensure excluded special items cannot be snapshotted, while blocks and normal monsters can.
  - Add focused unit coverage for snapshot creation, cloning, and restoration of representative occupants.

- [ ] PC4: DAT load of occupied carriers
  - Teach MS and Lynx level load/decode to interpret “Pet Carrier on top, eligible mob on bottom” as an occupied carrier with the bottom layer replaced by floor.
  - Normalize invalid lower occupants by leaving the carrier empty rather than loading a forbidden payload.
  - Add characterization tests covering empty carrier, occupied carrier, excluded lower special item, and block occupant cases.

- [ ] PC5: Action1 scoop behavior
  - Extend the shared portable Action1 seam so an empty carried Pet Carrier scoops an eligible adjacent mob in Chip’s facing direction.
  - Reuse occupancy lookup and actor-removal helpers so scooped mobs leave the board through the normal runtime paths.
  - Leave the carrier unchanged when the facing cell has no eligible occupant or is blocked by a special item.
  - Add MS and Lynx engine tests for monster capture, block capture, excluded special-item rejection, and no-op presses.

- [ ] PC6: Action1 release behavior
  - Extend the portable Action1 seam so an occupied carried Pet Carrier attempts to release its occupant in Chip’s facing direction, updating the released mob’s direction first.
  - Reuse the teleport / clone exit probing-and-start-move seam for both “can release?” and “actually release”, so probing and execution stay identical.
  - Only clear the carrier payload after a successful release; failed releases keep the carrier occupied.
  - Add MS and Lynx tests for successful releases, blocked releases, teleport-like push chains, and direction update on release.

- [ ] PC7: Persistence through carry, drop, and replacement pickup flow
  - Preserve occupied-carrier payloads through carried, primed, dropped, mapped, and replacement-pickup transitions.
  - Keep payload identity stable through undo/runtime projection the same way existing portable items preserve identity.
  - Verify drop-settle and pickup replacement behavior when the carrier is occupied.
  - Add undo/runtime projection tests and engine tests for “drop occupied carrier, pick it back up, release same occupant”.

- [ ] PC8: Occupied rendering and inventory presentation
  - Add occupied-carrier rendering in the player renderer for both map tiles and player inventory.
  - Render terrain first, or floor for inventory rendering, then the scaled occupant, then the Pet Carrier overlay sprite.
  - Cache derived occupied-carrier render composites at the renderer seam instead of recompositing every frame.
  - Add render tests for empty carrier, occupied carrier on map, occupied carrier in inventory, and sprite-id addressability.

- [ ] PC9: Focused regression pass
  - Run targeted MS/Lynx portable-item, render, decode, undo, and engine suites for the new family.
  - Run bounded replay smoke to ensure the new portable-item family does not regress sandbag, hook, or bowling-ball behavior.
  - Only after targeted suites are green, widen coverage if the portable-item seam changes touched shared runtime code.

## Exit Criteria

- Pet Carrier is decoded from DAT `0x75` and its sprite is registered as `pet_carrier`.
- Empty and occupied Pet Carriers load correctly from DAT, including the “top carrier / bottom mob” encoding.
- Empty carriers scoop eligible adjacent mobs with `Action 1`.
- Occupied carriers release their stored mob through the shared teleport/clone-style movement probe path, clearing only on success.
- Pet Carriers preserve payload state while carried, dropped, restored through undo, and otherwise flowing through portable-item runtime transitions.
- Occupied carriers render with the occupant composite on both the map and the player inventory.
- Existing sandbag, hook, and bowling-ball behavior remains stable under targeted tests and bounded replay smoke.
