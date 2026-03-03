
import React, { useEffect, useRef, useState } from 'react';
import { UserProfile, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GenAIBlob } from '@google/genai';
import { logEvent } from '../services/analyticsService';

interface VivaModeProps {
  user: UserProfile;
  appLanguage: Language;
}

// --- Audio Utils from Google GenAI SDK Guidelines ---
function createBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  
  // Manual encode instead of btoa to avoid issues
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  };
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
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
}
// --------------------------------------------------

const VivaMode: React.FC<VivaModeProps> = ({ user, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false); // AI is speaking
  const [volume, setVolume] = useState(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  const connect = async () => {
    // Fix: Obtain API key exclusively from environment variable process.env.API_KEY per guidelines.
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      alert("API Key missing for Viva Mode.");
      return;
    }

    setStatus('connecting');
    const ai = new GoogleGenAI({ apiKey });

    try {
      // Setup Audio Contexts
      const InputAudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new InputAudioContextClass({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;

      const OutputAudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const outputCtx = new OutputAudioContextClass({ sampleRate: 24000 });
      outputAudioContextRef.current = outputCtx;
      
      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);
      outputNodeRef.current = outputNode;

      // Visualizer Analyzer
      const analyzer = outputCtx.createAnalyser();
      analyzer.fftSize = 256;
      outputNode.connect(analyzer); // Connect gain to analyzer
      analyzerRef.current = analyzer;

      // Microphone Stream
      // IMPORTANT: This prompts the user for permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          // Fix: corrected property name 'responseModalalities' to 'responseModalities'
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: `You are a friendly and encouraging verbal tutor for a student in ${user.preferences.defaultYear}. 
          Subject Context: General Viva. 
          Ask short questions, wait for the answer, and provide feedback. 
          Keep responses concise and conversational. 
          Language: ${user.preferences.defaultLanguage}.`,
        },
        callbacks: {
          onopen: () => {
            console.log("Viva Connection Opened");
            setIsConnected(true);
            setStatus('connected');
            logEvent("Start Viva Session", "Voice Mode Connected");
            
            // Setup Microphone Processor
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              
              // Send to AI
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsSpeaking(true);
              
              // Sync play time
              if (outputAudioContextRef.current) {
                 const ctx = outputAudioContextRef.current;
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 
                 const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 
                 if (outputNodeRef.current) {
                    source.connect(outputNodeRef.current);
                 }
                 
                 source.addEventListener('ended', () => {
                   sourcesRef.current.delete(source);
                   if (sourcesRef.current.size === 0) setIsSpeaking(false);
                 });
                 
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 // Fix: Access .current on sourcesRef
                 sourcesRef.current.add(source);
              }
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
               sourcesRef.current.forEach(s => s.stop());
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
               setIsSpeaking(false);
            }
          },
          onclose: () => {
            console.log("Viva Connection Closed");
            setIsConnected(false);
            setStatus('idle');
          },
          onerror: (e) => {
            console.error("Viva Error", e);
            setIsConnected(false);
            setStatus('idle');
            // Handle specific error cases
            if (e instanceof ErrorEvent && e.message.includes('Permission denied')) {
                alert("Microphone access denied. Please allow microphone usage in your browser address bar/settings to use Voice Mode.");
            } else {
                alert("Connection Error. Please try again. (Check microphone permissions)");
            }
          }
        }
      });
      
      sessionPromiseRef.current = sessionPromise;

    } catch (e: any) {
      console.error("Setup failed", e);
      setStatus('idle');
      
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        alert("Microphone access denied. Please allow microphone usage in your browser address bar/settings to use Voice Mode.");
      } else {
        alert("Could not access microphone or connect. Error: " + (e.message || e));
      }
    }
  };

  const disconnect = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
    }
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    
    sessionPromiseRef.current = null;
    setIsConnected(false);
    setStatus('idle');
    setIsSpeaking(false);
    logEvent("End Viva Session", "Voice Mode Disconnected");
  };

  // Visualizer Loop
  useEffect(() => {
    const updateVisualizer = () => {
      if (analyzerRef.current && isConnected) {
        const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
        analyzerRef.current.getByteFrequencyData(dataArray);
        // Calc average volume
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolume(avg); // 0-255
      } else {
        setVolume(0);
      }
      animationFrameRef.current = requestAnimationFrame(updateVisualizer);
    };
    updateVisualizer();
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isConnected]);

  return (
    <div className="max-w-2xl mx-auto animate-fade-in py-12 px-4 text-center">
      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-600 mb-4">
        {t.vivaTitle}
      </h1>
      <p className="text-slate-500 dark:text-slate-400 mb-10 text-lg">
        {t.vivaIntro}
      </p>

      <Card className="relative overflow-hidden min-h-[300px] flex flex-col items-center justify-center bg-slate-900 border-slate-800">
        
        {/* Animated Circle Visualizer */}
        <div className="relative w-64 h-64 flex items-center justify-center mb-8">
           {/* Outer Glow - Reacts to volume */}
           <div 
             className={`absolute inset-0 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 opacity-30 blur-2xl transition-all duration-75`}
             style={{ transform: `scale(${1 + volume / 100})` }}
           ></div>
           
           {/* Inner Circle */}
           <div className="relative z-10 w-40 h-40 bg-slate-800 rounded-full flex items-center justify-center border-4 border-slate-700 shadow-2xl">
              {status === 'connecting' && (
                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
              )}
              {status === 'connected' && (
                 <span className="text-5xl animate-pulse">
                   {isSpeaking ? '🤖' : '🎤'}
                 </span>
              )}
              {status === 'idle' && <span className="text-5xl opacity-50">😴</span>}
           </div>
        </div>

        <div className="space-y-4 z-10">
           <div className="text-white font-mono text-sm">
              {status === 'connecting' && "Connecting..."}
              {status === 'connected' && (isSpeaking ? t.vivaSpeaking : t.vivaListening)}
              {status === 'idle' && "Ready to Start"}
           </div>

           {!isConnected ? (
             <Button onClick={connect} className="px-8 py-3 text-lg bg-pink-600 hover:bg-pink-700 focus:ring-pink-500">
               {t.vivaStart}
             </Button>
           ) : (
             <Button onClick={disconnect} variant="danger" className="px-8 py-3 text-lg">
               {t.vivaEnd}
             </Button>
           )}
        </div>
      </Card>
    </div>
  );
};

export default VivaMode;
