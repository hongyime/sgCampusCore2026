# STATUS — CampusCore

> Overwritten (not appended) at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## As of: Session 1 (continuity bootstrap)

### Done
- Read `prd.md`, `tech_design.md`, `agents.md` in full. Hard constraints internalized
  (server-owned `priority_tier`, no human image-review queue, ONNX WASM only,
  legal-escalation stub only, 15s correction window, per-ticket SLA via `runAfter`).
- Created the continuity system: `TASKS.md` (37 atomic tasks, dependency-ordered,
  grouped by tech_design section), `WAITING_ON_HUMAN.md`, this file.
- Verified tooling: Node v26.1.0, npm 11.14.1. Git remote `origin` is configured
  (GitHub HTTPS) so `git push` to `main` works.

### Next task
- **TASK-1**: Scaffold Next.js (App Router) + Convex. Create `package.json`,
  `tsconfig.json`, `next.config.mjs`, a `convex/` directory, and a minimal `app/`
  shell. No feature logic yet — just a compiling skeleton. Then proceed down
  `TASKS.md` in order, committing + pushing each task with `[TASK-<n>] ...`.

### Decisions / non-obvious context for a cold start
- **Doc path discrepancy:** `agents.md` references `docs/prd.md` and
  `docs/tech_design.md`, but the actual files are at **repo root** (`prd.md`,
  `tech_design.md`, `agents.md`). Files are correct; only the path string in
  AGENTS.md is stale. Left as-is (not in scope to move docs unilaterally).
- **Package manager:** npm (lockfile not yet created; will be `package-lock.json`).
- **Convex is source of truth** for ticket/queue/scheduler state. Per-ticket timers
  use `ctx.scheduler.runAfter`, never cron (sub-minute SLA requirement).

### Blockers / waiting on human
- **SECURITY:** the `origin` remote URL contains an embedded GitHub PAT in plaintext
  (`.git/config`). Flagged in `WAITING_ON_HUMAN.md` → rotate + switch to SSH/credential
  helper. Does not block the build.
- All third-party keys (Telegram, Clerk, Convex, Resend, LLM, Vercel) and the entire
  Cloudflare zone setup are deferred — see `WAITING_ON_HUMAN.md`. Everything that
  depends on them is being built against stubs / `.env.example` placeholders.

### Validation checklist (tech_design §9)
- Not yet run (requires live infra). Tracked in `WAITING_ON_HUMAN.md`.
