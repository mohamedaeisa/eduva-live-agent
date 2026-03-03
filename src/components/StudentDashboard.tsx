import React, { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import { generateStudentDashboard, DashboardStats, GalaxyNode } from '../services/dashboardService';
import Card from './ui/Card';
import Button from './ui/Button';

// 🌌 GALAXY VIEW COMPONENT
const KnowledgeGalaxy: React.FC<{ nodes: GalaxyNode[] }> = ({ nodes }) => {
  return (
    <div className="relative w-full h-[400px] bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-indigo-500/20 group cursor-grab active:cursor-grabbing">
      {/* Starfield Background */}
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
      
      {/* The Core (Sun) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-indigo-500/20 rounded-full blur-3xl animate-pulse"></div>

      {/* Atom Nodes */}
      <div className="absolute top-1/2 left-1/2 w-0 h-0">
        {nodes.map((node, i) => (
          <div 
            key={node.id}
            className={`absolute w-3 h-3 rounded-full transition-all duration-500 border-2 ${
              node.status === 'MASTERED' ? 'bg-emerald-400 border-emerald-200 shadow-[0_0_10px_#34d399]' :
              node.status === 'ACTIVE' ? 'bg-amber-400 border-amber-200 animate-pulse' :
              'bg-slate-700 border-slate-600'
            }`}
            style={{ 
              transform: `translate(${node.x * 4}px, ${node.y * 4}px)`,
              zIndex: node.status === 'MASTERED' ? 10 : 1
            }}
            title={node.title}
          />
        ))}
      </div>
      
      <div className="absolute bottom-6 left-6 text-xs font-black text-slate-500 uppercase tracking-widest">
        Neural Map Explorer v1.0
      </div>
    </div>
  );
};

// 🕸️ COGNITIVE RADAR COMPONENT
const CognitiveRadar: React.FC<{ split: DashboardStats['cognitiveSplit'] }> = ({ split }) => {
  const max = Math.max(split.recall, split.apply, split.analyze, 1);
  const r = 80; // Radius
  const c = 100; // Center
  
  const points = [
    { label: 'Recall', val: split.recall, ang: 270 }, // Top
    { label: 'Apply', val: split.apply, ang: 30 },    // Bottom Right
    { label: 'Analyze', val: split.analyze, ang: 150 } // Bottom Left
  ];

  const polyPoints = points.map(p => {
    const valNorm = (p.val / max) * r;
    const rad = p.ang * (Math.PI / 180);
    return `${c + Math.cos(rad) * valNorm},${c + Math.sin(rad) * valNorm}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[200px] h-[200px]">
        <svg viewBox="0 0 200 200" className="w-full h-full transform rotate-0">
          <polygon points="100,20 169,140 31,140" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          <polygon points="100,60 135,120 65,120" fill="none" stroke="#e2e8f0" strokeWidth="1" />
          <polygon points={polyPoints} fill="rgba(99, 102, 241, 0.2)" stroke="#6366f1" strokeWidth="2" />
          {points.map(p => {
             const rad = p.ang * (Math.PI / 180);
             return <circle key={p.label} cx={c + Math.cos(rad) * ((p.val/max)*r)} cy={c + Math.sin(rad) * ((p.val/max)*r)} r="4" fill="#4f46e5" />;
          })}
        </svg>
        <span className="absolute top-0 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase text-slate-400 bg-white dark:bg-slate-800 px-1">Recall</span>
        <span className="absolute bottom-4 right-2 text-[9px] font-black uppercase text-slate-400 bg-white dark:bg-slate-800 px-1">Apply</span>
        <span className="absolute bottom-4 left-2 text-[9px] font-black uppercase text-slate-400 bg-white dark:bg-slate-800 px-1">Analyze</span>
      </div>
      <p className="text-xs font-bold text-slate-500 mt-2">Cognitive Mastery Curve</p>
    </div>
  );
};

const StudentDashboard: React.FC<{ user: UserProfile; onLaunchMission: () => void; onBack: () => void }> = ({ user, onLaunchMission, onBack }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const subject = user.preferences.defaultSubject || "General";

  useEffect(() => {
    generateStudentDashboard(user, subject).then(setStats);
  }, [user, subject]);

  if (!stats) return <div className="p-10 text-center animate-pulse">Establishing Link to Command Center...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 animate-fade-in font-sans">
      <header className="flex justify-between items-end">
        <div>
          <button onClick={onBack} className="text-slate-400 hover:text-indigo-600 font-black text-xs uppercase tracking-widest mb-4 flex items-center gap-2">
            ← Exit to Hub
          </button>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-800 dark:text-white">
            Simulation Control
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">
            Cadet: {user.name} | Sector: {subject}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black text-indigo-600">{stats.globalProgress}%</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase">Map Progress</div>
        </div>
      </header>

      <section>
        <div className="flex justify-between items-center mb-4 px-2">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Knowledge Galaxy</h2>
          <span className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-800">
            {stats.masteredCount} / {stats.totalScope} Concept Atoms
          </span>
        </div>
        <KnowledgeGalaxy nodes={stats.galaxyNodes} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-8 flex flex-col items-center justify-center border-t-8 border-indigo-500">
          <CognitiveRadar split={stats.cognitiveSplit} />
          <div className="mt-8 text-center px-4">
            <p className="text-xs font-bold text-slate-500 italic leading-relaxed">
              "System analysis shows stable <strong>Recall</strong>. Command recommends prioritizing <strong>Analysis</strong> units."
            </p>
          </div>
        </Card>

        <Card className="p-8 bg-slate-900 text-white flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 text-9xl group-hover:rotate-12 transition-transform duration-700">🚀</div>
          <div className="relative z-10">
            <h3 className="text-lg font-black uppercase tracking-widest mb-2 flex items-center gap-3">
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></span>
                Next Objective
            </h3>
            <p className="text-slate-400 text-sm mb-10 leading-relaxed italic">
               Procedural scan indicates 3 unverified atoms in this sector. Clear them to bridge the next knowledge tier.
            </p>
          </div>
          <Button 
            onClick={onLaunchMission}
            className="bg-indigo-600 hover:bg-indigo-500 text-white w-full py-5 rounded-2xl font-black uppercase tracking-widest shadow-2xl border-none transition-all hover:scale-[1.02] active:scale-95"
          >
            Launch Extraction →
          </Button>
        </Card>
      </section>
    </div>
  );
};

export default StudentDashboard;