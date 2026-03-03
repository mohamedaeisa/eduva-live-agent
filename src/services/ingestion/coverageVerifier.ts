import { CurriculumMap, CurriculumNode } from '../../types/ingestion';
import { AtomCore } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Phase 3 R3 v1.1: NODE COVERAGE VERIFICATION
 * 
 * Purpose: Ensure every curriculum node has corresponding atoms
 * to prevent orphaned nodes and uncovered knowledge gaps.
 * 
 * Validates the core contract: "Atoms cannot exist without a map node"
 */

// 📊 Coverage Report
export interface CoverageReport {
    // Summary Metrics
    totalNodes: number;
    totalAtoms: number;
    coveredNodes: number;
    coveragePercentage: number;

    // Health Status
    isHealthy: boolean;

    // Detailed Findings
    uncoveredNodeIds: string[];          // Nodes with NO atoms
    uncoveredNodeTitles: string[];       // Human-readable titles
    orphanedAtomIds: string[];           // Atoms with invalid nodeId

    // Quality Metrics
    avgAtomsPerNode: number;
    nodesWithSingleAtom: number;         // Potential quality issue
    highCoverageNodes: string[];         // Nodes with 3+ atoms (good)

    // Warnings
    warnings: string[];
}

/**
 * Verify that all curriculum nodes have corresponding atoms
 */
export function verifyCoverage(
    map: CurriculumMap,
    atoms: AtomCore[]
): CoverageReport {

    logger.ingestion(`[COVERAGE] Verifying ${map.nodes.length} nodes against ${atoms.length} atoms...`);

    // Build lookup structures
    const nodeIds = new Set(map.nodes.map(n => n.nodeId));
    const nodeTitleMap = new Map(map.nodes.map(n => [n.nodeId, n.title]));

    // Group atoms by nodeId
    const atomsByNode = new Map<string, AtomCore[]>();
    const orphanedAtomIds: string[] = [];

    for (const atom of atoms) {
        const nodeId = atom.metadata.curriculumNodeId;

        if (!nodeId) {
            // Atom missing nodeId link
            orphanedAtomIds.push(atom.atomId);
            logger.warn(`[COVERAGE] Atom ${atom.atomId} has no curriculumNodeId`);
            continue;
        }

        if (!nodeIds.has(nodeId)) {
            // Atom references non-existent node
            orphanedAtomIds.push(atom.atomId);
            logger.warn(`[COVERAGE] Atom ${atom.atomId} references unknown node: ${nodeId}`);
            continue;
        }

        // Valid atom
        if (!atomsByNode.has(nodeId)) {
            atomsByNode.set(nodeId, []);
        }
        atomsByNode.get(nodeId)!.push(atom);
    }

    // Identify uncovered nodes
    const uncoveredNodeIds: string[] = [];
    const uncoveredNodeTitles: string[] = [];

    for (const node of map.nodes) {
        if (!atomsByNode.has(node.nodeId)) {
            uncoveredNodeIds.push(node.nodeId);
            uncoveredNodeTitles.push(node.title);
        }
    }

    // Quality metrics
    const coveredNodes = map.nodes.length - uncoveredNodeIds.length;
    const coveragePercentage = map.nodes.length > 0
        ? (coveredNodes / map.nodes.length) * 100
        : 0;

    const nodesWithSingleAtom = Array.from(atomsByNode.values())
        .filter(atoms => atoms.length === 1).length;

    const highCoverageNodes = Array.from(atomsByNode.entries())
        .filter(([_, atoms]) => atoms.length >= 3)
        .map(([nodeId, _]) => nodeTitleMap.get(nodeId) || nodeId);

    const avgAtomsPerNode = atomsByNode.size > 0
        ? atoms.length / atomsByNode.size
        : 0;

    // Generate warnings
    const warnings: string[] = [];

    if (uncoveredNodeIds.length > 0) {
        warnings.push(`${uncoveredNodeIds.length} nodes have no atoms (${((uncoveredNodeIds.length / map.nodes.length) * 100).toFixed(1)}%)`);
    }

    if (orphanedAtomIds.length > 0) {
        warnings.push(`${orphanedAtomIds.length} orphaned atoms (invalid nodeId references)`);
    }

    if (nodesWithSingleAtom > coveredNodes * 0.3) {
        warnings.push(`${nodesWithSingleAtom} nodes have only 1 atom (potential under-coverage)`);
    }

    if (coveragePercentage < 80) {
        warnings.push(`Low coverage: ${coveragePercentage.toFixed(1)}% (target: 80%+)`);
    }

    // Health check
    const isHealthy = uncoveredNodeIds.length === 0 && orphanedAtomIds.length === 0;

    const report: CoverageReport = {
        totalNodes: map.nodes.length,
        totalAtoms: atoms.length,
        coveredNodes,
        coveragePercentage,
        isHealthy,
        uncoveredNodeIds,
        uncoveredNodeTitles,
        orphanedAtomIds,
        avgAtomsPerNode,
        nodesWithSingleAtom,
        highCoverageNodes,
        warnings
    };

    // Logging
    if (isHealthy) {
        logger.ingestion(`[COVERAGE] ✅ 100% coverage: All ${map.nodes.length} nodes have atoms`);
        logger.ingestion(`[COVERAGE] Metrics: ${avgAtomsPerNode.toFixed(1)} atoms/node, ${highCoverageNodes.length} high-coverage nodes`);
    } else {
        logger.warn(`[COVERAGE] ⚠️ Coverage incomplete: ${coveragePercentage.toFixed(1)}%`);
        if (uncoveredNodeIds.length > 0) {
            logger.warn(`[COVERAGE] Uncovered nodes (${uncoveredNodeIds.length}):`);
            uncoveredNodeTitles.slice(0, 5).forEach(title => {
                logger.warn(`  - ${title}`);
            });
            if (uncoveredNodeTitles.length > 5) {
                logger.warn(`  ... and ${uncoveredNodeTitles.length - 5} more`);
            }
        }
        if (orphanedAtomIds.length > 0) {
            logger.warn(`[COVERAGE] ${orphanedAtomIds.length} orphaned atoms detected`);
        }
    }

    return report;
}

