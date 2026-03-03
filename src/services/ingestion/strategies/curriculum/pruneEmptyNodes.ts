import { CurriculumMap, CurriculumNode } from '../../../../types/ingestion';
import { logger } from '../../../../utils/logger';

export function pruneEmptyNodes(map: CurriculumMap): CurriculumMap {
    const originalCount = map.nodes.length;

    // 1. Identify valid nodes (OK status)
    const validNodes = map.nodes.filter(n => n.contentStatus !== 'EMPTY');
    const validNodeIds = new Set(validNodes.map(n => n.nodeId));

    // 2. Re-link children whose parents were removed
    // Strategy: If parent is removed, promote child to root (parentId = null) 
    // OR attach to grandparent? Promoting to root is safest for v1 to avoid disconnected subtrees.

    const prunedNodes: CurriculumNode[] = validNodes.map(node => {
        if (node.parentId && !validNodeIds.has(node.parentId)) {
            // Parent was pruned -> Promote to root
            return { ...node, parentId: null };
        }
        return node;
    });

    // 3. Re-calculate Root Nodes
    const newRootNodes = prunedNodes
        .filter(n => n.parentId === null)
        .map(n => n.nodeId);

    // Stats
    const removedCount = originalCount - prunedNodes.length;
    if (removedCount > 0) {
        logger.ingestion(`[PRUNE] Pruned ${removedCount} empty nodes from map ${map.mapId}`);
    }

    return {
        ...map,
        nodes: prunedNodes,
        rootNodes: newRootNodes
    };
}
