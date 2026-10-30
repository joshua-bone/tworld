# Jacques MS investigation

The requested 38-level investigation is ongoing. The published index records each
level as a verified replay, an impossibility argument, or under investigation.
An unresolved entry is not a final answer and a failed search is not a proof.

- Published reports: <https://joshua-bone.github.io/tworld/dev/solutions/jacques/>
- Source archive: <https://bitbusters.club/gliderbot/sets/cc1/Jacques.dat>
- Author's release thread: <https://forum.bitbusters.club/thread-796.html>
- Exact 986-level DAT SHA-256:
  `c10acac13135586a4ce7b45f0427010229c51ac2fc5b6d0631a7036b86a90b6f`

The archive's level records match the first 986 records of the author's
attachment; that attachment also contains thirteen empty placeholders. Results
apply to the archive above, with no edits to the levels or gameplay rules.

`analysis/` contains the per-level findings, maps and replay certificates.
The exact-tick visual harness and native replay checks are documented in
[`scripts/jacques/README.md`](../../../scripts/jacques/README.md).

To regenerate the static reports after updating findings:

```sh
node --test scripts/jacques/reports.test.mjs
node scripts/jacques/reports.mjs
```

A solved report is rejected unless its replay bytes match a certificate showing
completion in both the web MS engine and native Tile World, with identical full
traces and the required DAT hash. The generator copies these replays to the
published report directory. It does not convert unresolved attempts into
impossibility claims.

Replay links use the player's `replay` URL parameter alongside the existing
`pack`, `level`, and `ruleset` parameters. The player validates the TWS ruleset,
level number, and password before starting playback. The replay asset must be
served from the player's own origin; relative paths resolve from the app base
on desktop and mobile.
