import type { Metadata } from "next";
import Hero from "@/components/promo/Hero";
import ValueProps from "@/components/promo/ValueProps";
import ForkCta from "@/components/promo/ForkCta";
import ReferenceDeployment from "@/components/promo/ReferenceDeployment";
import Footer from "@/components/promo/Footer";

// Task 8 (Session 3) — Promo landing page served at `/`.
//
// Route group: `(promo)` is stripped from the URL, so this page handles
// `GET /` (design §C4). `app/page.tsx` is deleted in the same commit to
// avoid the duplicate-`/`-route build error (Requirements 7.1, 12.5).
//
// Server Component: no "use client" directive, no Convex hooks, no Clerk
// primitives. This composes the five promo components authored in Task 7
// (Hero → ValueProps → ForkCta → ReferenceDeployment → Footer). None of
// them import from `@/convex/*`, so this page renders even when
// `NEXT_PUBLIC_CONVEX_URL` is unset (Requirement 7.5).
//
// No `app/(promo)/layout.tsx` — the root layout (`app/layout.tsx`) is
// Convex-tolerant (see `app/providers.tsx` and
// `components/EmergencyTakeover.tsx`) and contains no SMU-specific top-nav
// to suppress. If a future fork adds one, add a minimal layout override
// here that renders `children` without that top-nav (design §C4).

export const metadata: Metadata = {
  title: "CampusCore — deployable per school",
  description:
    "Open-source campus issue-reporting network. Telegram-native reporting, a deterministic safety floor for emergencies, an isolated fast-lane egress queue, and a public dashboard with honest time-to-resolution. Fork it, wire your school's credentials, deploy your own instance.",
};

export default function PromoLandingPage() {
  return (
    <main className="page-shell">
      <Hero />
      <ValueProps />
      <ForkCta />
      <ReferenceDeployment />
      <Footer />
    </main>
  );
}
