// Decoupled from main types to prevent circular dependencies
export type LangMap<T> = {
    [K in keyof T]: {
        en: string | LangMap<any>;
        ar: string | LangMap<any>;
    };
};

export const mapLang = <T>(
    obj: any,
    lang: "English" | "Arabic" | "en" | "ar"
): any => {
    const targetLang = lang === "Arabic" || lang === 'ar' ? 'ar' : 'en';

    if (!obj || typeof obj !== 'object') return obj;

    // Check if this is a leaf node (translation object)
    if ('en' in obj && 'ar' in obj) {
        return obj[targetLang];
    }

    // Otherwise, it's a nested grouping object, recurse
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [
            k,
            mapLang(v, lang)
        ])
    );
};
