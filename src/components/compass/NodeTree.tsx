
import React, { useState } from 'react';
import { NodeWithMastery, AtomCoverage } from '../../types';

interface NodeTreeProps {
    nodes: NodeWithMastery[];
    rootNodes: string[];
}

const MasteryBadge = ({ level }: { level: AtomCoverage['masteryLevel'] }) => {
    const colors = {
        STRONG: 'bg-emerald-500',
        PARTIAL: 'bg-amber-500',
        WEAK: 'bg-rose-500',
        UNKNOWN: 'bg-slate-200 dark:bg-slate-700'
    };
    return <div className={`w-2 h-2 rounded-full ${colors[level]} shadow-sm shrink-0`}></div>;
};

const NodeItem: React.FC<{ node: NodeWithMastery }> = ({ node }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasAtoms = node.atoms.length > 0;

    const masteryColor =
        node.nodeMastery >= 80 ? 'text-emerald-600' :
            node.nodeMastery >= 50 ? 'text-amber-600' :
                node.nodeMastery > 0 ? 'text-rose-600' : 'text-slate-400';

    return (
        <div className="mb-2">
            {/* Node Header */}
            <div
                className={`flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${hasAtoms ? 'cursor-pointer' : ''}`}
                onClick={() => hasAtoms && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3 flex-grow">
                    {hasAtoms && (
                        <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                        </span>
                    )}
                    <h5 className="font-bold text-sm text-slate-700 dark:text-slate-200">
                        {node.title}
                    </h5>
                </div>
                <div className="flex items-center gap-3">
                    {node.atomCount > 0 && (
                        <span className="text-[10px] font-bold text-slate-400">
                            {node.atomCount} atom{node.atomCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <span className={`text-sm font-black ${masteryColor}`}>
                        {node.nodeMastery}%
                    </span>
                </div>
            </div>

            {/* Atoms (when expanded) */}
            {isExpanded && hasAtoms && (
                <div className="mt-2 ml-6 pl-4 border-l-2 border-slate-100 dark:border-slate-800 space-y-3">
                    {node.atoms.map(atom => (
                        <div key={atom.atomId} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-3">
                                <MasteryBadge level={atom.masteryLevel} />
                                <span className={`text-sm font-medium ${atom.masteryLevel === 'UNKNOWN' ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'
                                    }`}>
                                    {atom.conceptTag}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {atom.masteryLevel === 'UNKNOWN' ? (
                                    <span className="text-[10px] font-bold text-slate-300 uppercase">
                                        Not Started
                                    </span>
                                ) : (
                                    <>
                                        <div className="w-20 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500/50" style={{ width: `${atom.masteryScore}%` }}></div>
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-500 w-8 text-right">
                                            {atom.masteryScore}%
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const NodeTree: React.FC<NodeTreeProps> = ({ nodes }) => {
    if (nodes.length === 0) {
        return (
            <p className="text-center text-xs text-slate-400 italic py-4">
                No curriculum map available.
            </p>
        );
    }

    // FLAT LIST: All nodes at same level, each expandable to show atoms
    return (
        <div className="space-y-1">
            {nodes.map(node => (
                <NodeItem key={node.nodeId} node={node} />
            ))}
        </div>
    );
};

export default NodeTree;
