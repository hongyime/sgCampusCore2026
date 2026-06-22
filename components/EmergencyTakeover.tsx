"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useRef } from "react";

// TASK-29: Dashboard takeover UI
export default function EmergencyTakeover() {
  const escalations = useQuery(api.escalations.getActiveEscalations);
  const acknowledge = useMutation(api.escalations.acknowledgeEscalation);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // If there are active escalations, play the alarm
    if (escalations && escalations.length > 0) {
      if (audioRef.current) {
        audioRef.current.play().catch(e => console.error("Audio play failed (interaction needed):", e));
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
        
        <div className="space-y-6">
          {escalations.map((esc) => (
            <div key={esc._id} className="bg-white p-6 rounded-xl border-l-8 border-red-600 shadow-md">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{esc.headline}</h2>
                  <p className="text-red-600 font-semibold mt-1">Reason: {esc.reason}</p>
                </div>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded font-mono text-sm">
                  #{esc.ticket_id}
                </span>
              </div>
              <p className="text-gray-700 mb-4"><strong>Location:</strong> {esc.location_entity}</p>
              
              <button 
                onClick={() => acknowledge({ id: esc._id })}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-lg transition-colors shadow-lg active:scale-95"
              >
                Acknowledge & Handle
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
