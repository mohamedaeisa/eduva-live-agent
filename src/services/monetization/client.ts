import { auth, db } from '../firebaseConfig'; // Adjust path if needed (it's in services/firebaseConfig)
import type { EntitlementResult, Plan, BillingResponse, BillingEvent } from '../../types';

const API_BASE = '/api/monetization';

const DEBUG_LOGGING = true;

// Cache Configuration
const SHORT_TTL_MS = 5 * 60 * 1000; // 5 minutes (Entitlements/Usage) - Invalidated on action
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for static-ish data (plans/config)

// Cache State
interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const _cache: Record<string, CacheEntry<any>> = {};
const _activeRequests: Record<string, Promise<any> | undefined> = {};
const _lastIncrementTime: Record<string, number> = {};

function logTransaction(stage: 'REQ' | 'RES' | 'ERR' | 'CACHE', endpoint: string, details: any) {
    if (!DEBUG_LOGGING) return;
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const color = stage === 'REQ' ? '#3b82f6' : stage === 'RES' ? '#10b981' : stage === 'CACHE' ? '#8b5cf6' : '#ef4444';
    console.log(
        `%c[${stage}] ${endpoint} @ ${timestamp}`,
        `color: ${color}; font-weight: bold`,
        details
    );
}

async function getAuthHeaders(): Promise<HeadersInit> {
    try {
        if (!auth) return {};
        const user = auth.currentUser;
        if (!user) return {};
        const token = await user.getIdToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    } catch (e) {
        console.warn('Auth headers failed generation:', e);
        return {};
    }
}

/**
 * Helper to safely parse JSON
 */
async function safeJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error(`Invalid API Response: ${text.substring(0, 100)}...`);
    }
}

/**
 * Generic Request Deduplicator & Cacher
 */
async function deduplicateRequest<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = CACHE_TTL_MS,
    forceRefresh: boolean = false
): Promise<T> {
    const now = Date.now();

    // 1. Check Cache (if not forced)
    if (!forceRefresh && _cache[key]) {
        const entry = _cache[key];
        if (now - entry.timestamp < ttl) {
            logTransaction('CACHE', key, { age: now - entry.timestamp });
            return entry.data;
        }
    }

    // 2. Check In-Flight Promises (Deduplication)
    if (!forceRefresh && _activeRequests[key]) {
        logTransaction('CACHE', key, { status: 'deduplicated_join' });
        return _activeRequests[key];
    }

    // 3. Execute Fetch
    const promise = fetcher().then(data => {
        _cache[key] = { data, timestamp: Date.now() };
        delete _activeRequests[key]; // Cleanup
        return data;
    }).catch(err => {
        delete _activeRequests[key]; // Cleanup on error
        throw err;
    });

    _activeRequests[key] = promise;
    return promise;
}

