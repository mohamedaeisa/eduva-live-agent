
import { studentCompass } from './compass';

// Legacy keys (preserved for backward compatibility during refactor)
const studentLegacy = {
    yourCompass: { en: "Your Learning Compass", ar: "بوصلتك التعليمية" },
    overallProgress: { en: "Overall Progress", ar: "التقدم العام" },
    strengthAreas: { en: "Strength Areas", ar: "مجالات القوة" },
    growthAreas: { en: "Growth Opportunities", ar: "فرص النمو" },
    recentBreakthroughs: { en: "Recent Breakthroughs", ar: "إنجازات حديثة" },
    upcomingChallenges: { en: "Upcoming Challenges", ar: "تحديات قادمة" },
    reflectionPrompt: { en: "How do you feel about your progress today?", ar: "كيف تشعر حيال تقدمك اليوم؟" },
    setGoal: { en: "Set a Learning Goal", ar: "ضع هدف تعليمي" },
    viewHistory: { en: "View History", ar: "عرض السجل" },
    yourSignal: { en: "Your Signal", ar: "إشارتك" },
    keepPracticing: { en: "Keep Practicing", ar: "استمر بالتمرين" },
    youAreExcelling: { en: "You're Excelling!", ar: "أنت متفوق!" },
    steadyProgress: { en: "Steady Progress", ar: "تقدم ثابت" }
};

export const student = {
    compass: studentCompass,
    ...studentLegacy
};
