
import React, { useState, useEffect, useRef } from 'react';
import { PodcastData, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';

interface PodcastPlayerProps {
  data: PodcastData;
  onBack: () => void;
  appLanguage: Language;
}

const PodcastPlayer: React.FC<PodcastPlayerProps> = ({ data, onBack, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [isPlaying, setIsPlaying] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isAudioAvailable, setIsAudioAvailable] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isNativeSpeaking, setIsNativeSpeaking] = useState(false);
  
  // Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(1); // Ref to access in animation loop
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Native TTS Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // --- Helper Functions from Guidelines ---
  const decode = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };
  // ----------------------------------------

  useEffect(() => {
    const initAudio = async () => {
      // Check if audio data exists. If loaded from history, it might be stripped to save space.
      if (!data.audioBase64) {
        setIsAudioAvailable(false);
        setShowScript(true); // Auto-show script if audio is missing
        
        // Load Voices for fallback
        const loadVoices = () => {
            voicesRef.current = window.speechSynthesis.getVoices();
        };
        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }
        return;
      }

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: 24000 }); // 24000 for gemini tts
        audioContextRef.current = ctx;

        const bytes = decode(data.audioBase64);
        const buffer = await decodeAudioData(bytes, ctx, 24000, 1);
        audioBufferRef.current = buffer;
        setDuration(buffer.duration);
        setIsAudioAvailable(true);
      } catch (e) {
        console.error("Audio initialization failed", e);
        setIsAudioAvailable(false);
      }
    };

    initAudio();

    return () => {
      stopAudio();
      window.speechSynthesis.cancel();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [data.audioBase64]);

  const playAudio = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return;

    // Resume context if suspended (browser policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = playbackRateRef.current;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
        // Only reset if we reached the end naturally (not stopped manually)
    };

    // Start from paused time (absolute audio buffer time)
    const offset = pauseTimeRef.current;
    source.start(0, offset);
    
    // Record when we started playing (Wall Clock Time)
    startTimeRef.current = audioContextRef.current.currentTime;
    
    sourceNodeRef.current = source;
    setIsPlaying(true);
    
    // Progress loop
    const updateProgress = () => {
      if (audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        const runTime = now - startTimeRef.current;
        // Calculate total position: saved offset + (wall clock run time * speed)
        const elapsed = pauseTimeRef.current + (runTime * playbackRateRef.current);
        
        setCurrentTime(Math.min(elapsed, duration));
        
        if (elapsed < duration && sourceNodeRef.current) {
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        } else if (elapsed >= duration) {
           setIsPlaying(false);
           setCurrentTime(0);
           pauseTimeRef.current = 0;
        }
      }
    };
    cancelAnimationFrame(animationFrameRef.current);
    updateProgress();
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      if (audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        // Save current audio position
        pauseTimeRef.current += (now - startTimeRef.current) * playbackRateRef.current;
      }
      setIsPlaying(false);
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    pauseTimeRef.current = 0;
    setCurrentTime(0);
    cancelAnimationFrame(animationFrameRef.current);
  };

  const togglePlay = () => {
    if (isPlaying) pauseAudio();
    else playAudio();
  };

  const seekTo = (time: number) => {
    const newTime = Math.max(0, Math.min(time, duration));
    
    // Update refs
    pauseTimeRef.current = newTime;
    // We don't reset startTimeRef here because playAudio will do it based on the new context time
    setCurrentTime(newTime);

    // If playing, restart source seamlessly
    if (isPlaying) {
        if (sourceNodeRef.current) {
            sourceNodeRef.current.stop();
            sourceNodeRef.current = null;
        }
        playAudio();
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration === 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    seekTo(percentage * duration);
  };

  const changeSpeed = (rate: number) => {
    // If playing, we need to seamlessy transition
    if (isPlaying && audioContextRef.current) {
        const now = audioContextRef.current.currentTime;
        // 1. Commit progress so far at old rate
        const runTime = now - startTimeRef.current;
        pauseTimeRef.current += runTime * playbackRateRef.current;
        
        // 2. Reset start time anchor to NOW
        startTimeRef.current = now;
        
        // 3. Update active node param
        if (sourceNodeRef.current) {
            sourceNodeRef.current.playbackRate.setValueAtTime(rate, now);
        }
    }
    
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
  };

  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // Helper to write WAV header and data for download
  const downloadWav = () => {
    if (!audioBufferRef.current) return;

    const buffer = audioBufferRef.current;
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2; // 16-bit = 2 bytes
    const bufferSize = 44 + length;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    const writeString = (view: DataView, offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true); // 16-bit

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Write PCM data
    const channelData = buffer.getChannelData(0); // Mono is sufficient
    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      let s = Math.max(-1, Math.min(1, channelData[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, s, true);
      offset += 2;
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `podcast_${data.topic.replace(/\s+/g, '_')}.wav`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleNativeSpeak = () => {
      if (isNativeSpeaking) {
          window.speechSynthesis.cancel();
          setIsNativeSpeaking(false);
          return;
      }

      if (!data.script) return;

      const lines = data.script.split('\n').filter(l => l.trim());
      
      // Simple logic: Alternate voices
      const voices = voicesRef.current;
      const maleVoice = voices.find(v => v.name.includes('Male') || v.name.includes('David')) || voices[0];
      const femaleVoice = voices.find(v => v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Google US English')) || voices[1] || voices[0];

      let currentIndex = 0;

      const speakNext = () => {
          if (currentIndex >= lines.length) {
              setIsNativeSpeaking(false);
              return;
          }

          const line = lines[currentIndex];
          const isExpert = line.startsWith('Expert:');
          const text = line.replace(/^(Host:|Expert:)/i, '').trim();
          
          const utter = new SpeechSynthesisUtterance(text);
          utter.voice = isExpert ? maleVoice : femaleVoice;
          utter.rate = 1.1;
          
          utter.onend = () => {
              currentIndex++;
              speakNext();
          };

          window.speechSynthesis.speak(utter);
      };

      setIsNativeSpeaking(true);
      speakNext();
  };

  // Render Dialogue Script
  const renderScript = () => {
    if (!data.script) return null;
    
    // Split lines and filter empty ones
    const lines = data.script.split('\n').filter(line => line.trim() !== '');
    
    return (
        <div className="space-y-4">
            {lines.map((line, idx) => {
                const isExpert = line.startsWith('Expert:');
                const cleanLine = line.replace(/^(Host:|Expert:)/i, '').trim();
                
                return (
                    <div key={idx} className={`flex ${isExpert ? 'justify-end' : 'justify-start'}`}>
                        <div 
                            className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed ${
                                isExpert 
                                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100 rounded-tr-none' 
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white rounded-tl-none'
                            }`}
                        >
                            <span className="block text-[10px] font-bold uppercase opacity-50 mb-1">
                                {isExpert ? 'Expert' : 'Host'}
                            </span>
                            {cleanLine}
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in py-10 px-4">
      <div className="flex justify-between items-center mb-8">
        <Button variant="outline" onClick={onBack}>← {t.back}</Button>
        <span className="text-xs uppercase tracking-widest text-purple-500 font-bold bg-purple-50 dark:bg-purple-900/20 px-3 py-1 rounded-full">
          {t.modePodcast}
        </span>
      </div>

      <Card className="bg-gradient-to-br from-slate-900 to-purple-900 text-white border-0 shadow-2xl overflow-hidden relative">
        {/* Background Abstract Shapes */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20 pointer-events-none">
           <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[length:20px_20px]"></div>
           <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500 rounded-full blur-[100px] ${isPlaying || isNativeSpeaking ? 'animate-pulse' : ''}`}></div>
        </div>

        <div className="relative z-10 flex flex-col items-center text-center py-10">
           {/* Duration Badge */}
           {isAudioAvailable && duration > 0 && (
             <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-mono text-purple-200 border border-white/10">
               {formatTime(duration)}
             </div>
           )}

           <div className={`w-40 h-40 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center mb-6 shadow-lg shadow-purple-500/30 transition-transform duration-700 ${isPlaying || isNativeSpeaking ? 'scale-110 rotate-3' : 'scale-100'}`}>
              <span className="text-6xl">🎙️</span>
           </div>
           
           <h2 className="text-2xl font-bold mb-2 px-4">{data.title}</h2>
           <p className="text-purple-200 text-sm mb-8">{data.topic}</p>

           {/* Audio Controls or Missing State */}
           {isAudioAvailable ? (
             <>
               {/* Interactive Progress Bar */}
               <div className="w-full max-w-md px-4 mb-6">
                 <div className="flex justify-between text-xs text-purple-300 mb-2 font-mono">
                   <span>{formatTime(currentTime)}</span>
                   <span>{formatTime(duration)}</span>
                 </div>
                 
                 <div 
                   ref={progressBarRef}
                   className="w-full h-4 relative cursor-pointer group flex items-center"
                   onClick={handleProgressBarClick}
                 >
                   {/* Track */}
                   <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                     <div 
                       className="h-full bg-gradient-to-r from-purple-400 to-pink-400"
                       style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                     ></div>
                   </div>
                   
                   {/* Thumb (Hidden unless hovered/active) */}
                   <div 
                      className="absolute w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                      style={{ left: `${(currentTime / (duration || 1)) * 100}%`, transform: 'translateX(-50%)' }}
                   ></div>
                 </div>
               </div>

               {/* Playback Controls */}
               <div className="flex items-center gap-6 mb-8">
                  <button 
                    onClick={() => {
                       pauseAudio();
                       pauseTimeRef.current = Math.max(0, pauseTimeRef.current - 10);
                       playAudio();
                    }}
                    className="text-purple-300 hover:text-white transition-colors"
                    title="-10s"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z"></path></svg>
                  </button>

                  <button 
                    onClick={togglePlay}
                    className="w-20 h-20 rounded-full bg-white text-purple-900 flex items-center justify-center hover:scale-105 transition-transform shadow-xl"
                  >
                    {isPlaying ? (
                      <svg className="w-10 h-10 fill-current" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"></path></svg>
                    ) : (
                      <svg className="w-10 h-10 fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
                    )}
                  </button>

                  <button 
                    onClick={() => {
                       pauseAudio();
                       pauseTimeRef.current = Math.min(duration, pauseTimeRef.current + 10);
                       playAudio();
                    }}
                    className="text-purple-300 hover:text-white transition-colors"
                    title="+10s"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z"></path></svg>
                  </button>
               </div>

               {/* Bottom Row: Speed & Download */}
               <div className="flex gap-4 items-center">
                 {/* Speed Controls */}
                 <div className="flex gap-2 bg-black/20 p-1 rounded-lg backdrop-blur-sm">
                   {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                     <button
                       key={rate}
                       onClick={() => changeSpeed(rate)}
                       className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                         playbackRate === rate 
                           ? 'bg-white text-purple-900 shadow-sm' 
                           : 'text-purple-300 hover:bg-white/10'
                       }`}
                     >
                       {rate}x
                     </button>
                   ))}
                 </div>

                 {/* Download Button */}
                 <button 
                   onClick={downloadWav}
                   className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-purple-200 transition-colors flex items-center gap-2 text-xs font-bold backdrop-blur-sm border border-white/10"
                   title={t.downloadAudio}
                 >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                   {t.downloadAudio}
                 </button>
               </div>
             </>
           ) : (
             <div className="bg-purple-800/50 p-6 rounded-xl border border-purple-700 max-w-sm mx-auto mb-4">
                <div className="text-4xl mb-2">💾</div>
                <h3 className="font-bold mb-1">Audio Unavailable</h3>
                <p className="text-xs text-purple-200 mb-4">
                  The audio file is missing or expired. You can read the script below or use the offline reader.
                </p>
                <button 
                    onClick={handleNativeSpeak}
                    className="w-full py-2 bg-white text-purple-900 rounded-lg font-bold text-sm hover:bg-purple-50 transition-colors"
                >
                    {isNativeSpeaking ? "Stop Reading" : "🔊 Read Aloud (Offline)"}
                </button>
             </div>
           )}
        </div>
      </Card>

      <div className="mt-6 text-center">
        <button 
          onClick={() => setShowScript(!showScript)}
          className="text-slate-500 hover:text-brand-600 text-sm font-medium underline decoration-dotted"
        >
          {showScript ? "Hide Script" : t.scriptView}
        </button>
        
        {showScript && (
          <div className="mt-4 p-6 bg-white dark:bg-slate-800 rounded-xl shadow-inner text-left border border-slate-200 dark:border-slate-700 animate-slide-up">
             <h3 className="font-bold mb-4 text-slate-800 dark:text-white flex items-center gap-2">
                <span>📜</span> Podcast Script
             </h3>
             {renderScript()}
          </div>
        )}
      </div>
    </div>
  );
};

export default PodcastPlayer;
