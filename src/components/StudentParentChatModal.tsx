
import React, { useState, useEffect } from 'react';
import { ParentFeedEvent, UserProfile, GenerationRequest, QuizType, Difficulty, DetailLevel, ParentSignalType, InteractionState } from '../types';
import { replyToParentSignal, markFeedAsRead, updateFeedAction, markFeedActionAsSkipped } from '../services/parentService';
import Button from './ui/Button';
import Card from './ui/Card';

interface StudentParentChatModalProps {
  event: ParentFeedEvent;
  user: UserProfile;
  onClose: () => void;
  onAction: (req: GenerationRequest) => void;
}

type ChatPhase = 'CHAT' | 'ACTION_SUGGESTION';

const StudentParentChatModal: React.FC<StudentParentChatModalProps> = ({ event, user, onClose, onAction }) => {
  const [phase, setPhase] = useState<ChatPhase>('CHAT');
  const [isSending, setIsSending] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<'UNDERSTOOD' | 'PRACTICE' | 'CONFUSED' | null>(null);

  // Detect if this is a "FIX" mission (Foundation Repair)
  const isRepairMission = event.title.toLowerCase().includes('repair') || event.severity === 'ATTENTION';
  const targetTopic = event.masteryMission?.targetGaps?.[0] || event.subject;

  useEffect(() => {
      if (event.id) { markFeedAsRead(event.id); }
  }, [event.id]);

  const handleStatusSelect = async (status: 'UNDERSTOOD' | 'PRACTICE' | 'CONFUSED') => {
    setIsSending(true);
    setSelectedStatus(status);
    let message = status === 'UNDERSTOOD' ? `I'm actually feeling okay about ${event.subject}!` : status === 'PRACTICE' ? `I'll practice ${targetTopic} now.` : `Yeah, ${targetTopic} is still confusing for me.`;
    await replyToParentSignal(event.id, user.name, user.id, message, status);
    setIsSending(false);
    setPhase('ACTION_SUGGESTION');
  };

  const handleExecuteAction = async (actionType: 'REPAIR_NOTES' | 'FOCUSED_QUIZ' | 'SKIP') => {
    if (actionType === 'SKIP') { await markFeedActionAsSkipped(event.id); onClose(); return; }

    setIsDispatching(true);
    
    // Package the Surgical Request
    const masteryReq: GenerationRequest = {
        mode: actionType === 'FOCUSED_QUIZ' ? 'quiz' : 'notes',
        topic: actionType === 'REPAIR_NOTES' ? `Simplify: ${targetTopic}` : `Practice: ${targetTopic}`, 
        subject: event.subject,
        year: user.preferences.defaultYear,
        curriculum: user.preferences.defaultCurriculum,
        language: user.preferences.defaultLanguage,
        difficulty: actionType === 'REPAIR_NOTES' ? Difficulty.EASY : Difficulty.MEDIUM, 
        quizType: QuizType.MIX,
        questionCount: actionType === 'REPAIR_NOTES' ? 5 : 8,
        detailLevel: DetailLevel.DETAILED,
        sourceMissionId: event.id, 
        struggleAtoms: [targetTopic], // Surgical target
        fileName: event.fileName || 'Linked Material',
        contentId: event.contentId || undefined,
        studyMaterialUrl: event.contentId || undefined,
        strictFormat: true,
        metadata: {
            masteryLevel: 1
        }
    };

    const actionLabel = actionType === 'REPAIR_NOTES' 
        ? `Starting Step-by-Step Study: ${targetTopic}`
        : `Starting Focused Practice: ${targetTopic}`;

    await updateFeedAction(event.id, actionLabel);
    
    onAction(masteryReq);
    setTimeout(() => {
        onClose();
        setIsDispatching(false);
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-fade-in">
      <Card className="w-full max-w-md bg-white dark:bg-slate-900 border-0 shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
        
        {/* Intervention Header */}
        <div className={`p-6 text-white shrink-0 ${isRepairMission ? 'bg-gradient-to-r from-orange-600 to-amber-600' : 'bg-gradient-to-r from-indigo-600 to-blue-600'}`}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">✕</button>
            <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm">
                    {isRepairMission ? '🛠️' : '💬'}
                </div>
                <div>
                    <h3 className="font-black text-lg leading-tight">{isRepairMission ? 'Foundation Repair' : event.title}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">Mission Protocol v6.5</p>
                </div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-sm font-medium leading-relaxed border border-white/10 backdrop-blur-sm mt-2 italic">
                "{event.message}"
            </div>
        </div>

        <div className="p-6 overflow-y-auto flex-grow bg-slate-50 dark:bg-slate-950">
            {phase === 'CHAT' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="text-center">
                        <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">Status Check: {targetTopic}</p>
                        <div className="grid grid-cols-1 gap-3">
                            <button onClick={() => handleStatusSelect('CONFUSED')} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-100 hover:border-orange-400 transition-all group shadow-sm">
                                <div className="flex items-center gap-4"><span className="text-2xl group-hover:rotate-12 transition-transform">🧠</span><span className="font-bold text-slate-700 dark:text-slate-200">I'm still stuck on this</span></div>
                                <span className="text-slate-300">→</span>
                            </button>
                            <button onClick={() => handleStatusSelect('PRACTICE')} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-100 hover:border-blue-400 transition-all group shadow-sm">
                                <div className="flex items-center gap-4"><span className="text-2xl group-hover:rotate-12 transition-transform">💪</span><span className="font-bold text-slate-700 dark:text-slate-200">I just need to practice</span></div>
                                <span className="text-slate-300">→</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {phase === 'ACTION_SUGGESTION' && (
                <div className="text-center py-4 space-y-6 animate-slide-up">
                    <div className="p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-left relative">
                        <p className="text-[9px] font-black uppercase text-indigo-500 mb-2 tracking-widest">Mastery Engine Path</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 leading-relaxed italic">
                            {selectedStatus === 'CONFUSED' 
                                ? `"No problem. I've broken down '${targetTopic}' into small, simple steps. Let's rebuild your understanding from the ground up."`
                                : `"Got it. I've prepared a specialized practice set for '${targetTopic}' with new examples to lock in your mastery."`
                            }
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Button 
                            onClick={() => handleExecuteAction(selectedStatus === 'CONFUSED' ? 'REPAIR_NOTES' : 'FOCUSED_QUIZ')} 
                            isLoading={isDispatching}
                            className={`w-full py-5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl border-none transition-all hover:scale-[1.01] active:scale-95 ${selectedStatus === 'CONFUSED' ? 'bg-orange-600' : 'bg-indigo-600'}`}
                        >
                            {selectedStatus === 'CONFUSED' ? '🚀 Step 1: Simplify Topic' : '🚀 Start Focused Practice'}
                        </Button>
                        
                        {selectedStatus === 'CONFUSED' && (
                            <button 
                                onClick={() => handleExecuteAction('FOCUSED_QUIZ')}
                                className="w-full py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                            >
                                Skip Study & Practice Now
                            </button>
                        )}
                        
                        <button onClick={() => handleExecuteAction('SKIP')} className="text-slate-400 font-bold text-[9px] uppercase tracking-widest hover:text-red-500 mt-4 transition-colors">Dismiss mission for now</button>
                    </div>
                </div>
            )}
        </div>
        
        <div className="p-3 bg-slate-100 dark:bg-slate-900 text-center shrink-0">
             <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]">CLIP Protocol v6.5 • High-Integrity Intervention</p>
        </div>
      </Card>
    </div>
  );
};

export default StudentParentChatModal;
