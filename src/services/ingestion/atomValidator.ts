import { z } from 'zod';
import { logger } from '../../utils/logger';

/**
 * ARABIC DEFINITION RULES (v1.2 Strict)
 * - Must start with specific identifiers (Ho, Hiya, Yu'arraf, etc.)
 * - Must NOT start with weak verbs (Yu'addi, Yusa'id, etc.)
 * - Must be atomic (no huge paragraphs)
 */

const ARABIC_START_ALLOW = /^(هو|هي|يُعرّف|يُقصد بـ|عبارة عن|هي عملية|هو عملية|نظام|جهاز|علم|مجال)/;
const ARABIC_START_DENY = /^(يؤدي|يساعد|يعتمد|تتكون|يتميز|يعتبر|تعتبر)/;

export const AtomSchema = z.object({
    atomId: z.string().min(1),
    content: z.string().min(5), // The Definition
    type: z.enum(['CONCEPT', 'RULE', 'SKILL', 'PROCESS', 'FACT']), // Added FACT for completeness

    metadata: z.object({
        conceptTag: z.string().min(1),
        subject: z.string(),
        language: z.string(),
        gradeLevel: z.union([z.string(), z.number()]).optional(),
        curriculumNodeId: z.string().optional(),
    }).passthrough(), // Allow other metadata

}).superRefine((val, ctx) => {
    // 🔒 GUARDRAIL: Strict Arabic Validation
    if (val.metadata.language === 'Arabic') {
        const def = val.content.trim();

        // Rule 1: Forbidden Starters (Weak Definitions)
        if (ARABIC_START_DENY.test(def)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Arabic definition violates style guide. Uses forbidden verb start.`,
                path: ['content']
            });
        }

        // Rule 2: Mandated Starters (Strong Definitions)
        // We warn but don't fail hard on this unless strict mode (for now, just log/monitor, or strict?)
        // The prompt says "Auto-rejects atoms that fail", so we fail hard.
        if (!ARABIC_START_ALLOW.test(def)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Arabic definition must start with robust identifier (Ho/Hiya/...).`,
                path: ['content']
            });
        }

        // Rule 3: Length Cap (Atomic)
        if (def.length > 300) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Definition too long (${def.length} chars). Must be atomic.`,
                path: ['content']
            });
        }
    }
});

export type ValidatedAtom = z.infer<typeof AtomSchema>;

/**
 * Validates a batch of atoms.
 * - Filters out invalid ones.
 * - Logs rejections.
 * - Returns clean list.
 */
export function validateAtoms(atoms: any[]): any[] {
    const clean: any[] = [];
    let rejected = 0;

    for (const a of atoms) {
        const result = AtomSchema.safeParse(a);
        if (result.success) {
            clean.push(a);
        } else {
            rejected++;
            // Log first few errors for debug
            if (rejected <= 3) {
                logger.warn('INGESTION', `[ATOM_VALIDATOR] Rejected Atom "${a.metadata?.conceptTag}": ${result.error.issues[0].message}`);
            }
        }
    }

    if (rejected > 0) {
        logger.ingestion(`[ATOM_VALIDATOR] Filtered ${rejected}/${atoms.length} atoms due to strict rules.`);
    }

    return clean;
}
