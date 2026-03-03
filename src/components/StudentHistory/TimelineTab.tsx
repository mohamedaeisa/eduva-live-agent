import React, { useEffect, useState, useCallback } from 'react';
import { getTimelineEvents, TimelineEvent, formatRelativeTime } from '../../services/studentHistoryService';
import { TimelineEventCard } from './TimelineEventCard';
import { Loader, Calendar, Award, BookOpen, Brain } from 'lucide-react';

interface TimelineTabProps {
    studentId: string;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({ studentId }) => {
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<number | undefined>();
    const [filter, setFilter] = useState<'ALL' | 'EXAM' | 'NOTE' | 'STUDY'>('ALL');

    // Initial load
    useEffect(() => {
        loadInitialEvents();
    }, [studentId]);

    const loadInitialEvents = async () => {
        setLoading(true);
        try {
            const result = await getTimelineEvents(studentId, 20);
            setEvents(result.events);
            setNextCursor(result.nextCursor);
        } catch (error) {
            console.error('[Timeline] Failed to load events:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMoreEvents = useCallback(async () => {
        if (!nextCursor || loadingMore) return;

        setLoadingMore(true);
        try {
            const result = await getTimelineEvents(studentId, 20, nextCursor);
            setEvents((prev) => [...prev, ...result.events]);
            setNextCursor(result.nextCursor);
        } catch (error) {
            console.error('[Timeline] Failed to load more events:', error);
        } finally {
            setLoadingMore(false);
        }
    }, [studentId, nextCursor, loadingMore]);

    // Filter events
    const filteredEvents = filter === 'ALL'
        ? events
        : events.filter((e) => e.type === filter || (filter === 'EXAM' && e.type === 'QUIZ'));

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader className="animate-spin text-indigo-500 w-10 h-10 mb-4" />
                <p className="text-gray-400 text-sm font-medium">Loading your journey...</p>
            </div>
        );
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-3xl flex items-center justify-center mb-6">
                    <Calendar className="w-12 h-12 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                    Your Journey Starts Here
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
                    Complete quizzes, take notes, and track your progress. Every step you take will appear here.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
                {[
                    { key: 'ALL', label: 'All', icon: Calendar },
                    { key: 'EXAM', label: 'Exams', icon: Award },
                    { key: 'NOTE', label: 'Notes', icon: BookOpen },
                    { key: 'STUDY', label: 'Study', icon: Brain },
                ].map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key as any)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase
                            transition-all duration-200 whitespace-nowrap
                            ${filter === key
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }
                        `}
                    >
                        <Icon className="w-4 h-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Timeline Events */}
            <div className="space-y-4">
                {filteredEvents.map((event, index) => (
                    <div
                        key={event.id}
                        className="animate-fade-in-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                    >
                        <TimelineEventCard event={event} />
                    </div>
                ))}
            </div>

            {/* Load More Button */}
            {nextCursor && (
                <div className="flex justify-center pt-8">
                    <button
                        onClick={loadMoreEvents}
                        disabled={loadingMore}
                        className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white rounded-full font-bold text-sm shadow-md transition-all duration-200 hover:scale-105 disabled:scale-100"
                    >
                        {loadingMore ? (
                            <span className="flex items-center gap-2">
                                <Loader className="animate-spin w-4 h-4" />
                                Loading...
                            </span>
                        ) : (
                            'Load More'
                        )}
                    </button>
                </div>
            )}

            {/* No results after filtering */}
            {filteredEvents.length === 0 && filter !== 'ALL' && (
                <div className="flex flex-col items-center justify-center py-12">
                    <p className="text-gray-400 text-sm">
                        No {filter.toLowerCase()} activities found
                    </p>
                </div>
            )}
        </div>
    );
};
