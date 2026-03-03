export const FEATURE_FLAGS = {
    // Use environment variable or default to true/false
    ENABLE_CURRICULUM_MODE: true, // Master Kill Switch for vNext

    // Granular flags
    ENABLE_ARABIC_STEM_FIX: true,
    ENABLE_ARCHETYPE_CACHE: true
};

export function isFeatureEnabled(flag: keyof typeof FEATURE_FLAGS): boolean {
    // In a real app, this might check Remote Config (Firebase) or DB
    return FEATURE_FLAGS[flag];
}
