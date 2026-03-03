import { getAiClient, callAiWithRetry } from './client';
import { AI_MODELS } from './constants';
import { DashboardState } from '../../components/dashboard/types';
import { logger } from '../../utils/logger';

/**
 * THE SILENT COACH
 * Purely observational. Generates 1-sentence atmospheric guidance.
 * Never issues commands. Never changes state.
 * 
 * FIX v6.5.2: Removed thinkingConfig budget override to fix 400 error.
 * Allowing model to manage its own reasoning tokens to prevent "Budget 0 is invalid" faults.
 */
export const getSilentCoachWhisper = async (
  state: DashboardState,
  subject: string | null,
  momentum: number
): Promise<string> => {
  const { ai, apiKey, config } = getAiClient('dashboard' as any);

  const context = `
    STATE: ${state}
    SUBJECT: ${subject || 'General'}
    MOMENTUM: ${momentum}/100
  `;

  logger.ai(`SilentCoach REQ: ${state} | Subject: ${subject}`, { context, momentum });

  const systemInstruction = `
    You are the "Silent Coach" of the EDUVA Dashboard.
    ROLE: Provide a single, calm, short sentence of observation or encouragement.
    TONE: Biologic, calm, professional, concise.
    
    RULES:
    1. If STATE is FRICTION: Acknowledge difficulty, suggest a breath or slower pace.
    2. If STATE is FLOW: Reinforce the momentum.
    3. If STATE is IDLE: Inviting, open.
    4. If STATE is RECOVERY: Validating rest.
    5. MAX 12 WORDS.
  `;

  try {
    const startTime = Date.now();
    const response = await callAiWithRetry(ai, {
      model: AI_MODELS.FLASH,
      contents: [{ role: 'user', parts: [{ text: context }] }],
      config: {
        systemInstruction,
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        maxOutputTokens: config.maxOutputTokens
      }
    }, undefined, [], apiKey);

    const duration = Date.now() - startTime;
    const whisper = response.text?.trim();

    if (!whisper || whisper.length === 0) {
      logger.ai("SilentCoach RES: [EMPTY] -> Engaging Reflex", { latency: duration });
      return getReflexWhisper(state);
    }

    logger.ai(`SilentCoach RES: "${whisper}"`, { latency: duration, raw: response.text });
    return whisper;
  } catch (e: any) {
    logger.error('AI', "SilentCoach FAULT:", { error: e.message });
    return getReflexWhisper(state);
  }
};

/**
 * REFLEX SYSTEM (Hard-coded fallbacks for offline/fault states)
 */
const getReflexWhisper = (state: DashboardState): string => {
  switch (state) {
    case 'FRICTION': return "Breath detected. Adjusting neural load.";
    case 'FLOW': return "Momentum sustained. Deep work active.";
    case 'RECOVERY': return "Recalibration in progress. Rest is data.";
    case 'PRIMED': return "Bridge established. Ready for dispatch.";
    default: return "Systems stable. Awaiting intent.";
  }
};
