
import { Type } from "@google/genai";
import {
  ParentFeedEvent, AIExplanation, ProgressSignal, ParentWallet, UpgradeRecommendation, ParentPreferences,
  RawActivityEvent, ParentDailyBrief
} from '../../types';
import { getAiClient, callAiWithRetry } from './client';
import { AI_MODELS } from './constants';

export const generateParentFeedItem = async (
  signals: ProgressSignal[],
  prefs: ParentPreferences,
  language: string
): Promise<{ message: string; severity: 'INFO' | 'ATTENTION' }> => {
  const { ai, apiKey, config } = getAiClient('parent');
  const context = signals.map(s => `[${s.signalType}] ${s.message}`).join('\n');
  const philosophy = `Philosophy: ${prefs.guidancePhilosophy}, Intent: ${prefs.learningIntent}`;

  const response = await callAiWithRetry(ai, {
    contents: `CONTEXT:\n${context}\n\nPARENT_PREFS: ${philosophy}. LANG: ${language}`,
    config: {
      systemInstruction: `You are the EDUVA Parent Insight Engine. 
      TASK: Synthesize raw learning signals into a single, empathetic, 2-sentence update for a parent.`,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['INFO', 'ATTENTION'] }
        },
        required: ['message', 'severity']
      }
    }
  }, 'parent', [], apiKey);

  return JSON.parse(response.text || '{"message": "Synchronizing learning data...", "severity": "INFO"}');
};

export const generateDecisionReasoning = async (signals: any): Promise<{ explanation: string, reasoning: string[] }> => {
  const { ai, apiKey, config } = getAiClient('parent');

  const response = await callAiWithRetry(ai, {
    contents: `SIGNALS: ${JSON.stringify(signals)}. Explain why a specific task was recommended.`,
    config: {
      systemInstruction: `You are the EDUVA Pedagogical Analyst. 
            Explain a learning decision to a parent based on student signals.
            RULES:
            1. Be logical and data-driven.
            2. Use warm, expert terminology (e.g., "scaffolding", "reinforcement").
            3. "explanation" should be a 2-sentence parent-facing summary.
            4. "reasoning" should be 3 granular bullet points of logic.`,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING },
          reasoning: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['explanation', 'reasoning']
      }
    }
  }, 'parent', [], apiKey);

  return JSON.parse(response.text || '{"explanation": "Suggested based on current mastery.", "reasoning": ["Logic sync..."]}');
};

export const generateBehavioralExplanation = async (event: ParentFeedEvent): Promise<AIExplanation> => {
  const { ai, apiKey, config } = getAiClient('parent');
  const response = await callAiWithRetry(ai, {
    contents: `SIGNAL: ${event.signalType}. EVENT: ${event.message}. TASK: Decode student friction into parenting insights.`,
    config: {
      systemInstruction: "Explain learning telemetry in non-academic, empathetic terms.",
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      maxOutputTokens: config.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insight: { type: Type.STRING },
          rootCause: { type: Type.STRING },
          missingFoundations: { type: Type.ARRAY, items: { type: Type.STRING } },
          catchUpTime: { type: Type.STRING },
          actionTakenByAI: { type: Type.STRING },
          systemActions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, status: { type: Type.STRING } } } },
          parentActionRecommended: { type: Type.STRING },
          technicalLog: { type: Type.STRING }
        }
      }
    }
  }, 'parent', [], apiKey);
  return JSON.parse(response.text || '{}');
};

export const generateTacticalRecommendation = async (wallet: ParentWallet, signals: ProgressSignal[]): Promise<UpgradeRecommendation> => {
  const { ai, apiKey, config } = getAiClient('parent');
  const response = await callAiWithRetry(ai, {
    contents: `TIER: ${wallet.subscriptionTier}. CREDITS: ${wallet.balanceCredits}.`,
    config: {
      systemInstruction: "Recommend subscription boosts based on study intensity.",
      temperature: 0.3, // Using lower temperature for specific recommendations
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          cta: { type: Type.STRING },
          urgency: { type: Type.STRING }
        }
      }
    }
  }, 'parent', [], apiKey);
  return JSON.parse(response.text || '{}');
};

export const generateDailyConversationalBrief = async (
  studentName: string,
  activities: RawActivityEvent[]
): Promise<ParentDailyBrief> => {
  const { ai, apiKey, config } = getAiClient('parent');

  const context = activities.map(a =>
    `[${new Date(a.timestamp).toLocaleTimeString()}] Subject: ${a.subject}, Action: ${a.actionName}, Topic: ${a.conceptTag || 'General'}, Correct: ${a.isCorrect}`
  ).join('\n');

  const response = await callAiWithRetry(ai, {
    contents: `STUDENT: ${studentName}\nACTIVITIES (Last 24h):\n${context}`,
    config: {
      systemInstruction: `You are the EDUVA Parent Briefing Engine.
      Analyze student activity and generate a conversational brief.
      "sentiment" must be PROUD, CONCERNED, or NEUTRAL.
      "keySummary" is a warm 2-sentence summary.
      "conversationalCues" are 3 specific questions for the parent to ask.`,
      temperature: config.temperature,
      topP: config.topP,
      topK: config.topK,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          sentiment: { type: Type.STRING, enum: ['PROUD', 'CONCERNED', 'NEUTRAL'] },
          keySummary: { type: Type.STRING },
          conversationalCues: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['sentiment', 'keySummary', 'conversationalCues']
      }
    }
  }, 'parent', [], apiKey);

  const result = JSON.parse(response.text || '{}');
  return {
    id: `brief_${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    studentName,
    sentiment: result.sentiment || 'NEUTRAL',
    keySummary: result.keySummary || 'Synchronizing daily performance patterns...',
    conversationalCues: result.conversationalCues || [
      'How did your study session go today?',
      'What was the most interesting thing you learned?',
      'Is there anything you want to practice more tomorrow?'
    ],
    generatedAt: Date.now()
  };
};

export const generateEscalationMessage = async (subject: string): Promise<string> => {
  const { ai, apiKey, config } = getAiClient('parent');
  const response = await callAiWithRetry(ai, {
    contents: `SUBJECT: ${subject}. Generate a firm but encouraging nudge message for a student who ignored an important study mission. Focus on the impact of gaps in ${subject}. Max 15 words.`,
    config: {
      systemInstruction: "Authoritative yet supportive parent coach.",
      temperature: 0.7
    }
  }, 'parent', [], apiKey);
  return response.text || `Important mission for ${subject} pending. Let's tackle this gap now to keep your progress on track!`;
};
