import { getAiClient, callAiWithRetry } from '../../../ai/client';
import { Type } from "@google/genai";
import { CurriculumMap, CurriculumNode } from '../../../../types/ingestion';
import { logger } from '../../../../utils/logger';
import { sha256 } from '../../../../utils/hashUtils';

const CURRICULUM_MAPPER_SYSTEM_PROMPT = `
You are a curriculum mapping engine.

Your task is to analyze an educational document and extract its curriculum structure
as a Curriculum Map.

You MUST:
- Extract structure only
- Identify concepts, rules, skills, or processes explicitly present
- Preserve academic hierarchy
- Use the document as the ONLY source of truth

You MUST NOT:
- Explain content
- Teach or summarize
- Generate examples
- Add knowledge not found in the document
- Invent missing curriculum

Your output must be STRICTLY valid JSON.
`;

/*const ARABIC_CURRICULUM_MAPPER_PROMPT = `
أنت محرك تحليل مناهج تعليمية.

مهمتك:
تحليل النص التعليمي المقدم واستخراج "خريطة منهج" (Curriculum Map)
تعكس البنية الأكاديمية الفعلية للمحتوى.

قواعد صارمة:
1. استخرج البنية فقط (عناوين، مفاهيم، قواعد، مهارات).
2. استخدم النص كمصدر وحيد للحقيقة.
3. لا تشرح المحتوى ولا تلخصه.
4. لا تضف أمثلة أو تمارين.
5. لا تخترع مفاهيم غير موجودة.
6. يجب أن تكون جميع العناوين والتسميات باللغة العربية الفصحى.
7. حافظ على التسلسل الهرمي الأكاديمي الصحيح.

ممنوع:
- الشرح
- التعليم
- إعادة صياغة المحتوى
- إدخال أي معرفة خارج النص

المخرجات:
- JSON صالح فقط
- بدون أي نص إضافي خارج JSON
`;
*/
const ARABIC_CURRICULUM_MAPPER_PROMPT = `
أنت محرك تحليل مناهج تعليمية.

مهمتك:
تحليل النص التعليمي المقدم واستخراج "خريطة منهج" (Curriculum Map)
تعكس البنية الأكاديمية الفعلية للمحتوى.

قواعد صارمة:
1. استخرج البنية فقط (عناوين، مفاهيم، قواعد، مهارات).
2. استخدم النص كمصدر وحيد للحقيقة.
3. لا تشرح المحتوى ولا تلخصه.
4. لا تضف أمثلة أو تمارين أو أسئلة.
5. لا تخترع مفاهيم غير موجودة في النص.
6. يجب أن تكون جميع العناوين والتسميات باللغة العربية الفصحى.
7. حافظ على التسلسل الهرمي الأكاديمي الصحيح.
8. كل عقدة يجب أن تمثل مفهومًا دراسيًا واحدًا فقط.
9. يجب أن تكون عناوين العقد قصيرة، اسمية، وغير إنشائية.
10. تجاهل الأنشطة، التدريبات، والتكليفات غير المفاهيمية.
11. إذا لم يوجد محتوى فعلي لمفهوم ما في النص، لا تنشئ عقدة له.

ممنوع:
- الشرح
- التعليم
- إعادة صياغة المحتوى
- دمج أكثر من مفهوم في عقدة واحدة
- إدخال أي معرفة خارج النص

المخرجات:
- JSON صالح فقط
- بدون أي نص إضافي خارج JSON
`;

const CURRICULUM_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        nodes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    nodeId: { type: Type.STRING },
                    title: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['concept', 'rule', 'skill', 'process'] },
                    parentId: { type: Type.STRING, nullable: true },
                    prerequisites: { type: Type.ARRAY, items: { type: Type.STRING } },
                    examWeight: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    sourceAnchors: {
                        type: Type.OBJECT,
                        properties: {
                            sectionTitle: { type: Type.STRING },
                            textSpanHint: { type: Type.STRING }
                        },
                        required: ['sectionTitle', 'textSpanHint']
                    },
                    contentStatus: { type: Type.STRING, enum: ['EMPTY', 'OK'] }
                },
                required: ['nodeId', 'title', 'type', 'examWeight', 'sourceAnchors']
            }
        }
    },
    required: ['nodes']
};

/**
 * Destructively splits text into overlap chunks.
 * Prioritizes breaking at logical headings.
 */
