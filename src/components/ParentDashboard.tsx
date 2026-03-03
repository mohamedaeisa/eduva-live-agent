/**
 * PARENT DASHBOARD - Landing Page for Parent Role
 * 
 * Philosophy: Parents are supporters, not evaluators.
 * Shows ONLY the new Parent Compass screens (Screens 1-2-3).
 * NO legacy features, NO comparison, NO real-time computation.
 */

import React, { useState, useEffect } from 'react';
import { UserProfile, ParentProfile, ParentStudentOverview, ParentSubjectOverview, ParentSubjectProgressReport, AppView } from '../types';
import { getParentProfile, getLinkedStudents } from '../services/parentService';
import { getStudentOverview, getSubjectOverviews, getSubjectProgressReport, subscribeToStudentOverview, subscribeToSubjectOverviews } from '../services/parentDataService'; // DEPRECATED: Keep for fallback
import { useParentSignals } from '../hooks/useParentSignals'; // ✅ LIS
import { logger } from '../utils/logger';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';
import ParentCompass from './ParentCompass';
import ParentCompassDetails from './ParentCompassDetails';
import ParentSubjectProgressReportView from './ParentSubjectProgressReportView';
import AdminDashboard from './AdminDashboard';

interface ParentDashboardProps {
  user: UserProfile;
  appLanguage: Language;
  onNavigate: (view: AppView) => void;
}

// 🔄 ADAPTER HELPERS: Map LIS signals to legacy format (pure mapping, NO calculations)
const mapOverallStatus = (label: string): 'Strong' | 'Stable' | 'Needs Support' => {
  const lower = label.toLowerCase();
  if (lower.includes('track') || lower.includes('excellent') || lower.includes('strong')) return 'Strong';
  if (lower.includes('support') || lower.includes('attention') || lower.includes('risk')) return 'Needs Support';
  return 'Stable';
};

const mapStatusToLearningState = (
  status: 'GREEN' | 'YELLOW' | 'RED'
): 'Stable & Progressing' | 'Effortful but Steady' | 'Temporarily Challenging' | 'Light Engagement' => {
  switch (status) {
    case 'GREEN': return 'Stable & Progressing';
    case 'YELLOW': return 'Effortful but Steady';
    case 'RED': return 'Temporarily Challenging';
    default: return 'Light Engagement';
  }
};

