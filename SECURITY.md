# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: cadence.linardi@gmail.com

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours. Please allow reasonable
time to patch before public disclosure.

## Automated Security

- **TruffleHog** scans every push and PR for accidentally committed
  secrets.
- **CodeQL** runs on push and PR against the JS/TS surface.
- **Dependency Review** (GitHub-native) checks PRs for newly-added
  dependencies.
- **Dependabot** opens PRs for patch-only updates weekly. Bot PRs are
  **NOT auto-merged** — every dependency change goes through the
  same manual review as human PRs (Session 3 removed the previous
  `--admin` auto-merge workflows after a wave of breaking major
  bumps auto-landed and broke `next build`).

## Dependency Policy

- Bumps beyond `patch` require an explicit migration task per
  AGENTS.md § "Approval Checkpoints". This applies to every package
  in the approved stack: Convex, Clerk, Next.js, Telegram Bot API
  SDKs, Cloudflare tooling, ONNX Runtime, Resend, fast-check,
  ESLint, TypeScript.
- Adding a package outside the approved stack requires the same
  approval-checkpoint sign-off — no silent additions, no matter
  how small.

## Secret Handling

- All secrets live in either `.env*.local` files (gitignored) or in
  the deployment provider's env store (Vercel Project Settings or
  Convex Deployment settings).
- No secret value ever appears in a commit, PR description,
  markdown file, or in this repository's documentation. Placeholders
  and variable names only.
- If a secret is accidentally committed: rotate the credential
  immediately, then remove the value from git history in a follow-up
  task. TruffleHog will flag most cases before merge.

## GH_PAT

If a GitHub Personal Access Token is used by any workflow in this
repository, it must be:

- Stored only in GitHub Encrypted Secrets.
- Rotated at least quarterly.
- Scoped as narrowly as GitHub's PAT model allows (prefer
  fine-grained tokens over classic).
- Never used with `--admin` to bypass required checks. Session 3
  removed the previous workflow that did this — see
  `.github/workflows/` for the current, non-bypassing set.
