
import React, { useEffect, useState } from 'react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onAction: (notification: AppNotification) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onDismiss, onAction }) => {
  const [visibleNotifications, setVisibleNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    setVisibleNotifications(notifications);
  }, [notifications]);

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
      {visibleNotifications.map((notif) => (
        <div 
          key={notif.id}
          className={`pointer-events-auto bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-l-4 p-4 flex items-start gap-3 animate-slide-up transition-all ${
            notif.type === 'success' ? 'border-green-500' : 
            notif.type === 'error' ? 'border-red-500' : 'border-indigo-500'
          }`}
        >
          {/* Icon */}
          <div className="text-xl flex-shrink-0 mt-0.5">
            {notif.type === 'success' ? '✅' : notif.type === 'error' ? '❌' : 'ℹ️'}
          </div>

          {/* Content */}
          <div className="flex-grow">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">{notif.title}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{notif.message}</p>
            
            {notif.actionLabel && (
              <button 
                onClick={() => onAction(notif)}
                className="mt-3 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-sm transition-colors"
              >
                {notif.actionLabel}
              </button>
            )}
          </div>

          {/* Close */}
          <button 
            onClick={() => onDismiss(notif.id)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default NotificationCenter;