function splitText(text: string, chunkSize: number = 80000, overlap: number = 5000): string[] {
    if (text.length <= chunkSize) return [text];

    const chunks: string[] = [];
    let start = 0;
    const MAX_CHUNKS = 1000; // Hard safety cap

    // Regex for common headings: "Chapter 1", "Unit 2", "Section 3", "1. Introduction"
    const HEADING_REGEX = /(^|\n)(Chapter|Unit|Section|PART|Module|Week|Lesson)\s+\d+|^\d+\.\s+[A-Z]/im;

    logger.ingestion(`[SPLITTER] Splitting text of size ${text.length} (Chunk: ${chunkSize}, Overlap: ${overlap})`);

    while (start < text.length) {
        if (chunks.length >= MAX_CHUNKS) {
            // Use console.warn if logger.warn isn't strictly typed/available, but we have logger.ingestion
            // Assuming logger.warn exists or falling back to ingestion with warning prefix
            logger.ingestion(`[SPLITTER] [WARNING] Max chunks (${MAX_CHUNKS}) reached. Truncating remaining text.`);
            break;
        }

        let end = Math.min(start + chunkSize, text.length);

        // Smart Split Strategy
        if (end < text.length) {
            // 1. Look for a major heading in the "safe zone" (last 20% of the chunk)
            // Ensure safe zone is AFTER start to prevent getting stuck if overlap is huge
            const safeZoneStart = Math.max(start + (chunkSize * 0.5), end - 5000);
            const safeZone = text.substring(safeZoneStart, end + 2000);

            const headingMatch = safeZone.match(HEADING_REGEX);
            if (headingMatch && headingMatch.index !== undefined) {
                // Split exactly at the heading start
                end = safeZoneStart + headingMatch.index;
            } else {
                // 2. Fallback: Newline
                const nextNewLine = text.indexOf('\n', end);
                if (nextNewLine !== -1 && nextNewLine - end < 1000) {
                    end = nextNewLine;
                }
            }
        }

        const chunk = text.substring(start, end);
        chunks.push(chunk);

        // Strict Forward Progress Check
        // If the chunk is smaller than overlap, we simply move past the whole chunk to avoid negative progress
        const effectivelyMovesForward = (end - overlap) > start;

        if (effectivelyMovesForward) {
            start = end - overlap;
        } else {
            // If overlap is too aggressive for this chunk size, force a 10% advance relative to the chunk we just took
            // or at least 100 chars
            const forcedStep = Math.max(100, chunk.length * 0.1);
            start += forcedStep;
        }

        // Safety Break
        if (chunk.length === 0) break;
    }

    logger.ingestion(`[SPLITTER] Created ${chunks.length} chunks.`);
    return chunks;
}

/**
 * Maps a single text section to curriculum nodes.
 */
async function mapSection(
    sectionText: string,
    chunkIndex: number,
    subject: string,
    grade: string,
    language: string, // 'Arabic' | 'English'
    onStatus?: (msg: string) => void
): Promise<any[]> {
    const { ai, apiKey, keyName, config } = getAiClient('ingestion', onStatus);
    const isArabic = (language === 'Arabic');

    const systemPrompt = isArabic ? ARABIC_CURRICULUM_MAPPER_PROMPT : CURRICULUM_MAPPER_SYSTEM_PROMPT;

    const userPrompt = `
Analyze the following document section (Part ${chunkIndex + 1}) and produce a Curriculum Map.
Subject: ${subject}
Grade: ${grade}

Instructions:
1. Identify main topics and subtopics available IN THIS SECTION.
2. Mark 'contentStatus' as 'EMPTY' if a node has no substantial content (only a title).
3. Output strictly in JSON.
4. Do NOT hallucinate content from other sections.

Document Content (Section ${chunkIndex + 1}):
${sectionText}
`;

    try {
        // MODEL FALLBACK STRATEGY (v1.2.1 Hardening)
        // Primary: config.defaultModel (Ingestion Profile)
        // Fallback: Flash Lite (Stability)

        const callModel = async (model: string) => {
            return await callAiWithRetry(ai, {
                model: model,
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                config: {
                    systemInstruction: systemPrompt,
                    responseMimeType: 'application/json',
                    responseSchema: CURRICULUM_SCHEMA,
                    temperature: 0.1,
                    maxOutputTokens: config.maxOutputTokens
                },
                keyName
            }, undefined, [], apiKey, keyName);
        };

        let response;
        try {
            response = await callModel(config.defaultModel);
        } catch (err: any) {
            // Check for Quota or Overload error codes (429, 503, or specific library codes)
            logger.ingestion(`[SMART_CURRICULUM] Primary model (${config.defaultModel}) failed: ${err.message}. Switching to Fallback (Flash Lite).`);
            response = await callModel('gemini-2.5-flash-lite');
        }

        let text = response.text || '{"nodes":[]}';
        text = text.trim();
        if (text.startsWith('```json')) {
            text = text.replace(/^```json/, '').replace(/```$/, '');
        } else if (text.startsWith('```')) {
            text = text.replace(/^```/, '').replace(/```$/, '');
        }
        text = text.trim();
        const raw = JSON.parse(text);

        // Deteministic ID Enforcement (Critial for Merging)
        const nodes = raw.nodes || [];
        for (const node of nodes) {
            // v1.3 Fix: Preserve symbolic ID for reference resolution
            node.symbolicId = node.nodeId;

            // Generate stable ID from normalized title
            // Format: hash("grade|subject|normalized_title")
            const rawKey = `${grade}|${subject}|${node.title.toLowerCase().trim()}`;
            node.nodeId = await sha256(rawKey);
        }

        return nodes;
    } catch (e) {
        logger.error('INGESTION', `[CURRICULUM_MAPPER] Failed section ${chunkIndex}`, e);
        return [];
    }
}

