/**
 * AI Model Constants
 * Unified reference for all AI models used in the system.
 */

export const AI_MODELS = {
    // Flash models (fast, lower cost)
    FLASH: 'gemini-2.0-flash',
    FLASH_LITE: 'gemini-2.5-flash-lite',
    FLASH_EXP: 'gemini-2.0-flash-exp',
    GEMINI_REALTIME: 'gemini-2.5-flash-native-audio-preview-12-2025',

    // Pro models (high reasoning)
    PRO: 'models/gemini-1.5-pro',

    // Gemma models (open weights)
    GEMMA_27B: 'gemma-3-27b',

    // Legacy / Fallbacks
    FALLBACK: 'gemini-3-flash-preview'
} as const;

export type AiModel = typeof AI_MODELS[keyof typeof AI_MODELS];

/**
 * 🧠 MODEL CAPABILITIES (v2 Router)
 * Defines what each model can physically do.
 */
export const MODEL_CAPABILITIES = {
    [AI_MODELS.PRO]: { thinking: true, realtime: false, cost: 'high' },
    [AI_MODELS.FALLBACK]: { thinking: true, realtime: false, cost: 'medium' },
    [AI_MODELS.FLASH_LITE]: { thinking: true, realtime: false, cost: 'low' },
    [AI_MODELS.FLASH]: { thinking: false, realtime: false, cost: 'low' },
    [AI_MODELS.GEMMA_27B]: { thinking: false, realtime: false, cost: 'free' }
};


export interface ModuleAiConfig {
    defaultModel: AiModel; // Kept for legacy compatibility
    modelStack: AiModel[]; // v3 Router: Deterministic Stack
    temperature: number;
    topP: number;
    topK: number;
    maxOutputTokens: number;
    requiresThinking?: boolean;
    expectJson?: boolean;  // v3: Enforces JSON validation
}

export const AUTHORIZED_MODELS = Object.values(AI_MODELS);


/**
 * MODULE-SPECIFIC AI CONFIGURATIONS (v3 Router)
 * Deterministic stacks and tuned parameters for each service.
 */
export const MODULE_CONFIGS: Record<string, ModuleAiConfig> = {
    notes: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE, AI_MODELS.FLASH],
        temperature: 0.0,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 800
    },
    quiz: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [
            AI_MODELS.FLASH_LITE,
            AI_MODELS.FLASH,
            AI_MODELS.FALLBACK
        ],
        expectJson: true, // Forces JSON validation & strict MIME type
        temperature: 1.0,
        requiresThinking: true,
        topP: 0.95,
        topK: 64,
        maxOutputTokens: 16384
    },
    exam: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE, AI_MODELS.FLASH],
        temperature: 0.0, // Strictness for exams
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 800
    },
    tutor: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE],
        temperature: 0.5, // More conversational
        topP: 0.9,
        topK: 20,
        maxOutputTokens: 400
    },
    utility: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE],
        temperature: 0.0,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 200
    },
    cheatsheet: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE],
        temperature: 0.2,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 500
    },
    parent: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE],
        temperature: 0.5,
        topP: 0.9,
        topK: 10,
        maxOutputTokens: 600
    },
    privateteacher: {
        defaultModel: AI_MODELS.GEMINI_REALTIME,
        modelStack: [AI_MODELS.GEMINI_REALTIME, AI_MODELS.FLASH_EXP],
        temperature: 0.6,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 300
    },
    ingestion: {
        defaultModel: AI_MODELS.FLASH_LITE,
        // v3: Stack supports thinking. Graceful downgrade for Flash models implemented in client.ts.
        modelStack: [AI_MODELS.FLASH_LITE, AI_MODELS.FLASH_LITE, AI_MODELS.FALLBACK],
        requiresThinking: true,
        temperature: 0.0,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 16384
    },
    dashboard: {
        defaultModel: AI_MODELS.FLASH_LITE,
        modelStack: [AI_MODELS.FLASH_LITE],
        temperature: 0.2,
        topP: 1.0,
        topK: 1,
        maxOutputTokens: 500
    }
};

export type ServiceId = 'notes' | 'quiz' | 'exam' | 'tutor' | 'utility' | 'cheatsheet' | 'parent' | 'privateteacher' | 'dashboard' | 'ingestion';
