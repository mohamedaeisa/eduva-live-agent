
import React from 'react';
import { SalesCoachData } from '../types';
import Button from './ui/Button';
import Card from './ui/Card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface SalesCoachDisplayProps {
  data: SalesCoachData;
  onBack: () => void;
}

const SalesCoachDisplay: React.FC<SalesCoachDisplayProps> = ({ data, onBack }) => {
  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-20 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <div className="text-right">
           <h1 className="text-2xl font-black text-slate-800 dark:text-white">Sales Coach AI</h1>
           <p className="text-xs text-slate-500">Call Analysis & Feedback</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Transcript */}
        <div className="lg:col-span-1 h-[600px] flex flex-col">
           <Card className="h-full flex flex-col p-0 overflow-hidden bg-slate-50 dark:bg-slate-900">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                 <h3 className="font-bold text-slate-700 dark:text-white flex items-center gap-2">
                    📄 Diarized Transcript
                 </h3>
              </div>
              <div className="flex-grow overflow-y-auto p-4 space-y-4">
                 {data.transcript.map((entry, idx) => (
                    <div key={idx} className={`flex flex-col ${entry.speaker.includes('A') || entry.speaker.toLowerCase().includes('sales') ? 'items-end' : 'items-start'}`}>
                       <span className="text-[10px] text-slate-400 font-bold uppercase mb-1 px-1">
                          {entry.speaker} • {entry.timestamp}
                       </span>
                       <div className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed ${
                          entry.speaker.includes('A') || entry.speaker.toLowerCase().includes('sales')
                            ? 'bg-cyan-600 text-white rounded-tr-none' 
                            : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm rounded-tl-none border border-slate-100 dark:border-slate-600'
                       }`}>
                          {entry.text}
                       </div>
                    </div>
                 ))}
              </div>
           </Card>
        </div>

        {/* Right Col: Analytics */}
        <div className="lg:col-span-2 space-y-6">
           
           {/* Sentiment Graph */}
           <Card>
              <h3 className="font-bold mb-4 flex items-center gap-2">
                 📈 Engagement Sentiment
              </h3>
              <div className="h-48 w-full">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.sentimentGraph}>
                       <defs>
                          <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                             <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <XAxis dataKey="label" tick={{fontSize: 10}} interval={0} />
                       <YAxis hide domain={[0, 100]} />
                       <Tooltip />
                       <Area type="monotone" dataKey="score" stroke="#06b6d4" fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
           </Card>

           {/* Coaching Card */}
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Strengths */}
              <Card className="border-l-4 border-green-500">
                 <h3 className="font-bold text-green-700 dark:text-green-400 mb-4 flex items-center gap-2">
                    ✅ Winning Moves
                 </h3>
                 <ul className="space-y-3">
                    {data.coaching.strengths.map((point, i) => (
                       <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">✓</span>
                          {point}
                       </li>
                    ))}
                 </ul>
              </Card>

              {/* Opportunities */}
              <Card className="border-l-4 border-amber-500">
                 <h3 className="font-bold text-amber-700 dark:text-amber-400 mb-4 flex items-center gap-2">
                    🚀 Missed Opportunities
                 </h3>
                 <ul className="space-y-3">
                    {data.coaching.missedOpportunities.map((point, i) => (
                       <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 text-xs font-bold">!</span>
                          {point}
                       </li>
                    ))}
                 </ul>
              </Card>
           </div>
        </div>

      </div>
    </div>
  );
};

export default SalesCoachDisplay;
