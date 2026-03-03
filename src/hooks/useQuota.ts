import { useState, useEffect } from 'react';
import { monetizationClient } from '../services/monetization/client';

export interface QuotaStatus {
    allowed: boolean;
    remaining: number; // -1 for unlimited
    reason?: 'quota_exceeded' | 'plan_restriction' | 'expired';
    loading: boolean;
    check: (force?: boolean) => Promise<void>;
}

/**
 * Hook to check if a specific action is allowed by the user's plan.
 * @param capability The metric or feature key to check (e.g., 'notes', 'quizzes', 'exams')
 */
export const useQuota = (capability: string, options?: { forceOnMount?: boolean }): QuotaStatus => {
    const [allowed, setAllowed] = useState(false); // Pessimistic default to prevent auto-start race
    const [remaining, setRemaining] = useState(-1);
    const [loading, setLoading] = useState(true);
    const [reason, setReason] = useState<QuotaStatus['reason']>();

    const check = async (force: boolean = false) => {
        setLoading(true);
        try {
            const result = await monetizationClient.checkEntitlement(capability, force);
            setAllowed(result.allowed);
            setRemaining(result.remaining);
            setReason(result.reason);
        } catch (e) {
            console.error('[useQuota] Failed to check entitlement', e);
            // Fail open (allow) unless strictly blocked
            setAllowed(true);
        } finally {
            setLoading(false);
        }
    };

    // Initial Check & Event Listener
    useEffect(() => {
        check(options?.forceOnMount);

        const handleUpdate = () => {
            console.log('[useQuota] usage updated externally, re-checking:', capability);
            check();
        };

        window.addEventListener('monetization_usage_updated', handleUpdate);
        return () => window.removeEventListener('monetization_usage_updated', handleUpdate);
    }, [capability]);

    return { allowed, remaining, reason, loading, check };
};
