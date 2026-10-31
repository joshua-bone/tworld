# Private CC optimization routes

New optimization routes are private. The public `tworld` repository contains
tools and existing public reference inputs, not newly generated route artifacts.
Store replay files, route instructions/traces, win certificates, revealing
screenshots/GIFs and private score snapshots outside every Git checkout. A Git
ignore rule is not a privacy boundary. Do not upload those artifacts to GitHub
Pages, public releases, issues or pull requests.

The owner-only scores page is:

`https://joshua-server-775718163601.us-west1.run.app/cc-scores`

It uses Google IAP plus a server-side owner check. Its data and authenticated TWS
downloads come from the existing private bucket:

`gs://joshua-server-data-775718163601/cc-scores/`

## Archive a new route

Keep the candidate in a private working directory outside Git, then use the
checked-in helper from the canonical `joshua-server` checkout:

```sh
python3 -B ../joshua-server/scripts/cc-scores/publish.py route \
  --file /private/path/new-route.tws \
  --pack cclp5 --ruleset MS --level 42 \
  --metadata /private/path/new-route-metadata.json
```

The metadata argument is optional. Include source level/DAT digest, ruleset,
engine revision, provenance and validation evidence as available. The helper
archives replay bytes under
`cc-scores/private-routes/PACK/RULESET/LEVEL/SHA256.tws` with metadata beside them.
It uses create-only writes and verifies exact bytes after upload. It refuses
inputs inside Git, including symlink-resolved paths. It does not change bucket
permissions or create public URLs. Keep receipts outside Git too.

Archiving a candidate does not prove it wins and does not alter dashboard scores.
Validate the exact replay against the intended ruleset and native reference
before accepting a score. The current dashboard is the explicitly chosen bundled
reference baseline. A future private score overlay must preserve source digests,
accepted win evidence and per-level replay identity; do not substitute a private
route into a public reference pack to update the page.

## Baseline and benchmarks

The importer and publisher are documented in
`../joshua-server/scripts/cc-scores/README.md`. They import CCLP1, CCLP3, CCLP4 and
CCLP5 separately for MS and Lynx, fetch official Bold/Public/leaderboard values,
and store the catalog and original TWS in private GCS. Publish immutable replay
objects before replacing the catalog. Prior catalog versions are retained.

Keep access private unless the owner explicitly authorizes publishing a specific
route. Publication is a separate decision from solving, validating or archiving.
