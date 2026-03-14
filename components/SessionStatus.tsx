import React, { useEffect, useRef, useState } from 'react';
import { LiveSessionService } from '../services/liveSessionService';
import { TeacherState } from '../types';
import AudioVisualizer from './AudioVisualizer';

interface SessionStatusProps {
  serviceRef: React.MutableRefObject<LiveSessionService>;
  state: TeacherState;
  onStop: () => void;
}

export const SessionStatus: React.FC<SessionStatusProps> = ({ serviceRef, state, onStop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = useState(0);

  // Session Timer
  useEffect(() => {
    if (state === TeacherState.IDLE) {
      setElapsed(0);
      return;
    }
    const startTime = Date.now() - elapsed * 1000;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [state]);

  // No manual render loop needed, AudioVisualizer handles it

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  if (state === TeacherState.IDLE) return null;

  return (
    <div className="flex items-center space-x-4 bg-slate-900/90 backdrop-blur rounded-full px-5 py-1.5 border border-slate-700 shadow-xl animate-fade-in">
      {/* Visualizer */}
      <div className="w-40 h-8 relative opacity-90 overflow-hidden rounded-md">
        {/* Layer 1: Mic (User) */}
        <div className="absolute inset-0 z-10 mix-blend-screen opacity-80 pointer-events-none">
          <AudioVisualizer
            isActive={true}
            analyser={serviceRef.current.inputAnalyserNode}
            variant="mic"
          />
        </div>
        {/* Layer 2: AI (Teacher) */}
        <div className="absolute inset-0 z-0">
          <AudioVisualizer
            isActive={true}
            analyser={serviceRef.current.outputAnalyserNode}
            variant="ai"
          />
        </div>
      </div>

      {/* Stop Button (Red Circle with X) */}
      <button
        onClick={onStop}
        className="w-8 h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 shadow-lg ring-2 ring-red-500/30"
        title="End Session"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Timer */}
      <span className="font-mono text-slate-300 font-medium w-12 text-center text-sm">
        {fmtTime(elapsed)}
      </span>
    </div>
  );
};