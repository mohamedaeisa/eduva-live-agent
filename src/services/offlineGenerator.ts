
import { StudyWithMeData, QuizData, QuizQuestion, QuizType, Flashcard } from '../types';

/**
 * Shuffles an array in place using Fisher-Yates algorithm
 */
const shuffle = <T>(array: T[]): T[] => {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
};

const getRandomDistractors = (allConcepts: { term: string }[], correctTerm: string, count: number): string[] => {
  const otherTerms = allConcepts.filter(c => c.term !== correctTerm).map(c => c.term);
  if (otherTerms.length === 0) return ["None of the above", "All of the above", "Invalid Option"]; 
  return shuffle(otherTerms).slice(0, count);
};

const extractConceptsFromMarkdown = (text: string): { term: string, definition: string }[] => {
  if (!text) return [];
  const concepts: { term: string, definition: string }[] = [];
  const seenTerms = new Set<string>();

  const patterns = [
    /\*\*(.+?)\*\*[:\s\-]+([^\n\.]+)/g,
    /-\s*\*\*(.+?)\*\*[:\s]+([^\n\.]+)/g
  ];

  patterns.forEach(regex => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const term = match[1].trim();
      const def = match[2].trim();
      if (term.length > 2 && term.length < 50 && def.length > 10 && !seenTerms.has(term)) {
        concepts.push({ term, definition: def });
        seenTerms.add(term);
      }
    }
  });
  return concepts;
};

export const generateLocalQuiz = (
  data: StudyWithMeData, 
  count: number, 
  preferredType: QuizType
): QuizData => {
  const questions: QuizQuestion[] = [];
  let pool = [...(data.keyConcepts || [])];

  if (pool.length === 0 && data.summaryMarkdown) {
      pool = extractConceptsFromMarkdown(data.summaryMarkdown);
  }

  if (pool.length === 0) {
    return {
      title: "Offline Review",
      topic: data.title,
      questions: [{
        id: 1,
        type: 'MCQ',
        difficulty: 'easy',
        topic: data.title,
        cognitiveLevel: 'Understand',
        question: "Identify key concepts in your notes to generate an offline quiz.",
        options: ["Got it"],
        correctAnswer: "Got it",
        explanation: "Offline generator identifies 'Term: Definition' patterns."
      }],
      timestamp: Date.now(),
      timeEstimate: '1 min'
    };
  }

  for (let i = 0; i < count; i++) {
    const concept = pool[i % pool.length];
    if (!concept) continue;

    let q: QuizQuestion | null = null;
    const type = preferredType === QuizType.MIX 
      ? (Math.random() > 0.5 ? QuizType.MCQ : QuizType.TRUE_FALSE)
      : preferredType;

    if (type === QuizType.TRUE_FALSE) {
      const isTrue = Math.random() > 0.5;
      if (isTrue) {
        q = {
          id: Date.now() + i,
          type: 'TrueFalse',
          difficulty: 'easy',
          topic: data.title,
          cognitiveLevel: 'Remember',
          question: `True or False: "${concept.term}" is defined as "${concept.definition.toLowerCase()}"?`,
          options: ["True", "False"],
          correctAnswer: "True",
          explanation: `${concept.term} correctly matches this definition.`
        };
      } else {
        const wrongConcept = pool.length > 1 ? pool[(i + 1) % pool.length] : null;
        q = {
          id: Date.now() + i,
          type: 'TrueFalse',
          difficulty: 'easy',
          topic: data.title,
          cognitiveLevel: 'Understand',
          question: `True or False: "${wrongConcept?.term || 'This concept'}" is defined as "${concept.definition.toLowerCase()}"?`,
          options: ["True", "False"],
          correctAnswer: "False",
          explanation: `False. That definition belongs to "${concept.term}".`
        };
      }
    } else {
      let distractors = getRandomDistractors(pool, concept.term, 3);
      const options = shuffle([concept.term, ...distractors]);
      q = {
        id: Date.now() + i,
        type: 'MCQ',
        difficulty: 'medium',
        topic: data.title,
        cognitiveLevel: 'Apply',
        question: `Which term corresponds to: "${concept.definition}"?`,
        options: options,
        correctAnswer: concept.term,
        explanation: `Correct! ${concept.term} is defined as ${concept.definition}.`
      };
    }
    if (q) questions.push(q);
  }

  return {
    title: `Offline Review: ${data.title}`,
    topic: data.title,
    questions: questions,
    timeEstimate: `${Math.ceil(count * 1.5)} Mins`,
    timestamp: Date.now()
  };
};

export const generateLocalFlashcards = (data: StudyWithMeData): Flashcard[] => {
  let pool = [...(data.keyConcepts || [])];
  if (pool.length === 0 && data.summaryMarkdown) {
      pool = extractConceptsFromMarkdown(data.summaryMarkdown);
  }
  return pool.map((concept) => ({
    id: Math.random().toString(36).substr(2, 9),
    front: concept.term,
    back: concept.definition,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReview: Date.now()
  }));
};
