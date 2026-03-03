
import React, { useState, useEffect } from 'react';
import { QuotaGuard } from '../monetization/QuotaGuard';
import { ExamBlueprint } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';

interface ExamBlueprintPreviewProps {
    initialBlueprint: ExamBlueprint;
    onConfirm: (finalBlueprint: ExamBlueprint) => void;
    onBack: () => void;
    isInitializing?: boolean;
}


const ExamBlueprintPreview: React.FC<ExamBlueprintPreviewProps> = ({ initialBlueprint, onConfirm, onBack, isInitializing }) => {
    // Local mutation state
    const [blueprint, setBlueprint] = useState<ExamBlueprint>(initialBlueprint);
    const [disabledSections, setDisabledSections] = useState<Record<string, boolean>>({});

    // Recalculate totals on change
    useEffect(() => {
        const totalQ = blueprint.sections.reduce((acc, s) => disabledSections[s.id] ? acc : acc + s.count, 0);
        const totalM = blueprint.sections.reduce((acc, s) => disabledSections[s.id] ? acc : acc + (s.count * s.marksPerQuestion), 0);

        setBlueprint(prev => ({
            ...prev,
            totalQuestions: totalQ,
            totalMarks: totalM
        }));
    }, [blueprint.sections, disabledSections]);

    const updateSectionCount = (sectionId: string, delta: number) => {
        if (disabledSections[sectionId]) return;
        setBlueprint(prev => ({
            ...prev,
            sections: prev.sections.map(s => {
                if (s.id === sectionId) {
                    const newCount = Math.max(1, Math.min(50, s.count + delta));
                    return { ...s, count: newCount };
                }
                return s;
            })
        }));
    };

    const toggleSection = (sectionId: string) => {
        setDisabledSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    const cycleSectionType = (sectionId: string) => {
        const types: ('MCQ' | 'TEXT' | 'SCENARIO')[] = ['MCQ', 'SCENARIO', 'TEXT'];
        setBlueprint(prev => ({
            ...prev,
            sections: prev.sections.map(s => {
                if (s.id === sectionId) {
                    const currentIdx = types.indexOf(s.atomProfile.type as any); // cast for safety if type mismatch
                    const nextType = types[(currentIdx + 1) % types.length];
                    return { ...s, atomProfile: { ...s.atomProfile, type: nextType } };
                }
                return s;
            })
        }));
    };

    const isValid = blueprint.totalQuestions > 0;

    return (
        <div className="max-w-5xl mx-auto p-4 pb-48 animate-fade-in bg-slate-50/50 min-h-screen relative">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button variant="outline" className="border-none text-slate-500 hover:text-indigo-600" onClick={onBack}>← Back</Button>
                <div className="flex-grow">
                    <h1 className="text-2xl font-black font-serif text-slate-900">Exam Blueprint Preview</h1>
                    <p className="text-xs font-bold uppercase text-slate-400">{blueprint.title} • {blueprint.config.durationMinutes} mins</p>
                </div>
            </div>

            {/* Main Stats Card */}
            <Card className="mb-8 p-4 md:p-8 border-l-8 border-indigo-600 shadow-xl bg-white grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 items-center">
                <div className="text-center">
                    <span className="block text-4xl font-black text-slate-900">{blueprint.totalQuestions}</span>
                    <span className="text-xs font-bold uppercase text-slate-400">Total Questions</span>
                </div>
                <div className="text-center">
                    <span className="block text-4xl font-black text-slate-900">{blueprint.totalMarks}</span>
                    <span className="text-xs font-bold uppercase text-slate-400">Total Marks</span>
                </div>
                <div className="col-span-2 lg:col-span-2">
                    <div className="flex justify-between text-xs font-bold uppercase mb-2">
                        <span>Difficulty Estimate</span>
                        <span className="text-indigo-600">Medium → Hard</span>
                    </div>
                    <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                        <div className="w-1/3 bg-emerald-400"></div>
                        <div className="w-1/3 bg-indigo-500"></div>
                        <div className="w-1/6 bg-rose-500 opacity-50"></div>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 font-bold text-right flex items-center justify-end gap-1">
                        Verified Aligned to Curriculum <span className="text-green-500 text-lg">✓</span>
                    </div>
                </div>
            </Card>

            {/* Sections List */}
            <div className="space-y-6 mb-20">
                {blueprint.sections.map((section, idx) => {
                    const isDisabled = disabledSections[section.id];
                    return (
                        <div key={section.id} className={`transition-all duration-300 ${isDisabled ? 'opacity-50 grayscale' : 'opacity-100'}`}>
                            <Card className="p-4 md:p-6 relative overflow-visible group hover:shadow-lg transition-shadow border-slate-200">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">
                                            Section {String.fromCharCode(65 + idx)} • {section.atomProfile.type.replace('_', ' ')}
                                        </h3>
                                        <p className="text-sm text-indigo-600 font-bold uppercase tracking-wide">{section.atomProfile.bloomLevel}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                                        <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => cycleSectionType(section.id)} disabled={isDisabled}>
                                            Change Type ↻
                                        </Button>
                                        <Button
                                            size="sm"
                                            className={`flex-1 sm:flex-none ${isDisabled ? 'bg-slate-800 text-white border-none' : 'text-red-500 border-red-100 hover:bg-red-50'}`}
                                            onClick={() => toggleSection(section.id)}
                                        >
                                            {isDisabled ? 'Enable' : 'Disable'} ⏻
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between bg-slate-50 p-3 md:p-4 rounded-xl border border-slate-100 gap-4">
                                    <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-slate-600 font-medium overflow-hidden">
                                        <span className="bg-white px-2 py-1 rounded border shadow-sm">ℹ</span>
                                        <span className="whitespace-nowrap">{section.count} questions</span>
                                        <span className="text-slate-300">•</span>
                                        <span className="whitespace-nowrap">{section.marksPerQuestion} marks each</span>
                                        <span className="hidden md:inline mx-2 text-slate-300">|</span>
                                        <div className="flex items-center gap-1 min-w-0">
                                            Difficulty: <span className="flex gap-0.5">{Array(5).fill(0).map((_, i) => <div key={i} className={`w-2 h-2 rounded-full ${i < 3 ? 'bg-indigo-400' : 'bg-slate-200'}`} />)}</span>
                                        </div>
                                    </div>

                                    {!isDisabled && (
                                        <div className="flex items-center gap-3 bg-white px-2 py-1 rounded-lg border shadow-sm">
                                            <button
                                                onClick={() => updateSectionCount(section.id, -1)}
                                                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 font-bold text-xl"
                                            >
                                                −
                                            </button>
                                            <span className="font-black w-8 text-center text-lg">{section.count}</span>
                                            <button
                                                onClick={() => updateSectionCount(section.id, 1)}
                                                className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-indigo-600 font-bold text-xl"
                                            >
                                                +
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    );
                })}
            </div>

            {/* Footer / CTA - Lifted for Mobile Nav Clarity */}
            <div className="fixed bottom-16 md:bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-4 z-[100] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-[10px] md:text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 text-center md:text-left">
                        ⚠ Some questions may be practice-only due to source content quality.
                    </div>
                    <QuotaGuard capability="exams" disabled={!isValid || isInitializing} fresh={true}>
                        <Button
                            className="w-full md:w-auto bg-indigo-600 text-white px-8 md:px-12 py-3 shadow-xl shadow-indigo-200 hover:scale-105 active:scale-95 transition-all text-base md:text-lg font-black"
                            onClick={() => onConfirm(blueprint)}
                            disabled={!isValid || isInitializing}
                        >
                            {isInitializing ? 'Generating...' : (isValid ? 'Generate Exam' : 'Exam Empty')}
                        </Button>
                    </QuotaGuard>
                </div>
            </div>
        </div>
    );
};

export default ExamBlueprintPreview;
