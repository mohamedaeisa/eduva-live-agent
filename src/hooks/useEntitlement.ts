import { useState, useEffect } from 'react';
import { monetizationClient } from '../services/monetization/client';
import type { EntitlementResult } from '../types';
import { auth } from '../services/firebaseConfig'; // To re-trigger on auth state change

export function useEntitlement(capability: string) {
    const [result, setResult] = useState<EntitlementResult>({ allowed: false, remaining: 0, reason: undefined });
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState(auth.currentUser);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((u) => {
            setUser(u);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        let mounted = true;

        async function check() {
            if (!user) {
                if (mounted) {
                    setResult({ allowed: false, remaining: 0, reason: 'quota_exceeded' }); // Treat as no access
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            const res = await monetizationClient.checkEntitlement(capability);
            if (mounted) {
                setResult(res);
                setLoading(false);
            }
        }

        check();

        return () => { mounted = false; };
    }, [capability, user]); // Re-run if capability or user changes

    return { ...result, loading };
}
