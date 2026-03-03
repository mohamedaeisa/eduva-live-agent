import { z } from 'zod';
import { CurriculumMap, CurriculumNode } from '../../types/ingestion';
import { logger } from '../../utils/logger';

/**
 * Phase 3 R3 v1.1: MAP VALIDATION SCHEMA
 * 
 * Purpose: Validate AI-generated curriculum maps BEFORE storage
 * to prevent hallucinations, malformed data, and graph corruption.
 */

// 🔒 Node Type Enum (Strict)
export const NodeTypeSchema = z.enum(['concept', 'rule', 'skill', 'process'], {
    message: 'Node type must be: concept, rule, skill, or process'
});

// 🔒 Exam Weight Enum (Strict)
export const ExamWeightSchema = z.enum(['low', 'medium', 'high'], {
    message: 'Exam weight must be: low, medium, or high'
});

// 🔒 Content Status Enum
export const ContentStatusSchema = z.enum(['EMPTY', 'OK']).default('OK');

// 🔒 Source Anchors (Required for traceability)
export const SourceAnchorsSchema = z.object({
    sectionTitle: z.string().min(1, 'Section title cannot be empty'),
    textSpanHint: z.string().max(500, 'Text span hint too long (max 500 chars)'),
    pageRef: z.number().int().positive().optional()
}).strict();

// 🔒 Curriculum Node Schema
export const CurriculumNodeSchema = z.object({
    nodeId: z.string()
        .min(8, 'Node ID must be at least 8 characters')
        .regex(/^[a-f0-9]+$/, 'Node ID must be a valid hexadecimal hash'),

    title: z.string()
        .min(2, 'Node title too short (min 2 chars)')
        .max(200, 'Node title too long (max 200 chars)'),

    type: NodeTypeSchema,

    parentId: z.string().nullable(),

    prerequisites: z.array(z.string()).default([]),

    examWeight: ExamWeightSchema,

    sourceAnchors: SourceAnchorsSchema,

    contentStatus: ContentStatusSchema

}).strict();  // Reject unknown fields

// 🔒 Curriculum Map Schema
export const CurriculumMapSchema = z.object({
    mapId: z.string().min(8, 'Map ID must be at least 8 characters'),

    subject: z.string().min(1, 'Subject cannot be empty'),

    grade: z.union([
        z.string().regex(/^\d+$/, 'Grade must be numeric string'),
        z.number().int().positive()
    ]),

    language: z.enum(['Arabic', 'English'], {
        message: 'Language must be Arabic or English'
    }),

    version: z.string().default('1.0'),

    rootNodes: z.array(z.string()).default([]),

    nodes: z.array(CurriculumNodeSchema)
        .min(1, 'Map must contain at least 1 node')
        .max(500, 'Map exceeds maximum node limit (500)'),  // ⚡ CIRCUIT BREAKER

    createdAt: z.number().int().positive()

}).strict();

// 📊 Validation Report
export interface MapValidationReport {
    isValid: boolean;
    errors: string[];
    warnings: string[];
    nodeCount: number;
    circularReferences?: string[];
}

/**
 * Validates a curriculum map with comprehensive error reporting
 */
