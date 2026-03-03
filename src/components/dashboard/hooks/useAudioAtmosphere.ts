import { useEffect, useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { psychoacousticEngine } from '../../../services/audio/psychoacousticEngine';

export const useAudioAtmosphere = () => {
  const { state } = useDashboard();
  const [isMuted, setIsMuted] = useState(true); // Default mute for politeness

  useEffect(() => {
    // Init engine on first mount (but keep muted until user opt-in)
    psychoacousticEngine.init();
  }, []);

  useEffect(() => {
    psychoacousticEngine.transition(state.state);
  }, [state.state]);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    psychoacousticEngine.toggleMute(next);
    // If unmuting, ensure we trigger the current state sound
    if (!next) {
        psychoacousticEngine.transition(state.state);
    }
  };

  return { isMuted, toggleMute };
};
