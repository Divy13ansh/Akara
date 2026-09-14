import React, { useState } from "react";
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import { parseError } from "../services/http";
import { connectVoiceMentor, VoiceSession } from "../services/voiceService";

interface Props {
  conceptId: string;
  language?: string;
}

export function VoiceMentorButton({ conceptId, language }: Props) {
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [state, setState] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setState("connecting");
    try {
      const s = await connectVoiceMentor(conceptId, language, () => {}, (st) => {
        if (st === "live") setState("live");
        else if (st === "ended") { setState("idle"); setSession(null); }
        else if (st === "error") setState("error");
      });
      setSession(s);
      setState("live");
    } catch (e) {
      setError(parseError(e));
      setState("error");
    }
  };

  const stop = () => {
    session?.disconnect();
    setSession(null);
    setState("idle");
  };

  if (state === "live") {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Mentor live — speak now
        </span>
        <button type="button" onClick={stop} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 px-4 py-2 rounded-full transition-all cursor-pointer">
          <PhoneOff size={14} /> End
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={start}
        disabled={state === "connecting"}
        className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-white bg-[#6d0e00] hover:bg-[#540b00] disabled:opacity-50 px-5 py-2.5 rounded-full shadow-xs transition-all cursor-pointer"
      >
        {state === "connecting" ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}
        {state === "connecting" ? "Connecting…" : "Talk to your AI Mentor"}
      </button>
      {error && <span role="alert" className="text-xs font-medium text-red-800">{error}</span>}
    </div>
  );
}
