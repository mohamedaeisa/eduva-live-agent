
import React, { useState } from 'react';
// import { TimelineTab } from './TimelineTab';
import { JourneyTimeline } from '../journey/JourneyTimelineFinal';
import { PerformanceTab } from './PerformanceTab';
import { Calendar, BarChart2 } from 'lucide-react'; // Using icons for tabs

interface StudentHistoryScreenProps {
    studentId: string;
}

type TabType = 'TIMELINE' | 'PERFORMANCE';

export const StudentHistoryScreen: React.FC<StudentHistoryScreenProps> = ({ studentId }) => {
    const [activeTab, setActiveTab] = useState<TabType>('PERFORMANCE');

    return (
        <div className="student-history-screen w-full max-w-5xl mx-auto pb-24 animate-fade-in px-4 md:px-0">
            {/* Header & Title - Minimal, Centered or Left aligned compact */}
            <div className="mb-6 flex flex-col items-center justify-center pt-6">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-1">
                    <h1 className="text-3xl font-black tracking-tighter">My Journey</h1>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Your Learning Story</p>

                {/* Fancy Floating Tabs - Premium Design */}
                <div className="mt-6 p-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-full border border-slate-200/60 dark:border-slate-700 shadow-lg shadow-slate-200/40 dark:shadow-slate-900/40 inline-flex relative z-10">
                    <button
                        onClick={() => setActiveTab('PERFORMANCE')}
                        className={`
                            relative px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-300
                            ${activeTab === 'PERFORMANCE'
                                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md transform scale-105'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }
                        `}
                    >
                        <BarChart2 size={14} className={activeTab === 'PERFORMANCE' ? 'text-purple-100' : 'text-slate-400'} />
                        Performance
                    </button>
                    <button
                        onClick={() => setActiveTab('TIMELINE')}
                        className={`
                            relative px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-300
                            ${activeTab === 'TIMELINE'
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md transform scale-105'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }
                        `}
                    >
                        <Calendar size={14} className={activeTab === 'TIMELINE' ? 'text-blue-100' : 'text-slate-400'} />
                        Timeline
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="transition-all duration-500 ease-in-out">
                {activeTab === 'TIMELINE' && <JourneyTimeline studentId={studentId} />}
                {activeTab === 'PERFORMANCE' && <PerformanceTab studentId={studentId} />}
            </div>
        </div>
    );
};
