
import React, { useEffect, useState, useRef } from 'react';
import { JourneySDK } from '../../services/journey/journeySdk';
import { JourneyEvent } from '../../types/journey';
import { TimelineEventCard } from './TimelineEventCard';
import { ChevronLeft, ChevronRight, Calendar, Filter, BookOpen, GraduationCap, ClipboardList, MonitorPlay, FileText } from 'lucide-react';

interface JourneyTimelineProps {
    studentId: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({ studentId }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [centerDate, setCenterDate] = useState(new Date());
    const [dates, setDates] = useState<Date[]>([]);

    const [events, setEvents] = useState<JourneyEvent[]>([]);
    const [activeDays, setActiveDays] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | 'quiz' | 'exam' | 'study' | 'notes' | 'class'>('all');
    const [loading, setLoading] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Filter Configs
    const FILTERS = [
        { id: 'all', label: 'All', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300', active: 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' },
        { id: 'quiz', label: 'Quizzes', icon: ClipboardList, color: 'hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400', active: 'bg-purple-100 dark:bg-purple-900/50 ring-1 ring-purple-300 dark:ring-purple-700 text-purple-700 dark:text-purple-300 shadow-sm' },
        { id: 'exam', label: 'Exams', icon: GraduationCap, color: 'hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400', active: 'bg-orange-100 dark:bg-orange-900/50 ring-1 ring-orange-300 dark:ring-orange-700 text-orange-700 dark:text-orange-300 shadow-sm' },
        { id: 'notes', label: 'Notes', icon: FileText, color: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', active: 'bg-emerald-100 dark:bg-emerald-900/50 ring-1 ring-emerald-300 dark:ring-emerald-700 text-emerald-700 dark:text-emerald-300 shadow-sm' },
        { id: 'study', label: 'Study', icon: BookOpen, color: 'hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400', active: 'bg-green-100 dark:bg-green-900/50 ring-1 ring-green-300 dark:ring-green-700 text-green-700 dark:text-green-300 shadow-sm' },
        { id: 'class', label: 'Classes', icon: MonitorPlay, color: 'hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400', active: 'bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-300 dark:ring-blue-700 text-blue-700 dark:text-blue-300 shadow-sm' },
    ];

    // Initialize Dates (Current Month +/-)
    useEffect(() => {
        const tempDates = [];
        const start = new Date(centerDate);
        start.setDate(start.getDate() - 15); // Start 15 days back

        for (let i = 0; i < 31; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            tempDates.push(d);
        }
        setDates(tempDates);

        if (tempDates.length > 0) {
            loadActiveDays(tempDates[0], tempDates[tempDates.length - 1]);
        }
    }, [centerDate, studentId]);

    // Auto-scroll to center on load
    useEffect(() => {
        if (scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const centerOffset = (container.scrollWidth - container.clientWidth) / 2;
            container.scrollLeft = centerOffset;
        }
    }, [dates]);

    // Event Load: When date changes
    useEffect(() => {
        loadEvents();
    }, [studentId, selectedDate]);

    const loadActiveDays = async (from: Date, to: Date) => {
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
            console.log('[TIMELINE_DEBUG] Loading events for:', dateStr);
            const result = await JourneySDK.getEventsByDate(studentId, dateStr);
            console.log('[TIMELINE_DEBUG] Loaded events:', result);
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

    // Draggable Logic
    const onMouseDown = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
    };

    const onMouseLeave = () => {
        setIsDragging(false);
    };

    const onMouseUp = () => {
        setIsDragging(false);
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !scrollContainerRef.current) return;
        e.preventDefault();
        const x = e.pageX - scrollContainerRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Speed multiplier
        scrollContainerRef.current.scrollLeft = scrollLeft - walk;
    };

    const selectDate = (date: Date) => {
        setSelectedDate(date);
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-0.5 animate-in fade-in duration-500">

            {/* 1. Fancy Colored Filters (Centered) */}
            <div className="flex justify-center mb-0">
                <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar max-w-full p-1">
                    {FILTERS.map((f) => {
                        const isActive = filter === f.id;
                        const Icon = f.icon;
                        return (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id as any)}
                                className={`
                                    flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold transition-all duration-200 whitespace-nowrap border border-transparent
                                    ${isActive ? f.active : `bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 ${f.color} hover:shadow-sm`}
                                `}
                            >
                                {Icon && <Icon size={10} className={isActive ? 'opacity-100' : 'opacity-70'} />}
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 2. World-Class Date Selector (Thinner, Glassmorphism, Floating) */}
            <div className="relative group mx-2 md:mx-0">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50/50 to-white/50 dark:from-slate-900/50 dark:to-slate-900/50 rounded-2xl -z-10" />

                {/* Scroll Container */}
                <div
                    ref={scrollContainerRef}
                    className="flex gap-2 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing py-3 px-4 scroll-smooth items-center rounded-2xl border border-slate-100/60 dark:border-slate-700/60 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm"
                    onMouseDown={onMouseDown}
                    onMouseLeave={onMouseLeave}
                    onMouseUp={onMouseUp}
                    onMouseMove={onMouseMove}
                    style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
                >
                    {dates.map((date, i) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const isToday = date.toDateString() === new Date().toDateString();
                        const hasActivity = activeDays.has(dateStr);

                        return (
                            <button
                                key={i}
                                onClick={() => !isDragging && selectDate(date)}
                                className={`
                                    group/date flex-shrink-0 flex flex-col items-center justify-center 
                                    w-11 h-14 rounded-xl transition-all duration-300 select-none relative overflow-hidden
                                    ${isSelected
                                        ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110 z-10 ring-2 ring-blue-100 dark:ring-blue-900 ring-offset-2 dark:ring-offset-slate-900'
                                        : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 hover:border-blue-100 dark:hover:border-blue-800'}
                                    ${isToday && !isSelected ? 'ring-1 ring-blue-400/50' : ''}
                                `}
                            >
                                {/* Glass Shine Effect on Active */}
                                {isSelected && <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/10 rounded-t-xl pointer-events-none" />}

                                <span className={`text-[9px] uppercase font-bold leading-none mb-0.5 tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500 group-hover/date:text-slate-600 dark:group-hover/date:text-slate-300'}`}>
                                    {DAYS_OF_WEEK[date.getDay()]}
                                </span>
                                <span className={`text-lg font-black leading-none ${isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300 group-hover/date:text-slate-800 dark:group-hover/date:text-slate-200'}`}>
                                    {date.getDate()}
                                </span>

                                {hasActivity && (
                                    <div className={`
                                        mt-1 w-1 h-1 rounded-full transition-all
                                        ${isSelected ? 'bg-white shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'bg-blue-400'}
                                    `} />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Fade indicators */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 pointer-events-none rounded-l-2xl z-20" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent dark:from-slate-900 dark:via-slate-900/80 pointer-events-none rounded-r-2xl z-20" />

                {/* Navigation Arrows (Optional, absolute positioned) */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-md text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-110 transition-all cursor-pointer z-30"
                    onClick={() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft -= 200; }}
                >
                    <ChevronLeft size={16} />
                </div>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 hidden md:flex items-center justify-center w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-md text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:scale-110 transition-all cursor-pointer z-30"
                    onClick={() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollLeft += 200; }}
                >
                    <ChevronRight size={16} />
                </div>
            </div>

            {/* 3. Timeline Events */}
            <div className="relative min-h-[400px] mt-2">
                {/* Vertical Guide Line */}
                <div className="absolute left-4 md:left-[7.5rem] top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-800 block transition-all duration-300" />
                <div className="absolute left-4 md:left-[7.5rem] top-0 w-2 h-2 -ml-[3px] rounded-full bg-slate-200 dark:bg-slate-700 block transition-all duration-300" />

                <div className="space-y-4 pt-4">
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
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
                            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                                <Calendar size={24} className="text-slate-300 dark:text-slate-600" />
                            </div>
                            <p className="font-medium text-slate-500">No activity recorded</p>
                            <p className="text-xs opacity-60">
                                {selectedDate.toDateString() === new Date().toDateString()
                                    ? "Your journey for today starts now!"
                                    : "No events on this day."}
                            </p>
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
