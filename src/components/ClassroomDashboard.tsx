
import React, { useState, useEffect } from 'react';
import { UserProfile, Classroom, ClassroomFeedItem, ClassroomAssignment, ClassroomAnnouncement, Language, Comment } from '../types';
import { 
  createClassroom, 
  joinClassroom, 
  getUserClassrooms, 
  createAssignment, 
  createAnnouncement, 
  subscribeToClassFeed, 
  getClassLeaderboard, 
  getClassFeed,
  toggleLike,
  addComment
} from '../services/socialService';
import { checkFirebaseStatus } from '../services/analyticsService';
import Button from './ui/Button';
import Card from './ui/Card';
import AssignmentReportModal from './AssignmentReportModal';

// Sub-component for Comments
const CommentSection: React.FC<{ 
  item: ClassroomFeedItem, 
  user: UserProfile, 
  onAddComment: (text: string) => void 
}> = ({ item, user, onAddComment }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentText.trim()) {
      onAddComment(commentText);
      setCommentText('');
    }
  };

  const comments = item.comments || [];

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1"
        >
          <span>💬</span> {comments.length} Comments
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3 animate-fade-in">
          {comments.map((c, i) => (
            <div key={i} className="flex gap-2 items-start text-sm">
              <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                {(c.userName || '?').charAt(0)}
              </div>
              <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg rounded-tl-none flex-grow">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-xs text-slate-700 dark:text-slate-300">{c.userName}</span>
                  <span className="text-[9px] text-slate-400">{new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">{c.text}</p>
              </div>
            </div>
          ))}
          
          <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
            <input 
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="flex-grow text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:border-indigo-500"
            />
            <button 
              type="submit"
              disabled={!commentText.trim()}
              className="text-indigo-600 disabled:opacity-50 text-xs font-bold"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

interface ClassroomDashboardProps {
  user: UserProfile;
  appLanguage: Language;
  onNavigateToContent: (topic: string, mode: 'quiz' | 'notes', assignmentId?: string) => void;
  onBack: () => void;
}

const ClassroomDashboard: React.FC<ClassroomDashboardProps> = ({ user, appLanguage, onNavigateToContent, onBack }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [activeClass, setActiveClass] = useState<Classroom | null>(null);
  const [feed, setFeed] = useState<ClassroomFeedItem[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'stream' | 'classwork' | 'people'>('stream');
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  
  const [joinCode, setJoinCode] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [postType, setPostType] = useState<'announcement' | 'assignment'>('announcement');
  const [postContent, setPostContent] = useState('');
  const [assignmentType, setAssignmentType] = useState<'quiz' | 'notes'>('quiz');
  const [dueDate, setDueDate] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [selectedReportAssignment, setSelectedReportAssignment] = useState<ClassroomAssignment | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('Copy Join Code');

  const isTeacher = activeClass ? activeClass.creatorId === user.id : false;
  const visibleFeed = feed;

  useEffect(() => {
    loadClassrooms();
    checkConnection();
  }, [user]);

  const checkConnection = async () => {
    const status = await checkFirebaseStatus();
    setDbStatus(status.status === 'ok' ? 'connected' : 'offline');
  };

  useEffect(() => {
    if (activeClass) {
      loadLeaderboard(activeClass.id);
      setActiveTab('stream');
      const unsubscribe = subscribeToClassFeed(activeClass.id, (newFeed) => {
        setFeed(newFeed);
      });
      return () => unsubscribe();
    }
  }, [activeClass]);

  const loadClassrooms = async () => {
    const classes = await getUserClassrooms(user.id);
    setClassrooms(classes);
  };

  const loadLeaderboard = async (classId: string) => {
    const data = await getClassLeaderboard(classId);
    setLeaderboard(data);
  };

  const handleRefresh = async () => {
    if (!activeClass) return;
    setIsLoading(true);
    try {
      const data = await getClassFeed(activeClass.id);
      setFeed(data);
      const lb = await getClassLeaderboard(activeClass.id);
      setLeaderboard(lb);
      
      if (data.length === 0) {
          console.warn("Feed empty. Active Class ID:", activeClass.id);
      }
    } catch (e: any) {
      console.error("Refresh failed", e);
      alert(`Connection Error: ${e.message}\nCheck Firestore Rules.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName) return;
    setIsLoading(true);
    try {
      const newClass = await createClassroom(user, newClassName);
      setClassrooms(prev => [newClass, ...prev]);
      setIsCreating(false);
      setNewClassName('');
    } catch (e) {
      alert("Failed to create class.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinClass = async () => {
    if (!joinCode) return;
    setIsLoading(true);
    try {
      const joinedClass = await joinClassroom(user, joinCode);
      if (joinedClass) {
        setClassrooms(prev => {
            if (prev.find(c => c.id === joinedClass.id)) return prev;
            return [joinedClass, ...prev];
        });
        setJoinCode('');
        alert("Joined Successfully!");
      }
    } catch (e: any) {
      alert(e.message || "Failed to join class. Check code.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePost = async () => {
    if (!activeClass || !postContent.trim()) return;
    setIsPosting(true);
    try {
      if (postType === 'announcement') {
        await createAnnouncement(activeClass.id, user, postContent);
      } else {
        const dueTimestamp = dueDate ? new Date(dueDate).getTime() : undefined;
        await createAssignment(activeClass.id, user, postContent, assignmentType, dueTimestamp);
      }
      setPostContent('');
      setDueDate('');
    } catch (e) {
      alert("Failed to post.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleCopyCode = () => {
    if (activeClass) {
      navigator.clipboard.writeText(activeClass.code);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback('Copy Join Code'), 2000);
    }
  };

  const handleLike = async (item: ClassroomFeedItem) => {
    const collection = item.itemType === 'assignment' ? 'assignments' : 'announcements';
    await toggleLike(collection, item.id, user.id);
  };

  const handleComment = async (item: ClassroomFeedItem, text: string) => {
    const collection = item.itemType === 'assignment' ? 'assignments' : 'announcements';
    await addComment(collection, item.id, user, text);
  };

  const getDueStatus = (dueTimestamp?: number) => {
    if (!dueTimestamp) return null;
    const now = Date.now();
    const diff = dueTimestamp - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (diff < 0) return <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">Overdue</span>;
    if (days <= 1) return <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Due Tomorrow</span>;
    if (days <= 5) return <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded">Due in {days} days</span>;
    return <span className="text-xs text-slate-500">Due {new Date(dueTimestamp).toLocaleDateString()}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20 animate-fade-in pt-6">
      {/* Report Modal */}
      {selectedReportAssignment && (
        <AssignmentReportModal 
          assignment={selectedReportAssignment}
          members={leaderboard} 
          onClose={() => setSelectedReportAssignment(null)}
        />
      )}

      {!activeClass ? (
        <>
          <div className="flex justify-between items-center mb-8">
             <div className="flex flex-col">
                <h1 className="text-3xl font-black text-slate-800 dark:text-white">My Study Groups</h1>
                <span className={`text-xs px-2 py-1 rounded-full border w-fit mt-2 ${dbStatus === 'connected' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {dbStatus === 'connected' ? '● Online' : '○ Offline Mode'}
                </span>
             </div>
             <Button variant="outline" onClick={onBack} className="rounded-xl border-slate-200 shadow-sm bg-white dark:bg-slate-800">
                ← Back
             </Button>
          </div>
          
          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
             <Card className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white border-0">
                <h3 className="font-bold text-lg mb-2">Join a Classroom</h3>
                <p className="text-sm text-indigo-100 mb-4">Enter the code shared by your teacher or friend.</p>
                <div className="flex gap-2">
                   <input 
                     value={joinCode}
                     onChange={e => setJoinCode(e.target.value)}
                     placeholder="Enter Code (e.g. X7K9P2)"
                     className="flex-grow p-2 rounded-lg text-slate-900 font-mono text-center uppercase font-bold focus:outline-none"
                   />
                   <Button variant="secondary" onClick={handleJoinClass} isLoading={isLoading}>Join</Button>
                </div>
             </Card>

             <Card className="border-dashed border-2 border-slate-300 dark:border-slate-700 bg-transparent flex flex-col justify-center items-center p-8 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => setIsCreating(true)}>
                <span className="text-4xl mb-2">➕</span>
                <span className="font-bold text-slate-500">Create Study Group</span>
             </Card>
          </div>

          {/* Creation Modal */}
          {isCreating && (
             <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setIsCreating(false)}>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                   <h3 className="font-bold text-xl mb-4">Create New Group</h3>
                   <input 
                     className="w-full p-3 border rounded-xl mb-4 dark:bg-slate-700 dark:border-slate-600"
                     placeholder="Group Name (e.g. Grade 10 Math Club)"
                     value={newClassName}
                     onChange={e => setNewClassName(e.target.value)}
                   />
                   <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
                      <Button onClick={handleCreateClass} isLoading={isLoading}>Create</Button>
                   </div>
                </div>
             </div>
          )}

          {/* List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
             {classrooms.map(cls => (
                <div 
                  key={cls.id} 
                  onClick={() => setActiveClass(cls)}
                  className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer group"
                >
                   <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center text-2xl font-bold">
                         {(cls.name || '?').charAt(0)}
                      </div>
                      <span className="bg-slate-100 dark:bg-slate-700 text-xs px-2 py-1 rounded font-mono text-slate-500">{cls.code}</span>
                   </div>
                   <h3 className="font-bold text-lg mb-1 group-hover:text-indigo-600 transition-colors">{cls.name}</h3>
                   <p className="text-xs text-slate-500">{cls.grade} • {cls.members.length} Members</p>
                </div>
             ))}
             {classrooms.length === 0 && !isLoading && (
                <div className="col-span-full text-center py-10 text-slate-400 italic">
                   You haven't joined any groups yet.
                </div>
             )}
          </div>
        </>
      ) : (
        <>
          {/* Active Class Header */}
          <div className="bg-indigo-600 dark:bg-indigo-900 rounded-2xl p-6 text-white mb-6 shadow-lg">
             <div className="flex justify-between items-start">
               <div>
                  <button onClick={() => setActiveClass(null)} className="text-indigo-200 hover:text-white mb-2 text-sm">← Back to Groups</button>
                  <h1 className="text-3xl font-black">{activeClass.name}</h1>
                  <p className="text-indigo-200 text-sm mt-1">{activeClass.grade} • {activeClass.curriculum}</p>
               </div>
               <div className="text-right">
                  {/* Interactive Copy Button */}
                  <button 
                    onClick={handleCopyCode}
                    className="bg-white/10 hover:bg-white/20 transition-all cursor-pointer px-4 py-2 rounded-xl text-xl font-mono font-black tracking-widest mb-1 border-2 border-white/10 hover:border-white/30 active:scale-95 flex items-center gap-3 shadow-lg"
                    title="Click to copy join code"
                  >
                     <span>{activeClass.code}</span>
                     <span className="text-sm opacity-60">📋</span>
                  </button>
                  <div className="text-[10px] font-bold uppercase opacity-60 tracking-wider text-center">
                    {copyFeedback}
                  </div>
               </div>
             </div>
          </div>

          {/* Tabs - Scrollable */}
          <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 mb-6">
             <div className="flex overflow-x-auto no-scrollbar">
                {['stream', 'classwork', 'people'].map((tab) => (
                    <button 
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={`px-6 py-3 font-bold text-sm capitalize border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                    {tab}
                    </button>
                ))}
             </div>
             <button 
                onClick={handleRefresh}
                className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex-shrink-0"
                title="Force Refresh from Database"
             >
                <span className={`text-lg ${isLoading ? 'animate-spin' : ''}`}>🔄</span>
                <span className="hidden sm:inline">Refresh</span>
             </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
             
             {/* Main Feed */}
             <div className="lg:col-span-3 space-y-6">
                
                {/* Composer (Teacher Only) */}
                {isTeacher && activeTab === 'stream' && (
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm animate-slide-up">
                       <div className="flex gap-4 mb-4">
                          <button onClick={() => setPostType('announcement')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${postType === 'announcement' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-500'}`}>📣 Announcement</button>
                          <button onClick={() => setPostType('assignment')} className={`flex-1 py-2 text-xs font-bold rounded-lg ${postType === 'assignment' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-500'}`}>📝 Assignment</button>
                       </div>
                       
                       <textarea 
                          value={postContent}
                          onChange={(e) => setPostContent(e.target.value)}
                          className="w-full p-3 border rounded-xl dark:bg-slate-700 dark:border-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          placeholder={postType === 'announcement' ? "Share something with your class..." : "Enter topic to generate (e.g. Calculus Derivatives)..."}
                          rows={3}
                       />

                       {postType === 'assignment' && (
                          <div className="flex flex-col sm:flex-row gap-4 mt-4 sm:items-center">
                             <select 
                                value={assignmentType}
                                onChange={(e) => setAssignmentType(e.target.value as any)}
                                className="p-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                             >
                                <option value="quiz">Quiz</option>
                                <option value="notes">Study Notes</option>
                             </select>
                             
                             <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Due:</span>
                                <input 
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    className="p-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                />
                             </div>
                          </div>
                       )}

                       <div className="flex justify-end mt-4">
                          <Button size="sm" onClick={handlePost} isLoading={isPosting} disabled={!postContent.trim()}>
                             Post
                          </Button>
                       </div>
                    </div>
                )}

                {/* Feed Items */}
                {activeTab === 'stream' && (
                   <div className="space-y-4">
                      {visibleFeed.length === 0 && (
                         <div className="text-center py-10 text-slate-400 italic">
                            No posts yet. {isTeacher ? 'Start the conversation!' : 'Wait for your teacher to post.'}
                            
                            {/* Warning if connected but empty */}
                            {dbStatus === 'connected' && (
                                <p className="mt-4 text-xs text-slate-300">
                                   Status: Online. If items are missing, ask admin to check rules.
                                </p>
                            )}
                         </div>
                      )}
                      
                      {visibleFeed.map(item => {
                         const isLiked = (item.likes || []).includes(user.id);
                         const likeCount = (item.likes || []).length;

                         if (item.itemType === 'announcement') {
                            // Fix: Properly cast to ClassroomAnnouncement
                            const ann = item as ClassroomAnnouncement;
                            return (
                               <div key={item.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:border-slate-300">
                                  <div className="flex gap-4 mb-2">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
                                       {(item.createdBy || '?').charAt(0)}
                                    </div>
                                    <div>
                                       <div className="flex items-center gap-2 mb-1">
                                          <span className="font-bold text-sm text-slate-800 dark:text-white">{item.createdBy}</span>
                                          <span className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                                       </div>
                                       {/* Fix: Access text property from ClassroomAnnouncement */}
                                       <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{ann.text}</p>
                                    </div>
                                  </div>
                                  
                                  {/* Social Actions */}
                                  <div className="flex gap-4 mt-4 ml-14">
                                     <button 
                                       onClick={() => handleLike(item)}
                                       className={`text-xs font-bold flex items-center gap-1 transition-colors ${isLiked ? 'text-pink-600' : 'text-slate-400 hover:text-pink-600'}`}
                                     >
                                        <span>{isLiked ? '❤️' : '🤍'}</span> {likeCount || ''} Like
                                     </button>
                                  </div>
                                  
                                  {/* Comments */}
                                  <div className="ml-14">
                                     <CommentSection item={item} user={user} onAddComment={(text) => handleComment(item, text)} />
                                  </div>
                               </div>
                            );
                         } else {
                            // Assignment Item
                            // Fix: Properly cast to ClassroomAssignment
                            const asg = item as ClassroomAssignment;
                            const submission = asg.submissions?.[user.id];
                            return (
                               <div key={item.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-all hover:border-indigo-200">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4">
                                       {/* Fix: Access assignment properties via asg cast */}
                                       <div className={`p-3 rounded-full ${asg.type === 'quiz' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                          {asg.type === 'quiz' ? '⚡' : '📝'}
                                       </div>
                                       <div>
                                          <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                             {asg.topic}
                                             {submission && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">✅ Done ({submission.score})</span>}
                                          </h4>
                                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                             <span>Posted {new Date(item.createdAt).toLocaleDateString()}</span>
                                             {asg.dueDate && (
                                                <>
                                                  <span>•</span>
                                                  {getDueStatus(asg.dueDate)}
                                                </>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                    <div className="flex gap-2">
                                       {isTeacher && (
                                          <Button size="sm" variant="outline" onClick={() => setSelectedReportAssignment(asg)}>
                                             View Report
                                          </Button>
                                       )}
                                       {/* Fix: use asg properties */}
                                       <Button size="sm" onClick={() => onNavigateToContent(asg.topic, asg.type, item.id)}>
                                          {submission ? 'Retake' : 'Start'}
                                       </Button>
                                    </div>
                                  </div>

                                  {/* Social Actions */}
                                  <div className="flex gap-4 mt-4 ml-16">
                                     <button 
                                       onClick={() => handleLike(item)}
                                       className={`text-xs font-bold flex items-center gap-1 transition-colors ${isLiked ? 'text-pink-600' : 'text-slate-400 hover:text-pink-600'}`}
                                     >
                                        <span>{isLiked ? '❤️' : '🤍'}</span> {likeCount || ''} Like
                                     </button>
                                  </div>

                                  {/* Comments */}
                                  <div className="ml-16">
                                     <CommentSection item={item} user={user} onAddComment={(text) => handleComment(item, text)} />
                                  </div>
                               </div>
                            );
                         }
                      })}
                   </div>
                )}

                {/* Classwork Tab */}
                {activeTab === 'classwork' && (
                   <div className="space-y-4">
                      {visibleFeed.filter(i => i.itemType === 'assignment').map(item => (
                         <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-lg">
                                  {(item as ClassroomAssignment).type === 'quiz' ? '⚡' : '📄'}
                                </div>
                                <div>
                                  <p className="font-bold text-sm">{(item as ClassroomAssignment).topic}</p>
                                  {getDueStatus((item as ClassroomAssignment).dueDate)}
                                </div>
                            </div>
                            <Button size="sm" onClick={() => onNavigateToContent((item as ClassroomAssignment).topic, (item as ClassroomAssignment).type, item.id)}>Open</Button>
                         </div>
                      ))}
                   </div>
                )}

                {/* People Tab */}
                {activeTab === 'people' && (
                   <Card>
                      <h3 className="font-bold mb-4">Classmates</h3>
                      <div className="space-y-3">
                         {leaderboard.map((u, i) => (
                            <div key={i} className="flex items-center gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                               <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                                  {(u.name || '?').charAt(0)}
                                </div>
                               <div className="flex-grow">
                                  <p className="font-bold text-sm">{u.name}</p>
                               </div>
                               {isTeacher && u.id !== user.id && (
                                  <button className="text-xs text-slate-400 hover:text-indigo-600 border px-2 py-1 rounded">🔔 Nudge</button>
                               )}
                            </div>
                         ))}
                      </div>
                   </Card>
                )}
             </div>

             {/* Sidebar: Upcoming & Leaderboard */}
             <div className="lg:col-span-1 space-y-6">
                <Card className="border-l-4 border-amber-500">
                   <h3 className="font-bold text-sm uppercase text-slate-500 mb-3">Upcoming Due</h3>
                   <div className="space-y-2">
                      {visibleFeed
                        .filter(i => i.itemType === 'assignment' && (i as ClassroomAssignment).dueDate && (i as ClassroomAssignment).dueDate! > Date.now())
                        .sort((a,b) => (a as ClassroomAssignment).dueDate! - (b as ClassroomAssignment).dueDate!)
                        .slice(0, 3)
                        .map(item => (
                           <div key={item.id} className="text-sm">
                              <p className="font-bold">{(item as ClassroomAssignment).topic}</p>
                              <p className="text-xs text-slate-500">{new Date((item as ClassroomAssignment).dueDate!).toLocaleDateString()}</p>
                           </div>
                        ))}
                      {visibleFeed.filter(i => i.itemType === 'assignment' && (i as ClassroomAssignment).dueDate).length === 0 && (
                         <p className="text-xs text-slate-400 italic">No upcoming deadlines.</p>
                      )}
                   </div>
                </Card>

                <Card>
                   <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold flex items-center gap-2 text-sm">
                         🏆 Leaderboard
                      </h3>
                   </div>
                   <div className="space-y-3">
                      {leaderboard.slice(0, 5).map((u, i) => (
                         <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                               <span className={`font-bold w-4 ${i===0?'text-yellow-500':i===1?'text-slate-400':'text-amber-600'}`}>#{i+1}</span>
                               <span className={u.name === user.name ? 'font-bold text-indigo-600' : ''}>{u.name}</span>
                            </div>
                            <span className="font-mono text-slate-500">{u.xp} XP</span>
                         </div>
                      ))}
                   </div>
                </Card>
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClassroomDashboard;
