import React, { useMemo } from 'react';
import { ExamSession, ExamItem } from '../../types';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface ExamPreparationViewProps {
    session: ExamSession;
    bunkerState: any; // Using explicit type from useExamBunker would be better but 'any' avoids circular dependency issues for now if types aren't exported
    onStart: () => void;
    onCancel: () => void;
}

const ExamPreparationView: React.FC<ExamPreparationViewProps> = ({ session, bunkerState, onStart, onCancel }) => {

    // Compute Statistics
    const stats = useMemo(() => {
        const sections: Record<string, { total: number; ready: number; failed: number; pending: number; title: string }> = {};

        session.blueprint.sections.forEach(s => {
            sections[s.id] = { total: 0, ready: 0, failed: 0, pending: 0, title: s.title };
        });

        session.items.forEach(item => {
            const mat = bunkerState?.materializedQuestions?.[item.atomId];
            const isReady = !!mat && !mat.isFailed; // Assuming FAILED items are stored in materializedQuestions with a flag or we check 'status' if we propagated it
            // Actually, in the streamer update I did: onMaterialize(candidate.atomId, { isFailed: true, failureReason: ... });

            const isFailed = mat?.isFailed === true;
            const isPending = !mat;

            if (sections[item.sectionId]) {
                sections[item.sectionId].total++;
                if (isReady) sections[item.sectionId].ready++;
                else if (isFailed) sections[item.sectionId].failed++;
                else sections[item.sectionId].pending++;
            }
        });

        return Object.values(sections);
    }, [session, bunkerState]);

    const totalReady = stats.reduce((acc, s) => acc + s.ready, 0);
    const totalFailed = stats.reduce((acc, s) => acc + s.failed, 0);
    const totalTotal = stats.reduce((acc, s) => acc + s.total, 0);

    // Terminal State Check
    const isGenerationComplete = bunkerState?.generationComplete === true;
    const isGenerating = !isGenerationComplete && (totalReady + totalFailed < totalTotal);
    const canStart = totalReady > 0 && (isGenerationComplete || totalReady > 0); // Can start if some ready, even if generating
    // STRICTER: The user said "Begin Exam enabled when >= 1 READY".

    const isTotallyFailed = isGenerationComplete && totalReady === 0;

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 animate-fade-in p-4">
            <Card className="w-full max-w-2xl shadow-xl border-t-8 border-indigo-600 p-8">
                <div className="text-center mb-8">
                    <div className="text-4xl mb-4 animate-bounce-subtle">
                        {isTotallyFailed ? '🛑' : (isGenerating ? '⏳' : '✅')}
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 mb-2">
                        {isTotallyFailed ? 'Content Unavailable' : (isGenerating ? 'Preparing Exam...' : 'Exam Ready')}
                    </h2>
                    <p className="text-slate-500 font-medium">
                        {isTotallyFailed
                            ? "We could not generate any valid questions for this exam."
                            : (isGenerating
                                ? "EDUVA is constructing your secure assessment environment."
                                : (
                                    <>
                                        All possible questions have been materialized.
                                        {(totalReady < totalTotal) && (
                                            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2 text-center animate-fade-in">
                                                <p className="text-amber-800 font-bold text-xs">
                                                    ⚠ Additional training required.
                                                </p>
                                                <p className="text-amber-600 text-[10px] leading-tight mt-1">
                                                    Existing materials are insufficient to generate all required question types. Please upload more content to unlock full exam coverage.
                                                </p>
                                            </div>
                                        )}
                                    </>
                                ))}
                    </p>
                </div>

                <div className="space-y-6 mb-10">
                    {stats.map((section, idx) => (
                        <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-slate-700 text-sm">{section.title}</span>
                                <span className="text-xs font-mono bg-white px-2 py-1 rounded border border-slate-200">
                                    {section.ready + section.failed} / {section.total}
                                </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                                <div className="h-full flex">
                                    <div
                                        className="bg-green-500 transition-all duration-500"
                                        style={{ width: `${(section.ready / section.total) * 100}%` }}
                                    />
                                    <div
                                        className="bg-amber-400 striped-bg transition-all duration-500"
                                        style={{ width: `${(section.failed / section.total) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {/* Status Text */}
                            <div className="flex gap-4 text-xs font-bold">
                                {section.ready > 0 && (
                                    <span className="text-green-600">✔ {section.ready} Ready</span>
                                )}
                                {section.failed > 0 && (
                                    <span className="text-amber-600">🚧 {section.failed} Unavailable</span>
                                )}
                                {section.pending > 0 && (
                                    <span className="text-slate-400 animate-pulse">⏳ {section.pending} Generating...</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Action */}
                <div className="flex flex-col gap-3">
                    <Button
                        onClick={onStart}
                        disabled={!canStart}
                        className={`w-full py-4 text-lg font-black shadow-lg transition-all ${canStart
                            ? 'bg-indigo-600 text-white shadow-indigo-200 hover:scale-[1.02] active:scale-[0.98]'
                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                    >
                        {canStart
                            ? (isGenerating ? "Start Available Questions" : "Begin Exam Now")
                            : "Waiting for Content..."}
                    </Button>

                    <button
                        onClick={onCancel}
                        className="text-slate-400 text-xs font-bold uppercase hover:text-red-500 transition-colors py-2"
                    >
                        Cancel Prep
                    </button>

                    {!canStart && isGenerating && (
                        <p className="text-center text-[10px] text-slate-400 mt-2">
                            You can start once at least one question is ready.
                        </p>
                    )}
                </div>
            </Card>

            <style>{`
                .striped-bg {
                    background-image: linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);
                    background-size: 1rem 1rem;
                }
            `}</style>
        </div>
    );
};

export default ExamPreparationView;
