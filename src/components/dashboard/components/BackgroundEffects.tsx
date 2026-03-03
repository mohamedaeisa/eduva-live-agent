
import React, { useEffect, useState } from 'react';

// Random utility
const useRandomParticles = (count: number) => {
    const [particles, setParticles] = useState<any[]>([]);

    useEffect(() => {
        // Hydration safe generation
        const newParticles = Array.from({ length: count }).map((_, i) => ({
            id: i,
            left: Math.random() * 95,
            top: Math.random() * 95,
            delay: Math.random() * 8, // Spread start times
            duration: 6 + Math.random() * 10, // Mix of fast (6s) and slow (16s) waves
            scale: 0.5 + Math.random() * 3, // Mix of small and large waves
            opacity: 0.2 + Math.random() * 0.3 // Random max opacity
        }));
        setParticles(newParticles);
    }, [count]);

    return particles;
};

// "Signal Wave" - Expanding concentric rings
const SignalWave: React.FC<{ particle: any }> = ({ particle }) => {
    return (
        <div
            className="absolute flex items-center justify-center pointer-events-none"
            style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
            }}
        >
            {/* Ring 1 */}
            <div
                className="absolute border border-indigo-500/10 rounded-full opacity-0"
                style={{
                    width: `${particle.scale * 60}px`,
                    height: `${particle.scale * 60}px`,
                    animation: `signalExpand ${particle.duration}s ease-out infinite`,
                    animationDelay: `${particle.delay}s`,
                    // Dynamic Max Opacity via CSS var
                    '--max-opacity': particle.opacity
                } as any}
            />
            {/* Ring 2 (Delayed Echo) */}
            <div
                className="absolute border border-indigo-400/20 rounded-full opacity-0"
                style={{
                    width: `${particle.scale * 60}px`,
                    height: `${particle.scale * 60}px`,
                    animation: `signalExpand ${particle.duration}s ease-out infinite`,
                    animationDelay: `${particle.delay + (particle.duration * 0.2)}s`, // 20% delay
                    '--max-opacity': particle.opacity * 0.7
                } as any}
            />
        </div>
    );
};

const BackgroundEffects: React.FC = () => {
    // Increased count for "more waves"
    const waves = useRandomParticles(15);

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
            {waves.map(p => <SignalWave key={`w-${p.id}`} particle={p} />)}

            <style>{`
                @keyframes signalExpand {
                    0% { transform: scale(0); opacity: 0; border-width: 3px; }
                    40% { opacity: var(--max-opacity, 0.3); } /* Fade In Phase */
                    100% { transform: scale(4); opacity: 0; border-width: 0px; } /* Fade Out Phase */
                }
            `}</style>
        </div>
    );
};

export default BackgroundEffects;
