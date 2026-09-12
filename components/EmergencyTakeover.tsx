"use client";

import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";

// Local alias for the shape returned by `api.escalations.getActiveEscalations`:
// a critical_escalations row joined with the headline + location_entity of the
// referenced ticket. The generated `api` is currently AnyApi, so the useQuery
// result is untyped; this narrows the map callback parameter without changing
// runtime behavior.
type ActiveEscalation = Doc<"critical_escalations"> & {
  headline: string;
  location_entity: string;
};

// TASK-29: Dashboard takeover UI
export default function EmergencyTakeover() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;

  return <EmergencyTakeoverContent />;
}

function EmergencyTakeoverContent() {
  const { isAuthenticated } = useConvexAuth();
  const escalations = useQuery(
    api.escalations.getActiveEscalations,
    isAuthenticated ? {} : "skip",
  );
  const acknowledge = useMutation(api.escalations.acknowledgeEscalation);
  const [pendingId, setPendingId] = useState<Id<"critical_escalations"> | null>(
    null,
  );
  const [acknowledgeError, setAcknowledgeError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function handleAcknowledge(id: Id<"critical_escalations">) {
    if (!isAuthenticated || pendingId) return;
    setPendingId(id);
    setAcknowledgeError(null);
    try {
      await acknowledge({ id });
    } catch (error: unknown) {
      setAcknowledgeError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not acknowledge the emergency. Please try again.",
      );
    } finally {
      setPendingId(null);
    }
  }

  useEffect(() => {
    // If there are active escalations, play the alarm
    if (escalations && escalations.length > 0) {
      if (audioRef.current) {
        audioRef.current
          .play()
          .catch((error: unknown) =>
            console.error("Audio play failed (interaction needed):", error),
          );
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [escalations]);

  if (!escalations || escalations.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-900/90 backdrop-blur-sm p-6">
      {/* Audio alarm looping */}
      <audio ref={audioRef} src="/alarm.mp3" loop />

      <div className="bg-red-100 p-8 rounded-2xl max-w-3xl w-full shadow-2xl border-4 border-red-600 animate-pulse">
        <h1 className="text-4xl font-extrabold text-red-700 mb-6 flex items-center gap-4">
          <span className="text-6xl">🚨</span> CRITICAL ESCALATION
        </h1>

        {acknowledgeError ? <p role="alert">{acknowledgeError}</p> : null}
        <div className="space-y-6">
          {(escalations as ActiveEscalation[]).map((esc) => (
            <div
              key={esc._id}
              className="bg-white p-6 rounded-xl border-l-8 border-red-600 shadow-md"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {esc.headline}
                  </h2>
                  <p className="text-red-600 font-semibold mt-1">
                    Reason: {esc.reason}
                  </p>
                </div>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded font-mono text-sm">
                  #{esc.ticket_id}
                </span>
              </div>
              <p className="text-gray-700 mb-4">
                <strong>Location:</strong> {esc.location_entity}
              </p>

              <button
                type="button"
                disabled={pendingId !== null}
                onClick={() => void handleAcknowledge(esc._id)}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-lg transition-colors shadow-lg active:scale-95"
              >
                {pendingId === esc._id
                  ? "Acknowledging..."
                  : "Acknowledge & Handle"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
