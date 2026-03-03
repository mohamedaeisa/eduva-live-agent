import React, { useRef, useEffect, useCallback } from 'react';

interface AudioVisualizerProps {
    isActive: boolean;
    analyser?: AnalyserNode | null;
    variant?: 'ai' | 'mic';
    barColor?: string;
    noiseThreshold?: number; // 0.0 – 1.0: draws an orange dashed line at this level
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, analyser, variant = 'ai', barColor, noiseThreshold }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const animationRef = useRef<number | null>(null);

    const drawVisualization = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !analyser) return;

        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        // Set canvas size to match its display size
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvasCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const width = rect.width;
        const height = rect.height;

        // Get frequency data from the real audio analyser
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        canvasCtx.clearRect(0, 0, width, height);

        // Draw bars
        const numBars = Math.min(64, bufferLength);
        const barWidth = width / numBars;
        const thinBarWidth = Math.max(2, barWidth * 0.6);
        const barSpacing = (barWidth - thinBarWidth) / 2;
        const maxBarHeight = height * 0.8;

        for (let i = 0; i < numBars; i++) {
            const barHeight = (dataArray[i] / 255) * maxBarHeight;
            const x = i * barWidth + barSpacing;
            const y = height - barHeight;

            let fillStyle: string | CanvasGradient;

            if (barColor) {
                fillStyle = barColor;
            } else {
                const gradient = canvasCtx.createLinearGradient(0, y, 0, height);
                if (variant === 'ai') {
                    const hue = (i / numBars) * 120 + 200;
                    gradient.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.9)`);
                    gradient.addColorStop(0.5, `hsla(${hue + 20}, 80%, 70%, 0.8)`);
                    gradient.addColorStop(1, `hsla(${hue + 40}, 90%, 80%, 0.6)`);
                } else {
                    const hue = (i / numBars) * 60 + 20;
                    gradient.addColorStop(0, `hsla(${hue}, 80%, 45%, 0.9)`);
                    gradient.addColorStop(0.5, `hsla(${hue + 10}, 85%, 55%, 0.75)`);
                    gradient.addColorStop(1, `hsla(${hue + 20}, 90%, 65%, 0.6)`);
                }
                fillStyle = gradient;
            }

            canvasCtx.fillStyle = fillStyle;
            canvasCtx.fillRect(x, y, thinBarWidth, barHeight);

            canvasCtx.shadowColor = barColor ? barColor : (variant === 'ai' ? 'rgba(99, 102, 241, 0.5)' : 'rgba(16, 185, 129, 0.5)');
            canvasCtx.shadowBlur = 4;
            canvasCtx.fillRect(x, y, thinBarWidth, barHeight);
            canvasCtx.shadowBlur = 0;
        }

        // 🔊 Noise Threshold Line: orange dashed line at the threshold level
        if (noiseThreshold != null && noiseThreshold > 0) {
            // 🛑 enh35: Visual scaling fix. The WebAudio analyzer is logarithmic (how human ears hear),
            // but our noise gate math (0.0 -> 1.0 amplitude) is completely linear. 
            // Taking the square root dynamically expands the lower values to match the visual bars.
            const visualHeightRatio = Math.min(1.0, Math.pow(noiseThreshold * 2.5, 0.5));
            const thresholdY = height - (visualHeightRatio * maxBarHeight);
            canvasCtx.save();
            canvasCtx.setLineDash([4, 4]);
            canvasCtx.lineWidth = 1.5;
            canvasCtx.strokeStyle = 'rgba(36, 38, 36, 0.9)'; // orange-400
            canvasCtx.shadowColor = 'rgba(60, 251, 89, 0.5)';
            canvasCtx.shadowBlur = 4;
            canvasCtx.beginPath();
            canvasCtx.moveTo(0, thresholdY);
            canvasCtx.lineTo(width, thresholdY);
            canvasCtx.stroke();

            // Label
            canvasCtx.shadowBlur = 0;
            canvasCtx.setLineDash([]);
            canvasCtx.fillStyle = 'rgba(251, 60, 133, 0.9)';
            canvasCtx.font = `${Math.max(8, height * 0.18)}px sans-serif`;
            canvasCtx.fillText('    Noise Level', 2, Math.max(thresholdY - 2, 10));
            canvasCtx.restore();
        }

        // Continue animation
        if (isActive) {
            animationRef.current = requestAnimationFrame(drawVisualization);
        }
    }, [isActive, analyser, variant, barColor, noiseThreshold]);

    useEffect(() => {
        if (isActive && analyser) {
            drawVisualization();
        } else {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            const canvas = canvasRef.current;
            if (canvas) {
                const canvasCtx = canvas.getContext('2d');
                if (canvasCtx) {
                    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                }
            }
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isActive, analyser, drawVisualization]);

    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ imageRendering: 'auto' }}
        />
    );
};

export default AudioVisualizer;
