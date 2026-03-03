
import { mapLang } from './types';
import { common } from './common';
import { parent, parentShared, parentLegacy } from './parent';
import { student } from './student';
import { quiz } from './quiz/quiz';
import { library } from './library/library';
import { notes } from './notes/notes';
import { Language } from '../types';

console.log('[i18n Debug] Imports Check:', {
    hasStudent: !!student,
    hasNotes: !!notes,
    hasLibrary: !!library,
    hasQuiz: !!quiz,
    notesType: typeof notes
});

export const TRANSLATIONS = {
    [Language.ENGLISH]: {
        common: mapLang(common, Language.ENGLISH),
        ...mapLang(common, Language.ENGLISH),
        student: mapLang(student, Language.ENGLISH),
        ...mapLang(student, Language.ENGLISH), // Root level student keys in legacy

        quiz: mapLang(quiz, Language.ENGLISH),
        ...mapLang(quiz, Language.ENGLISH),    // Root level quiz keys in legacy

        library: mapLang(library, Language.ENGLISH),
        ...mapLang(library, Language.ENGLISH), // Root level library keys in legacy

        notes: mapLang(notes, Language.ENGLISH),
        ...mapLang(notes, Language.ENGLISH),   // Root level notes keys in legacy

        parent: {
            ...mapLang(parent.compass, Language.ENGLISH), // This spreads recommendation/supportStance
            signals: mapLang(parent.signals, Language.ENGLISH),
            status: mapLang(parent.status, Language.ENGLISH),
            compass: mapLang(parent.compass, Language.ENGLISH),
            footer: mapLang(parentShared.footer, Language.ENGLISH),
            report: mapLang(parent.report, Language.ENGLISH),
            // ... legacy keys also available nested if needed
            ...mapLang(parentLegacy, Language.ENGLISH)
        },
    },
    [Language.ARABIC]: {
        common: mapLang(common, Language.ARABIC),
        ...mapLang(common, Language.ARABIC),
        student: mapLang(student, Language.ARABIC),
        ...mapLang(student, Language.ARABIC),

        quiz: mapLang(quiz, Language.ARABIC),
        ...mapLang(quiz, Language.ARABIC),

        library: mapLang(library, Language.ARABIC),
        ...mapLang(library, Language.ARABIC),

        notes: mapLang(notes, Language.ARABIC),
        ...mapLang(notes, Language.ARABIC),

        parent: {
            ...mapLang(parent.compass, Language.ARABIC),
            signals: mapLang(parent.signals, Language.ARABIC),
            status: mapLang(parent.status, Language.ARABIC),
            compass: mapLang(parent.compass, Language.ARABIC),
            footer: mapLang(parentShared.footer, Language.ARABIC),
            report: mapLang(parent.report, Language.ARABIC),
            ...mapLang(parentLegacy, Language.ARABIC)
        }
    }
};
