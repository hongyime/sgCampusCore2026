import Link from "next/link";

// Task 7 (Session 3) — Promo Hero.
//
// Server Component. No "use client" directive, no Convex imports, no Clerk
// primitives. Renders even when NEXT_PUBLIC_CONVEX_URL is unset (Req 7.5).
//
// This is the top of the promo landing page for the CampusCore multi-school
// template. It is intentionally decoupled from `getActiveSchool()` — the
// promo pitches CampusCore itself, not the SMU instance. The secondary CTA
// points to `/dashboard` (the SMU reference deployment) so a visitor can see
// the app running underneath.
//
// The whole `components/promo/` tree can be deleted by a fork in a single
// commit (Req 7.7); nothing in the SMU app routes imports from here.

const REPO_URL = "https://github.com/hongyime/sgCampusCore2026";

export default function Hero() {
  return (
    <section className="hero-card" aria-labelledby="promo-hero-title">
      <p className="eyebrow">CampusCore · deployable per school</p>
      <h2 id="promo-hero-title">
        A decentralized campus issue-reporting network. One code base, one
        deployment per school.
      </h2>
      <p className="hero-copy">
        CampusCore is an open-source template for student-run campus
        operations. Telegram-native reporting, a deterministic safety floor
        for emergencies, an egress queue with an isolated fast lane, and a
        public dashboard with honest time-to-resolution — all running on
        Convex, Clerk, and Vercel free tiers. Fork it, wire your school&rsquo;s
        credentials, and deploy your own instance.
      </p>
      <div className="hero-actions">
        <a
          className="button button-primary"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Fork it for your school
        </a>
        <Link className="button button-secondary" href="/dashboard">
          See the SMU reference deployment →
        </Link>
      </div>
    </section>
  );
}
