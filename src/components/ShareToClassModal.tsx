
import React, { useState, useEffect } from 'react';
import { UserProfile, Classroom } from '../types';
import { getUserClassrooms, createAssignment } from '../services/socialService';
import Button from './ui/Button';

interface ShareToClassModalProps {
  user: UserProfile;
  content: { title: string; type: 'quiz' | 'notes' | 'exam-generator' | 'homework' };
  onClose: () => void;
}

const ShareToClassModal: React.FC<ShareToClassModalProps> = ({ user, content, onClose }) => {
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const classes = await getUserClassrooms(user.id);
      // Filter: Only show classes where user is Creator/Teacher
      // Students cannot broadcast assignments to the class feed.
      const teachingClasses = classes.filter(c => c.creatorId === user.id);
      setClassrooms(teachingClasses);
    };
    load();
  }, [user]);

  const toggleClass = (id: string) => {
    setSelectedClasses(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleShare = async () => {
    if (selectedClasses.length === 0) return;
    setIsLoading(true);
    try {
      // Map complex types to simple assignment types supported by Classroom
      const assignmentType = content.type === 'notes' ? 'notes' : 'quiz'; 
      
      const promises = selectedClasses.map(classId => 
        // Note: undefined due date for quick shares
        createAssignment(classId, user, content.title, assignmentType, undefined)
      );
      
      await Promise.all(promises);
      setIsSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      alert("Failed to share.");
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-700">
          <h3 className="text-xl font-black text-slate-800 dark:text-white">Share to Class</h3>
          <p className="text-sm text-slate-500">Post "{content.title}" as an assignment.</p>
        </div>
        
        <div className="p-6 max-h-[300px] overflow-y-auto">
          {isSuccess ? (
            <div className="text-center py-8 text-green-600 font-bold animate-pulse">
              <span className="text-4xl block mb-2">✅</span>
              Posted Successfully!
            </div>
          ) : (
            <div className="space-y-3">
              {classrooms.length > 0 ? classrooms.map(cls => (
                <div 
                  key={cls.id}
                  onClick={() => toggleClass(cls.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedClasses.includes(cls.id) 
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                  }`}
                >
                  <span className="font-bold text-slate-700 dark:text-slate-200">{cls.name}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedClasses.includes(cls.id) ? 'bg-brand-500 border-brand-500' : 'border-slate-300'
                  }`}>
                    {selectedClasses.includes(cls.id) && <span className="text-white text-xs">✓</span>}
                  </div>
                </div>
              )) : (
                <div className="text-center py-6">
                    <p className="text-slate-500 italic mb-2">You don't manage any classes.</p>
                    <p className="text-xs text-slate-400">Only teachers/creators can post assignments.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {!isSuccess && (
          <div className="p-4 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
            <Button 
              onClick={handleShare} 
              disabled={selectedClasses.length === 0} 
              isLoading={isLoading}
              size="sm"
            >
              Post Assignment
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareToClassModal;
