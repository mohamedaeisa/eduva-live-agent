/**
 * Central normalization for subject names.
 * Ensures acronyms like ICT, IGCSE, SAT are preserved.
 */
export const normalizeSubjectName = (name: string): string => {
  const acronyms = ['ICT', 'IGCSE', 'IB', 'NEIS', 'SAT', 'ACT', 'STEM', 'IT', 'AI'];
  const upper = (name || '').trim().toUpperCase();
  if (acronyms.includes(upper)) return upper;
  
  return (name || '').trim().split(' ').map((w: string) => {
    if (acronyms.includes(w.toUpperCase())) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
};