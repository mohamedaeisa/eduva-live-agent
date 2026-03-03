import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import Card from './Card';
import Button from './Button';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'warning' | 'error' | 'info' | 'system';
  faultCode?: string;
  remedy?: string;
}

const AlertModal: React.FC<AlertModalProps> = ({
  isOpen,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = "Acknowledge",
  cancelLabel = "Dismiss",
  type = 'warning',
  faultCode,
  remedy
}) => {
  const [showDetails, setShowDetails] = useState(false);
  if (!isOpen) return null;

  const getTheme = () => {
    switch (type) {
      case 'error': return { icon: '🚫', border: 'border-red-500', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', btn: 'bg-red-600' };
      case 'system': return { icon: '⚙️', border: 'border-slate-800', bg: 'bg-slate-50 dark:bg-slate-900/50', text: 'text-slate-700 dark:text-slate-300', btn: 'bg-slate-900' };
      case 'info': return { icon: 'ℹ️', border: 'border-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-400', btn: 'bg-indigo-600' };
      default: return { icon: '⚠️', border: 'border-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', btn: 'bg-amber-600' };
    }
  };

  const theme = getTheme();

  // Use Portal to escape parent stacking contexts (overflow/transforms)
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 animate-fade-in safe-area-padding">
      <Card className={`w-full max-w-sm bg-white dark:bg-slate-900 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] border-t-[8px] ${theme.border} rounded-[2rem] p-0 overflow-hidden relative z-[10000]`}>

        {/* Header Section */}
        <div className="p-6 pb-2 text-center">
          <div className={`w-14 h-14 ${theme.bg} rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 text-2xl shadow-inner border border-white/10`}>
            {theme.icon}
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight tracking-tight mb-1">
            {title}
          </h3>
          {faultCode && (
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2 opacity-60">
              ID: {faultCode}
            </p>
          )}
        </div>

        {/* Message Body */}
        <div className="px-6 pb-6">
          <div className={`${theme.bg} p-4 rounded-[1.5rem] border border-white/5 shadow-inner`}>
            <p className={`text-xs font-bold leading-relaxed ${theme.text}`}>
              {message}
            </p>
            {remedy && (
              <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5">
                <p className="text-[9px] font-black uppercase text-slate-500 mb-1 tracking-widest flex items-center gap-2">
                  <span>💡</span> Recommended Action
                </p>
                <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 italic">
                  {remedy}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
          <div className="flex gap-2">
            {onConfirm && (
              <Button
                variant="outline"
                onClick={() => {
                  console.log('[AlertModal] Cancel/Close clicked');
                  onClose();
                }}
                className="flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.2em]"
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              onClick={() => {
                console.log('[AlertModal] Confirm clicked. onConfirm exists:', !!onConfirm);
                if (onConfirm) onConfirm();
                else onClose();
              }}
              className={`flex-grow py-3 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] shadow-xl border-none ${theme.btn}`}
            >
              {confirmLabel || (onConfirm ? "Proceed" : "OK")}
            </Button>
          </div>

          <p className="text-center text-[7px] font-bold text-slate-400 uppercase tracking-widest opacity-40">
            EDUVA Intelligence v6.5
          </p>
        </div>
      </Card>
    </div>,
    document.body
  );
};

export default AlertModal;