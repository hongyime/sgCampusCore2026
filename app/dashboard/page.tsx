"use client";

import { useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { AuthControls } from "@/components/AuthControls";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type TicketFilter = "open" | "resolved";
type TicketCategory = "Facilities" | "Janitorial" | "Safety" | "Lost & Found";

type DashboardTicket = {
  _id: Id<"tickets">;
  status: TicketFilter;
  priority_tier: 1 | 2;
  headline: string;
  description: string;
  location_entity: string;
  category: TicketCategory | null;
  created_at: number;
  egress_cleared_at: number | null;
};

type LocationStats = {
  location: string;
  total: number;
  open: number;
};

type LeaderboardEntry = {
  userId: string;
  count: number;
};

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function formatDuration(ms: number) {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}

function DashboardSetupRequired() {
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <div>
          <p className="eyebrow">Dashboard setup required</p>
          <h1>CampusCore</h1>
        </div>
        <AuthControls />
      </nav>
      <section className="notice-card">
        <h2>Convex is not configured yet.</h2>
        <p>
          Set `NEXT_PUBLIC_CONVEX_URL` after creating or linking a Convex
          deployment, then restart the app to enable realtime dashboard data.
        </p>
      </section>
    </main>
  );
}

export default function DashboardPage() {
  if (!convexConfigured) return <DashboardSetupRequired />;
  return <DashboardContent />;
}

function DashboardContent() {
  const [filter, setFilter] = useState<TicketFilter | undefined>();
  const { isAuthenticated } = useConvexAuth();
  const [resolvingId, setResolvingId] = useState<Id<"tickets"> | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [locationPages, setLocationPages] = useState<(string | null)[]>([null]);

  const ticketsQuery = useQuery(api.dashboard.getTickets, { status: filter });
  const metrics = useQuery(api.dashboard.getMetrics, {
    locationCursor: locationPages.at(-1) ?? null,
  });
  const leaderboardQuery = useQuery(api.dashboard.getLeaderboard);
  const resolveTicket = useMutation(api.dashboard.resolveTicket);

  const tickets = (ticketsQuery ?? []) as DashboardTicket[];
  const locations = (metrics?.locations ?? []) as LocationStats[];
  const locationPage = metrics?.locationPageReset ? 1 : locationPages.length;
  const leaderboard = (leaderboardQuery ?? []) as LeaderboardEntry[];

  async function handleResolve(ticketId: Id<"tickets">) {
    if (!isAuthenticated || resolvingId) return;
    setResolvingId(ticketId);
    setResolveError(null);
    try {
      await resolveTicket({ ticketId });
    } catch (error: unknown) {
      setResolveError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not resolve the ticket. Please try again.",
      );
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <main className="page-shell dashboard-shell">
      <nav className="top-nav">
        <div>
          <p className="eyebrow">Realtime operations dashboard</p>
          <h1>CampusCore</h1>
        </div>
        <AuthControls />
      </nav>

      <section className="dashboard-grid">
        <aside className="dashboard-sidebar">
          <section className="metric-card">
            <p className="eyebrow">Live metrics</p>
            <div className="metric-row">
              <span>True TTR</span>
              <strong>
                {metrics ? formatDuration(metrics.avgTtrMs) : "..."}
              </strong>
            </div>
            <div className="metric-row">
              <span>Broadcast latency</span>
              <strong>
                {metrics ? formatDuration(metrics.avgSblMs) : "..."}
              </strong>
            </div>
          </section>

          <section className="metric-card" aria-busy={!metrics}>
            <p className="eyebrow">Campus health</p>
            {locations.length > 0 ? (
              <div className="stack location-list">
                {locations.map((stats) => (
                  <div className="split-row" key={stats.location}>
                    <span>{stats.location}</span>
                    <strong>
                      {stats.open} open / {stats.total} total
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" aria-live="polite">
                {!metrics
                  ? "Loading locations..."
                  : "No location data on this page."}
              </p>
            )}
            {locationPage > 1 || metrics?.nextLocationCursor ? (
              <nav
                className="filter-group location-pages"
                aria-label="Location pages"
              >
                <button
                  className="filter"
                  type="button"
                  disabled={!metrics || locationPage === 1}
                  onClick={() =>
                    setLocationPages((pages) => pages.slice(0, -1))
                  }
                >
                  Previous
                </button>
                <span aria-live="polite">Page {locationPage}</span>
                <button
                  className="filter"
                  type="button"
                  disabled={!metrics?.nextLocationCursor}
                  onClick={() => {
                    const next = metrics?.nextLocationCursor;
                    if (next)
                      setLocationPages((pages) =>
                        metrics.locationPageReset
                          ? [null, next]
                          : [...pages, next],
                      );
                  }}
                >
                  Next
                </button>
              </nav>
            ) : null}
          </section>

          <section className="metric-card">
            <p className="eyebrow">Top volunteers</p>
            <p className="badge">Not a CSP-hours record</p>
            {leaderboard.length > 0 ? (
              <ol className="leaderboard-list">
                {leaderboard.map((entry) => (
                  <li key={entry.userId}>
                    <span>{entry.userId.slice(-6)}</span>
                    <strong>{entry.count}</strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No resolutions yet.</p>
            )}
          </section>
        </aside>

        <section className="feed-panel">
          <div className="feed-header">
            <div>
              <p className="eyebrow">Ticket feed</p>
              <h2>Active reports</h2>
            </div>
            <div className="filter-group" aria-label="Ticket filters">
              {(["open", "resolved"] as const).map((status) => (
                <button
                  className={filter === status ? "filter active" : "filter"}
                  key={status}
                  onClick={() =>
                    setFilter(filter === status ? undefined : status)
                  }
                  type="button"
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {resolveError ? <p role="alert">{resolveError}</p> : null}
          {!ticketsQuery ? (
            <p className="muted">Loading realtime tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="empty-state">No tickets found.</p>
          ) : (
            <div className="ticket-list">
              {tickets.map((ticket) => (
                <article className="ticket-card" key={ticket._id}>
                  <div className="ticket-meta">
                    <span
                      className={
                        ticket.priority_tier === 1 ? "tier one" : "tier"
                      }
                    >
                      Tier {ticket.priority_tier}
                    </span>
                    <span>#{ticket._id}</span>
                  </div>
                  <h3>{ticket.headline}</h3>
                  <p>{ticket.description}</p>
                  <div className="ticket-footer">
                    <span>{ticket.location_entity}</span>
                    <span>{ticket.category ?? "Uncategorized"}</span>
                    {ticket.egress_cleared_at ? (
                      <span>
                        Broadcast in{" "}
                        {formatDuration(
                          ticket.egress_cleared_at - ticket.created_at,
                        )}
                      </span>
                    ) : null}
                  </div>
                  {ticket.status === "open" ? (
                    <button
                      className="button button-primary"
                      disabled={!isAuthenticated || resolvingId !== null}
                      onClick={() => void handleResolve(ticket._id)}
                      type="button"
                    >
                      {resolvingId === ticket._id
                        ? "Resolving..."
                        : isAuthenticated
                          ? "Claim & resolve"
                          : "Sign in to resolve"}
                    </button>
                  ) : (
                    <span className="badge success">Resolved</span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
