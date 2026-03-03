import { GoogleGenAI } from "@google/genai";
import { logger } from '../../utils/logger';
import {
  AI_MODELS,
  AUTHORIZED_MODELS as CONST_AUTHORIZED_MODELS,
  MODULE_CONFIGS,
  ServiceId,
  MODEL_CAPABILITIES,
  AiModel
} from './constants';

export const AUTHORIZED_MODELS = CONST_AUTHORIZED_MODELS;
export const FALLBACK_MODEL = AI_MODELS.FALLBACK;

/**
 * AI v1.6 DETERMINISM GUARD
 * Temperature locked to 0.0 for core academic tasks.
 */
export const STRICT_GENERATION_CONFIG = {
  temperature: 0.0,
  topP: 1.0,
  topK: 1,
};


// --- 🧠 AI ROUTER STATE (Service-Scoped) ---
// Structure: [ServiceId][ModelId] = FailureCount
const MODEL_HEALTH: Record<string, Record<string, number>> = {};
// Structure: [ServiceId][ModelId] = CooldownExpiryTimestamp
const MODEL_COOLDOWN: Record<string, Record<string, number>> = {};

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TEMP_FAILURES = 3;


const getServiceSpecificKey = (serviceId: ServiceId): string | undefined => {
  switch (serviceId) {
    case 'notes': return process.env.API_KEY_NOTES;
    case 'quiz': return process.env.API_KEY_QUIZ;
    case 'exam': return process.env.API_KEY_EXAM;
    case 'tutor': return process.env.API_KEY_TUTOR;
    case 'utility': return process.env.API_KEY_UTILITY;
    case 'cheatsheet': return process.env.API_KEY_CHEATSHEET;
    case 'parent': return process.env.API_KEY_PARENT;
    case 'privateteacher': return process.env.API_KEY_PRIVATETEACHER;
    case 'ingestion': return process.env.API_KEY_INGESTION;
    default: return undefined;
  }
};