const ParentDashboard: React.FC<ParentDashboardProps> = ({ user, appLanguage, onNavigate }) => {
  // 🚩 FEATURE FLAG: Toggle LIS parent signals vs old parentDataService
  const USE_LIS_PARENT_SIGNALS = true; // Set to false to rollback

  // Core State
  const [parentProfile, setParentProfile] = useState<ParentProfile | null>(null);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  // New Parent Module State
  const [studentOverview, setStudentOverview] = useState<ParentStudentOverview | null>(null);
  const [subjectOverviews, setSubjectOverviews] = useState<ParentSubjectOverview[]>([]);
  const [selectedSubjectForReport, setSelectedSubjectForReport] = useState<ParentSubjectOverview | null>(null);
  const [subjectProgressReport, setSubjectProgressReport] = useState<ParentSubjectProgressReport | null>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<'compass' | 'admin'>('compass');
  const [compassView, setCompassView] = useState<'overview' | 'details' | 'report'>('overview');
  const [isLoading, setIsLoading] = useState(true);

  // ✅ LIS: Fetch parent signals (when enabled)
  const {
    data: parentSignals,
    loading: lisLoading,
    error: lisError
  } = useParentSignals(user.id);

  // 🔄 ADAPTER: Convert LIS signals to legacy format (mapping only, NO calculations)
  const adaptedOverview: ParentStudentOverview | null = USE_LIS_PARENT_SIGNALS && parentSignals
    ? {
      parentId: user.id,
      studentId: activeStudentId || '',
      lastUpdated: parentSignals.generatedAt,

      // Overall health (map LIS label to legacy format)
      overallHealth: mapOverallStatus(parentSignals.overallStatus.label),
      healthReason: parentSignals.overallStatus.label + ' - ' + parentSignals.overallStatus.trendLabel,

      // Core signals (map from LIS format)
      effort: 'Steady',  // TODO: Extract from engagement or subjects
      understanding: 'Steady',
      focus: 'Stable',
      recovery: 'Steady',

      // Stability trend (empty for now, can be populated from timeline)
      stabilityTrend: [],

      // Support stance
      supportStance: parentSignals.subjects[0]?.recommendation || 'Continue supporting their learning journey'
    }
    : null;

  const adaptedSubjects: ParentSubjectOverview[] = USE_LIS_PARENT_SIGNALS && parentSignals
    ? parentSignals.subjects.map(s => ({
      parentId: user.id,
      studentId: activeStudentId || '',
      subject: s.name,
      lastUpdated: parentSignals.generatedAt,

      // Map status to learning state
      learningState: mapStatusToLearningState(s.status),

      // Signals (simplified mapping)
      signals: {
        effort: 'Medium',
        understanding: 'Settling',
        focus: 'Stable'
      },

      // Parent support stance
      parentSupportStance: s.recommendation
    }))
    : [];

  // Admin Detection
  const isAdmin = user.email === 'nour@nour.nour';

  // Initialize: Load parent profile and students
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const profile = await getParentProfile(user.id);
        if (profile) {
          setParentProfile(profile);
          const linked = await getLinkedStudents(profile.linkedStudents);
          setStudents(linked);
          if (linked.length > 0 && !activeStudentId) {
            setActiveStudentId(linked[0].id);
          }
        }
      } catch (e) {
        logger.error('STATE', '[PARENT_DASHBOARD] Initialization failed', e);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [user.id]);

  // Load parent data when student changes
  useEffect(() => {
    if (!activeStudentId || !user.id) return;

    setIsLoading(true);

    // Subscribe to real-time updates
    const unsubOverview = subscribeToStudentOverview(user.id, activeStudentId, (overview) => {
      setStudentOverview(overview);
      setIsLoading(false);
    });

    const unsubSubjects = subscribeToSubjectOverviews(user.id, activeStudentId, (subjects) => {
      setSubjectOverviews(subjects);
    });

    return () => {
      unsubOverview();
      unsubSubjects();
    };
  }, [user.id, activeStudentId]);

  // Load subject progress report when subject is selected
  useEffect(() => {
    if (!selectedSubjectForReport || !user.id || !activeStudentId) return;

    const loadReport = async () => {
      const report = await getSubjectProgressReport(user.id, activeStudentId, selectedSubjectForReport.subject);
      setSubjectProgressReport(report);
    };

    loadReport();
  }, [selectedSubjectForReport, user.id, activeStudentId]);

  // Get active student name
  const activeStudent = students.find(s => s.id === activeStudentId);
  const studentName = (activeStudent as any)?.displayName || activeStudent?.email.split('@')[0] || 'Student';

  // Handlers
  const handleViewDetails = () => {
    setCompassView('details');
  };

  const handleSelectSubject = (subject: ParentSubjectOverview) => {
    setSelectedSubjectForReport(subject);
    setCompassView('report');
  };

  const handleBackToOverview = () => {
    setCompassView('overview');
    setSelectedSubjectForReport(null);
    setSubjectProgressReport(null);
  };

  const handleBackToDetails = () => {
    setCompassView('details');
    setSelectedSubjectForReport(null);
    setSubjectProgressReport(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Loading Parent Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900/20">
      {/* Header - COMPACT & PREMIUM */}
      <div className="bg-white dark:bg-slate-800 border-b-2 border-indigo-200 dark:border-indigo-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-200">
                {isAdmin && activeTab === 'admin' ? 'Admin Dashboard' : 'EDUVA Parent Compass'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin && activeTab === 'admin'
                  ? 'System Administration & Management'
                  : 'Supporting Your Child\'s Learning Journey'}
              </p>
            </div>

            {/* Student Switcher - PREMIUM WIDE VERSION */}
            {students.length > 1 && activeTab === 'compass' && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Viewing:
                </label>
                <select
                  value={activeStudentId || ''}
                  onChange={(e) => {
                    setActiveStudentId(e.target.value);
                    setCompassView('overview');
                  }}
                  className="min-w-[200px] px-6 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 text-slate-800 dark:text-slate-200 font-bold text-base shadow-md hover:shadow-lg transition-shadow cursor-pointer focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {students.map(s => (
                    <option key={s.id} value={s.id}>
                      {(s as any).displayName || s.email.split('@')[0]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Tab Selector (Admin Only) */}
          {isAdmin && (
            <div className="flex gap-4 mt-6">
              <button
                onClick={() => { setActiveTab('compass'); setCompassView('overview'); }}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${activeTab === 'compass'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
              >
                Parent Compass
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-6 py-3 rounded-xl font-bold transition-all ${activeTab === 'admin'
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
              >
                Admin
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'admin' && isAdmin ? (
          <AdminDashboard currentUser={user} onBack={() => { }} />
        ) : (
          <>
            {/* Breadcrumbs */}
            {compassView !== 'overview' && (
              <div className="mb-6 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                <button onClick={handleBackToOverview} className="hover:text-indigo-600 dark:hover:text-indigo-400 font-bold">
                  Overview
                </button>
                {compassView === 'details' && <span>/ Subject Learning</span>}
                {compassView === 'report' && (
                  <>
                    <span>/</span>
                    <button onClick={handleBackToDetails} className="hover:text-indigo-600 dark:hover:text-indigo-400 font-bold">
                      Subject Learning
                    </button>
                    <span>/ {selectedSubjectForReport?.subject}</span>
                  </>
                )}
              </div>
            )}

            {/* Screen 1: Parent Compass (Overview) */}
            {compassView === 'overview' && (
              <ParentCompass
                overview={USE_LIS_PARENT_SIGNALS ? adaptedOverview : studentOverview}
                studentName={studentName}
                isLoading={USE_LIS_PARENT_SIGNALS ? lisLoading : isLoading}
                onViewDetails={handleViewDetails}
                appLanguage={appLanguage}
              />
            )}

            {/* Screen 2: Parent Compass Details (Subject Overview) */}
            {compassView === 'details' && (
              <ParentCompassDetails
                subjects={USE_LIS_PARENT_SIGNALS ? adaptedSubjects : subjectOverviews}
                studentName={studentName}
                isLoading={USE_LIS_PARENT_SIGNALS ? lisLoading : isLoading}
                onSelectSubject={handleSelectSubject}
                appLanguage={appLanguage}
              />
            )}

            {/* Screen 3: Subject Progress Report */}
            {compassView === 'report' && (
              <ParentSubjectProgressReportView
                report={subjectProgressReport}
                studentName={studentName}
                isLoading={isLoading}
                onBack={handleBackToDetails}
                appLanguage={appLanguage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ParentDashboard;
