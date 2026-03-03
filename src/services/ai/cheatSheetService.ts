
import { GenerationRequest, CheatSheetData, AtomCore } from '../../types';
import { getAtomsForContent } from '../storageService';
import { sha256 } from '../../utils/hashUtils';
import { ensureAtoms } from './ingestionService';

/**
 * CHEAT SHEET MICROSERVICE (Derived Layer)
 * Optimized for high-density academic reference using the "Perfect Cheat Sheet" format v2.
 * Pure transformation of existing Knowledge Atoms.
 */

export const generateCheatSheet = async (req: GenerationRequest, onStatus?: (msg: string) => void): Promise<CheatSheetData> => {
    const log = (msg: string) => onStatus?.(`[CHEATSHEET] ${msg}`);

    log("Initializing Atomic Compression Engine...");

    let atoms: AtomCore[] = [];

    // Support Multi-Document Selection (Assembler Mode)
    if (req.selectedDocumentIds && req.selectedDocumentIds.length > 0) {
        log(`Aggregating knowledge from ${req.selectedDocumentIds.length} sources...`);
        for (const docId of req.selectedDocumentIds) {
            const docAtoms = await getAtomsForContent(docId, 'notes');
            atoms = [...atoms, ...docAtoms];
        }
    } else {
        // Legacy Single Source Mode
        const contentId = req.studyMaterialUrl || await sha256(req.studyMaterialFile?.substring(0, 5000) || `TOPIC:${req.topic}:${req.language}`);
        atoms = await getAtomsForContent(contentId, 'notes') as AtomCore[];

        if (atoms.length === 0) {
            log("⚠️ Knowledge pool empty. Triggering headless ingestion...");
            await ensureAtoms(req, (msg) => onStatus?.(`[DELEGATION] ${msg}`));
            atoms = await getAtomsForContent(contentId, 'notes') as AtomCore[];
        }
    }

    log(`Total atoms before filtering: ${atoms.length}`);

    // --- PAGE RANGE FILTERING ---
    if (req.documentConfigs) {
        log(`Document configs provided: ${JSON.stringify(req.documentConfigs)}`);

        const configKeys = Object.keys(req.documentConfigs);
        const hasCustomRanges = configKeys.some(key => req.documentConfigs![key].useCustomRange);

        if (hasCustomRanges) {
            log(`Applying custom page ranges...`);

            const beforeCount = atoms.length;
            atoms = atoms.filter(atom => {
                const sourceId = atom.metadata.sourceDocumentId;

                // Try to find config using different ID formats
                let config = req.documentConfigs![sourceId];

                if (!config) {
                    const matchingKey = configKeys.find(key =>
                        key === sourceId ||
                        sourceId.includes(key) ||
                        key.includes(sourceId)
                    );
                    if (matchingKey) {
                        config = req.documentConfigs![matchingKey];
                    }
                }

                // If no config for this doc, or not using custom range, include all atoms
                if (!config || !config.useCustomRange) {
                    return true;
                }

                // Check if atom has page references
                const pageRefs = atom.metadata.sourcePageRefs;
                log(`Checking atom ${atom.atomId}: sourceId=${sourceId}, pageRefs=${JSON.stringify(pageRefs)}, range=${config.start}-${config.end}`);

                if (!pageRefs || pageRefs.length === 0) {
                    log(`  -> No page refs, including by default`);
                    return true;
                }

                // Check if any of the atom's page refs fall within the specified range
                const inRange = pageRefs.some(page =>
                    page >= config.start && page <= config.end
                );

                log(`  -> ${inRange ? 'INCLUDED' : 'EXCLUDED'}`);
                return inRange;
            });

            log(`Filtered from ${beforeCount} to ${atoms.length} atoms within specified page ranges.`);
        } else {
            log(`No custom ranges specified, using all atoms.`);
        }
    }

    if (atoms.length === 0) {
        throw new Error("No knowledge atoms available for Cheat Sheet generation.");
    }

    log(`Compressing ${atoms.length} atoms into High-Density Matrix...`);

    // Sort by narrative sequence
    atoms.sort((a, b) => (a.metadata.narrativeSequence || 0) - (b.metadata.narrativeSequence || 0));

    const content = atoms.map((atom, index) => {
        const { conceptTag } = atom.metadata;
        const { definition } = atom.coreRepresentation;
        const { essentialKeywords, difficultyCeiling } = atom.assessmentMetadata;
        const { analogy, misconceptions } = atom.extendedRepresentation;

        // --- 1. PRIORITY BADGE ---
        let priorityBadge = "🔴 **EXAM CORE**"; // Default: Definitions
        if (misconceptions && misconceptions.length > 0) {
            priorityBadge = "🟡 **COMMON TRAP**";
        } else if (difficultyCeiling >= 4) {
            priorityBadge = "🔵 **UNDERSTAND RELATIONSHIP**";
        }

        // --- 2. EXAM TRIGGER ---
        let trigger = "Recall definition.";
        if (difficultyCeiling >= 4) trigger = "Analyze relationships.";
        else if (difficultyCeiling === 3) trigger = "Apply to scenarios.";

        // --- 3. DEFINITION COMPRESSION ---
        // Removed hard truncation for auto-layout
        let defSnippet = definition.split('.')[0].replace(new RegExp(conceptTag, 'i'), '').trim().replace(/^is\s+/i, '');
        // if (defSnippet.length > 50) defSnippet = defSnippet.substring(0, 47) + "...";
        if (!defSnippet) defSnippet = "Core Definition";

        // --- 4. KEYWORDS LOCK ---
        // Take top 4 keywords
        const keywordsLock = essentialKeywords.slice(0, 4).join(' • ');

        // --- 5. MEMORY HOOK ---
        const mnemonicLine = analogy ? `🧠 **Memory Hook:** ${analogy.split('.')[0]}` : '';

        // --- 6. CONFUSION PAIR (Compact ❌/✅) ---
        let confusionBlock = '';
        if (misconceptions && misconceptions.length > 0) {
            const trap = misconceptions[0];
            confusionBlock = `⚠️ **Confusion:** ❌ ${trap} / ✅ ${conceptTag}`;
        }

        // --- 7. EXAM SHAPE (MCQ Pattern Rotation) ---
        let mcqBlock = "";
        if (index % 2 === 0) {
            // Shape A: Definition MCQ
            const stemKeywords = defSnippet.split(' ').slice(0, 4).join(' ');
            mcqBlock = `🧪 **MCQ:** Which term means "${stemKeywords}..."? → **${conceptTag}**`;
        } else {
            // Shape B: True/False Trap
            const trapConcept = misconceptions && misconceptions.length > 0 ? misconceptions[0] : "unrelated concept";
            mcqBlock = `🧪 **True/False:** ${conceptTag} is basically ${trapConcept}? → **False**`;
        }

        // --- FINAL ASSEMBLY (Strict Order) ---
        // Concept Name
        // 🎯 Exam Trigger
        // 🔑 Definition Line (compressed)
        // 🔒 Keywords Lock
        // 🧠 Memory Hook (1 line)
        // ⚠️ ❌ / ✅ Confusion
        // 🧪 MCQ Pattern
        // 🚦 Priority Badge

        return `## ${conceptTag.toUpperCase()}
🎯 **Trigger:** ${trigger}

🔑 **Def:** ${defSnippet}

🔒 **Keywords Lock:** ${keywordsLock}

${mnemonicLine}

${confusionBlock}

${mcqBlock}

🚦 ${priorityBadge}`;
    }).join('\n\n');

    log("Cheat Sheet Rendered.");

    const contentId = await sha256(content);
    return {
        topic: req.topic || 'High-Density Sheet',
        content: content,
        timestamp: Date.now(),
        contentId
    };
};
