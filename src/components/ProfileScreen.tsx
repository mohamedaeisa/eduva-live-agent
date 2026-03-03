
import React, { useState, useEffect } from 'react';
import { UserProfile, EducationSystem, Language, UserRole } from '../types';
import { YEARS, EDUCATION_SYSTEMS, SUBJECTS, TRANSLATIONS } from '../constants';
import { updateFullUserProfile } from '../services/authService';
import { getParentProfile, getLinkedStudents, linkStudentByCode } from '../services/parentService';
import { renameSubjectCascade, getTrainedCountForSubject } from '../services/storageService';
import Button from './ui/Button';
import Card from './ui/Card';

interface ProfileScreenProps {
  user: UserProfile;
  appLanguage: Language;
  onUpdate: (updatedUser: UserProfile) => void;
  onBack: () => void;
}

// Sub-component: Delete Warning Modal
const SubjectDeleteModal = ({
  subject, trainedCount, onRename, onDelete, onCancel
}: {
  subject: string;
  trainedCount: number;
  onRename: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) => (
  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-pop border border-slate-200 dark:border-slate-700">
      <div className="text-4xl text-center mb-4">{trainedCount > 0 ? '⚠️' : '🗑️'}</div>
      <h3 className="text-lg font-black text-slate-800 dark:text-white text-center mb-3">
        Remove "{subject}"?
      </h3>
      {trainedCount > 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
          You have <strong className="text-orange-600 dark:text-orange-400">{trainedCount} trained document{trainedCount !== 1 ? 's' : ''}</strong> under this subject. They will be <strong>orphaned</strong> if you delete it. Consider <strong>renaming</strong> instead to keep all your work.
        </p>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-6">
          No trained documents exist under this subject. It's safe to remove.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {trainedCount > 0 && (
          <button
            onClick={onRename}
            className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-colors shadow-md"
          >
            ✏️ Rename Instead
          </button>
        )}
        <button
          onClick={onDelete}
          className="w-full py-3 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold text-sm border border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors"
        >
          Delete Anyway
        </button>
        <button
          onClick={onCancel}
          className="w-full py-2 text-slate-500 font-medium text-sm hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  appLanguage,
  onUpdate,
  onBack
}) => {
  const t = TRANSLATIONS[appLanguage];

  const [name, setName] = useState(user.name);
  const [year, setYear] = useState(user.preferences.defaultYear);
  const [curriculum, setCurriculum] = useState(user.preferences.defaultCurriculum);
  const [subject, setSubject] = useState(user.preferences.defaultSubject || SUBJECTS[0]);
  const [userSubjects, setUserSubjects] = useState<string[]>(user.preferences.subjects || []);

  const [isCustomSubject, setIsCustomSubject] = useState(false);
  const [customSubject, setCustomSubject] = useState('');

  // Rename state
  const [renamingSubject, setRenamingSubject] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete warning state
  const [deleteWarning, setDeleteWarning] = useState<{ subject: string; trainedCount: number } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parent Specific State
  const [linkedStudents, setLinkedStudents] = useState<UserProfile[]>([]);
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // @ts-ignore
  const linkCode = user.linkCode || "UNSET";

  useEffect(() => {
    if (user.role === UserRole.PARENT) {
      const loadLinked = async () => {
        const p = await getParentProfile(user.id);
        if (p?.linkedStudents) {
          const s = await getLinkedStudents(p.linkedStudents);
          setLinkedStudents(s);
        }
      };
      loadLinked();
    }
  }, [user]);

  const handleAddSubject = () => {
    const subjToAdd = isCustomSubject ? customSubject.trim() : subject;
    if (subjToAdd && !userSubjects.includes(subjToAdd)) {
      setUserSubjects(prev => [...prev, subjToAdd]);
      if (isCustomSubject) {
        setCustomSubject('');
      }
    }
  };

  const handleRemoveSubject = async (subj: string) => {
    const count = await getTrainedCountForSubject(user.id, subj);
    setDeleteWarning({ subject: subj, trainedCount: count });
  };

  const confirmDelete = () => {
    if (!deleteWarning) return;
    setUserSubjects(prev => prev.filter(s => s !== deleteWarning.subject));
    setDeleteWarning(null);
  };

  const handleStartRename = (subj: string) => {
    setDeleteWarning(null);
    setRenamingSubject(subj);
    setRenameValue(subj);
  };

  const handleConfirmRename = async () => {
    if (!renamingSubject || !renameValue.trim() || renameValue.trim() === renamingSubject) {
      setRenamingSubject(null);
      return;
    }
    const newName = renameValue.trim();
    if (userSubjects.includes(newName)) {
      alert(`Subject "${newName}" already exists.`);
      return;
    }
    setIsRenaming(true);
    try {
      // 1. Update the profile list
      setUserSubjects(prev => prev.map(s => s === renamingSubject ? newName : s));
      // 2. Cascade to all TrainingSource records
      const count = await renameSubjectCascade(user.id, renamingSubject, newName);
      console.log(`[PROFILE] Renamed "${renamingSubject}" to "${newName}". ${count} documents updated.`);
    } finally {
      setRenamingSubject(null);
      setIsRenaming(false);
    }
  };

  const handleLinkStudent = async () => {
    if (!linkCodeInput.trim()) return;
    setIsLinking(true);
    const res = await linkStudentByCode(user.id, linkCodeInput);
    if (res.success) {
      const p = await getParentProfile(user.id);
      if (p?.linkedStudents) {
        const s = await getLinkedStudents(p.linkedStudents);
        setLinkedStudents(s);
      }
      setLinkCodeInput('');
      alert(`Successfully linked ${res.studentName}`);
    } else {
      alert(res.error);
    }
    setIsLinking(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccess(false);

    const finalDefaultSubject = userSubjects.length > 0 ? userSubjects[0] : (isCustomSubject ? customSubject.trim() : subject);

    try {
      await updateFullUserProfile(user.id, {
        name,
        year,
        curriculum,
        subject: finalDefaultSubject,
        subjects: userSubjects
      });

      const updatedUser: UserProfile = {
        ...user,
        name,
        preferences: {
          ...user.preferences,
          defaultYear: year,
          defaultCurriculum: curriculum,
          defaultSubject: finalDefaultSubject,
          subjects: userSubjects
        }
      };

      onUpdate(updatedUser);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      alert("Failed to update profile.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyLinkCode = () => {
    navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto p-4 animate-fade-in pb-32 pt-8">
      {/* Delete Warning Modal */}
      {deleteWarning && (
        <SubjectDeleteModal
          subject={deleteWarning.subject}
          trainedCount={deleteWarning.trainedCount}
          onRename={() => handleStartRename(deleteWarning.subject)}
          onDelete={confirmDelete}
          onCancel={() => setDeleteWarning(null)}
        />
      )}

      {/* HEADER WITH BACK BUTTON */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex flex-col">
          <h1 className="text-5xl font-black text-slate-900 dark:text-white mb-2">Profile</h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs">{user.role}</p>
        </div>
        <Button variant="outline" onClick={onBack} className="rounded-xl border-slate-200 bg-white dark:bg-slate-800 shadow-sm">
          ← Back to Screen
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* SIDEBAR: LINK CODE OR MANAGED STUDENTS */}
        <div className="lg:col-span-1">
          {user.role === UserRole.STUDENT ? (
            <Card className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-8 border-0 shadow-2xl overflow-hidden relative">
              <div className="relative z-10">
                <h3 className="text-xs font-black uppercase tracking-widest opacity-60 mb-6">Parent Connection</h3>
                <p className="text-sm font-medium mb-4">Share this code with your parent to link your accounts:</p>

                <div
                  onClick={copyLinkCode}
                  className="bg-white/10 hover:bg-white/20 transition-all cursor-pointer p-6 rounded-2xl text-3xl font-mono font-black text-center tracking-[0.2em] border-2 border-white/20 relative group"
                >
                  {linkCode}
                  {copied && (
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-indigo-600 text-[10px] px-3 py-1 rounded-full font-black animate-bounce shadow-xl">
                      COPIED!
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-center mt-4 opacity-50 font-bold uppercase">Click code to copy</p>
              </div>
              {/* Decoration */}
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            </Card>
          ) : (
            <Card className="bg-slate-900 text-white p-6 border-0 shadow-xl h-full">
              <h3 className="text-xs font-black uppercase tracking-widest opacity-60 mb-6">Managed Students</h3>

              <div className="space-y-3 mb-8 max-h-[300px] overflow-y-auto custom-scrollbar">
                {linkedStudents.length > 0 ? linkedStudents.map(s => (
                  <div key={s.id} className="flex items-center gap-3 bg-white/10 p-3 rounded-xl border border-white/5">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-xs shrink-0">
                      {(s.name || '?').charAt(0)}
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <p className="text-sm font-bold truncate">{s.name}</p>
                      <p className="text-[10px] opacity-60 truncate">{s.preferences?.defaultYear || 'No Grade'}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-6 border-2 border-dashed border-white/10 rounded-xl">
                    <p className="text-sm opacity-50 italic">No students linked yet.</p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-white/10">
                <p className="text-xs font-bold mb-3 uppercase tracking-wider opacity-80">Link New Student</p>
                <div className="flex gap-2">
                  <input
                    className="flex-grow bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all font-mono uppercase"
                    placeholder="CODE"
                    value={linkCodeInput}
                    onChange={e => setLinkCodeInput(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <button
                    onClick={handleLinkStudent}
                    disabled={isLinking || !linkCodeInput}
                    className="bg-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95"
                  >
                    {isLinking ? '...' : '+'}
                  </button>
                </div>
                <p className="text-[9px] mt-2 opacity-40">Enter the 6-digit code from student profile</p>
              </div>
            </Card>
          )}
        </div>

        {/* MAIN FORM */}
        <div className={user.role === UserRole.STUDENT ? "lg:col-span-2" : "lg:col-span-2"}>
          <Card className="shadow-2xl border-t-8 border-brand-500 p-8 md:p-12 bg-white dark:bg-slate-800 h-full">
            {success && (
              <div className="mb-8 p-4 bg-green-50 text-green-700 font-bold text-center rounded-2xl animate-pop shadow-sm">
                ✅ Settings Synced Successfully
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-10">
              <div className="space-y-3">
                <label className="block text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Full Display Name</label>
                <input
                  type="text" required
                  className="w-full p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xl font-bold outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 transition-all shadow-inner"
                  value={name} onChange={e => setName(e.target.value)}
                />
              </div>

              {user.role === UserRole.STUDENT && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="block text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Grade Level</label>
                      <div className="relative">
                        <select
                          className="w-full p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold outline-none focus:border-brand-500 appearance-none shadow-inner"
                          value={year} onChange={e => setYear(e.target.value)}
                        >
                          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Curriculum</label>
                      <div className="relative">
                        <select
                          className="w-full p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold outline-none focus:border-brand-500 appearance-none shadow-inner"
                          value={curriculum} onChange={e => setCurriculum(e.target.value as EducationSystem)}
                        >
                          {EDUCATION_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] ml-1">Primary Target Subjects</label>
                    <div className="flex gap-4 items-start">
                      <div className="flex-grow space-y-4">
                        <div className="flex gap-2">
                          {!isCustomSubject ? (
                            <div className="relative flex-grow">
                              <select
                                className="w-full p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold outline-none focus:border-brand-500 appearance-none shadow-inner"
                                value={subject} onChange={e => setSubject(e.target.value)}
                              >
                                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                          ) : (
                            <input
                              className="flex-grow p-5 rounded-2xl border-2 border-brand-500 bg-white dark:bg-slate-900 font-bold outline-none ring-4 ring-brand-500/10 text-xl"
                              placeholder="Type custom subject..."
                              value={customSubject} onChange={e => setCustomSubject(e.target.value)}
                            />
                          )}
                          <button
                            type="button" onClick={handleAddSubject}
                            className="w-16 h-16 flex-shrink-0 flex items-center justify-center rounded-2xl border-2 bg-brand-50 text-brand-600 border-brand-200 transition-all shadow-md active:scale-90 hover:bg-brand-100"
                          >
                            <span className="text-2xl">+</span>
                          </button>
                          <button
                            type="button" onClick={() => setIsCustomSubject(!isCustomSubject)}
                            className={`w-16 h-16 flex-shrink-0 flex items-center justify-center rounded-2xl border-2 transition-all shadow-md active:scale-90 ${isCustomSubject ? 'bg-red-50 text-red-500 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}
                          >
                            {isCustomSubject ? '✕' : '✏️'}
                          </button>
                        </div>

                        {/* Subject List Box */}
                        <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl min-h-[100px] flex flex-wrap gap-2">
                          {userSubjects.length > 0 ? userSubjects.map(s => (
                            renamingSubject === s ? (
                              // --- INLINE RENAME MODE ---
                              <div key={s} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-400 rounded-xl px-2 py-1 shadow-md animate-pop">
                                <input
                                  autoFocus
                                  type="text"
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') handleConfirmRename(); if (e.key === 'Escape') setRenamingSubject(null); }}
                                  className="bg-transparent text-indigo-700 dark:text-indigo-200 font-bold text-sm outline-none w-24"
                                />
                                <button type="button" onClick={handleConfirmRename} disabled={isRenaming}
                                  className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-50">
                                  {isRenaming ? '...' : '✓'}
                                </button>
                                <button type="button" onClick={() => setRenamingSubject(null)}
                                  className="text-[10px] text-indigo-400 hover:text-red-500 font-bold">✕</button>
                              </div>
                            ) : (
                              // --- NORMAL CHIP MODE ---
                              <div key={s} className="group bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 px-3 py-2 rounded-xl flex items-center gap-2 font-bold animate-pop border border-indigo-100 dark:border-indigo-800 shadow-sm">
                                <span>{s}</span>
                                {/* Rename button */}
                                <button
                                  type="button"
                                  onClick={() => handleStartRename(s)}
                                  title="Rename subject"
                                  className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-800 text-indigo-500 flex items-center justify-center text-[10px] hover:bg-indigo-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                >✏️</button>
                                {/* Delete button */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSubject(s)}
                                  title="Remove subject"
                                  className="w-5 h-5 rounded-full bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 flex items-center justify-center text-[10px] hover:bg-red-500 hover:text-white transition-colors"
                                >✕</button>
                              </div>
                            )
                          )) : (
                            <div className="w-full flex items-center justify-center text-slate-400 font-bold italic text-sm">
                              No subjects added yet. Add one above.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-8">
                <Button
                  type="submit" isLoading={isLoading}
                  className="w-full py-6 text-lg font-black uppercase tracking-[0.3em] shadow-2xl rounded-3xl"
                >
                  UPDATE PROFILE
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;
