"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

// Clerk auth hook (assuming available)
// import { useUser } from "@clerk/nextjs";

// Mocking useUser for now since Clerk isn't fully installed or if it's missing in my deps:
function useUser() {
  return { user: { id: "user_test_volunteer_123", primaryEmailAddress: { emailAddress: "test@smu.edu.sg" } } };
}

function formatDuration(ms: number) {
  if (ms < 1000) return "0s";
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function DashboardPage() {
  const [filter, setFilter] = useState<"open" | "resolved" | undefined>(undefined);
  
  const tickets = useQuery(api.dashboard.getTickets, { status: filter });
  const metrics = useQuery(api.dashboard.getMetrics);
  const leaderboard = useQuery(api.dashboard.getLeaderboard);
  const resolveTicket = useMutation(api.dashboard.resolveTicket);
  
  const { user } = useUser();

  const handleResolve = async (ticketId: string) => {
    if (!user?.id) return;
    try {
      await resolveTicket({ ticketId: ticketId as any, userId: user.id });
    } catch (e) {
      console.error("Failed to resolve:", e);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 selection:bg-indigo-500/30 font-sans pb-24">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-white to-indigo-200">
              CampusCore
            </h1>
          </div>
          
          <div className="flex items-center gap-4 text-sm font-medium text-neutral-400">
            {user?.primaryEmailAddress?.emailAddress}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Metrics & Leaderboard */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Metrics Card */}
          <section className="bg-neutral-900 border border-white/10 rounded-3xl p-8 relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <h2 className="text-sm font-semibold tracking-widest text-neutral-400 uppercase mb-6">Live Metrics</h2>
            
            <div className="space-y-6 relative">
              <div>
                <p className="text-sm text-neutral-400 mb-1">True TTR (Time-to-Resolution)</p>
                <div className="text-4xl font-light text-white tracking-tight">
                  {metrics ? formatDuration(metrics.avgTtrMs) : "..."}
                </div>
              </div>
              
              <div className="h-px bg-white/5 w-full" />
              
              <div>
                <p className="text-sm text-neutral-400 mb-1">System Broadcast Latency (SBL)</p>
                <div className="text-4xl font-light text-white tracking-tight">
                  {metrics ? formatDuration(metrics.avgSblMs) : "..."}
                </div>
              </div>
            </div>
          </section>

          {/* Location Breakdown Card */}
          <section className="bg-neutral-900 border border-white/10 rounded-3xl p-8">
            <h2 className="text-sm font-semibold tracking-widest text-neutral-400 uppercase mb-6">Campus Health</h2>
            {metrics?.locationBreakdown ? (
              <div className="space-y-4">
                {Object.entries(metrics.locationBreakdown).map(([loc, stats]) => (
                  <div key={loc} className="flex justify-between items-center group">
                    <span className="text-neutral-300 group-hover:text-white transition-colors">{loc}</span>
                    <div className="flex gap-3 text-sm">
                      <span className="text-rose-400">{stats.open} open</span>
                      <span className="text-neutral-600">/</span>
                      <span className="text-neutral-500">{stats.total} total</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-white/5 rounded w-3/4"></div>
                <div className="h-4 bg-white/5 rounded w-1/2"></div>
              </div>
            )}
          </section>

          {/* Leaderboard Card */}
          <section className="bg-neutral-900 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8">
              <span className="inline-flex items-center rounded-full bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-400 ring-1 ring-inset ring-amber-400/20">
                Not a CSP Record
              </span>
            </div>
            <h2 className="text-sm font-semibold tracking-widest text-neutral-400 uppercase mb-6">Top Volunteers</h2>
            
            {leaderboard ? (
              <ul className="space-y-3">
                {leaderboard.map((u, i) => (
                  <li key={u.userId} className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-neutral-400">
                        {i + 1}
                      </div>
                      <span className="font-mono text-sm text-neutral-300">
                        {u.userId.slice(-6)}
                      </span>
                    </div>
                    <span className="text-indigo-400 font-semibold">{u.count}</span>
                  </li>
                ))}
                {leaderboard.length === 0 && <p className="text-neutral-500 text-sm">No resolutions yet.</p>}
              </ul>
            ) : (
              <div className="animate-pulse h-10 bg-white/5 rounded w-full"></div>
            )}
          </section>
        </div>

        {/* Right Column: Ticket List */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Active Feed</h2>
            <div className="flex bg-neutral-900 p-1 rounded-lg border border-white/5">
              {(["open", "resolved"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(filter === s ? undefined : s)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    filter === s 
                      ? "bg-white/10 text-white shadow-sm" 
                      : "text-neutral-500 hover:text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {tickets ? (
              tickets.map((t) => (
                <div key={t._id} className="group relative bg-neutral-900/50 hover:bg-neutral-900 border border-white/5 hover:border-white/10 rounded-2xl p-6 transition-all duration-300">
                  <div className="absolute top-6 right-6">
                    {t.status === "open" ? (
                      <button 
                        onClick={() => handleResolve(t._id)}
                        className="text-xs font-semibold px-4 py-2 rounded-full bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-colors border border-indigo-500/20"
                      >
                        Claim & Resolve
                      </button>
                    ) : (
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Resolved
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 mb-4">
                    {t.priority_tier === 1 ? (
                      <span className="inline-flex items-center rounded-md bg-rose-400/10 px-2 py-1 text-xs font-medium text-rose-400 ring-1 ring-inset ring-rose-400/20">
                        Tier 1 (Emergency)
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-sky-400/10 px-2 py-1 text-xs font-medium text-sky-400 ring-1 ring-inset ring-sky-400/20">
                        Tier 2 (Routine)
                      </span>
                    )}
                    <span className="text-neutral-500 font-mono text-xs">#{t._id}</span>
                  </div>

                  <h3 className="text-xl font-medium text-white mb-2 group-hover:text-indigo-200 transition-colors">
                    {t.headline}
                  </h3>
                  <p className="text-neutral-400 line-clamp-2 text-sm leading-relaxed mb-6">
                    {t.description}
                  </p>

                  <div className="flex items-center gap-6 text-xs text-neutral-500 font-medium">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {t.location_entity}
                    </div>
                    {t.egress_cleared_at && (
                      <div className="flex items-center gap-1.5">
                        <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Broadcast in {formatDuration(t.egress_cleared_at - t.created_at)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      {t.category || "Uncategorized"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex justify-center items-center h-40">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            {tickets?.length === 0 && (
              <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                <p className="text-neutral-500">No tickets found.</p>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
