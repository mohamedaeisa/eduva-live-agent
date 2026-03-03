import React from 'react';
import { useAudioAtmosphere } from '../hooks/useAudioAtmosphere';

const AtmosphereControls: React.FC = () => {
  const { isMuted, toggleMute } = useAudioAtmosphere();

  return (
    <button 
        onClick={toggleMute}
        className={`fixed top-4 right-4 z-[300] p-2 rounded-full backdrop-blur-md border transition-all ${isMuted ? 'bg-white/10 border-white/20 text-slate-400' : 'bg-indigo-600/80 border-indigo-500 text-white shadow-lg animate-pulse-slow'}`}
        title={isMuted ? "Enable Neural Audio" : "Mute Atmosphere"}
    >
        {isMuted ? '🔇' : '🎧'}
    </button>
  );
};

export default AtmosphereControls;
