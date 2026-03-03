
import { UserProfile, AtomCore } from '../types';
import { getLocalAtoms } from './storageService';

export interface DashboardStats {
  totalScope: number;
  masteredCount: number;
  inProgressCount: number;
  globalProgress: number; // 0-100
  cognitiveSplit: {
    recall: number; // L1 Mastery
    apply: number;  // L2 Mastery
    analyze: number; // L3 Mastery
  };
  galaxyNodes: GalaxyNode[];
  velocity: number; // Atoms mastered per week (Estimate)
}

export interface GalaxyNode {
  id: string;
  x: number;
  y: number;
  status: 'LOCKED' | 'ACTIVE' | 'MASTERED';
  title: string;
  connections: string[]; // IDs of related atoms
}

export const generateStudentDashboard = async (user: UserProfile, subject: string): Promise<DashboardStats> => {
  // 1. Fetch the Universe (All Atoms for Subject)
  const allAtoms = await getLocalAtoms(user.id);
  // Fix: Property 'metadata' does not exist on type 'AtomViewModel'. Access via 'core'.
  const subjectAtoms = allAtoms.filter(a => a.core.metadata.subject === subject);
  
  // 2. Get the User's footprint (Mastery Map)
  const masteryMap = user.gamification.masteryMap || {};
  
  let mastered = 0;
  let inProgress = 0;
  let recallCount = 0; 
  let applyCount = 0; 
  let analyzeCount = 0;

  // 3. Generate Galaxy Nodes & Calculate Stats
  const nodes: GalaxyNode[] = subjectAtoms.map((atom, index) => {
    const score = masteryMap[atom.atomId] || 0;
    
    // Status Logic
    let status: GalaxyNode['status'] = 'LOCKED';
    if (score >= 0.9) {
      status = 'MASTERED';
      mastered++;
    } else if (score > 0) {
      status = 'ACTIVE';
      inProgress++;
    }

    // Cognitive Split Logic
    if (score >= 0.3) recallCount++;
    if (score >= 0.6) applyCount++;
    if (score >= 0.9) analyzeCount++;

    // Procedural Galaxy Generation (Spiral Layout)
    const angle = 0.5 * index;
    const radius = 5 + 4 * angle;
    return {
      id: atom.atomId,
      x: Math.cos(angle) * radius, 
      y: Math.sin(angle) * radius,
      status,
      // Fix: Property 'metadata' does not exist on type 'AtomViewModel'. Access via 'core'.
      title: atom.core.metadata?.conceptTag || "Unknown Concept",
      connections: [] 
    };
  });

  return {
    totalScope: subjectAtoms.length,
    masteredCount: mastered,
    inProgressCount: inProgress,
    globalProgress: Math.round((mastered / (subjectAtoms.length || 1)) * 100),
    cognitiveSplit: {
      recall: recallCount,
      apply: applyCount,
      analyze: analyzeCount
    },
    galaxyNodes: nodes,
    velocity: 5 
  };
};
