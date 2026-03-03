import { Atom } from '../../../../types';
import { CurriculumNode } from '../../../../types/ingestion';
import { getAiClient, callAiWithRetry } from '../../../ai/client';
import { logger } from '../../../../utils/logger';
import { sha256 } from '../../../../utils/hashUtils';
import { ARABIC_ATOM_PROMPT_BATCH } from './ai-prompts/atom/arabic';

// Using the same generic prompt for English (placeholder)
const GENERIC_ATOM_PROMPT_MULTI_NODE = `
You are an expert curriculum designer.
Extract Learning Atoms for the provided concepts.
Output strictly JSON.
`;

export async function generateAtomsFromBatch(
    nodes: CurriculumNode[],
    textSlice: string,
    subject: string,
    language: string,
    archetypeId: string,
    onStatus?: (msg: string) => void
): Promise<Atom[]> {
    const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
    const isArabic = (language === 'Arabic');

    let systemPrompt = isArabic ? ARABIC_ATOM_PROMPT_BATCH : GENERIC_ATOM_PROMPT_MULTI_NODE;

    // Prepare Node List
    const titlesList = nodes.map(n => `- ${n.title}`).join('\n');

    if (isArabic) {
        // Fill placeholders for the standardized Arabic prompt
        systemPrompt = systemPrompt
            .replace('{{gradeLevel}}', 'General')
            .replace('{{subject}}', subject)
            .replace('{{docFingerprint}}', 'smart-batch')
            .replace('{{maxAtoms}}', '15');
    } else {
        // Legacy/Generic behavior
        systemPrompt = systemPrompt.replace('${NODE_TITLES_LIST}', titlesList);
    }

    const userPrompt = `
    CONTEXT:
    We are extracting atoms specifically for these curriculum concepts:
    ${titlesList}

    Source Text:
    ${textSlice}

    Extract atoms for the listed concepts now.
    `;

    try {
        const result = await callAiWithRetry(ai, {
            model: config.defaultModel, // High capacity for large batches
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: 'application/json',
                temperature: 0.1,
                maxOutputTokens: config.maxOutputTokens
            },
            keyName
        }, undefined, [], apiKey, keyName);

        let outputText = result.text || '[]';
        if (outputText.startsWith('```json')) outputText = outputText.replace(/^```json/, '').replace(/```$/, '');
        else if (outputText.startsWith('```')) outputText = outputText.replace(/^```/, '').replace(/```$/, '');
        outputText = outputText.trim();

        let atomsRaw: any[] = [];
        try {
            // Handle both Array and Object wrapper
            const json = JSON.parse(outputText);
            if (Array.isArray(json)) atomsRaw = json;
            else if (json.atoms) atomsRaw = json.atoms;
            else if (json.learningAtoms) atomsRaw = json.learningAtoms;
            else atomsRaw = [json]; // Fallback single object
        } catch (e) {
            logger.error('INGESTION', `[SMART_CURRICULUM] JSON Parse Error in Batch`, e);
            return [];
        }

        // Map responses back to nodes and create Atom objects
        const atoms: Atom[] = [];
        for (const raw of atomsRaw) {
            // Find matching node by title (fuzzy match)
            const targetNode = nodes.find(n => n.title === raw.nodeTitle) || nodes[0];

            // Generate clean ID
            const atomId = await sha256(`atom:${targetNode.nodeId}:${raw.conceptTag}`);

            const atom: Atom = {
                id: atomId, // Keep for generic ID usage
                atomId: atomId, // REQUIRED: IndexedDB KeyPath for 'local_atoms'
                content: raw.definition || "No definition provided",
                type: 'CONCEPT', // Default
                trustScore: 0.9,
                metadata: {
                    difficulty: raw.difficultyCeiling || 1,
                    importance: 1,
                    keywords: raw.essentialKeywords || [],
                    language: language as any,
                    bloomLevel: 'understand', // Default
                    conceptTag: raw.conceptTag,
                    curriculumNodeId: targetNode.nodeId, // 🔗 LINKAGE
                    // domain: subject, // Removed as per types.ts
                    subject: subject // Ensure subject is present
                } as any, // Cast as any because AtomMetadata might mismatch slightly or strict check fails on missing optional props? 
                // Better: Let's follow strict type. types.ts has 'subject'.

                coreRepresentation: {
                    definition: raw.definition,
                    keyRule: raw.keyRule || "", // Fixed keyIdea -> keyRule
                    formula: "", // Added required prop
                    primaryExample: raw.primaryExample
                },
                extendedRepresentation: {
                    fullExplanation: "",
                    analogy: "",
                    misconceptions: raw.misconceptions || [],
                    realWorldAnalogy: "",
                    proTips: []
                },
                assessmentMetadata: {
                    difficultyCeiling: raw.difficultyCeiling || 1,
                    highestBloomObserved: 1,
                    essentialKeywords: raw.essentialKeywords || [],
                    cognitiveLoad: raw.cognitiveLoad || 'medium',
                    prerequisiteConceptTags: []
                },
                bloomsParameters: {
                    cognitiveDimension: raw.cognitiveLoad || 'medium',
                    knowledgeDimension: 'conceptual'
                },
                ingestionMetadata: {
                    sourceFile: 'smart-ingestion',
                    pageNumber: 0,
                    contextSnippet: "", // Optional to save space
                    confidenceScore: 0.95
                }
            };
            atoms.push(atom);
        }

        return atoms;

    } catch (e) {
        logger.error('INGESTION', `[SMART_CURRICULUM] Batch generation failed`, e);
        return [];
    }
}
