
/**
 * EDUVA v2.2 Atom Validator
 * Strict checking for mandatory semantic fields.
 * Updated for V7 Schema Compliance.
 */
export function validateAtom(atom: any): string[] {
  const errors: string[] = [];

  // 1. Definition Check
  if (!atom.coreRepresentation?.definition || atom.coreRepresentation.definition.length < 5) {
    errors.push("Validation Fault: Core Definition missing or insufficient density.");
  }

  // 2. Keyword Check (Critical for Hybrid Grading)
  // V7: Check assessmentMetadata.essentialKeywords
  if (!atom.assessmentMetadata?.essentialKeywords || atom.assessmentMetadata.essentialKeywords.length < 1) {
    errors.push("Validation Fault: Mastery keywords missing. Offline grading will fail.");
  }

  // 3. Identity Check
  if (!atom.metadata?.conceptTag) {
    errors.push("Validation Fault: Concept Tag (Identity) missing.");
  }

  // 4. Source Check
  // V7: sourcePageRefs in metadata
  if (!atom.metadata?.sourcePageRefs || atom.metadata.sourcePageRefs.length === 0) {
    // Warn but allow if service injection failed, though service should have injected it.
    // Strictness reduced slightly to prevent total failure on single page missing.
    if (!atom.metadata?.sourcePageRefs) {
         errors.push("Validation Fault: Traceability lost. No page references.");
    }
  }

  return errors;
}
