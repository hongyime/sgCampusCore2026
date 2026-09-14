# sgCampusCore2026

Singapore campus project pending fuller documentation and setup notes.


## Project Status

Singapore campus project pending fuller documentation and setup notes. The current Phase 3 pass standardises repository hygiene without inventing implementation details beyond what is visible in the repository.

## Setup

Review the source tree for the current runtime entry point, install the dependencies for the detected stack, and keep local secrets in environment files that are ignored by git.

## Usage

Run the project using the scripts or entry points already present in the repository. Update this section with exact commands once the runtime contract is confirmed.

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Maintenance 2026-09-15 - bounded full-history metrics

Internal metric helpers retain a separate contribution receipt per ticket and sixteen deterministic counter shards. Deltas update ticket counts, resolution durations and broadcast durations in the same transaction as each integrated source writer. Repeated backfill does not count a ticket twice. The immutable location catalog has pages of at most 25 locations, each with at most sixteen counters. Backfill does not modify the original ticket or queue fields. Zero timestamps, negative retained durations and Unicode location names retain their values.

Operator backfill pages read at most 25 source tickets / 250,000 source bytes. An oversized record stops the page without advancing. Restart preserves counters and receipts and disables the derived reader. Enabling requires full source/derived parity and an unchanged sixteen-shard revision vector throughout verification; a broadcast or resolution change invalidates that vector even when ticket count remains equal. Direct edits or a rollback to older writers require reconciliation before activation. There is no recurring scan or new dependency.

Ingestion, successful broadcast completion and authenticated resolution update their contributions atomically with the source transaction. A metric failure rolls back the whole operation. Emergency scheduling remains 60 seconds; retry thresholds, the reaper, lexicon, moderation and identity checks retain their existing behavior. Each writer change has a separate commit for review.

The dashboard pages through every location, 25 at a time, while its global counts and duration averages cover all retained tickets. Unicode and reserved names are string values instead of unsupported Convex object keys. An already-loaded older dashboard receives the first page's compatible ASCII names and needs a reload for full pagination. Healthy enabled reads use at most 442 control, counter and catalog rows and read no source tickets or queue records. The reader rejects an invalid extra counter rather than silently truncating it. A stale cursor resets to the first page when switching readers.

The internal `metricsMaintenance` functions support finite backfill and verification. Deploy the writers first; keep the reader disabled, finish every backfill page, compare all original source fields, receipts, shard totals and location totals, and require an unchanged revision vector before `setEnabled`. Disabling the reader restores the full-history source query, including its original scan cost. An older-writer rollback requires disabling and reconciling before reactivation. Operator verification output must contain counts/hashes, never raw reports or identities.

Local validation passes 173 tests, build, lint, types and three repository boundary checks. Tests include 1,200 retained records, repeated/interleaved backfill, transaction rollback, a registered 50-ticket burst, unchanged safety thresholds and authenticated resolution. Browser checks exercise the actual dashboard with synthetic provider responses at 1440, 390 and 320 pixels, including 57 locations, keyboard paging and reader transitions. Actual isolated Convex concurrency/parity and production checks gate activation separately.

Receipts and counters add derived storage and work to each changed source transaction; they reduce repeated visitor scans, not the retained source history. The existing main backend is preserved. Missing older-backend history, migration from Convex to Supabase and measured monthly quota headroom remain open. No paid service, periodic scanner or new dependency is introduced.
