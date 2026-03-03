
import { DecisionAction, ParentSignalType, InterventionPlan, SubjectHealthState, Difficulty } from '../types';

export const mapIntentToPlan = (
  decision: DecisionAction,
  signal: ParentSignalType,
  health: SubjectHealthState
): InterventionPlan => {
  
  // Default fallback plan
  const plan: InterventionPlan = {
    taskType: 'Quiz',
    // Fix: Using Difficulty.MEDIUM instead of string literal
    difficulty: Difficulty.MEDIUM,
    tone: 'Encouraging',
    uiTheme: 'INDIGO',
    studentTitle: 'Mission Update',
    parentSubtitle: 'Standard Review'
  };

  // 1. PROBE (Any Parent Signal)
  if (decision.type === 'PROBE') {
    return {
      taskType: 'Speed Round',
      // Fix: Using Difficulty.MEDIUM instead of string literal
      difficulty: Difficulty.MEDIUM,
      tone: 'Dynamic',
      uiTheme: 'AMBER',
      studentTitle: 'Knowledge Checkpoint',
      parentSubtitle: 'Verifying Neural Stability'
    };
  }

  // 2. COMMIT -> MASTERY
  if (decision.type === 'COMMIT' && decision.targetState === 'mastery') {
    if (signal === 'CELEBRATION') {
      return {
        taskType: 'Boss Battle',
        // Fix: Using Difficulty.HARD instead of string literal
        difficulty: Difficulty.HARD,
        tone: 'Heroic',
        uiTheme: 'EMERALD',
        studentTitle: 'Legendary Challenge Unlocked',
        parentSubtitle: 'Celebrating Mastery with Peak Performance'
      };
    }
    return {
      taskType: 'Advanced Deep Dive',
      // Fix: Using Difficulty.HARD instead of string literal
      difficulty: Difficulty.HARD,
      tone: 'Academic',
      uiTheme: 'INDIGO',
      studentTitle: 'Path to Excellence',
      parentSubtitle: 'Deepening Core Foundations'
    };
  }

  // 3. COMMIT -> DISENGAGED
  if (decision.type === 'COMMIT' && decision.targetState === 'disengaged') {
    if (signal === 'CELEBRATION') {
      return {
        taskType: 'Boss Battle',
        // Fix: Using Difficulty.MEDIUM instead of string literal
        difficulty: Difficulty.MEDIUM,
        tone: 'Gamified',
        uiTheme: 'EMERALD',
        studentTitle: 'Surprise Challenge!',
        parentSubtitle: 'Re-igniting Spark with Success'
      };
    }
    if (signal === 'SUPPORT') {
      return {
        taskType: 'Gamified Deep Dive',
        // Fix: Using Difficulty.MEDIUM instead of string literal
        difficulty: Difficulty.MEDIUM,
        tone: 'Playful',
        uiTheme: 'INDIGO',
        studentTitle: 'New Level Discovered',
        parentSubtitle: 'Supportive Momentum Building'
      };
    }
    return {
      taskType: 'Speed Round',
      // Fix: Using Difficulty.MEDIUM instead of string literal
      difficulty: Difficulty.MEDIUM,
      tone: 'Urgent',
      uiTheme: 'AMBER',
      studentTitle: 'Rapid Mastery',
      parentSubtitle: 'Efficiency-First Knowledge Check'
    };
  }

  // 4. COMMIT -> STRUGGLE (Critical Innovation)
  if (decision.type === 'COMMIT' && decision.targetState === 'struggle') {
    if (signal === 'CELEBRATION') {
      return {
        taskType: 'Review & Conquer',
        // Fix: Using Difficulty.MEDIUM instead of string literal
        difficulty: Difficulty.MEDIUM,
        tone: 'Empowering',
        uiTheme: 'INDIGO',
        studentTitle: 'Mastery Reinforcement',
        parentSubtitle: 'Preserving Confidence through Guided Review'
      };
    }
    return {
      taskType: 'Foundation Repair',
      difficulty: Difficulty.REMEDIAL,
      tone: 'Supportive',
      uiTheme: 'INDIGO',
      studentTitle: 'Groundwork Mission',
      parentSubtitle: 'Tactical Foundation Rebuilding'
    };
  }

  return plan;
};
