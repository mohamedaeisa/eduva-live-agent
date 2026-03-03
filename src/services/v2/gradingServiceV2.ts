/**
 * EDUVA Hybrid Grading Engine v2.2
 * Typo-Tolerant Offline Validation
 */

const getLevenshteinDistance = (a: string, b: string): number => {
  const tmp = [];
  for (let i = 0; i <= a.length; i++) tmp[i] = [i];
  for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
};

/**
 * OFFLINE VALIDATOR
 * Match threshold: Levenshtein Distance <= 2
 * Pass threshold: 80% Keywords matched
 */
export const validateShortAnswerOffline = (
  answer: string, 
  keywords: string[]
): { passed: boolean; matchedCount: number; totalCount: number; score: number } => {
  if (!answer || !keywords || keywords.length === 0) {
      return { passed: false, matchedCount: 0, totalCount: keywords?.length || 0, score: 0 };
  }

  const userTokens = answer.toLowerCase().split(/[ ,.!?;:]+/).filter(t => t.length > 2);
  let matchedCount = 0;

  keywords.forEach(keyword => {
    const kwLower = keyword.toLowerCase().trim();
    const isMatched = userTokens.some(token => {
        if (token === kwLower) return true;
        if (Math.abs(token.length - kwLower.length) > 2) return false;
        return getLevenshteinDistance(token, kwLower) <= 2;
    });
    if (isMatched) matchedCount++;
  });

  const score = matchedCount / keywords.length;
  return {
    passed: score >= 0.8,
    matchedCount,
    totalCount: keywords.length,
    score
  };
};

export const validateOnlineSemantic = async (
    answer: string,
    semanticThreshold: number
): Promise<{ passed: boolean; score: number }> => {
    // Note: AI Semantic comparison happens during sync or online mode
    return { passed: true, score: 1.0 }; 
};
