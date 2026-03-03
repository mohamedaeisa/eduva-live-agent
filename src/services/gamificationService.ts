
import { UserProfile, UserStats } from '../types';
import { BADGES, LEVEL_THRESHOLD } from '../constants';
import { getHistory } from './storageService';

const saveUserInternal = (user: UserProfile) => {
  try {
    const users = JSON.parse(localStorage.getItem('eduva_users') || '{}');
    users[user.email] = user;
    localStorage.setItem('eduva_users', JSON.stringify(users));
    localStorage.setItem('eduva_active_user', user.email);
  } catch (e) {
    console.error("Failed to save user in gamification", e);
  }
};

export const awardXP = (user: UserProfile, amount: number): { user: UserProfile, levelUp: boolean } => {
  const currentXP = user.gamification.xp + amount;
  const currentLevel = user.gamification.level;
  
  // Calculate new level: floor(XP / 200) + 1
  const newLevel = Math.floor(currentXP / LEVEL_THRESHOLD) + 1;
  const levelUp = newLevel > currentLevel;

  const updatedUser: UserProfile = {
    ...user,
    gamification: {
      ...user.gamification,
      xp: currentXP,
      level: newLevel,
      lastStudyDate: Date.now()
    }
  };

  saveUserInternal(updatedUser);
  return { user: updatedUser, levelUp };
};

export const checkStreak = (user: UserProfile): UserProfile => {
  const lastDate = new Date(user.gamification.lastStudyDate);
  const now = new Date();
  
  // Reset time to midnight for comparison
  lastDate.setHours(0,0,0,0);
  const today = new Date();
  today.setHours(0,0,0,0);

  const diffTime = Math.abs(today.getTime() - lastDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let newStreak = user.gamification.streak;

  if (diffDays === 0) {
    // Already studied today, do nothing
    return user; 
  } else if (diffDays === 1) {
    // Consecutive day
    newStreak += 1;
  } else {
    // Missed a day, reset unless it's the first day ever
    if (user.gamification.lastStudyDate > 0) {
       newStreak = 1; 
    } else {
       newStreak = 1; // First day
    }
  }

  const updatedUser: UserProfile = {
    ...user,
    gamification: {
      ...user.gamification,
      streak: newStreak,
      lastStudyDate: Date.now()
    }
  };
  
  saveUserInternal(updatedUser);
  return updatedUser;
};

export const checkBadges = async (user: UserProfile): Promise<{ user: UserProfile, newBadges: string[] }> => {
  const history = await getHistory(user.id);
  
  // Aggregate stats from history
  const stats: UserStats = {
    totalHistory: history.length,
    quizCount: history.filter(h => h.type === 'quiz').length,
    notesCount: history.filter(h => h.type === 'note' || h.type === 'lazy').length,
    flashcardsCount: history.filter(h => h.type === 'flashcards').length,
    podcastCount: history.filter(h => h.type === 'podcast').length,
    homeworkCount: history.filter(h => h.type === 'homework').length,
    examCount: history.filter(h => h.type === 'exam-generator').length
  };
  
  const currentBadges = new Set(user.gamification.earnedBadges);
  const newBadgesEarned: string[] = [];

  BADGES.forEach(badge => {
    if (!currentBadges.has(badge.id)) {
      if (badge.condition(user, stats)) {
        currentBadges.add(badge.id);
        newBadgesEarned.push(badge.id);
      }
    }
  });

  if (newBadgesEarned.length === 0) {
    return { user, newBadges: [] };
  }

  const updatedUser: UserProfile = {
    ...user,
    gamification: {
      ...user.gamification,
      earnedBadges: Array.from(currentBadges)
    }
  };

  saveUserInternal(updatedUser);
  return { user: updatedUser, newBadges: newBadgesEarned };
};
