import { useMemo } from 'react';
import { TRANSLATIONS } from '../constants';
import { Language } from '../types';

/**
 * useTranslation Hook
 * 
 * Returns translation object based on current app language.
 * Does NOT depend on user profile fetch timing.
 * 
 * Usage:
 *   const { t } = useTranslation(appLanguage);
 *   return <h1>{t.parentHub}</h1>;
 * 
 * @param appLanguage - Current app language (from App.tsx state)
 * @returns Translation object for current language
 */
export const useTranslation = (appLanguage: Language) => {
    const t = useMemo(() => {
        return TRANSLATIONS[appLanguage] || TRANSLATIONS[Language.ENGLISH];
    }, [appLanguage]);

    return {
        t,
        dir: appLanguage === Language.ARABIC ? 'rtl' : 'ltr',
        lang: appLanguage === Language.ARABIC ? 'ar' : 'en'
    };
};

/**
 * Fallback for development (allows missing keys without breaking)
 * Use ONLY during development. Remove before production.
 */
export const t = (key: string, defaultValue?: string) => {
    // This is a simple fallback helper for quick development
    // Should be replaced with proper useTranslation hook in components
    return defaultValue || key;
};
