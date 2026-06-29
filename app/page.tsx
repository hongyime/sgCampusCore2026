import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";

export default function HomePage() {
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <div>
          <p className="eyebrow">SMU campus issue response</p>
          <h1>CampusCore</h1>
        </div>
        <AuthControls />
      </nav>

      <section className="hero-card">
        <p className="eyebrow">Hackathon readiness build</p>
        <h2>Report, triage, broadcast, and resolve campus issues fast.</h2>
        <p className="hero-copy">
          CampusCore combines Telegram intake, deterministic safety routing,
          Convex realtime state, and a public dashboard for operational
          visibility. Sign in with Clerk to test authenticated controls, then
          open the dashboard once Convex is configured.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" href="/dashboard">
            Open dashboard
          </Link>
          <a className="button button-secondary" href="/WAITING_ON_HUMAN.md">
            Setup checklist
          </a>
        </div>
      </section>
    </main>
  );
}