function mergeMaps(sectionResults: any[][]): any[] {
    const mergedNodes: any[] = [];
    const seenIds = new Set<string>();
    let duplicateCount = 0;

    for (const nodes of sectionResults) {
        for (const node of nodes) {
            // Deduplicate by strict deterministic ID
            if (!seenIds.has(node.nodeId)) {
                seenIds.add(node.nodeId);
                mergedNodes.push(node);
            } else {
                duplicateCount++;
            }
        }
    }

    if (duplicateCount > 0) {
        logger.ingestion(`[SMART_CURRICULUM] Merged overlapped sections: Deduplicated ${duplicateCount} nodes.`);
    }

    return mergedNodes;
}

export async function generateCurriculumMap(
    docText: string,
    subject: string,
    grade: string,
    docFingerprint: string,
    onStatus?: (msg: string) => void
): Promise<CurriculumMap> {

    logger.ingestion(`[SMART_CURRICULUM] Orchestarting mapping for ${docText.length} chars.`);
    onStatus?.("Analyzing structure...");

    // 🔍 DETERMINISTIC LANGUAGE DETECTION (Hoisted)
    const detectContentLanguage = (text: string): string => {
        const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g;
        const arabicCount = (text.match(arabicPattern) || []).length;
        const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
        const ratio = (arabicCount + latinCount) > 0 ? arabicCount / (arabicCount + latinCount) : 0;
        return ratio >= 0.3 ? 'Arabic' : 'English';
    };

    const detectedLanguage = detectContentLanguage(docText);
    logger.ingestion(`[SMART_CURRICULUM] Detected Language: ${detectedLanguage}`);

    // 1. Split (for token safety ONLY - chunks help model read, not multiply calls)
    const chunks = splitText(docText, 100000, 5000);
    logger.ingestion(`[SMART_CURRICULUM] Split into ${chunks.length} logical chunks for context.`);

    // 🔒 CRITICAL FIX: Merge chunks into ONE payload - NO FAN-OUT
    // Chunks exist to help the model read large docs, NOT to multiply AI calls
    const mergedText = chunks.join('\n\n---SECTION BREAK---\n\n');
    logger.ingestion(`[SMART_CURRICULUM] Merged ${chunks.length} chunks into single context (${mergedText.length} chars).`);

    // 2. ONE AI CALL for entire document (not per-chunk!)
    onStatus?.("Generating curriculum map (1 AI call)...");
    const allNodes = await mapSection(mergedText, 0, subject, grade, detectedLanguage, onStatus);

    // 🔍 ID RESOLUTION (v1.3 Fix)
    // Map symbolic IDs (e.g., "unit_5") to Deterministic Hash IDs
    const idMap = new Map<string, string>();
    allNodes.forEach((n: any) => {
        if (n.symbolicId) {
            idMap.set(n.symbolicId, n.nodeId);
        }
        // Also map the determinstic ID to itself just in case
        idMap.set(n.nodeId, n.nodeId);
    });

    // Resolve References
    allNodes.forEach((n: any) => {
        // Fix Parent ID
        if (n.parentId && idMap.has(n.parentId)) {
            n.parentId = idMap.get(n.parentId);
        }

        // Fix Prerequisites
        if (n.prerequisites && n.prerequisites.length > 0) {
            n.prerequisites = n.prerequisites
                .map((p: string) => idMap.get(p))
                .filter((p: string | undefined) => p !== undefined); // Remove unresolvable
        }

        // Clean up temporary property
        delete n.symbolicId;
    });

    logger.ingestion(`[SMART_CURRICULUM] Final Map: ${allNodes.length} nodes (from ${chunks.length} sections).`);

    // 🔍 QUALITY INSPECTION LOG
    logger.ingestion(`[SMART_CURRICULUM] MAP STRUCTURE DUMP:\n${JSON.stringify(allNodes, null, 2)}`);

    // Post-process
    const mapId = await sha256(`${docFingerprint}:${subject}:${grade}:v1.2`);

    return {
        mapId,
        subject,
        grade,
        language: detectedLanguage,
        version: '1.2',
        rootNodes: allNodes.filter((n: any) => !n.parentId).map((n: any) => n.nodeId),
        nodes: allNodes,
        createdAt: Date.now()
    };
}
