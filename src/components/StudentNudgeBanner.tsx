import React, { useState, useMemo } from 'react';
import { ParentNudge, ParentFeedEvent, Language, InteractionState } from '../types';

interface StudentNudgeBannerProps {
    nudges: ParentNudge[];
    feed?: ParentFeedEvent[];
    onAction: (nudge: ParentNudge) => void;
    onIgnoreFeed?: (id: string) => void;
    onIgnoreNudge?: (id: string) => void;
    onOpenChat?: (event: ParentFeedEvent) => void;
    appLanguage: Language;
}

const StudentNudgeBanner: React.FC<StudentNudgeBannerProps> = ({ 
    nudges, 
    feed = [], 
    onAction, 
    onIgnoreFeed,
    onIgnoreNudge,
    onOpenChat, 
    appLanguage 
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const isArabic = appLanguage === Language.ARABIC;

    // --- COLOR CODING ENGINE ---
    const getFeedTheme = (event: ParentFeedEvent) => {
        if (event.severity === 'SUCCESS') return {
            gradient: 'from-emerald-600 to-teal-700',
            shadow: 'shadow-emerald-500/20',
            icon: '🏆',
            label: isArabic ? 'إنجاز محقق' : 'ACHIEVEMENT'
        };
        if (event.severity === 'ATTENTION') return {
            gradient: 'from-amber-500 to-orange-600',
            shadow: 'shadow-amber-500/20',
            icon: '⚠️',
            label: isArabic ? 'تنبيه هام' : 'ATTENTION REQ'
        };
        if (event.title.includes('Checked') || event.title.includes('Progress')) return {
            gradient: 'from-slate-600 to-slate-800',
            shadow: 'shadow-slate-500/20',
            icon: '🔭',
            label: isArabic ? 'تحديث الحالة' : 'SYSTEM UPDATE'
        };
        return {
            gradient: 'from-blue-600 to-indigo-700',
            shadow: 'shadow-indigo-500/20',
            icon: '💬',
            label: isArabic ? 'رسالة واردة' : 'NEW MESSAGE'
        };
    };

    const getNudgeTheme = (nudge: ParentNudge) => {
        const isStrategic = !!nudge.metadata?.isStrategic;

        if (nudge.intent === 'CHALLENGE') return {
            gradient: 'from-rose-600 to-red-700',
            shadow: 'shadow-rose-500/20',
            icon: '⚔️',
            label: isArabic ? 'تحدي قتالي' : 'PRIORITY COMBAT'
        };
        if (nudge.intent === 'FIX') {
            if (isStrategic) return {
                gradient: 'from-indigo-600 to-violet-800',
                shadow: 'shadow-indigo-500/20',
                icon: '🧬',
                label: isArabic ? 'فرقة عمل للإصلاح' : 'TASK FORCE REPAIR'
            };
            return {
                gradient: 'from-orange-600 to-red-600',
                shadow: 'shadow-orange-500/20',
                icon: '🔧',
                label: isArabic ? 'إصلاح عاجل' : 'URGENT REPAIR'
            };
        }
        return {
            gradient: 'from-indigo-600 to-blue-700',
            shadow: 'shadow-indigo-500/20',
            icon: '🧬',
            label: isArabic ? 'إصلاح أساسات' : 'STANDARD REPAIR'
        };
    };

    /**
     * MISSION VISIBILITY ENGINE
     * Items are hidden if:
     * 1. They are older than 72 hours (TTL Expiry).
     * 2. Their interaction state is RESOLVED (Completed, Ignored/Later, or Skipped).
     * 3. They are scheduled for the future (System Snooze).
     */
    const activeInteractions = useMemo(() => {
        const now = Date.now();
        const ttlWindow = now - (72 * 60 * 60 * 1000); // 3 Day Persistence
        
        const activeFeed = feed.filter(f => {
            const isFresh = f.createdAt > ttlWindow;
            const isUnresolved = 
              f.interactionState !== InteractionState.COMPLETED && 
              f.interactionState !== InteractionState.IGNORED && 
              f.interactionState !== InteractionState.ACTION_SKIPPED;
            
            // Check if system has snoozed this via nextScheduledAt (Parent Rescheduling)
            const isReadyNow = !f.nextScheduledAt || now >= f.nextScheduledAt;
            
            return isFresh && isUnresolved && isReadyNow;
        });

        const activeNudges = nudges.filter(n => 
            n.status === 'PENDING' && 
            n.interactionState !== InteractionState.IGNORED
        );

        return { feed: activeFeed, nudges: activeNudges };
    }, [feed, nudges]);

    const totalCount = activeInteractions.feed.length + activeInteractions.nudges.length;

    if (totalCount === 0) return null;

    return (
        <div className="space-y-4 mb-10 animate-slide-up">
            <div className="flex justify-between items-center px-4">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
                    <h3 className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.3em]">
                        {isArabic ? 'مركز العمليات: المهام النشطة' : 'MISSION CONTROL: ACTIVE TASKS'}
                    </h3>
                    <div className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        {totalCount}
                    </div>
                </div>
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="text-[10px] font-black uppercase text-indigo-500 hover:text-indigo-700 transition-colors flex items-center gap-2 group"
                >
                    {isCollapsed ? (isArabic ? 'فتح المركز' : 'EXPAND') : (isArabic ? 'طي القائمة' : 'COLLAPSE')}
                    <span className={`text-[8px] transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}>▲</span>
                </button>
            </div>

            {!isCollapsed && (
                <div className="space-y-3 animate-fade-in">
                    {activeInteractions.feed.map((event) => {
                        const theme = getFeedTheme(event);
                        return (
                            <div key={event.id} className={`relative overflow-hidden bg-gradient-to-r ${theme.gradient} text-white rounded-[2.5rem] p-6 md:p-8 shadow-2xl ${theme.shadow} border border-white/10 group transition-all duration-500 hover:scale-[1.01]`}>
                                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:32px_32px]"></div>
                                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex items-center gap-6 w-full md:w-auto">
                                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center text-4xl shadow-inner border border-white/20 group-hover:bg-white/20 transition-all duration-500 transform group-hover:scale-105">
                                            {theme.icon}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10">
                                                    {theme.label}
                                                </div>
                                                <span className="text-[10px] font-bold text-white/60 tracking-tighter">
                                                    {new Date(event.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-none">
                                                {event.title}
                                            </h3>
                                            <p className="text-sm font-medium text-white/70 max-w-md leading-relaxed italic">
                                                {event.message}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <button 
                                            onClick={() => onIgnoreFeed && onIgnoreFeed(event.id)}
                                            className="flex-1 md:flex-none px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 active:scale-95"
                                        >
                                            {isArabic ? 'لاحقاً' : 'LATER'}
                                        </button>
                                        <button 
                                            onClick={() => onOpenChat && onOpenChat(event)}
                                            className="flex-[1.5] md:flex-none px-10 py-4 bg-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] text-slate-900 shadow-2xl transition-all hover:bg-slate-50 hover:scale-105 active:translate-y-1"
                                        >
                                            {isArabic ? 'فتح المحادثة' : 'OPEN CHAT'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {activeInteractions.nudges.map((nudge) => {
                        const theme = getNudgeTheme(nudge);
                        return (
                            <div key={nudge.id} className={`relative overflow-hidden group bg-gradient-to-r ${theme.gradient} text-white rounded-[2.5rem] p-6 md:p-8 shadow-2xl ${theme.shadow} border border-white/10 transition-all hover:scale-[1.01]`}>
                                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(circle,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[length:32px_32px]"></div>
                                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                                    <div className="flex items-center gap-6 w-full md:w-auto">
                                        <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center text-4xl shadow-inner border border-white/20 group-hover:rotate-6 transition-all duration-500">
                                            {theme.icon}
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10">
                                                    {theme.label}
                                                </div>
                                                <span className="text-[10px] font-bold text-white/60 tracking-tighter">ID: {nudge.id.slice(-4)}</span>
                                            </div>
                                            <h3 className="text-2xl md:text-3xl font-black tracking-tight leading-none">
                                                {nudge.subject}
                                            </h3>
                                            <p className="text-sm font-medium text-white/70 max-w-md leading-relaxed italic">
                                                {nudge.intent === 'FIX' 
                                                    ? (isArabic ? 'تحذير: تم اكتشاف فشل في فهم المادة. اتبع مسار الإصلاح العاجل الآن.' : 'URGENT: Subject failure detected. Execute foundation repair protocol now.')
                                                    : nudge.intent === 'REVISE'
                                                    ? (isArabic ? 'تم اكتشاف ضعف في المفاهيم الأساسية. بادر بالإصلاح الآن لضمان التفوق.' : 'Learning friction detected in core concepts. Act now to restore synergy.')
                                                    : (isArabic ? 'بروتوكول القتال مفعل. مطلوب محاكاة عالية المخاطر للتحقق من المستوى.' : 'Combat protocol active. High-stakes simulation required for level verification.')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3 w-full md:w-auto">
                                        <button 
                                            onClick={() => onIgnoreNudge && onIgnoreNudge(nudge.id)}
                                            className="flex-1 md:flex-none px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[11px] bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 active:scale-95"
                                        >
                                            {isArabic ? 'لاحقاً' : 'LATER'}
                                        </button>
                                        <button 
                                            onClick={() => onAction(nudge)}
                                            className="flex-1 md:flex-none px-12 py-4 bg-white rounded-2xl font-black uppercase tracking-[0.2em] text-[11px] text-slate-900 shadow-2xl transition-all hover:bg-slate-50 hover:scale-105 active:translate-y-1"
                                        >
                                            {isArabic ? 'بدء الإصلاح 🚀' : nudge.intent === 'CHALLENGE' ? 'ENTER COMBAT ⚔️' : 'START REPAIR 🚀'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default StudentNudgeBanner;