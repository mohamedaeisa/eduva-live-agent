
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Language } from '../types';
import { generateAvatarResponse } from '../services/geminiService';
import Button from './ui/Button';
import Card from './ui/Card';
import { logEvent } from '../services/analyticsService';

interface AvatarTutorProps {
  appLanguage: Language;
  onBack: () => void;
}

const AvatarTutor: React.FC<AvatarTutorProps> = ({ appLanguage, onBack }) => {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: 'model', text: appLanguage === Language.ARABIC ? 'أهلاً! أنا معلمك الذكي. اسألني أي شيء!' : 'Hello! I am your AI Tutor. Ask me anything!' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Simple SVG Face
  const renderAvatar = () => (
    <div className="relative w-48 h-48 mx-auto my-6 transition-transform duration-300 hover:scale-105">
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-2xl">
        {/* Head */}
        <circle cx="100" cy="100" r="90" fill="#ffdbac" stroke="#d4a373" strokeWidth="3" />
        {/* Hair */}
        <path d="M30,80 Q100,-20 170,80" fill="#4a3b2a" />
        {/* Eyes */}
        <circle cx="70" cy="90" r="10" fill="#333" className={isThinking ? "animate-pulse" : ""} />
        <circle cx="130" cy="90" r="10" fill="#333" className={isThinking ? "animate-pulse" : ""} />
        {/* Glasses */}
        <path d="M45,90 C45,75 95,75 95,90 M105,90 C105,75 155,75 155,90 M95,90 L105,90" fill="none" stroke="#333" strokeWidth="2" />
        {/* Mouth - Animates when speaking */}
        {isSpeaking ? (
          <ellipse cx="100" cy="140" rx="20" ry="15" fill="#a53f3f">
            <animate attributeName="ry" values="5;20;5" dur="0.2s" repeatCount="indefinite" />
          </ellipse>
        ) : (
          <path d="M80,140 Q100,155 120,140" fill="none" stroke="#a53f3f" strokeWidth="3" />
        )}
      </svg>
      {isSpeaking && (
        <div className="absolute -top-4 -right-4 bg-white px-3 py-1 rounded-xl shadow-lg text-xs font-bold animate-bounce">
          Speaking...
        </div>
      )}
    </div>
  );

  const speakText = async (text: string) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const voice = appLanguage === Language.ARABIC ? 'Zephyr' : 'Fenrir'; // Adjusted for best dialect fit
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioData) return;

      // Play Audio
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      const ctx = audioContextRef.current;

      const binary = atob(audioData);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

      // Decode
      const dataInt16 = new Int16Array(bytes.buffer);
      const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);
      for (let i = 0; i < channelData.length; i++) channelData[i] = dataInt16[i] / 32768.0;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      
      source.onended = () => setIsSpeaking(false);
      setIsSpeaking(true);
      source.start();

    } catch (e) {
      console.error("TTS Error", e);
      setIsSpeaking(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);
    
    logEvent("Ask Avatar Tutor", input);

    try {
      const replyText = await generateAvatarResponse([...messages, userMsg], appLanguage);
      const aiMsg = { role: 'model', text: replyText };
      setMessages(prev => [...prev, aiMsg]);
      speakText(replyText);
    } catch (e) {
      alert("AI Error");
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 pb-20 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <h2 className="text-xl font-black text-brand-600">AI Talking Tutor</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Avatar Column */}
        <div className="flex flex-col items-center bg-gradient-to-b from-indigo-100 to-white dark:from-slate-800 dark:to-slate-900 rounded-3xl p-8 border border-indigo-200 dark:border-slate-700 shadow-inner">
           {renderAvatar()}
           <p className="text-center text-sm text-slate-500 font-medium mt-4 italic">
             "I can explain anything! Try me."
           </p>
           <button 
             className="mt-6 bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95"
             onClick={() => alert("Recording simulation: Clip saved to gallery! (Share to TikTok)")}
           >
             <span>🔴</span> Record Clip
           </button>
        </div>

        {/* Chat Column */}
        <Card className="h-[500px] flex flex-col">
           <div className="flex-grow overflow-y-auto space-y-4 p-2 custom-scrollbar">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-white rounded-tl-none'}`}>
                     {m.text}
                   </div>
                </div>
              ))}
              {isThinking && <div className="text-xs text-slate-400 animate-pulse">Typing...</div>}
           </div>
           <div className="mt-4 flex gap-2">
              <input 
                className="flex-grow p-3 rounded-xl border border-slate-300 dark:bg-slate-700 dark:border-slate-600 outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Ask a question..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <Button onClick={handleSend} disabled={isThinking || isSpeaking}>Send</Button>
           </div>
        </Card>
      </div>
    </div>
  );
};

export default AvatarTutor;
