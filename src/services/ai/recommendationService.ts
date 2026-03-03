import { getAiClient, callAiWithRetry } from './client';
import { getStudentMasteryStats, sendTelemetry } from '../telemetryBrainService';
import { UserProfile, AiRecommendationEvent } from '../../types';
import { logger } from '../../utils/logger';

/**
 * EDUVA BRAIN LAYER: AI Recommendation Engine
 */

export const generateLearningRecommendations = async (user: UserProfile) => {
  const stats = await getStudentMasteryStats(user.id);
  const weakAtoms = stats.filter(s => s.masteryPct < 50 && s.attempts > 1);

  if (weakAtoms.length === 0) return null;

  const { ai, apiKey, config, keyName } = getAiClient('tutor');

  const context = weakAtoms.map(a =>
    `Concept: ${a.conceptTag}, Attempts: ${a.attempts}, Accuracy: ${a.masteryPct}%`
  ).join('\n');

  logger.ai("Generating recommendations for weak concepts...", { count: weakAtoms.length });

  try {
    const response = await callAiWithRetry(ai, {
      contents: `Student: ${user.name}. Grade: ${user.preferences.defaultYear}.
      Weak Knowledge Atoms Detected:
      ${context}
      
      Generate a specific study action plan. For each recommendation, provide:
      1. Action label (e.g. "Foundation Repair")
      2. Atoms to focus on
      3. Brief reasoning.`,
      config: {
        systemInstruction: "You are the Eduva Strategic Architect. Output clear, high-impact study recommendations.",
        temperature: config.temperature,
        topP: config.topP,
        topK: config.topK,
        maxOutputTokens: config.maxOutputTokens
      }
    }, 'tutor', [], apiKey);

    const recId = `rec_${Date.now()}`;

    // Store as traceable event
    await sendTelemetry({
      userId: user.id,
      studentId: user.id,
      module: 'Recommendation',
      eventType: 'ai_recommendation',
      payload: {
        recommendationId: recId,
        targetAtoms: weakAtoms.map(a => a.atomId),
        actionSuggested: "REPAIR_FOUNDATION",
        reasoning: response.text || "Focus on identified gaps.",
        urgency: weakAtoms.length > 3 ? 'HIGH' : 'MEDIUM',
        atoms: weakAtoms.map(a => a.atomId)
      },
      timestamp: new Date().toISOString()
    });

    return response.text;
  } catch (e) {
    logger.error("AI", "Recommendation Generation Fault", e);
    return null;
  }
};
