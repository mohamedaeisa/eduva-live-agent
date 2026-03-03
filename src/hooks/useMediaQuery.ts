import { useState, useEffect } from 'react';

/**
 * Hook to detect if a media query matches.
 * Usage: const isMobile = useMediaQuery('(max-width: 768px)');
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia(query);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);

        // Set initial value
        setMatches(mediaQuery.matches);

        // Add listener
        mediaQuery.addEventListener('change', handler);

        return () => mediaQuery.removeEventListener('change', handler);
    }, [query]);

    return matches;
}
