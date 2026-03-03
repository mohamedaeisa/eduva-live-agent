import { getAiClient, callAiWithRetry } from '../../../ai/client';
import { Type } from "@google/genai";
import { CurriculumNode } from '../../../../types/ingestion';
import { SymbolicArchetype } from '../../../symbolic/types';
import { AtomCore } from '../../../../types';
import { logger } from '../../../../utils/logger';
import { ARABIC_ATOM_PROMPT_BATCH } from './ai-prompts/atom/arabic';

// Schema reuse from generic service or re-definition. 
// For v1.2, we define a compatible schema.
const ATOM_GENERATION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        atoms: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    metadata: {
                        type: Type.OBJECT,
                        properties: {
                            conceptTag: { type: Type.STRING },
                            relatedConceptTags: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['conceptTag', 'relatedConceptTags']
                    },
                    coreRepresentation: {
                        type: Type.OBJECT,
                        properties: {
                            definition: { type: Type.STRING },
                            keyRule: { type: Type.STRING },
                            primaryExample: { type: Type.STRING },
                            formula: { type: Type.STRING }
                        },
                        required: ['definition', 'keyRule', 'primaryExample']
                    },
                    // ... (Simplified for brevity, full schema should match types.ts AtomCore)
                    extendedRepresentation: {
                        type: Type.OBJECT,
                        properties: {
                            fullExplanation: { type: Type.STRING },
                            analogy: { type: Type.STRING },
                            misconceptions: { type: Type.ARRAY, items: { type: Type.STRING } },
                            realWorldAnalogy: { type: Type.STRING },
                            proTips: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['fullExplanation', 'misconceptions']
                    },
                    assessmentMetadata: {
                        type: Type.OBJECT,
                        properties: {
                            difficultyCeiling: { type: Type.INTEGER },
                            highestBloomObserved: { type: Type.NUMBER },
                            essentialKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                            cognitiveLoad: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                            prerequisiteConceptTags: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ['difficultyCeiling', 'essentialKeywords', 'cognitiveLoad']
                    }
                },
                required: ['metadata', 'coreRepresentation', 'extendedRepresentation', 'assessmentMetadata']
            }
        }
    },
    required: ['atoms']
};

const GENERIC_ATOM_PROMPT = `
You are an expert curriculum designer.
Task: Create a "Learning Atom" for the provided Curriculum Node.

Context:
- Node: \${nodeTitle}
- Archetype: \${archetypeDesc}
- Grade: \${grade}

Strictly follow the JSON schema.
`;

export async function generateAtomsFromNode(
    node: CurriculumNode,
    nodeText: string,
    archetype: SymbolicArchetype,
    subject: string,
    language: string, // 🔒 GUARDRAIL: Must be CurriculumMap.language
    onStatus?: (msg: string) => void
): Promise<Partial<AtomCore>[]> {
    const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
    const isArabic = (language || '').toLowerCase().startsWith('ar'); // Robust check (Arabic, arabic, ar)

    const basePrompt = isArabic ? ARABIC_ATOM_PROMPT_BATCH : GENERIC_ATOM_PROMPT;
    let sysPrompt = basePrompt;

    if (isArabic) {
        sysPrompt = sysPrompt
            .replace('{{gradeLevel}}', archetype.gradeLevel.toString())
            .replace('{{subject}}', subject)
            .replace('{{docFingerprint}}', `node-${node.nodeId}`)
            .replace('{{maxAtoms}}', '3');
    } else {
        sysPrompt = sysPrompt
            .replace('${nodeTitle}', node.title)
            .replace('${archetypeDesc}', `${archetype.abstractionLevel} abstraction, ${archetype.examOrientation ? 'exam-focused' : 'concept-focused'}`)
            .replace('${grade}', archetype.gradeLevel.toString());
    }

    const userPrompt = `
Generate atoms for node: "${node.title}"
Source Material:
${nodeText.substring(0, 5000)}
  `;

    logger.ingestion(`[ATOM_GEN] Generating atoms for node ${node.nodeId} (Arch: ${archetype.id})`);

    try {
        const response = await callAiWithRetry(ai, {
            model: config.defaultModel,
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            config: {
                systemInstruction: sysPrompt,
                responseMimeType: 'application/json',
                responseSchema: ATOM_GENERATION_SCHEMA,
                temperature: 0.2,
                maxOutputTokens: config.maxOutputTokens
            },
            keyName
        }, undefined, [], apiKey, keyName);

        const raw = JSON.parse(response.text || '{"atoms":[]}');
        return raw.atoms || [];

    } catch (e) {
        logger.error('INGESTION', `[ATOM_GEN] Failed for node ${node.nodeId}`, e);
        throw e;
    }
}
