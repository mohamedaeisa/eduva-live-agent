
import React, { useEffect, useState, useRef } from 'react';
import { JourneySDK } from '../../services/journey/journeySdk';
import { JourneyEvent } from '../../types/journey';
import { TimelineEventCard } from './TimelineEventCard';
import { ChevronLeft, ChevronRight, Calendar, Filter } from 'lucide-react';

interface JourneyTimelineProps {
    studentId: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({ studentId }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [weekStart, setWeekStart] = useState(getStartOfWeek(new Date()));
    const [events, setEvents] = useState<JourneyEvent[]>([]);
    const [activeDays, setActiveDays] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'quiz' | 'exam' | 'study' | 'notes' | 'class'>('all');
    const [loading, setLoading] = useState(false);

    // Initial Load: Active Days for the month
    useEffect(() => {
        loadActiveDays();
    }, [studentId, weekStart]);

    // Event Load: When date changes
    useEffect(() => {
        loadEvents();
    }, [studentId, selectedDate]);

    const loadActiveDays = async () => {
        const from = new Date(weekStart);
        from.setDate(from.getDate() - 14);
        const to = new Date(weekStart);
        to.setDate(to.getDate() + 14);

        try {
            const days = await JourneySDK.getDays(studentId, from, to);
            setActiveDays(new Set(days));
        } catch (e) {
            console.error('Failed to load active days', e);
        }
    };

    const loadEvents = async () => {
        setLoading(true);
        try {
            const dateStr = selectedDate.toISOString().split('T')[0];
            const result = await JourneySDK.getEventsByDate(studentId, dateStr);
            setEvents(result);
        } catch (e) {
            console.error('Failed to load events', e);
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredEvents = filter === 'all'
        ? events
        : events.filter(e => e.type === filter);

    // Week Navigation
    const nextWeek = () => {
        const next = new Date(weekStart);
        next.setDate(next.getDate() + 7);
        setWeekStart(next);
    };

    const prevWeek = () => {
        const prev = new Date(weekStart);
        prev.setDate(prev.getDate() - 7);
        setWeekStart(prev);
    };

    // Date Selection
    const selectDate = (date: Date) => {
        setSelectedDate(date);
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-4 space-y-8 animate-in fade-in duration-500">

            {/* 1. Header & Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'quiz', label: 'Quizzes' },
                        { id: 'exam', label: 'Exams' },
                        { id: 'notes', label: 'Notes' },
                        { id: 'study', label: 'Study' },
                        { id: 'class', label: 'Classes' },
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id as any)}
                            className={`
                                px-4 py-1.5 rounded-full text-sm font-medium transition-all
                                ${filter === f.id
                                    ? 'bg-blue-500 text-white shadow-md shadow-blue-200'
                                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}
                            `}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* 2. Date Selector (Week View) */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative">
                <div className="flex items-center justify-between mb-2">
                    <button onClick={prevWeek} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="font-semibold text-slate-700">
                        {weekStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button onClick={nextWeek} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <ChevronRight size={20} />
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 7 }).map((_, i) => {
                        const date = new Date(weekStart);
                        date.setDate(date.getDate() + i);
                        const dateStr = date.toISOString().split('T')[0];
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const isToday = date.toDateString() === new Date().toDateString();
                        const hasActivity = activeDays.has(dateStr);

                        return (
                            <button
                                key={i}
                                onClick={() => selectDate(date)}
                                className={`
                                    flex flex-col items-center justify-center p-3 rounded-xl transition-all relative
                                    ${isSelected
                                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-200 scale-105 z-10'
                                        : 'hover:bg-slate-50 text-slate-500'}
                                    ${isToday && !isSelected ? 'bg-blue-50 text-blue-600 border border-blue-100' : ''}
                                `}
                            >
                                <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                    {DAYS_OF_WEEK[date.getDay()]}
                                </span>
                                <span className={`text-xl font-bold ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                                    {date.getDate()}
                                </span>

                                {/* Activity Dot */}
                                {hasActivity && (
                                    <div className={`
                                        absolute bottom-2 w-1.5 h-1.5 rounded-full 
                                        ${isSelected ? 'bg-white' : 'bg-blue-400'}
                                    `} />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 3. Timeline Events */}
            <div className="relative min-h-[400px]">
                {/* Vertical Guide Line */}
                <div className="absolute left-[7.5rem] top-0 bottom-0 w-px bg-slate-100 hidden md:block" />

                <div className="space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 animate-pulse">
                            <Calendar size={48} className="mb-4 opacity-20" />
                            <p>Loading timeline...</p>
                        </div>
                    ) : filteredEvents.length > 0 ? (
                        filteredEvents.map(event => (
                            <TimelineEventCard key={event.id} event={event} />
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <Calendar size={24} className="text-slate-300" />
                            </div>
                            <p className="font-medium">No activity recorded</p>
                            <p className="text-sm opacity-60">Try selecting a different date</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Helper: Get start of week (Sunday)
function getStartOfWeek(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // adjust when day is sunday
    return new Date(d.setDate(diff));
}