/**
 * Get nodes that need atom extraction
 */
export function getUncoveredNodes(
    map: CurriculumMap,
    atoms: AtomCore[]
): CurriculumNode[] {

    const atomNodeIds = new Set(
        atoms
            .map(a => a.metadata.curriculumNodeId)
            .filter((id): id is string => !!id)
    );

    return map.nodes.filter(node => !atomNodeIds.has(node.nodeId));
}

/**
 * Validate atom-node linkage integrity
 * Returns atoms that should be removed (orphaned)
 */
export function validateAtomLinks(
    map: CurriculumMap,
    atoms: AtomCore[]
): { validAtoms: AtomCore[]; orphanedAtoms: AtomCore[] } {

    const nodeIds = new Set(map.nodes.map(n => n.nodeId));
    const validAtoms: AtomCore[] = [];
    const orphanedAtoms: AtomCore[] = [];

    for (const atom of atoms) {
        const nodeId = atom.metadata.curriculumNodeId;

        if (!nodeId || !nodeIds.has(nodeId)) {
            orphanedAtoms.push(atom);
        } else {
            validAtoms.push(atom);
        }
    }

    if (orphanedAtoms.length > 0) {
        logger.warn(`[COVERAGE] Found ${orphanedAtoms.length} orphaned atoms (will be excluded)`);
    }

    return { validAtoms, orphanedAtoms };
}

/**
 * Generate coverage summary for logging/display
 */
export function formatCoverageSummary(report: CoverageReport): string {
    const lines = [
        `Coverage: ${report.coveragePercentage.toFixed(1)}% (${report.coveredNodes}/${report.totalNodes} nodes)`,
        `Total Atoms: ${report.totalAtoms}`,
        `Avg Atoms/Node: ${report.avgAtomsPerNode.toFixed(1)}`,
    ];

    if (report.highCoverageNodes.length > 0) {
        lines.push(`High Coverage Nodes: ${report.highCoverageNodes.length}`);
    }

    if (!report.isHealthy) {
        lines.push(`⚠️ Issues Found:`);
        report.warnings.forEach(w => lines.push(`  - ${w}`));
    }

    return lines.join('\n');
}
