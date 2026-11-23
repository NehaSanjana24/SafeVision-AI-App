import React, { useEffect, useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  Sparkles,
  Bot,
  User,
  Shield,
  Activity,
} from 'lucide-react';
import { LiveVoiceClient } from '../../services/liveAudio';
import { useToast } from '../../context/ToastContext';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptReceived?: (text: string, isUser: boolean) => void;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  onTranscriptReceived,
}) => {
  const { addToast } = useToast();
  const [status, setStatus] = useState<
    'disconnected' | 'connecting' | 'connected' | 'listening' | 'speaking' | 'error'
  >('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<Array<{ id: string; text: string; isUser: boolean; timestamp: string }>>([]);
  const clientRef = useRef<LiveVoiceClient | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const client = new LiveVoiceClient({
      onStatusChange: (newStatus) => {
        setStatus(newStatus);
      },
      onTranscript: (text, isUser) => {
        const item = {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          text,
          isUser,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setTranscripts((prev) => [...prev, item]);
        onTranscriptReceived?.(text, isUser);
      },
      onAudioLevel: (level) => {
        setAudioLevel(level);
      },
      onError: (err) => {
        addToast('error', 'Voice Session Error', err);
      },
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  if (!isOpen) return null;

  const handleToggleMute = () => {
    if (!clientRef.current) return;
    const muted = clientRef.current.toggleMute();
    setIsMuted(muted);
    addToast('info', muted ? 'Microphone Muted' : 'Microphone Unmuted');
  };

  const handleEndSession = () => {
    clientRef.current?.disconnect();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Radio className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                <span>SafeVision Live Voice</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950/50 text-purple-300 border border-purple-800/60">
                  gemini-3.8-live
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Two-way real-time audio with low latency</p>
            </div>
          </div>

          {/* Status Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border bg-slate-800/80 border-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'speaking'
                  ? 'bg-teal-400 animate-ping'
                  : status === 'listening'
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-300 capitalize">
              {status === 'speaking' ? 'Speaking...' : status === 'listening' ? 'Listening...' : status}
            </span>
          </div>
        </div>

        {/* Visualizer & Orb */}
        <div className="p-8 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-purple-950/20">
          <div className="relative flex items-center justify-center mb-6">
            {/* Outer pulsating rings */}
            <div
              className="absolute w-36 h-36 rounded-full bg-purple-500/10 border border-purple-500/20 transition-transform duration-75"
              style={{ transform: `scale(${1 + audioLevel * 0.8})` }}
            />
            <div
              className="absolute w-28 h-28 rounded-full bg-indigo-500/15 border border-indigo-500/30 transition-transform duration-75"
              style={{ transform: `scale(${1 + audioLevel * 0.5})` }}
            />

            {/* Core Voice Orb */}
            <div
              className={`relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all duration-150 ${
                status === 'speaking'
                  ? 'bg-gradient-to-tr from-teal-500 to-emerald-400 shadow-teal-500/40'
                  : status === 'listening'
                  ? 'bg-gradient-to-tr from-purple-600 to-indigo-500 shadow-purple-500/40'
                  : 'bg-slate-800 shadow-slate-950'
              }`}
            >
              {status === 'speaking' ? (
                <Volume2 className="w-8 h-8 text-slate-950 animate-bounce" />
              ) : isMuted ? (
                <MicOff className="w-8 h-8 text-rose-300" />
              ) : (
                <Mic className="w-8 h-8 text-yellow-200" />
              )}
            </div>
          </div>

          {/* Dynamic Audio Wave Bars */}
          <div className="flex items-center gap-1.5 h-8">
            {[40, 75, 100, 60, 90, 45, 80, 65, 95, 50, 70, 35].map((baseHeight, i) => {
              const activeH = Math.max(6, Math.min(32, baseHeight * (audioLevel * 1.5 || 0.15)));
              return (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-purple-400/80 transition-all duration-75"
                  style={{ height: `${activeH}px` }}
                />
              );
            })}
          </div>

          <p className="text-xs text-slate-400 mt-4 text-center max-w-xs">
            {status === 'listening'
              ? 'Speak naturally about worksite hazards, PPE rules, or incident logs.'
              : status === 'speaking'
              ? 'SafeVision Live is responding verbally...'
              : 'Establishing Live Audio socket...'}
          </p>
        </div>

        {/* Live Conversation Transcript Stream */}
        <div className="border-t border-slate-800 bg-slate-950/50 p-4">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Live Transcript Stream</span>
          </div>

          <div
            ref={transcriptScrollRef}
            className="h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs"
          >
            {transcripts.length === 0 ? (
              <p className="text-slate-500 italic text-center py-8">
                Transcripts will appear here in real time as you speak...
              </p>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t.id}
                  className={`flex gap-2 p-2 rounded-lg ${
                    t.isUser ? 'bg-slate-900/90 text-slate-200' : 'bg-purple-950/30 text-purple-200'
                  }`}
                >
                  <span className="shrink-0 mt-0.5">
                    {t.isUser ? (
                      <User className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-mono block">{t.timestamp}</span>
                    <p className="text-xs leading-relaxed">{t.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom Controls Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleToggleMute}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              isMuted
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4" />}
            <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
          </button>

          <button
            type="button"
            onClick={handleEndSession}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-yellow-200 shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
          >
            <PhoneOff className="w-4 h-4" />
            <span>End Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
