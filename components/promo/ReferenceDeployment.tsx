import Link from "next/link";

// Task 7 (Session 3) — Promo ReferenceDeployment.
//
// Server Component. No "use client", no Convex imports.
//
// Credits the SMU reference deployment and links to `/dashboard` (Req 7.4).
// States plainly that this domain (sgcampuscore.hong-yi.me) is the template
// promo page — the SMU app is the reference instance running underneath.
// SMU is not name-checked hard here; the school name is a config value and
// forks may repurpose the reference-deployment section entirely.

export default function ReferenceDeployment() {
  return (
    <section
      className="landing-section"
      aria-labelledby="promo-reference-title"
    >
      <div className="landing-teaser">
        <div>
          <p className="eyebrow">Reference deployment</p>
          <h2
            id="promo-reference-title"
            className="landing-teaser-title"
          >
            SMU is running the template today
          </h2>
          <p className="landing-teaser-copy">
            This domain (<code>sgcampuscore.hong-yi.me</code>) is the promo
            page for the CampusCore multi-school template. The SMU reference
            deployment lives on the same host at <code>/dashboard</code> —
            open it to see the app running against real Convex functions,
            real Clerk auth, and a real Telegram bot.
          </p>
        </div>
        <Link className="button button-primary" href="/dashboard">
          Open SMU dashboard →
        </Link>
      </div>
    </section>
  );
}
