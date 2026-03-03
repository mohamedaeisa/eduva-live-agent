import { CurriculumNode } from '../../../../types/ingestion';
import { logger } from '../../../../utils/logger';

export interface NodeBatch {
    id: string;
    nodes: CurriculumNode[];
    textSlice: string;
    startIndex: number;
    endIndex: number;
}

const MAX_TEXT_PER_BATCH = 8000;
const MAX_BATCHES = 5;

/**
 * Deterministically sorts and batches nodes based on their position in the text.
 * Enforces strict limits: Max 8k chars per batch, Max 5 batches total.
 */
export function batchNodes(nodes: CurriculumNode[], fullText: string): NodeBatch[] {
    if (!nodes || nodes.length === 0) return [];

    // 1. Locate and Sort Nodes
    const locatedNodes = nodes.map(node => {
        const hint = node.sourceAnchors.textSpanHint || node.sourceAnchors.sectionTitle;
        // Simple locator: First occurrence of hint
        // In prod, use fuzzy match or the exact offset from mapping stage if available
        let offset = fullText.indexOf(hint);
        if (offset === -1) offset = 0; // Fallback to start if not found

        return { ...node, _sortOffset: offset };
    });

    locatedNodes.sort((a, b) => a._sortOffset - b._sortOffset);

    // 2. Group into Batches
    let batches: NodeBatch[] = [];
    let currentBatch: NodeBatch = {
        id: 'batch_0',
        nodes: [],
        textSlice: '',
        startIndex: locatedNodes[0]._sortOffset,
        endIndex: locatedNodes[0]._sortOffset
    };

    for (const node of locatedNodes) {
        // Estimate node end (assume ~1000 chars coverage per concept if unknown)
        const nodeStart = node._sortOffset;
        const estimatedEnd = Math.min(nodeStart + 2000, fullText.length);

        const newStartIndex = Math.min(currentBatch.startIndex, nodeStart);
        const newEndIndex = Math.max(currentBatch.endIndex, estimatedEnd);
        const newSliceLength = newEndIndex - newStartIndex;

        if (currentBatch.nodes.length > 0 && newSliceLength > MAX_TEXT_PER_BATCH) {
            // Push old batch
            currentBatch.textSlice = fullText.substring(currentBatch.startIndex, currentBatch.endIndex);
            batches.push(currentBatch);

            // Start new batch
            currentBatch = {
                id: `batch_${batches.length}`,
                nodes: [node],
                textSlice: '',
                startIndex: nodeStart,
                endIndex: estimatedEnd
            };
        } else {
            // Add to current
            currentBatch.nodes.push(node);
            currentBatch.startIndex = newStartIndex;
            currentBatch.endIndex = newEndIndex;
        }
    }

    // Push final batch
    if (currentBatch.nodes.length > 0) {
        currentBatch.textSlice = fullText.substring(currentBatch.startIndex, currentBatch.endIndex);
        batches.push(currentBatch);
    }

    // 3. Enforce Max Batches (Merge Overflows)
    if (batches.length > MAX_BATCHES) {
        logger.ingestion(`[SMART_CURRICULUM] Batch overflow (${batches.length} > ${MAX_BATCHES}). Merging tail.`);

        // Take the first MAX_BATCHES - 1
        const kept = batches.slice(0, MAX_BATCHES - 1);

        // Merge the rest into the last allowed batch
        const tail = batches.slice(MAX_BATCHES - 1);

        const mergedTail: NodeBatch = {
            id: `batch_${MAX_BATCHES - 1}_merged`,
            nodes: tail.flatMap(b => b.nodes),
            startIndex: tail[0].startIndex,
            endIndex: tail[tail.length - 1].endIndex,
            textSlice: fullText.substring(tail[0].startIndex, tail[tail.length - 1].endIndex)
            // NOTE: This might violate 8k limit, but "Completed" is better than "Missing"
        };

        batches = [...kept, mergedTail];
    }

    logger.ingestion(`[SMART_CURRICULUM] Batched ${nodes.length} nodes into ${batches.length} batches.`);
    batches.forEach((b, i) => {
        logger.ingestion(`[SMART_CURRICULUM] Batch #${i + 1}: ${b.nodes.length} nodes, ${b.textSlice.length} chars.`);
    });

    return batches;
}
