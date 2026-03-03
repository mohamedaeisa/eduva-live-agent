
import React from 'react';
import { ClassroomAssignment } from '../types';
import Button from './ui/Button';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface AssignmentReportModalProps {
  assignment: ClassroomAssignment;
  members: any[]; // List of class members (from leaderboard logic) to map IDs to names
  onClose: () => void;
}

const AssignmentReportModal: React.FC<AssignmentReportModalProps> = ({ assignment, members, onClose }) => {
  
  // Calculate Stats
  const totalStudents = members.length;
  // Ensure submissions object exists before using Object.values
  const submissionsMap = assignment.submissions || {};
  const submissions = Object.values(submissionsMap) as { score: number; timestamp: number; completed: boolean; attempts?: number }[];
  
  const completedCount = submissions.length;
  const completionRate = totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0;
  
  const avgScore = completedCount > 0 
    ? Math.round(submissions.reduce((acc, curr) => acc + (curr.score || 0), 0) / completedCount)
    : 0;

  // Chart Data Preparation
  const pieData = [
    { name: 'Completed', value: completedCount, color: '#10b981' }, // emerald-500
    { name: 'Pending', value: Math.max(0, totalStudents - completedCount), color: '#e2e8f0' } // slate-200
  ];

  // Bucket scores for Histogram
  const scoreDistribution = [
    { range: 'Low', count: 0, fill: '#f87171' }, // red-400
    { range: 'Avg', count: 0, fill: '#fbbf24' }, // amber-400
    { range: 'High', count: 0, fill: '#34d399' }, // emerald-400
  ];

  submissions.forEach(s => {
    // Assuming typical 10 question quiz logic for buckets, adaptable
    // If scores are percentages, threshold 50, 80
    // If scores are raw (e.g. 10), threshold 5, 8
    // Let's assume raw < 5 is low, 5-8 avg, > 8 high
    if (s.score < 5) scoreDistribution[0].count++;
    else if (s.score < 8) scoreDistribution[1].count++;
    else scoreDistribution[2].count++;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-start">
          <div>
             <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full mb-2 inline-block ${assignment.type === 'quiz' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {assignment.type} Report
             </span>
             <h2 className="text-2xl font-black text-slate-800 dark:text-white">{assignment.topic}</h2>
             <p className="text-xs text-slate-500">Posted on {new Date(assignment.createdAt).toLocaleDateString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 text-xl">✕</button>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar">
            {/* Visual Analytics Section */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-slate-100 dark:border-slate-700">
               {/* 1. Completion Chart */}
               <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center">
                  <h4 className="text-sm font-bold text-slate-500 uppercase mb-2">Participation</h4>
                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={pieData} 
                                innerRadius={50} 
                                outerRadius={70} 
                                paddingAngle={5} 
                                dataKey="value"
                                stroke="none"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                                itemStyle={{ color: '#334155', fontWeight: 'bold' }}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="text-center mt-[-10px]">
                     <span className="text-2xl font-black text-slate-800 dark:text-white">{completionRate}%</span>
                     <span className="text-xs text-slate-400 block">Completed</span>
                  </div>
               </div>

               {/* 2. Score/Stats Chart */}
               {assignment.type === 'quiz' ? (
                   <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col">
                      <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-bold text-slate-500 uppercase">Score Distribution</h4>
                          <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold">Avg: {avgScore}</span>
                      </div>
                      <div className="flex-grow h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={scoreDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <XAxis dataKey="range" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                <YAxis allowDecimals={false} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {scoreDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                      </div>
                   </div>
               ) : (
                   <div className="bg-slate-50 dark:bg-slate-900/30 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                       <span className="text-4xl mb-4">📝</span>
                       <h4 className="font-bold text-slate-700 dark:text-slate-300">Study Notes Assignment</h4>
                       <p className="text-xs text-slate-500 mt-2">No scores available for this task type.<br/>Track completion status on the left.</p>
                   </div>
               )}
            </div>

            {/* Student List Table */}
            <div className="p-6">
               <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-4">Student Details</h3>
               
               <div className="space-y-2">
                  {members.map(member => {
                     const submission = submissionsMap[member.id];
                     const isDone = !!submission;
                     
                     return (
                        <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isDone ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}`}>
                                 {(member.name || '?').charAt(0)}
                              </div>
                              <div>
                                 <p className="font-bold text-sm text-slate-800 dark:text-white">{member.name}</p>
                                 <p className="text-[10px] text-slate-400">
                                    {isDone ? `Submitted ${new Date(submission.timestamp).toLocaleDateString()}` : 'Not started'}
                                 </p>
                              </div>
                           </div>

                           <div className="text-right">
                              {isDone ? (
                                 <div className="flex flex-col items-end">
                                    {assignment.type === 'quiz' && (
                                       <span className={`font-black text-sm ${submission.score >= 8 ? 'text-green-600' : 'text-amber-600'}`}>
                                          {submission.score} Marks
                                       </span>
                                    )}
                                    <span className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-500">
                                       {submission.attempts || 1} Attempt{(submission.attempts || 1) > 1 ? 's' : ''}
                                    </span>
                                 </div>
                              ) : (
                                 <span className="text-xs font-bold text-slate-400 italic">Pending...</span>
                              )}
                           </div>
                        </div>
                     );
                  })}
                  
                  {members.length === 0 && (
                     <p className="text-center text-slate-400 py-8 italic">No students found in this class.</p>
                  )}
               </div>
            </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
           <Button onClick={onClose}>Close Report</Button>
        </div>

      </div>
    </div>
  );
};

export default AssignmentReportModal;
