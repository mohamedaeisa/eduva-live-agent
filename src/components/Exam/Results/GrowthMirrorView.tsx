
import React from 'react';
import { GrowthSnapshot } from '../../../services/scoring/types';
import Button from '../../ui/Button';
import Card from '../../ui/Card';

interface GrowthMirrorViewProps {
    snapshot: GrowthSnapshot;
    onBack: () => void;
}

const GrowthMirrorView: React.FC<GrowthMirrorViewProps> = ({ snapshot, onBack }) => {

    const { bloomDistribution, strengths, weaknesses, trustScore } = snapshot;

    return (
        <div className="bg-slate-50 min-h-screen animate-fade-in pb-20">
            {/* Header */}
            <div className="bg-slate-900 text-white p-6 pb-20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-indigo-600 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>

                <div className="max-w-2xl mx-auto flex justify-between items-center relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl animate-bounce-subtle">🔮</span>
                            <h1 className="text-2xl font-black font-serif bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                                Growth Mirror
                            </h1>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider pl-9">
                            Analysis of your cognitive performance
                        </p>
                    </div>
                    <Button
                        onClick={onBack}
                        className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all px-6 py-2 rounded-xl flex items-center gap-2 group"
                    >
                        <span className="font-bold text-sm">Close Mirror</span>
                        <span className="bg-white text-slate-900 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black group-hover:rotate-90 transition-transform">✕</span>
                    </Button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 -mt-10 space-y-6 relative z-20">

                {/* 1. Trust Score Panel */}
                <Card className="p-6 border-0 shadow-xl bg-white/90 backdrop-blur-sm flex items-center justify-between ring-1 ring-slate-900/5">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full ${trustScore >= 0.9 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                            <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Data Confidence</h3>
                        </div>
                        <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                            {trustScore === 1
                                ? "This analysis is based on a complete dataset with no technical exclusions."
                                : `Based on ${(trustScore * 100).toFixed(0)}% available data. Some items were excluded to protect your score integrity.`}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className={`text-4xl font-black ${trustScore >= 0.9 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {(trustScore * 100).toFixed(0)}%
                        </span>
                        <div className="text-[10px] font-bold text-slate-300 uppercase">Trust Score</div>
                    </div>
                </Card>

                {/* 2. Cognitive Profile (Reimagined) */}
                <Card className="p-0 overflow-hidden border-0 shadow-lg">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                            <span>🧠</span> Cognitive Profile
                        </h3>
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Results Breakdown</span>
                    </div>
                    <div className="p-6 space-y-6">
                        {Object.entries(bloomDistribution).map(([level, stats]) => {
                            const percent = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
                            const color = level === 'recall' ? 'bg-blue-500' : (level === 'apply' ? 'bg-purple-500' : 'bg-pink-500');

                            return (
                                <div key={level} className="group">
                                    <div className="flex justify-between text-xs font-bold uppercase mb-2">
                                        <span className="text-slate-500 group-hover:text-indigo-600 transition-colors">{level}</span>
                                        <span className="text-slate-900">{stats.correct}/{stats.total} <span className="text-slate-300 mx-1">|</span> {Math.round(percent)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${color} shadow-lg shadow-${color}/30 transition-all duration-1000 ease-out`}
                                            style={{ width: `${percent}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 3. Strengths */}
                    <Card className="p-5 border-t-4 border-green-500 shadow-md hover:shadow-lg transition-shadow bg-white">
                        <h3 className="font-bold text-slate-900 mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
                            <span className="text-green-500">▲</span> Observed Strengths
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {strengths.length > 0 ? strengths.map(tag => (
                                <span key={tag} className="px-3 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-bold border border-green-100 shadow-sm">
                                    {tag}
                                </span>
                            )) : <span className="text-xs text-slate-400 italic">No specific strengths isolated yet.</span>}
                        </div>
                    </Card>

                    {/* 4. Focus Areas */}
                    <Card className="p-5 border-t-4 border-rose-500 shadow-md hover:shadow-lg transition-shadow bg-white">
                        <h3 className="font-bold text-slate-900 mb-4 text-xs uppercase tracking-widest flex items-center gap-2">
                            <span className="text-rose-500">▼</span> Focus Areas
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {weaknesses.length > 0 ? weaknesses.map(tag => (
                                <span key={tag} className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-100 shadow-sm">
                                    {tag}
                                </span>
                            )) : <span className="text-xs text-slate-400 italic">No specific gaps detected. Good job!</span>}
                        </div>
                    </Card>
                </div>

                {/* 5. Velocity (Placeholder) */}
                <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center opacity-40 hover:opacity-100 transition-opacity">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Velocity Tracking available after 5 exams</p>
                </div>

            </div>
        </div>
    );
};

export default GrowthMirrorView;
