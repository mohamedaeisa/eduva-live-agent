
import {
    RadarStrategy, RadarAction, RadarActionType, RadarUrgency
} from '../types/radar';
import {
    findRecoveryCandidates, findBuildCandidates, findChallengeCandidates
} from './radarSignalService';
import { nanoid } from 'nanoid';
import { TRANSLATIONS } from '../i18n';
import { Language } from '../types';

/**
 * PHASE 4: Action Factory
 * Orchestrates the creation of concrete actions.
 * Fetches atoms ONLY if needed by the strategy.
 */

export const buildRadarActions = async (
    strategy: RadarStrategy,
    studentId: string,
    focusSubjectId?: string,
    limit: number = 3 // v2.2 Upgrade: Support limiting to 1
): Promise<RadarAction[]> => {

    const actions: RadarAction[] = [];

    // --- ONBOARDING ---
    if (strategy === RadarStrategy.ONBOARDING) {
        actions.push({
            actionId: nanoid(),
            subjectId: 'ALL',
            actionType: RadarActionType.QUIZ, // Normalized for execution (was DISCOVERY)
            urgency: RadarUrgency.HIGH,
            title: "Let's personalize your path",
            reason: "We need to know where you stand to guide you.",
            payload: {
                quizOrigin: 'NEW',
                quizScope: 'ALL'
            }
        });
        return actions;
    }

    if (!focusSubjectId) {
        // Fallback safety if strategy exists but subject is undefined (shouldn't happen via Engine)
        return actions;
    }

    // --- RECOVERY ---
    if (strategy === RadarStrategy.RECOVERY) {
        const weakAtoms = await findRecoveryCandidates(studentId, focusSubjectId, limit);

        if (weakAtoms.length > 0) {
            actions.push({
                actionId: nanoid(),
                subjectId: focusSubjectId,
                actionType: RadarActionType.NOTE, // V3: Use NOTE for Study
                urgency: RadarUrgency.HIGH,
                title: `Fix: ${weakAtoms[0].conceptTag || 'Weak Concepts'}`,
                reason: `Detected multiple mistakes in ${focusSubjectId}. Let's repair this foundation.`,
                payload: {
                    atomIds: weakAtoms.map(a => a.atomId),
                    scope: 'SUBJECT',
                    scopeId: focusSubjectId,
                    mode: 'notes', // Legacy
                    noteMode: 'REVIEW', // V3
                    contentId: weakAtoms[0].atomId
                }
            });

            // Secondary: Practice the same
            if (weakAtoms.length > 1) {
                actions.push({
                    actionId: nanoid(),
                    subjectId: focusSubjectId,
                    actionType: RadarActionType.QUIZ, // V3: Use QUIZ for Practice
                    urgency: RadarUrgency.MEDIUM,
                    title: `Practice: ${weakAtoms[0].conceptTag}`,
                    reason: "Reinforce what you just reviewed.",
                    payload: {
                        atomIds: weakAtoms.map(a => a.atomId),
                        scope: 'SUBJECT',
                        scopeId: focusSubjectId,
                        mode: 'quiz',
                        quizOrigin: 'REPAIR',
                        quizScope: 'SUBJECT'
                    }
                });
            }
        } else {
            // Fallback if no specific atoms found but status is Critical
            actions.push({
                actionId: nanoid(),
                subjectId: focusSubjectId,
                actionType: RadarActionType.QUIZ, // V3: QUIZ
                urgency: RadarUrgency.HIGH,
                title: `Basics Review: ${focusSubjectId}`,
                reason: "Your confidence is low here. Let's do a quick refresh.",
                payload: {
                    mode: 'quiz',
                    scope: 'SUBJECT',
                    scopeId: focusSubjectId,
                    quizOrigin: 'REPAIR',
                    quizScope: 'SUBJECT'
                }
            });
        }
        return actions;
    }

    // --- BUILD ---
    if (strategy === RadarStrategy.BUILD) {
        const gapAtoms = await findBuildCandidates(studentId, focusSubjectId, limit);

        if (gapAtoms.length > 0) {
            actions.push({
                actionId: nanoid(),
                subjectId: focusSubjectId,
                actionType: RadarActionType.QUIZ, // V3
                urgency: RadarUrgency.MEDIUM,
                title: `Apply: ${gapAtoms[0].conceptTag}`,
                reason: "You know the basics. Now let's test your application skills.",
                payload: {
                    atomIds: gapAtoms.map(a => a.atomId),
                    scope: 'SUBJECT',
                    scopeId: focusSubjectId,
                    mode: 'quiz',
                    quizOrigin: 'PRACTICE',
                    quizScope: 'SUBJECT'
                }
            });
        } else {
            actions.push({
                actionId: nanoid(),
                subjectId: focusSubjectId,
                actionType: RadarActionType.QUIZ, // V3: Use QUIZ
                urgency: RadarUrgency.MEDIUM,
                title: `Build Strength: ${focusSubjectId}`,
                reason: "Keep building momentum in this subject.",
                payload: {
                    scope: 'SUBJECT',
                    scopeId: focusSubjectId,
                    mode: 'quiz',
                    quizOrigin: 'PRACTICE',
                    quizScope: 'SUBJECT'
                }
            });
        }
        return actions;
    }

    // --- CHALLENGE ---
    if (strategy === RadarStrategy.CHALLENGE) {
        // Challenge is usually 1 big item regardless, but we respect limit for consistency
        const strongAtoms = await findChallengeCandidates(studentId, limit);
        // Filter for focus subject if needed, or allow cross-subject challenge
        // For v1, sticking to focus subject for simplicity unless we have a "General Challenge"

        actions.push({
            actionId: nanoid(),
            subjectId: focusSubjectId,
            actionType: RadarActionType.EXAM,
            urgency: RadarUrgency.MEDIUM,
            title: `Ace the Exam: ${focusSubjectId}`,
            reason: "You're trending up! Test your limits with harder questions.",
            payload: {
                mode: 'exam-generator',
                scope: 'SUBJECT',
                scopeId: focusSubjectId,
                examMode: 'CHALLENGE'
            }
        });
        return actions;
    }

    // --- MAINTAIN ---
    if (strategy === RadarStrategy.MAINTAIN) {
        actions.push({
            actionId: nanoid(),
            subjectId: focusSubjectId,
            actionType: RadarActionType.QUIZ, // V3: Use QUIZ (SMART)
            urgency: RadarUrgency.LOW,
            title: `Quick Recall: ${focusSubjectId}`,
            reason: "Keep your memory fresh with a short session.",
            payload: {
                mode: 'flashcards',
                scope: 'SUBJECT',
                scopeId: focusSubjectId,
                quizOrigin: 'SMART',
                quizScope: 'SUBJECT'
            }
        });
    }

    return actions;
};