export function validateCurriculumMap(raw: unknown): { map: CurriculumMap | null; report: MapValidationReport } {
    const report: MapValidationReport = {
        isValid: false,
        errors: [],
        warnings: [],
        nodeCount: 0
    };

    try {
        // 1. Schema Validation
        const validated = CurriculumMapSchema.parse(raw);
        report.nodeCount = validated.nodes.length;

        // 2. Business Logic Validation
        const businessErrors = validateBusinessRules(validated);
        report.errors.push(...businessErrors);
        report.warnings.push(...validateWarnings(validated));

        // 3. Graph Integrity Checks
        const circularRefs = detectCircularReferences(validated.nodes);
        if (circularRefs.length > 0) {
            report.errors.push(`Circular references detected: ${circularRefs.join(', ')}`);
            report.circularReferences = circularRefs;
        }

        report.isValid = report.errors.length === 0;

        if (report.isValid) {
            logger.ingestion(`[MAP_VALIDATOR] ✅ Valid map: ${validated.nodes.length} nodes`);
            return { map: validated as CurriculumMap, report };
        } else {
            logger.warn('INGESTION', `[MAP_VALIDATOR] ❌ Invalid map: ${report.errors.length} errors`);
            report.errors.forEach(err => logger.warn('INGESTION', `  - ${err}`));
            return { map: null, report };
        }

    } catch (e: any) {
        if (e instanceof z.ZodError) {
            report.errors = e.issues.map(err => `${err.path.join('.')}: ${err.message}`);
            logger.error('INGESTION', `[MAP_VALIDATOR] Schema validation failed:`, report.errors);
        } else {
            report.errors.push(`Unexpected validation error: ${e.message}`);
            logger.error('INGESTION', `[MAP_VALIDATOR] Unexpected error:`, e);
        }
        return { map: null, report };
    }
}

/**
 * Business logic validation rules
 */
function validateBusinessRules(map: z.infer<typeof CurriculumMapSchema>): string[] {
    const errors: string[] = [];
    const nodeIds = new Set<string>();

    // Rule 1: Unique Node IDs
    for (const node of map.nodes) {
        if (nodeIds.has(node.nodeId)) {
            errors.push(`Duplicate node ID: ${node.nodeId}`);
        }
        nodeIds.add(node.nodeId);
    }

    // Rule 2: Valid Parent References
    for (const node of map.nodes) {
        if (node.parentId && !nodeIds.has(node.parentId)) {
            errors.push(`Node "${node.title}" references non-existent parent: ${node.parentId}`);
        }
    }

    // Rule 3: Valid Prerequisites
    for (const node of map.nodes) {
        for (const prereq of node.prerequisites) {
            if (!nodeIds.has(prereq)) {
                errors.push(`Node "${node.title}" references non-existent prerequisite: ${prereq}`);
            }
        }
    }

    return errors;
}

/**
 * Detects circular parent-child references
 */
function detectCircularReferences(nodes: z.infer<typeof CurriculumNodeSchema>[]): string[] {
    const circular: string[] = [];

    for (const node of nodes) {
        const visited = new Set<string>();
        let current: string | null = node.nodeId;

        while (current) {
            if (visited.has(current)) {
                circular.push(node.nodeId);
                break;
            }
            visited.add(current);
            const parent = nodes.find(n => n.nodeId === current);
            current = parent?.parentId || null;
        }
    }

    return circular;
}

/**
 * Generate warnings for suspicious but non-fatal patterns
 */
function validateWarnings(map: z.infer<typeof CurriculumMapSchema>): string[] {
    const warnings: string[] = [];

    // Warning 1: Empty nodes
    const emptyNodes = map.nodes.filter(n => n.contentStatus === 'EMPTY');
    if (emptyNodes.length > 0) {
        warnings.push(`${emptyNodes.length} nodes marked as EMPTY`);
    }

    // Warning 2: Orphan nodes (no parent, not in rootNodes)
    const orphans = map.nodes.filter(n => !n.parentId && !map.rootNodes?.includes(n.nodeId));
    if (orphans.length > 0 && map.rootNodes.length > 0) {
        warnings.push(`${orphans.length} orphan nodes (no parent, not in rootNodes)`);
    }

    // Warning 3: Excessive nodes
    if (map.nodes.length > 200) {
        warnings.push(`Large map (${map.nodes.length} nodes) - consider splitting document`);
    }

    return warnings;
}

/**
 * Quick validation (throws on error)
 */
export function assertValidMap(raw: unknown): CurriculumMap {
    const { map, report } = validateCurriculumMap(raw);

    if (!map) {
        throw new Error(`Map validation failed:\n${report.errors.join('\n')}`);
    }

    return map;
}
