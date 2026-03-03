import { sanitizeAtom } from '../../utils/atomSanitizer';
import { validateAtom } from '../../utils/atomValidator';

/**
 * THE IRON GATE: v2.2 Finalization Pipeline
 * Ensures no malformed or non-compliant atoms enter the Firestore grid.
 */
export function finalizeAtom(rawAtom: any, fingerprint: string): any {
  // Phase 1: Aggressive Sanitization (Fix types, remove deprecated fields)
  const sanitized = sanitizeAtom(rawAtom, fingerprint);

  // Phase 2: Strict Validation (Reject missing logic)
  const errors = validateAtom(sanitized);

  if (errors.length > 0) {
    throw new Error(errors.join(' | '));
  }

  // Phase 3: Return Certified Payload
  return sanitized;
}