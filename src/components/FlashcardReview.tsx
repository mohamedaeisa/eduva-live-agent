
import React, { useState, useEffect } from 'react';
import { Flashcard, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { updateFlashcard } from '../services/storageService';
import { logEvent } from '../services/analyticsService';
import Button from './ui/Button';
import Card from './ui/Card';

interface FlashcardReviewProps {
  cards: Flashcard[];
  onComplete: () => void;
  userId: string;
  appLanguage: Language;
}

const FlashcardReview: React.FC<FlashcardReviewProps> = ({ cards, onComplete, userId, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentCard, setCurrentCard] = useState<Flashcard | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    // Filter cards that are due (nextReview < now)
    const now = Date.now();
    const due = cards.filter(c => c.nextReview <= now);
    setQueue(due);
    if (due.length > 0) {
      setCurrentCard(due[0]);
    } else {
      setSessionComplete(true);
    }
  }, [cards]);

  const handleRating = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!currentCard) return;

    // SM-2 Inspired Algorithm
    let newInterval = 0;
    let newEase = currentCard.easeFactor;
    let newReps = currentCard.repetitions;

    if (rating === 'again') {
      newReps = 0;
      newInterval = 1; // 1 day
    } else {
      if (rating === 'hard') {
        newInterval = Math.max(1, currentCard.interval * 1.2);
        newEase = Math.max(1.3, newEase - 0.15);
      } else if (rating === 'good') {
        newInterval = Math.max(1, currentCard.interval * 2.5); // Simplified multiplier
      } else if (rating === 'easy') {
        newInterval = Math.max(1, currentCard.interval * 1.3 * newEase);
        newEase += 0.15;
      }
      newReps += 1;
    }

    const updatedCard: Flashcard = {
      ...currentCard,
      interval: Math.round(newInterval),
      easeFactor: newEase,
      repetitions: newReps,
      nextReview: Date.now() + (newInterval * 24 * 60 * 60 * 1000)
    };

    // Await storage update
    await updateFlashcard(updatedCard, userId);

    // Move to next
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    setIsFlipped(false);

    if (nextQueue.length > 0) {
      setCurrentCard(nextQueue[0]);
    } else {
      setSessionComplete(true);
      logEvent('Complete Flashcard Review', `Reviewed ${cards.length} cards`);
    }
  };

  if (sessionComplete) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-fade-in">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold mb-2 text-slate-800 dark:text-white">{(t as any).reviewComplete || 'Review Complete!'}</h2>
        <p className="text-slate-500 mb-8">{(t as any).noDueCards || 'No due cards.'}</p>
        <Button onClick={onComplete} className="px-8">{(t as any).backDashboard || 'Back to Dashboard'}</Button>
      </div>
    );
  }

  if (!currentCard) return null;

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" size="sm" onClick={onComplete}>{(t as any).exit || 'Exit'}</Button>
        <span className="text-sm font-bold text-brand-600">{queue.length} {(t as any).cardShort || 'Cards'} Left</span>
      </div>

      <div className="perspective-1000 h-80 md:h-96 relative mb-8">
        <div 
          className={`relative w-full h-full transition-all duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white dark:bg-slate-800 rounded-3xl shadow-xl border-2 border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center p-8 text-center hover:border-brand-300 transition-colors">
            <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-slate-400">Question</span>
            <h3 className="text-xl md:text-3xl font-bold leading-relaxed">{currentCard.front}</h3>
            <p className="absolute bottom-8 text-sm font-medium text-brand-500 animate-pulse">
              {(t as any).tapFlip || 'Tap to flip'}
            </p>
          </div>

          {/* Back */}
          <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-brand-600 text-white rounded-3xl shadow-xl flex flex-col items-center justify-center p-8 text-center">
            <span className="absolute top-6 left-6 text-xs font-bold uppercase tracking-widest text-brand-200">Answer</span>
            <h3 className="text-xl font-medium leading-relaxed">{currentCard.back}</h3>
          </div>
        </div>
      </div>

      {isFlipped ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-up">
          <button 
            onClick={() => handleRating('again')}
            className="p-3 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 font-bold text-sm transition-colors border border-red-200"
          >
            {(t as any).ratingAgain || 'Again'}
          </button>
          <button 
             onClick={() => handleRating('hard')}
             className="p-3 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 font-bold text-sm transition-colors border border-amber-200"
          >
            {(t as any).ratingHard || 'Hard'}
          </button>
          <button 
             onClick={() => handleRating('good')}
             className="p-3 rounded-xl bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold text-sm transition-colors border border-blue-200"
          >
            {(t as any).ratingGood || 'Good'}
          </button>
          <button 
             onClick={() => handleRating('easy')}
             className="p-3 rounded-xl bg-green-100 text-green-700 hover:bg-green-200 font-bold text-sm transition-colors border border-green-200"
          >
            {(t as any).ratingEasy || 'Easy'}
          </button>
        </div>
      ) : (
        <Button className="w-full py-4 text-lg" onClick={() => setIsFlipped(true)}>
          {(t as any).revealAnswer || 'Reveal Answer'}
        </Button>
      )}
    </div>
  );
};

export default FlashcardReview;