export const monetizationClient = {
    // --- AUTO-BATCHING QUEUE ---
    _batchQueue: [] as { capability: string; resolve: (res: EntitlementResult) => void; reject: (err: any) => void }[],
    _batchTimer: null as any,

    _processBatch: async function () {
        const queue = [...this._batchQueue];
        this._batchQueue = [];
        this._batchTimer = null;

        if (queue.length === 0) return;

        const capabilities = Array.from(new Set(queue.map(q => q.capability)));

        try {
            logTransaction('REQ', '/entitlement/bulk (AUTO)', { count: capabilities.length, capabilities });
            const results = await this.checkEntitlementsBulk(capabilities);

            queue.forEach(q => {
                const res = results[q.capability] || { allowed: true, remaining: 0, reason: 'quota_exceeded' };
                q.resolve(res);
            });
        } catch (error) {
            queue.forEach(q => q.reject(error));
        }
    },

    /**
     * Fetch all active plans (Public/Admin)
     */
    getPlans: async (force: boolean = false): Promise<Plan[]> => {
        const endpoint = '/billing/plans';
        return deduplicateRequest(endpoint, async () => {
            logTransaction('REQ', endpoint, { force });
            const response = await fetch(`${API_BASE}${endpoint}`);
            if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);
            const data = await safeJson<{ plans: Plan[] }>(response);
            logTransaction('RES', endpoint, { count: data.plans?.length });
            return data.plans || [];
        }, CACHE_TTL_MS, force);
    },

    /**
     * Fetch monetization config (costs & packages)
     */
    getConfig: async (force: boolean = false): Promise<{ costs: any; packages: any[] }> => {
        const endpoint = '/config/get';
        return deduplicateRequest(endpoint, async () => {
            logTransaction('REQ', endpoint, { force });
            const response = await fetch(`${API_BASE}${endpoint}`);
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await safeJson<any>(response);
            logTransaction('RES', endpoint, data);
            return data;
        }, CACHE_TTL_MS, force);
    },

    /**
     * Update monetization config (Admin)
     */
    updateConfig: async (config: { costs: any; packages: any[] }): Promise<void> => {
        const endpoint = '/config/update';
        logTransaction('REQ', endpoint, config);
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(config)
            });

            if (!response.ok) throw new Error(`Config Update Failed: ${response.status}`);

            // Invalidate Cache
            delete _cache['/config/get'];
            logTransaction('RES', endpoint, { success: true, cacheCleared: true });
        } catch (error) {
            logTransaction('ERR', endpoint, error);
            throw error;
        }
    },

    /**
     * Check entitlement (With automatic batching & deduplication)
     */
    checkEntitlement: async function (capability: string, force: boolean = false): Promise<EntitlementResult> {
        // If forced or already cached, skip batching for speed
        const cacheKey = `/entitlement/check:${capability}`;
        if (!force && _cache[cacheKey]) {
            const entry = _cache[cacheKey];
            if (Date.now() - entry.timestamp < SHORT_TTL_MS) {
                return entry.data;
            }
        }

        // If forced, go direct (don't wait for batching window)
        if (force) {
            const bulk = await this.checkEntitlementsBulk([capability], true);
            return bulk[capability] || { allowed: true, remaining: 0 };
        }

        return new Promise((resolve, reject) => {
            this._batchQueue.push({ capability, resolve, reject });

            if (!this._batchTimer) {
                this._batchTimer = setTimeout(() => this._processBatch(), 50); // 50ms window to collect components
            }
        });
    },

    /**
     * Bulk check multiple capabilities in one round-trip
     */
    checkEntitlementsBulk: async (capabilities: string[], force: boolean = false): Promise<Record<string, EntitlementResult>> => {
        const endpoint = '/entitlement/bulk';
        const cacheKey = `${endpoint}:${capabilities.sort().join(',')}`;

        return deduplicateRequest(cacheKey, async () => {
            logTransaction('REQ', endpoint, { capabilities });
            try {
                const headers = await getAuthHeaders();
                const response = await fetch(`${API_BASE}${endpoint}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ capabilities })
                });

                if (!response.ok) throw new Error(`Bulk Entitlement Check Failed: ${response.status}`);
                const data = await safeJson<Record<string, EntitlementResult>>(response);

                // Also seed individual caches to avoid redundant calls
                Object.entries(data).forEach(([cap, res]) => {
                    _cache[`/entitlement/check:${cap}`] = { data: res, timestamp: Date.now() };
                });

                logTransaction('RES', endpoint, { processed: Object.keys(data).length });
                return data;
            } catch (error) {
                logTransaction('ERR', endpoint, error);
                // CRITICAL SAFETY: If we are checking quotas and the network fails, 
                // we should NOT default to 'allowed: true' for restricted items.
                return capabilities.reduce((acc, cap) => ({
                    ...acc,
                    [cap]: {
                        allowed: false,
                        remaining: 0,
                        reason: 'Network error during entitlement check'
                    }
                }), {});
            }
        }, SHORT_TTL_MS, force);
    },

    /**
     * Initialize checkout session
     */
    startCheckout: async (planId: string, cycle: 'MONTHLY' | 'YEARLY'): Promise<BillingResponse> => {
        const endpoint = '/billing/checkout';
        logTransaction('REQ', endpoint, { planId, cycle });
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ planId, cycle })
            });

            if (!response.ok) {
                // Try to parse specific error message from backend
                try {
                    const errData = await response.json();
                    logTransaction('ERR', endpoint, errData);
                    return {
                        error: errData.error || 'CHECKOUT_FAILED',
                        message: errData.message || `Request Failed: ${response.status}`
                    };
                } catch (parseErr) {
                    throw new Error(`Checkout Initialization Failed: ${response.status}`);
                }
            }

            const data = await safeJson<BillingResponse>(response);
            logTransaction('RES', endpoint, data);
            return data;
        } catch (error: any) {
            logTransaction('ERR', endpoint, error);
            return { error: 'CHECKOUT_API_FAILED', message: error.message || 'Network Error' };
        }
    },

    /**
     * Purchase credits
     */
    buyCredits: async (packageId: string): Promise<{ checkoutUrl?: string; error?: string; message?: string }> => {
        const endpoint = '/billing/checkout-credits';
        logTransaction('REQ', endpoint, { packageId });
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ packageId })
            });

            if (!response.ok) {
                // Try to parse specific error message from backend
                try {
                    const errData = await response.json();
                    logTransaction('ERR', endpoint, errData);
                    return {
                        error: errData.error || 'CHECKOUT_FAILED',
                        message: errData.message || `Request Failed: ${response.status}`
                    };
                } catch (parseErr) {
                    throw new Error(`Credit Checkout Failed: ${response.status}`);
                }
            }

            const data = await safeJson<{ checkoutUrl: string }>(response);
            logTransaction('RES', endpoint, data);
            return data;
        } catch (error: any) {
            logTransaction('ERR', endpoint, error);
            return { error: 'CHECKOUT_API_FAILED', message: error.message || 'Network Error' };
        }
    },

    /**
     * Increment usage (Debounced for safety on critical metrics)
     */
    incrementUsage: async (metric: 'quizzesUsed' | 'notesUsed' | 'aiSecondsUsed' | 'examsUsed' | 'trainedMaterialUsed', amount: number = 1): Promise<void> => {
        // Safety: Debounce rapid increments (e.g. double clicks) for heavy actions
        if (metric !== 'aiSecondsUsed') {
            const now = Date.now();
            const last = _lastIncrementTime[metric] || 0;
            if (now - last < 2000) {
                console.warn(`[Monetization] Debounced rapid usage increment for ${metric}`);
                return;
            }
            _lastIncrementTime[metric] = now;
        }

        const endpoint = '/usage/increment';
        logTransaction('REQ', endpoint, { metric, amount });
        try {
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ metric, amount })
            });

            if (!response.ok) throw new Error(`Usage Increment Failed: ${response.status}`);

            // Invalidate Usage Cache
            delete _cache['/usage/get'];

            // CRITICAL FIX: Invalidate ALL Entitlement Caches (bulk too), otherwise blocking logic is stale
            Object.keys(_cache).forEach(key => {
                if (key.startsWith('/entitlement')) {
                    delete _cache[key];
                }
            });

            logTransaction('RES', endpoint, { success: true, cacheCleared: true });

            // Dispatch event to notify hooks (like useQuota) to re-check
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('monetization_usage_updated'));
            }

        } catch (error) {
            logTransaction('ERR', endpoint, error);
        }
    },

    /**
     * Fetch user's billing history
     */
    getBillingHistory: async (force: boolean = false): Promise<BillingEvent[]> => {
        const endpoint = '/billing/history';
        return deduplicateRequest(endpoint, async () => {
            logTransaction('REQ', endpoint, { force });
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, { headers });
            if (!response.ok) throw new Error(`Billing History Fetch Failed: ${response.status}`);
            const data = await safeJson<{ events: BillingEvent[] }>(response);
            logTransaction('RES', endpoint, { count: data.events?.length });
            return data.events || [];
        }, 60000, force); // 1 minute cache for history
    },

    /**
     * Fetch user's current usage stats
     */
    getUsage: async (force: boolean = false): Promise<{ quizzesUsed: number; aiSecondsUsed: number; notesUsed: number; examsUsed: number; trainedMaterialUsed: number }> => {
        const endpoint = '/usage/get';
        return deduplicateRequest(endpoint, async () => {
            logTransaction('REQ', endpoint, { force });
            const headers = await getAuthHeaders();
            const response = await fetch(`${API_BASE}${endpoint}`, { headers });
            if (!response.ok) throw new Error(`Usage Fetch Failed: ${response.status}`);
            const data = await safeJson<{ usage: any }>(response);
            logTransaction('RES', endpoint, data.usage);
            return data.usage || { quizzesUsed: 0, aiSecondsUsed: 0, notesUsed: 0, examsUsed: 0, trainedMaterialUsed: 0 };
        }, SHORT_TTL_MS, force); // Short TTL for usage
    },

    /**
     * Pre-fetch all dashboard data in parallel
     */
    async prefetchDashboard() {
        console.log('[Monetization] Prefetching dashboard data...');
        Promise.all([
            this.getPlans().catch(e => console.warn('Prefetch plans failed', e)),
            this.getConfig().catch(e => console.warn('Prefetch config failed', e)),
            this.getBillingHistory().catch(e => console.warn('Prefetch history failed', e)),
            this.getUsage().catch(e => console.warn('Prefetch usage failed', e))
        ]);
    }
};