export const sanitizeModelName = (modelName: string): string => {
  const name = (modelName || FALLBACK_MODEL).toLowerCase();

  // 1. Explicit Version Keywords
  if (name.includes('gemini-3-flash')) return AI_MODELS.FLASH; // 3-Flash
  if (name.includes('gemini-3-pro')) return AI_MODELS.PRO;
  if (name.includes('gemini-2.5') || name.includes('flash-lite')) return AI_MODELS.FLASH_LITE;
  if (name.includes('gemini-2.0') && name.includes('flash')) return AI_MODELS.FLASH;
  if (name.includes('gemini-live-2.5')) return AI_MODELS.GEMINI_REALTIME;

  // 2. Direct Match
  const authorized = Object.values(AI_MODELS);
  if (authorized.includes(modelName as any)) return modelName;

  // 3. Fallback
  return FALLBACK_MODEL;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getAiClient = (serviceId: ServiceId, onStatus?: (msg: string) => void) => {
  const specificKey = getServiceSpecificKey(serviceId);
  const masterKey = process.env.API_KEY;
  const apiKey = (specificKey && specificKey.length > 0) ? specificKey : masterKey;

  if (!apiKey || apiKey.length < 5) {
    const err = `Configuration Error: Missing API Key for [${serviceId}].`;
    logger.error('AI', err);
    throw new Error(err);
  }

  const moduleConfig = MODULE_CONFIGS[serviceId] || MODULE_CONFIGS.utility;
  const debugKeyName = (specificKey && specificKey.length > 0) ? `API_KEY_${serviceId.toUpperCase()}` : 'API_KEY_MASTER';

  logger.ai(`[getAiClient] Service: ${serviceId} | Model: ${moduleConfig.defaultModel} | Key: ${debugKeyName}`);

  return {
    ai: new GoogleGenAI({
      apiKey: apiKey
    }),
    apiKey: apiKey,
    keyName: debugKeyName,
    config: moduleConfig,
    serviceId // Pass serviceId for router auditing
  };
};

// --- 🔍 ROUTER HELPERS ---

const classifyError = (e: any): "permanent" | "temporary" | "quota" | "timeout" | "unknown" => {
  if (!e) return "unknown";
  const msg = (e.message || "").toUpperCase();

  if (e.status === 400 || msg.includes("INVALID_ARGUMENT") || msg.includes("NOT SUPPORTED")) return "permanent";
  if (e.status === 503 || msg.includes("UNAVAILABLE") || msg.includes("OVERLOADED")) return "temporary";
  if (e.status === 429 || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("QUOTA")) return "quota";
  if (msg.includes("TIMED OUT") || msg.includes("TIMEOUT")) return "timeout"; // Timeout is a health issue

  return "unknown";
};

const isModelHealthy = (serviceId: string, model: string): boolean => {
  // Ensure state exists
  if (!MODEL_COOLDOWN[serviceId]) MODEL_COOLDOWN[serviceId] = {};

  const cooldown = MODEL_COOLDOWN[serviceId][model];
  if (cooldown && Date.now() < cooldown) {
    return false; // Still in cooldown
  }

  // If cooldown expired, clear it
  if (cooldown) delete MODEL_COOLDOWN[serviceId][model];
  return true;
};

const recordFailure = (serviceId: string, model: string, errorType: "temporary" | "timeout") => {
  if (!MODEL_HEALTH[serviceId]) MODEL_HEALTH[serviceId] = {};
  if (!MODEL_COOLDOWN[serviceId]) MODEL_COOLDOWN[serviceId] = {};

  const failures = (MODEL_HEALTH[serviceId][model] || 0) + 1;
  MODEL_HEALTH[serviceId][model] = failures;

  logger.warn('AI', `[CIRCUIT_BREAKER] ${serviceId}:${model} Failure ${failures}/${MAX_TEMP_FAILURES}`);

  if (failures >= MAX_TEMP_FAILURES) {
    const jitter = Math.floor(Math.random() * 30000); // 0-30s jitter
    MODEL_COOLDOWN[serviceId][model] = Date.now() + COOLDOWN_MS + jitter;
    logger.error('AI', `[CIRCUIT_BREAKER] 🛑 OPENED for ${serviceId}:${model}. Disabled for 5m.`);
  }
};

/**
 * CLEAN JSON RESPONSE
 * Stares deep into the model's output and extracts the raw JSON.
 * Strips markdown code blocks (```json ... ```) which often confuse strict parsing.
 */
export const cleanJsonResponse = (text: string): string => {
  if (!text) return "";

  let cleaned = text.trim();

  // 1. Detect and Extract Markdown Blocks (Robust)
  // Matches ```json ... ``` or just ``` ... ``` anywhere in the string
  const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleaned.match(markdownRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  // 2. Locate boundaries (Preamble/Postscript Strip)
  // Support both JSON objects {...} and arrays [...]
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  // Determine which JSON boundary comes first
  const objectValid = firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace;
  const arrayValid = firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket;

  if (objectValid && arrayValid) {
    // Use whichever appears first in the text
    if (firstBrace < firstBracket) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else {
      cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    }
  } else if (objectValid) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  } else if (arrayValid) {
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
  }

  return cleaned;
};


// --- 🛰️ ROUTER v3 (DETERMINISTIC) ---
export const callAiWithRetry = async (
  ai: GoogleGenAI,
  params: {
    contents: any,
    config: any,
    model?: string
  },
  serviceId: ServiceId,
  history: any[] = [],
  apiKey?: string
): Promise<{ text: string, usage?: any }> => {

  // 1. Resolve Module Config (Hard Guard)
  const moduleConfig = MODULE_CONFIGS[serviceId];
  if (!moduleConfig) {
    const err = `CRITICAL: Invalid ServiceId [${serviceId}]. Routing blocked to prevent silent failure.`;
    logger.error('AI', err);
    throw new Error(err);
  }

  // Use explicit model override if provided, otherwise default to module stack
  const stack = params.model ? [params.model] : moduleConfig.modelStack;

  // 2. Initialize Router State
  const startTimeResult = Date.now();
  const TIMEOUT_MS = 45000; // 45s Global Router Timeout

  logger.ai(`[AI_ROUTER] Service=${serviceId} | Routing Request...`);
  logger.debug('AI', 'Payload:', { stack, config: moduleConfig });

  let lastError: any = null;

  // 3. Deterministic Loop
  for (const model of stack) {
    // A. Global Timeout Check
    if (Date.now() - startTimeResult > TIMEOUT_MS) {
      logger.error('AI', `❌ ROUTER_TIMEOUT [${serviceId}]. Executed > ${TIMEOUT_MS}ms.`);
      throw new Error(`AI_ROUTER_TIMEOUT: Request took too long.`);
    }

    // B. Health Check (Circuit Breaker)
    const failures = MODEL_HEALTH[serviceId]?.[model] || 0;
    const cooldown = MODEL_COOLDOWN[serviceId]?.[model] || 0;

    if (failures >= 3) {
      if (Date.now() < cooldown) {
        logger.warn('AI', `⚠️ SKIP [${model}]: Unhealthy (${failures} failures). Cooldown until ${new Date(cooldown).toISOString()}`);
        continue;
      } else {
        // Reset health after cooldown
        logger.info('AI', `♻️ RETRY [${model}]: Cooldown expired. Testing health.`);
        if (!MODEL_HEALTH[serviceId]) MODEL_HEALTH[serviceId] = {};
        MODEL_HEALTH[serviceId][model] = 0;
      }
    }

    // C. Capability Check (Thinking)
    // We no longer SKIP incompatible models here. 
    // Instead, we just don't inject the thinkingConfig later (Best Effort Reasoning).
    const caps = MODEL_CAPABILITIES[model];

    // D. Prepare Config (Sanitization)
    const requestConfig: any = {
      ...moduleConfig,
      ...(params.config || {}) // Explicitly merge per-call overrides (Schema, Temp, etc.)
    };

    // 🛡️ INTERNAL STRIP (Prevent leaking router logic to SDK)
    delete requestConfig.modelStack;
    delete requestConfig.defaultModel;
    delete requestConfig.requiresThinking;
    delete requestConfig.expectJson;
    delete requestConfig.fastModel;
    delete requestConfig.systemInstruction; // Handled separately

    // 🔥 Strict JSON Enforcement (Override if module says so)
    if (moduleConfig.expectJson) {
      requestConfig.responseMimeType = "application/json";
    }

    // 🧠 THINKING CONFIG INJECTION
    // Inject thinkingConfig only for models that support it.
    if (moduleConfig.requiresThinking && caps?.thinking) {
      const budget = params.config?.thinkingConfig?.thinkingBudget ?? 2048;
      requestConfig.thinkingConfig = { thinkingBudget: budget };
    }

    // ⚠️ Model-Specific Parameter Strip (reasoning models hate temperature/topP/topK)
    if (caps?.thinking) {
      delete requestConfig.temperature;
      delete requestConfig.topP;
      delete requestConfig.topK;
    }

    try {
      logger.ai(`REQUEST [${model}]`);
      const start = Date.now();
      logger.debug('AI', 'Payload:', { stack, maxOutputTokens: requestConfig.maxOutputTokens });

      // E. EXECUTE REQUEST (Direct SDK v1.30+ Pattern)
      const result = await (ai as any).models.generateContent({
        model: model,
        contents: params.contents,
        systemInstruction: params.config?.systemInstruction,
        config: requestConfig
      });

      // 🛡️ Resilient Text Extraction (Handles both @google/genAI and legacy signatures)
      const text = typeof result.text === 'function' ? result.text() :
        (result.text || result.response?.text() || "");

      const duration = Date.now() - start;

      logger.ai(`RESPONSE [${model}] - ${duration}ms`);

      // F. 🛡️ DATA VALIDATION (The Guard)
      let finalizedText = text;

      // 1. Empty Check
      if (!text || text.trim().length === 0) {
        logger.warn('AI', `❌ EMPTY_RESPONSE [${model}]. Triggering fallback.`);
        lastError = new Error("EMPTY_RESPONSE_FROM_AI");
        continue;
      }

      if (moduleConfig.expectJson) {
        try {
          finalizedText = cleanJsonResponse(text);
          JSON.parse(finalizedText); // Strict Check
        } catch (jsonErr) {
          const sample = text.substring(0, 200).replace(/\n/g, ' ');
          logger.warn('AI', `❌ INVALID_JSON [${model}] | Length: ${text.length} | Sample: "${sample}..."`);
          lastError = new Error("INVALID_JSON_FORMAT");
          continue; // Skip without punishing health
        }
      }

      // G. SUCCESS: Reset Health & Return
      if (!MODEL_HEALTH[serviceId]) MODEL_HEALTH[serviceId] = {};
      MODEL_HEALTH[serviceId][model] = 0; // Reset failures
      return {
        text: finalizedText,
        usage: result.usageMetadata || result.response?.usageMetadata
      };

    } catch (error: any) {
      const errType = classifyError(error);
      logger.error('AI', `❌ AI_ERROR [${model}] Type: ${errType}`);

      // H. FAILURE HANDLING
      if (!MODEL_HEALTH[serviceId]) MODEL_HEALTH[serviceId] = {};
      if (!MODEL_COOLDOWN[serviceId]) MODEL_COOLDOWN[serviceId] = {};

      // Increment Failure Count
      MODEL_HEALTH[serviceId][model] = (MODEL_HEALTH[serviceId][model] || 0) + 1;

      if (MODEL_HEALTH[serviceId][model] >= 3) {
        MODEL_COOLDOWN[serviceId][model] = Date.now() + COOLDOWN_MS;
        logger.error('AI', `🚫 CIRCUIT OPEN [${model}]: Too many failures. Paused for 5m.`);
      }

      lastError = error;
      // Continue to next model in stack...
    }
  }

  // 4. Exhaustion
  logger.error('AI', `💀 ROUTER_EXHAUSTION: All models in stack failed for [${serviceId}].`);
  throw lastError || new Error("AI_ROUTER_EXHAUSTION: No models available.");
};


