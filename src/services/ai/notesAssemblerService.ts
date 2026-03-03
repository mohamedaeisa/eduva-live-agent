
import { Type } from "@google/genai";
import {
    GenerationRequest, StudyNoteData, StudyNoteSection, UserProfile, LocalTrainingSource, AtomCore,
    Difficulty, DetailLevel, QuizType
} from '../../types';
import { getLocalAtoms, saveToHistory, saveLocalTrainingSource } from '../storageService';
import { sha256 } from '../../utils/hashUtils';
import { getDB } from '../idbService';
import { db } from '../firebaseConfig';
import { fetchAtomsForSession } from '../hydrationService';
import { extractAtomsFromDocument } from './ingestionService';

/**
 * EDUVA v2.9 Logic Linker (Advanced Synthesis Layer)
 * Restored for Master Guide Fidelity
 */
export const assembleStudyNotes = async (
    req: GenerationRequest,
    user: UserProfile,
    onStatus?: (msg: string) => void,
    onPartialUpdate?: (partial: Partial<StudyNoteData>) => void
): Promise<StudyNoteData> => {
    const log = (msg: string) => onStatus?.(`[ASSEMBLER] ${msg}`);

    // Standard Note Assembly Logic
    if (!req.selectedDocumentIds || req.selectedDocumentIds.length === 0) {
        throw new Error("Selection Fault: No knowledge vaults selected.");
    }

    log("Synchronizing Knowledge Vaults...");
    const idb = await getDB();
    const contentIds: string[] = [];

    for (const identifier of req.selectedDocumentIds) {
        let source = await idb.get('training_sources', identifier);

        if (!source) {
            const allLocal = await idb.getAll('training_sources');
            source = allLocal.find(s => s.fileHash === identifier);
        }

        if (!source) {
            try {
                const cloudDoc = await db.collection('training_sources').doc(identifier).get();
                if (cloudDoc.exists) {
                    source = cloudDoc.data() as LocalTrainingSource;
                } else {
                    const cloudSnap = await db.collection('training_sources')
                        .where('studentId', '==', user.id)
                        .where('fileHash', '==', identifier)
                        .limit(1)
                        .get();
                    if (!cloudSnap.empty) {
                        source = cloudSnap.docs[0].data() as LocalTrainingSource;
                    }
                }

                if (source) {
                    await idb.put('training_sources', source);
                }
            } catch (e) {
                console.warn("[ASSEMBLER] Cloud resolution attempt failed", e);
            }
        }

        if (!source) throw new Error(`Vault Link Corrupted: Record ${identifier} not found.`);

        const fingerprint = source.fileHash;
        contentIds.push(fingerprint);
        log(`Establishing Bridge: ${source.fileName}...`);

        let hydration = await fetchAtomsForSession(user.id, fingerprint, (msg) => onStatus?.(`[ASSEMBLER] ${msg}`));

        // SELF-HEALING: If atoms missing but source data (base64) exists, re-extract immediately.
        if (hydration.status === 'error') {
            if (source.data) {
                log(`[SELF-HEAL] Re-synthesizing atoms for ${source.fileName}...`);
                try {
                    const repairReq: GenerationRequest = {
                        subject: source.subject || req.subject,
                        topic: source.fileName,
                        mode: 'atom_extraction',
                        language: req.language,
                        difficulty: Difficulty.MEDIUM,
                        detailLevel: DetailLevel.DETAILED,
                        quizType: QuizType.MIX,
                        questionCount: 0,
                        studyMaterialFile: source.data,
                        studyMaterialUrl: source.fileHash,
                        fileName: source.fileName,
                        year: source.grade || req.year,
                        curriculum: (source.educationSystem as any) || req.curriculum
                    };

                    await extractAtomsFromDocument(repairReq, user, (m) => log(`[HEAL] ${m}`));
                    hydration = await fetchAtomsForSession(user.id, fingerprint);
                } catch (healErr) {
                    console.error("[ASSEMBLER] Self-healing failed", healErr);
                }
            }
        }

        if (hydration.status === 'error') {
            if (source.status === 'Completed') {
                source.status = 'Pending';
                source.progress = 0;
                await idb.put('training_sources', source);
                await saveLocalTrainingSource(source).catch(e => console.warn("Status sync failed", e));
            }
            throw new Error(`Data integrity fault for "${source.fileName}". Atoms missing and source file unavailable. Please re-upload/train in Library.`);
        }
    }

    const atomResults = await Promise.all(contentIds.map(id => getLocalAtoms(user.id, id)));
    let allViewModels = atomResults.flat();

    log(`Total atoms before filtering: ${allViewModels.length}`);

    // --- PAGE RANGE FILTERING ---
    // If custom page ranges are specified, filter atoms by their source page references
    if (req.documentConfigs) {
        log(`Document configs provided: ${JSON.stringify(req.documentConfigs)}`);

        const configKeys = Object.keys(req.documentConfigs);
        const hasCustomRanges = configKeys.some(key => req.documentConfigs![key].useCustomRange);

        if (hasCustomRanges) {
            log(`Applying custom page ranges...`);

            const beforeCount = allViewModels.length;
            allViewModels = allViewModels.filter(vm => {
                const sourceId = vm.core.metadata.sourceDocumentId;

                // Try to find config using different ID formats
                // The documentConfigs keys are fileHash from selectedDocumentIds
                // Try exact match first, then check if any key matches
                let config = req.documentConfigs![sourceId];

                if (!config) {
                    // Try to find by checking if sourceId matches any of the selected document IDs
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
                const pageRefs = vm.core.metadata.sourcePageRefs;
                log(`Checking atom ${vm.atomId}: sourceId=${sourceId}, pageRefs=${JSON.stringify(pageRefs)}, range=${config.start}-${config.end}`);

                if (!pageRefs || pageRefs.length === 0) {
                    // If atom has no page refs, include it (conservative approach)
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

            log(`Filtered from ${beforeCount} to ${allViewModels.length} atoms within specified page ranges.`);
        } else {
            log(`No custom ranges specified, using all atoms.`);
        }
    }

    // --- SCOPE REFINEMENT (Weakness Targeting) ---
    if (req.struggleAtoms && req.struggleAtoms.length > 0) {
        log(`Refining scope to ${req.struggleAtoms.length} targeted concepts...`);
        const filtered = allViewModels.filter(vm => req.struggleAtoms!.includes(vm.atomId));
        if (filtered.length > 0) {
            allViewModels = filtered;
        }
    }

    const allAtoms = allViewModels.map(vm => vm.core).sort((a, b) => {
        const seqA = a.metadata.narrativeSequence || 0;
        const seqB = b.metadata.narrativeSequence || 0;
        return seqA - seqB;
    });

    const globalGlossary = allAtoms.map(a => ({
        term: a.metadata.conceptTag,
        definition: a.coreRepresentation.definition
    }));

    log(`Cross-Linking ${allAtoms.length} Concepts...`);

    const sections: StudyNoteSection[] = allAtoms.map((atom, sectionIdx) => {
        const currentHeading = atom.metadata.conceptTag.toLowerCase();

        // Derived UI Fields for Master Guide
        const difficultyMap: Record<number, string> = { 1: 'Recall', 2: 'Recall', 3: 'Apply', 4: 'Analyze', 5: 'Analyze' };
        const diffLevel = atom.assessmentMetadata?.difficultyCeiling || 3;
        const difficultyBadge = difficultyMap[diffLevel] || 'Apply';

        const rememberThis = (atom.coreRepresentation.keyRule && atom.coreRepresentation.keyRule.toUpperCase() !== 'N/A')
            ? atom.coreRepresentation.keyRule
            : (atom.coreRepresentation.formula || atom.coreRepresentation.definition.split('.')[0]);

        const examHint = atom.extendedRepresentation.proTips?.[0]
            || (atom.extendedRepresentation.misconceptions?.[0] ? `Common error: ${atom.extendedRepresentation.misconceptions[0]}` : "Focus on precision in definition.");

        const miniQuestion = {
            question: `Test yourself: Define ${atom.metadata.conceptTag}`,
            answer: atom.coreRepresentation.definition
        };

        const actionableTraps = atom.extendedRepresentation.misconceptions || [];
        const linkedConcepts = atom.metadata.relatedConceptTags || [];

        let visualFlow: string[] | undefined;
        const rule = atom.coreRepresentation.keyRule || "";
        if (rule.includes('->')) {
            visualFlow = rule.split('->').map(s => s.trim());
        } else if (rule.includes('→')) {
            visualFlow = rule.split('→').map(s => s.trim());
        }

        // Smart Glossary Linking
        const searchContext = (
            atom.metadata.conceptTag + " " +
            atom.coreRepresentation.definition + " " +
            atom.coreRepresentation.keyRule + " " +
            atom.extendedRepresentation.fullExplanation
        ).toLowerCase();

        const mentionedDefinitions = globalGlossary.filter(def => {
            const targetTerm = def.term.toLowerCase();
            if (targetTerm === currentHeading) return false;
            if (currentHeading.includes(targetTerm) || targetTerm.includes(currentHeading)) return false;
            return searchContext.includes(targetTerm);
        });

        let finalDefinitions = [...mentionedDefinitions];
        if (finalDefinitions.length < 3) {
            const remainingGlossary = globalGlossary.filter(def =>
                def.term.toLowerCase() !== currentHeading &&
                !finalDefinitions.some(fd => fd.term === def.term)
            );
            // Distribute filler definitions based on sequence to rotate them
            const primeOffset = (sectionIdx * 2) % Math.max(1, remainingGlossary.length);
            const fillers = [...remainingGlossary.slice(primeOffset), ...remainingGlossary.slice(0, primeOffset)];
            finalDefinitions = [...finalDefinitions, ...fillers].slice(0, 3);
        }

        return {
            heading: atom.metadata.conceptTag,
            keyPoints: [
                atom.coreRepresentation.definition,
                atom.coreRepresentation.keyRule,
                atom.extendedRepresentation.fullExplanation,
                ...(atom.coreRepresentation.formula ? [`Formula: $${atom.coreRepresentation.formula}$`] : [])
            ],
            definitions: finalDefinitions,
            examFacts: [...(atom.extendedRepresentation.proTips || []), ...(atom.extendedRepresentation.misconceptions.map(m => `Avoid: ${m}`))],
            trustScore: atom.trustScore,
            pageRefs: atom.metadata.sourcePageRefs,
            mnemonic: atom.extendedRepresentation.realWorldAnalogy,
            // Enhanced UI fields
            rememberThis,
            examHint,
            miniQuestion,
            actionableTraps,
            linkedConcepts,
            difficultyBadge,
            visualFlow
        };
    });

    const assemblyKey = await sha256(req.selectedDocumentIds.join(':') + 'fullNotes' + (req.struggleAtoms ? req.struggleAtoms.join(',') : ''));
    const finalData: StudyNoteData = {
        title: req.topic || "Master Study Guide",
        summary: `Complete synthesis of ${allAtoms.length} core concepts across ${req.selectedDocumentIds.length} materials.`,
        sections,
        timestamp: Date.now(),
        contentId: assemblyKey,
        mode: 'fullNotes',
        atomIds: allAtoms.map(a => a.atomId)
    };

    await saveToHistory({ title: finalData.title, type: 'note', timestamp: finalData.timestamp, data: finalData }, user.id);
    return finalData;
};
