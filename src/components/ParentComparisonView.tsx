
import React, { useState, useMemo } from 'react';
import { UserProfile, SubjectHealthState } from '../types';
import Card from './ui/Card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

interface ParentComparisonViewProps {
  students: UserProfile[];
  allHealthData: Record<string, SubjectHealthState[]>;
  onClose: () => void;
}

const ParentComparisonView: React.FC<ParentComparisonViewProps> = ({ students, allHealthData, onClose }) => {
  const [mode, setMode] = useState<'OVERVIEW' | 'SUBJECT' | 'ROI'>('OVERVIEW');
  const [selectedSubject, setSelectedSubject] = useState<string>('Mathematics');

  // --- ENGINE: Derived Metrics ---
  const comparisonData = useMemo(() => {
    return students.map(student => {
      const healths: SubjectHealthState[] = allHealthData[student.id] || [];
      
      const avgConfidence = healths.length > 0 
        ? Math.round(healths.reduce((acc, h) => acc + h.confidenceScore, 0) / healths.length)
        : 0;
      
      const atRiskCount = healths.filter(h => h.overallStatus === 'CRITICAL').length;
      const attentionCount = healths.filter(h => h.overallStatus === 'NEEDS_ATTENTION').length;
      
      // Monetization Logic: Risk -> Revenue
      // Base $10 + $15 per Critical + $5 per Attention
      const monthlyCost = 10 + (atRiskCount * 15) + (attentionCount * 5);
      
      const riskLevel = atRiskCount > 0 ? 'HIGH' : attentionCount > 1 ? 'MED' : 'LOW';

      // Find top subjects to display in table
      const subjectsMap = healths.reduce((acc, h) => ({ ...acc, [h.subjectId]: h }), {} as Record<string, SubjectHealthState>);

      return {
        id: student.id,
        name: student.name,
        avgConfidence,
        atRiskCount,
        riskLevel,
        monthlyCost,
        subjectsMap,
        healths
      };
    });
  }, [students, allHealthData]);

  // --- RENDERERS ---

  const renderOverview = () => (
    <div className="overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <th className="p-4 w-1/5">Student</th>
            <th className="p-4">Math</th>
            <th className="p-4">Science</th>
            <th className="p-4">English</th>
            <th className="p-4 text-center">Overall Risk</th>
            <th className="p-4 text-right">Est. Monthly</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
          {comparisonData.map(s => {
             const getCell = (subj: string) => {
                 const h = s.subjectsMap[subj];
                 if (!h) return <span className="text-slate-300">-</span>;
                 const color = h.overallStatus === 'GOOD' ? 'text-green-600' : h.overallStatus === 'CRITICAL' ? 'text-red-600' : 'text-amber-600';
                 const icon = h.overallStatus === 'GOOD' ? '🟢' : h.overallStatus === 'CRITICAL' ? '🔴' : '🟠';
                 const arrow = h.trend === 'UP' ? '↑' : h.trend === 'DOWN' ? '↓' : '→';
                 return <span className={color}>{icon} {h.confidenceScore}% {arrow}</span>;
             };

             return (
              <tr key={s.id}>
                <td className="p-4">{s.name}</td>
                <td className="p-4">{getCell('Mathematics')}</td>
                <td className="p-4">{getCell('Science')}</td>
                <td className="p-4">{getCell('English')}</td>
                <td className="p-4 text-center">
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${
                        s.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 
                        s.riskLevel === 'MED' ? 'bg-amber-100 text-amber-700' : 
                        'bg-green-100 text-green-700'
                    }`}>
                        {s.riskLevel}
                    </span>
                </td>
                <td className="p-4 text-right font-mono text-indigo-600">${s.monthlyCost}</td>
              </tr>
             );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderSubjectComparison = () => {
    // Get all unique subjects across all students
    const allSubjects = Array.from(new Set(Object.values(allHealthData).flat().map((h: any) => h.subjectId)));

    return (
      <div className="space-y-6">
        {/* Subject Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {allSubjects.map((subj: unknown) => (
            <button
              key={subj as string}
              onClick={() => setSelectedSubject(subj as string)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedSubject === subj 
                  ? 'bg-indigo-600 text-white border-indigo-600' 
                  : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
              }`}
            >
              {subj as string}
            </button>
          ))}
        </div>

        <div className="overflow-hidden bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="p-4">Student</th>
                        <th className="p-4 text-center">Status</th>
                        <th className="p-4 text-center">Confidence</th>
                        <th className="p-4 text-center">Trend</th>
                        <th className="p-4">Primary Cause</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                    {comparisonData.map(s => {
                        const h = s.subjectsMap[selectedSubject];
                        if (!h) return null;
                        
                        const statusColor = h.overallStatus === 'GOOD' ? 'bg-green-100 text-green-700' : h.overallStatus === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                        
                        return (
                            <tr key={s.id}>
                                <td className="p-4">{s.name}</td>
                                <td className="p-4 text-center">
                                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${statusColor}`}>
                                        {h.overallStatus.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-center text-lg font-black">{h.confidenceScore}</td>
                                <td className="p-4 text-center">
                                    {h.trend === 'UP' ? '↗' : h.trend === 'DOWN' ? '↘' : '→'}
                                </td>
                                <td className="p-4 text-slate-500">{h.cause.replace(/_/g, ' ')}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
      </div>
    );
  };

  const renderROI = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
       {comparisonData.map(s => {
           // Simulate a risk reduction trend (Mock logic for display)
           const riskReduction = Math.round(s.avgConfidence * 0.4); 
           const worthIt = riskReduction > 20;

           return (
               <Card key={s.id} className="bg-white dark:bg-slate-900 border-l-4 border-indigo-500">
                   <div className="flex justify-between items-start mb-4">
                       <h3 className="font-black text-lg">{s.name}</h3>
                       <span className="text-xs font-mono text-slate-400">30 Day Outlook</span>
                   </div>
                   
                   <div className="flex items-center gap-6">
                       <div className="text-center">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monthly Spend</p>
                           <p className="text-2xl font-black text-slate-800 dark:text-white">${s.monthlyCost}</p>
                       </div>
                       <div className="text-center">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Risk Reduced</p>
                           <p className="text-2xl font-black text-emerald-500">↓ {riskReduction}%</p>
                       </div>
                   </div>

                   <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                       {worthIt ? (
                           <p className="text-xs font-bold text-emerald-600 flex items-center gap-2">
                               <span>✔</span> Investment validated. Trend is positive.
                           </p>
                       ) : (
                           <p className="text-xs font-bold text-amber-600 flex items-center gap-2">
                               <span>⚠</span> Review strategy. Risk remaining steady.
                           </p>
                       )}
                   </div>
               </Card>
           );
       })}
    </div>
  );

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800">
        {/* Tab Navigation */}
        <div className="flex justify-center mb-6">
            <div className="flex bg-white dark:bg-slate-900 p-1 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                {(['OVERVIEW', 'SUBJECT', 'ROI'] as const).map(m => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            mode === m 
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        {m}
                    </button>
                ))}
            </div>
        </div>

        {/* Main Content Area */}
        <div className="min-h-[400px]">
            {mode === 'OVERVIEW' && renderOverview()}
            {mode === 'SUBJECT' && renderSubjectComparison()}
            {mode === 'ROI' && renderROI()}
        </div>
    </div>
  );
};

export default ParentComparisonView;
