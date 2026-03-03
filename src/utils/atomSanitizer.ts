import { decodeHTMLEntities, symbolicToLatex } from './stringUtils';

/**
 * EDUVA v2.3 Atom Sanitizer (Hardened)
 * Safety net to enforce structural integrity after AI generation.
 * Updated for V7 Schema Compliance.
 */
export function sanitizeAtom(rawAtom: any, fingerprint: string): any {
  // 0. Hardening: Ensure Metadata and AssessmentMetadata Exists
  if (!rawAtom.metadata) rawAtom.metadata = {};
  if (!rawAtom.assessmentMetadata) rawAtom.assessmentMetadata = {};

  // 1. Fix Difficulty Ceiling (Float -> Integer 1-5)
  // V7: Located in assessmentMetadata
  let ceiling = rawAtom.assessmentMetadata.difficultyCeiling;

  if (typeof ceiling === 'number') {
    // Map 0.0-1.0 float to 1-5 integer scale
    if (ceiling <= 1.0) {
      ceiling = Math.ceil(ceiling * 5);
    }
    // Round and Clamp between 1 and 5
    ceiling = Math.max(1, Math.min(5, Math.round(ceiling)));
  } else {
    ceiling = 3; // Default safety fallback (Analysis/Application level)
  }

  // 2. Clean Metadata (Remove Duplicate/Deprecated Fields)
  // 🔪 HARD DELETE sourcePages to prevent duplication in raw output
  if ('sourcePages' in rawAtom.metadata) {
    delete rawAtom.metadata.sourcePages;
  }

  const { sourcePages, ...cleanMetadata } = rawAtom.metadata;

  // Ensure ExtendedRepresentation exists and has defaults for missing fields
  const ext = rawAtom.extendedRepresentation || {};
  const extendedRepresentation = {
    fullExplanation: ext.fullExplanation || "",
    analogy: ext.analogy || "N/A",  // R3_Batch default
    misconceptions: Array.isArray(ext.misconceptions) ? ext.misconceptions : [],
    realWorldAnalogy: ext.realWorldAnalogy || "N/A", // R3_Batch default
    proTips: Array.isArray(ext.proTips) ? ext.proTips : [] // R3_Batch default
  };

  return {
    ...rawAtom,
    // Fix Identity (Enforce Fingerprint Link)
    fingerprint: fingerprint,
    metadata: {
      ...cleanMetadata,
      // Ensure strict sourceDocumentId linkage
      sourceDocumentId: fingerprint,
      // Ensure narrative sequence is numeric
      narrativeSequence: Number(cleanMetadata.narrativeSequence) || 0,
    },
    coreRepresentation: {
      ...(rawAtom.coreRepresentation || {}),
      definition: decodeHTMLEntities(rawAtom.coreRepresentation?.definition || ""),
      keyRule: symbolicToLatex(decodeHTMLEntities(rawAtom.coreRepresentation?.keyRule || "")),
      formula: symbolicToLatex(decodeHTMLEntities(rawAtom.coreRepresentation?.formula || "")),
      primaryExample: decodeHTMLEntities(rawAtom.coreRepresentation?.primaryExample || "")
    },
    extendedRepresentation: {
      ...extendedRepresentation,
      fullExplanation: decodeHTMLEntities(extendedRepresentation.fullExplanation || ""),
    },
    // V7 Structure
    assessmentMetadata: {
      ...rawAtom.assessmentMetadata,
      difficultyCeiling: ceiling,
      // Ensure keywords array exists
      essentialKeywords: Array.isArray(rawAtom.assessmentMetadata.essentialKeywords)
        ? rawAtom.assessmentMetadata.essentialKeywords
        : []
    }
  };
}
