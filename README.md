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

## Maintenance 2026-09-15 - full-history metric preparation

Internal metric helpers retain a separate contribution receipt per ticket and sixteen deterministic counter shards. Deltas update ticket counts, resolution durations and broadcast durations in the same transaction as each integrated source writer. Repeated backfill does not count a ticket twice. The immutable location catalog has pages of at most 25 locations, each with at most sixteen counters. Backfill does not modify the original ticket or queue fields. Zero timestamps, negative retained durations and Unicode location names retain their values.

Operator backfill pages read at most 25 source tickets / 250,000 source bytes. An oversized record stops the page without advancing. Restart preserves counters and receipts and disables the derived reader. Enabling requires full source/derived parity and an unchanged sixteen-shard revision vector throughout verification; a broadcast or resolution change invalidates that vector even when ticket count remains equal. Direct edits or a rollback to older writers require reconciliation before activation. There is no recurring scan or new dependency.

Ingestion now writes its metric contribution after the ticket and queue row, before scheduling the unchanged 60-second emergency check. A metric failure rolls back ingestion. The registered-handler burst covers 50 reports, five emergency schedules, server-owned priority, attribution and denial for unpaired/stale users. Local foundation tests also cover 1,200 retained records, repeated/interleaved backfill, rollback, activation and bounded reads.

This is preparation, not an active reader or production migration. Delivery/resolution writer integration, dashboard pagination, real isolated Convex concurrency/parity checks and production validation remain required. The existing main backend is preserved; no production schema or metric reader is activated. The Supabase migration and measured monthly quota headroom remain open.
