
import React, { useEffect, useRef } from 'react';
import { AppView } from '../types';
import { initSession, updateBehavior, syncSession } from '../services/analyticsService';

interface SessionTrackerProps {
  currentView: AppView;
}

const SessionTracker: React.FC<SessionTrackerProps> = ({ currentView }) => {
  const isInitialized = useRef(false);

  // 1. Init Session on Mount
  useEffect(() => {
    if (!isInitialized.current) {
        initSession();
        isInitialized.current = true;
    }
  }, []);

  // 2. Track Page Visits
  useEffect(() => {
    updateBehavior({ pagesVisited: [currentView] });
  }, [currentView]);

  // 3. Track Scroll Depth & Device Metrics
  useEffect(() => {
    const handleScroll = () => {
        const scrollTop = window.scrollY;
        const docHeight = document.body.scrollHeight - window.innerHeight;
        const percent = Math.min(100, Math.round((scrollTop / docHeight) * 100));
        updateBehavior({ scrollDepth: percent });
    };

    // We need a local click counter to pass cumulative
    let localClickCount = 0;
    const clickTracker = () => {
        localClickCount++;
        updateBehavior({ clickEventsCount: localClickCount });
    };

    const handleResize = () => {
        const orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
        updateBehavior({ orientation, zoomLevel: window.devicePixelRatio });
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('click', clickTracker);
    window.addEventListener('resize', handleResize);

    return () => {
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('click', clickTracker);
        window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 4. Heartbeat & Background Sync logic
  useEffect(() => {
    // Periodic Heartbeat (every 15s)
    const interval = setInterval(() => {
        syncSession();
    }, 15000); 

    // Sync immediately when tab/app is hidden (Background) or closed
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            // App sent to background - sync latest stats immediately
            syncSession();
        }
    };

    // Attempt final sync on close (Best effort)
    const handleBeforeUnload = () => {
        syncSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return null; // Headless
};

export default SessionTracker;
