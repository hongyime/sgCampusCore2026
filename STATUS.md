# STATUS — CampusCore

> Overwritten at the end of every work session.
> A stranger agent should be able to resume from this file in one read.

## As of: Session 2 — local stabilization pass

### Done this session

- Created a durable tracker at `C:\Users\bryan\AppData\Local\Temp\ulw-20260623-152122-nqf04e4q.md` and kept findings there for handoff.
- Installed dependencies successfully in a local mirror at `C:\Users\bryan\AppData\Local\Temp\opencode\sgCampusCore2026-local`. Direct npm work on the UNC repo is unreliable because `cmd.exe` cannot run npm scripts from UNC paths and package extraction there was very slow/incomplete.
- Wrote gitignored local env files in both the repo and local mirror:
  - `.env.local` for Next/Vercel-facing values.
  - `.env.convex.local` for Convex-side values.
  - Git confirmed both files are ignored; do not stage or commit them.
- Added visible Clerk auth controls via `components/AuthControls.tsx`.
- Added no-Convex runtime guards so dashboard/takeover UI shows a setup state or no-ops instead of calling Convex hooks without a Convex provider.
- Replaced the mocked dashboard user with real Clerk `useUser()` state.
- Added Clerk's `"/__clerk/:path*"` matcher in `middleware.ts`.
- Removed explicit `any`/suppression patterns from source paths checked by `rg`.
- Made Resend escalation safer: it stays in stub/log mode unless `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_ESCALATION_TO` are all configured. No hardcoded live recipient remains.
- Added `.omo/` to `.gitignore` so agent runtime metadata is not committed.

### Validation evidence

- `npm ci --no-audit --no-fund` in the local mirror: passed in 18s.
- `npm run lint` in the local mirror: passed.
- Explicit-any/suppression scan: passed for `app`, `components`, `convex`, and `middleware.ts`.
- `lsp_diagnostics`: unavailable because the LSP MCP returned `Connection closed`; `lsp_status` reported `Not connected`.
- `npm run typecheck`: blocked by missing `convex/_generated/*` files.
- `npm run build`: blocked by missing `@/convex/_generated/api` imports in `app/dashboard/page.tsx`, `components/EmergencyTakeover.tsx`, and `app/api/upload/route.ts`.

### Current blocker

Convex is not configured. `npx convex codegen` fails with `No CONVEX_DEPLOYMENT set`. The provided Convex value was tested as `CONVEX_DEPLOY_KEY` and rejected by the CLI. It was also tested through Convex access-token override and failed with insufficient service-account access.

To unblock build/typecheck, a human must do one of these:

1. Run interactive Convex setup from the repo: `npx convex dev` and complete login/project selection.
2. Or provide a real project deploy key from Convex Project Settings as `CONVEX_DEPLOY_KEY`.

After Convex is configured, run `npx convex dev --once` or `npx convex codegen`, commit `convex/_generated/`, then rerun `npm run typecheck && npm run lint && npm run build`.

### Next agent checklist

1. Do not read or print `.env*` contents. They contain real secrets.
2. Preserve the hard constraints from `AGENTS.md`, `prd.md`, and `tech_design.md`: no client writes to `priority_tier`, no human image-review queue, legal escalation endpoint remains console-only, and do not change safety thresholds without approval.
3. Get Convex codegen unblocked before attempting full build or browser QA.
4. After generated files exist, validate from a local non-UNC mirror or use a mapped drive; avoid direct npm scripts from the UNC path.
5. Stage only non-secret, intentional source/docs files. Do not stage `.env.local`, `.env.convex.local`, `node_modules`, `.next`, `.convex`, or `.omo`.
