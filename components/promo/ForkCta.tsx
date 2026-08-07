// Task 7 (Session 3) — Promo ForkCta.
//
// Server Component. No "use client", no Convex imports, no new deps.
// GitHub icon is an inline <svg>; no icon-library dependency is added
// (AGENTS.md dependency rule).
//
// Two links:
//   1. GitHub repository.
//   2. DEPLOYMENT.md on GitHub (the fork-and-deploy runbook — Req 7.3).
//
// The repo URL is the canonical CampusCore template repository, matching
// the link already used in `app/page.tsx`.

const REPO_URL = "https://github.com/hongyime/sgCampusCore2026";
const DEPLOYMENT_URL =
  "https://github.com/hongyime/sgCampusCore2026/blob/main/DEPLOYMENT.md";

function GitHubIcon() {
  return (
    <svg
      className="landing-github-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.35-1.3-1.71-1.3-1.71-1.06-.72.08-.7.08-.7 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.76.4-1.28.74-1.57-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.19 1.18a11 11 0 0 1 5.8 0c2.22-1.49 3.19-1.18 3.19-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export default function ForkCta() {
  return (
    <section className="landing-fork" aria-labelledby="promo-fork-title">
      <p className="eyebrow">For other campuses</p>
      <h2 id="promo-fork-title" className="landing-fork-title">
        Fork and deploy for your school
      </h2>
      <p className="landing-fork-copy">
        You&rsquo;ll need a GitHub account, a Convex project, a Clerk
        application restricted to your school&rsquo;s email domain, and a
        Vercel project. The deployment runbook walks through every step from
        <code> git clone </code>to a green Vercel Preview.
      </p>
      <div className="hero-actions">
        <a
          className="button button-primary landing-fork-cta"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon />
          Fork on GitHub
        </a>
        <a
          className="button button-secondary landing-fork-cta"
          href={DEPLOYMENT_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon />
          Read DEPLOYMENT.md
        </a>
      </div>
    </section>
  );
}
