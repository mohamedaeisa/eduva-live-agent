import React, { useState, useEffect } from 'react';
import { useQuota } from '../../hooks/useQuota';
import AlertModal from '../ui/AlertModal';
import ProgressLoader from '../ui/ProgressLoader';
import { AppView } from '../../types';

interface QuotaGuardProps {
    capability: string;
    children: React.ReactElement; // The element to wrap (usually a button)
    onUpgrade?: () => void;
    setView?: (view: AppView) => void;
    onClose?: () => void;
    disabled?: boolean; // Forced disable (external)
    variant?: 'standard' | 'mini' | 'card' | 'inline'; // Polish: Adaptive sizing
    fresh?: boolean; // Force fresh check on mount
}

export const QuotaGuard: React.FC<QuotaGuardProps> = ({
    capability,
    children,
    onUpgrade,
    setView,
    onClose,
    disabled = false,
    variant = 'standard',
    fresh = false
}) => {
    const quota = useQuota(capability, { forceOnMount: fresh });
    const [showModal, setShowModal] = useState(false);
    const [showInitialLoader, setShowInitialLoader] = useState(true);

    // Initial Load Effect - Hide loader when quota check resolves
    useEffect(() => {
        if (!quota.loading) {
            const timer = setTimeout(() => setShowInitialLoader(false), 800);
            return () => clearTimeout(timer);
        }
    }, [quota.loading]);

    // Standard labels and messages based on capability
    const getMetaData = () => {
        switch (capability) {
            case 'notes': return { name: 'Study Notes', limit: 'generation' };
            case 'quizzes': return { name: 'Quizzes', limit: 'attempts' };
            case 'exams': return { name: 'Exams', limit: 'generation' };
            case 'ai_minutes': return { name: 'AI Tutor', limit: 'minutes' };
            case 'radar': return { name: 'AI Guidance', limit: 'Radar' };
            default: return { name: 'this feature', limit: 'usage' };
        }
    };

    const meta = getMetaData();

    const handleClick = (e: React.MouseEvent) => {
        // If loading or already disabled by parent, don't do anything special
        if (quota.loading || disabled) return;

        // If quota is exceeded, BLOCK and show modal
        if (!quota.allowed) {
            e.preventDefault();
            e.stopPropagation();
            setShowModal(true);
            return;
        }

        // Otherwise, the click naturally flows to the child component
    };

    const handleConfirmUpgrade = () => {
        setShowModal(false);
        if (onUpgrade) {
            onUpgrade();
        } else if (setView) {
            setView(AppView.PRICING);
        }
    };

    const handleClose = () => {
        setShowModal(false);
        if (onClose) onClose();
    };

    // We clone the child to inject a 'disabled' state if quota is blocked
    // This provides a visual cue even before the click
    const childProps = children.props as any;

    // Variant-based Styling Logic
    const getLockedStyle = () => {
        if (variant === 'mini') {
            return `opacity-50 cursor-not-allowed !bg-slate-800 !text-slate-500 !border-slate-700 relative overflow-hidden`;
        }
        if (variant === 'card') {
            return `grayscale opacity-80 pointer-events-none relative overflow-visible border-amber-500/30 ring-1 ring-amber-500/20`;
        }
        // Standard (Button)
        return `
            !bg-slate-900 !text-amber-400 !border-amber-500/50 !border-2 
            shadow-[0_0_15px_rgba(245,158,11,0.3)] 
            hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]
            opacity-90 saturate-150 transition-all duration-300
            relative overflow-hidden
        `;
    };

    const enhancedChild = React.cloneElement(children as any, {
        // Literally disable ONLY during loading or if parent forced it
        // If quota is exceeded, we DON'T disable literally so we can catch the click for the modal
        disabled: childProps.disabled || disabled || quota.loading,

        // WORLD-CLASS DESIGN: Premium "Locked but Interactive" State
        className: `
            ${childProps.className || ''} 
            ${(!quota.allowed && !quota.loading) ? getLockedStyle() : ''}
            ${quota.loading ? 'opacity-50 cursor-wait' : ''}
        `.trim(),

        children: (
            <>
                {childProps.children}
                {(!quota.allowed && !quota.loading) && (
                    <>
                        {variant === 'standard' && (
                            <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-900 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm ring-1 ring-slate-900 z-10">
                                Upgrade
                            </span>
                        )}
                        {variant === 'mini' && (
                            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-[1px]">
                                <span className="text-[10px]">🔒</span>
                            </span>
                        )}
                        {variant === 'card' && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px] rounded-[inherit] border border-amber-500/30">
                                <div className="bg-slate-900/90 text-amber-500 px-4 py-2 rounded-xl border border-amber-500/50 shadow-2xl flex items-center gap-2">
                                    <span>🔒</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Locked</span>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </>
        ),

        onClick: (e: React.MouseEvent) => {
            handleClick(e);
            if (quota.allowed && childProps.onClick) {
                childProps.onClick(e);
            }
        },
    });

    return (
        <>
            <ProgressLoader isVisible={quota.loading && showInitialLoader} />
            {enhancedChild}

            <AlertModal
                isOpen={showModal}
                title="Quota Exceeded"
                message={`You have reached your limit for ${meta.name} ${meta.limit} on your current plan.`}
                type="warning"
                confirmLabel="Upgrade Plan"
                cancelLabel="Dismiss"
                onConfirm={handleConfirmUpgrade}
                onClose={handleClose}
                remedy={`Upgrade to a higher plan to unlock more ${meta.name}.`}
            />
        </>
    );
};
