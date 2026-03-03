
import { Type } from "@google/genai";
import { Language } from '../../types';
import { getAiClient, FALLBACK_MODEL, callAiWithRetry } from './client';
import { AI_MODELS } from './constants';

export const generateAvatarResponse = async (messages: any[], language: Language, model?: string): Promise<string> => {
  const { ai, apiKey, config } = getAiClient('tutor');
  const modelToUse = model || config.defaultModel;

  console.log(`[AVATAR_TUTOR] Dispatching ${messages.length} messages. Lang: ${language}`);

  const response = await callAiWithRetry(ai, {
    contents: messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
    config: {
      systemInstruction: `You are a helpful and professional AI tutor. You must respond in ${language}. Keep your explanations clear, concise, and educational.`,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens
    }
  }, 'tutor', [], apiKey);

  return response.text || "";
};

export const analyzeWeakness = async (topic: string, mistakes: any[], language: Language, model?: string): Promise<string> => {
  const { ai, apiKey, config } = getAiClient('tutor');
  const modelToUse = model || config.defaultModel;

  console.log(`[COACH] Analyzing ${mistakes.length} mistakes for topic: ${topic}`);

  const response = await callAiWithRetry(ai, {
    contents: `Analyze quiz results for ${topic}: ${JSON.stringify(mistakes)}. Provide motivating coach feedback in ${language}. Actionable plan included.`,
    config: {
      systemInstruction: `Role: Mastery Insight Coach.`,
      temperature: config.temperature
    }
  }, 'tutor', [], apiKey);

  return response.text || "";
};

export const generateExplanation = async (topic: string, mode: 'ELI5' | 'Deep', language: Language, model?: string): Promise<any> => {
  const { ai, apiKey, config } = getAiClient('tutor');
  const modelToUse = model || config.defaultModel;

  console.log(`[EXPLAINER] Triggering ${mode} explanation for: ${topic}`);

  const response = await callAiWithRetry(ai, {
    contents: `Explain ${topic} in ${mode} mode. Lang: ${language}`,
    config: {
      responseMimeType: 'application/json',
      temperature: config.temperature,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          content: { type: Type.STRING },
          analogy: { type: Type.STRING },
          citations: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  }, 'tutor', [], apiKey);

  return JSON.parse(response.text || '{}');
};
