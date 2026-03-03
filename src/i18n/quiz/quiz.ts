
export const quiz = {
    // ═══════════════════════════════════════════
    // QUIZ MODULE
    // ═══════════════════════════════════════════
    levels: {
        recall: { en: "Recall", ar: "تذكر" },
        apply: { en: "Apply", ar: "تطبيق" },
        analyze: { en: "Analyze", ar: "تحليل" }
    },
    hud: {
        progress: { en: "Progress", ar: "تقدم" },
        depth: { en: "Depth", ar: "عمق" },
        pool: { en: "Pool", ar: "مخزون" },
        selectToConstruct: { en: "Select to Construct Logic", ar: "اختر لبناء المنطق" }
    },
    status: {
        handshake: { en: "Neural Bridge Handshake...", ar: "مصافحة الجسر العصبي..." },
        initializing: { en: "Initializing QSE Matrix...", ar: "جاري تهيئة مصفوفة الأسئلة..." },
        hydrating: { en: "Hydrating Targeted Repair Matrix...", ar: "تجهيز مصفوفة الإصلاح..." },
        indexing: { en: "Indexing File...", ar: "فهرسة الملف..." },
        scanning: { en: "Scanning Subject...", ar: "فحص المادة..." },
        synthesizing: { en: "Synthesizing Initial Matrix...", ar: "توليف المصفوفة الأولية..." }
    },
    errors: {
        quotaTitle: { en: "Daily Limit Reached", ar: "تم الوصول للحد اليومي" },
        quotaMsg: { en: "You've reached the daily limit for AI-generated quizzes. The quota resets in a few hours.", ar: "لقد وصلت للحد اليومي للاختبارات المولدة بالذكاء الاصطناعي. سيتم إعادة التعيين خلال ساعات." },
        connectionTitle: { en: "Connection Error", ar: "خطأ في الاتصال" },
        connectionMsg: { en: "Could not connect to the server. Please check your internet connection.", ar: "لا يمكن الاتصال بالخادم. تحقق من اتصال الإنترنت." },
        tryAgain: { en: "Try Again", ar: "حاول مرة أخرى" },
        gotIt: { en: "Got It", ar: "فهمت" },
        retry: { en: "Retry", ar: "إعادة المحاولة" }
    },
    types: {
        mcq: { en: "Multiple Choice", ar: "اختيار من متعدد" },
        trueFalse: { en: "True / False", ar: "صح / خطأ" },
        fillIn: { en: "Fill in Blank", ar: "املأ الفراغ" },
        match: { en: "Matching", ar: "توصيل" }
    },
    picker: {
        title: { en: "Practice Matrix", ar: "مصفوفة التدريب" },
        selectDomain: { en: "SELECT DOMAIN", ar: "اختر المجال" },
        selectMaterial: { en: "SELECT MATERIAL", ar: "اختر المصدر" },
        selected: { en: "Selected", ar: "محدد" },
        status: {
            verified: { en: "VERIFIED", ar: "موثق" },
            untrained: { en: "UNTRAINED", ar: "غير مدرب" }
        },
        noMaterials: { en: "No Materials Found", ar: "لم يتم العثور على مواد" },
        libraryTip: { en: "Add documents in the Library to generate quizzes.", ar: "أضف مستندات في المكتبة لإنشاء اختبارات." },
        actions: {
            selectToUnlock: { en: "SELECT TO UNLOCK", ar: "اختر للفتح" },
            launch: { en: "LAUNCH", ar: "تشغيل" }
        }
    },
    lobby: {
        readyTitle: { en: "Ready to Test Your Knowledge?", ar: "جاهز لاختبار معلوماتك؟" },
        begin: { en: "BEGIN", ar: "ابدأ" }
    },
    setup: {
        domain: { en: "DOMAIN SCOPE", ar: "مجال" },
        vault: { en: "KNOWLEDGE VAULT", ar: "مكتبة المعرفة" },
        questionsLevel: { en: "QUESTIONS/LEVEL", ar: "أسئلة / مستوى" },
        questionTypes: { en: "QUESTION TYPES", ar: "أنواع الأسئلة" },
        generate: { en: "Generate Quiz", ar: "بدء الاختبار" },
        search: { en: "Search...", ar: "بحث..." }
    },
    pulse: {
        title: { en: "How do you feel?", ar: "كيف تشعر؟" },
        sharp: { en: "Sharp", ar: "نشيط" },
        neutral: { en: "Neutral", ar: "عادي" },
        tired: { en: "Tired", ar: "مرهق" }
    },
    summary: {
        title: { en: "Session Complete", ar: "انتهت الجلسة" },
        back: { en: "BACK TO LOBBY", ar: "العودة للقائمة" }
    },
    loading: {
        initializing: { en: "Initializing...", ar: "جاري التهيئة..." }
    },

    // Legacy Keys (Preserved)
    quizTitle: { en: "Practice Matrix", ar: "مصفوفة التدريب" },
    quizSubtitle: { en: "Adaptive Quiz", ar: "اختبار تكيفي" },
    generateQuiz: { en: "Generate Quiz", ar: "إنشاء اختبار" },
    startQuiz: { en: "Start Quiz", ar: "بدء الاختبار" },
    quit: { en: "Quit", ar: "خروج" },
    quizComplete: { en: "Quiz Complete!", ar: "اكتمل الاختبار!" },
    selectSubject: { en: "Select Subject", ar: "اختر المادة" },
    selectDifficulty: { en: "Select Difficulty", ar: "اختر الصعوبة" },
    questionCount: { en: "Number of Questions", ar: "عدد الأسئلة" },
    easy: { en: "Easy", ar: "سهل" },
    medium: { en: "Medium", ar: "متوسط" },
    hard: { en: "Hard", ar: "صعب" },
    question: { en: "Question", ar: "سؤال" },
    of: { en: "of", ar: "من" },
    progress: { en: "Progress", ar: "تقدم" },
    depth: { en: "Depth", ar: "عمق" },
    pool: { en: "Pool", ar: "مجموعة" },
    left: { en: "left", ar: "متبقي" },
    multipleChoice: { en: "Multiple Choice", ar: "اختيار من متعدد" },
    fillInBlank: { en: "Fill in the Blank", ar: "املأ الفراغ" },
    matching: { en: "Matching", ar: "مطابقة" },
    trueFalse: { en: "True/False", ar: "صح/خطأ" },
    submit: { en: "Submit", ar: "إرسال" },
    next: { en: "Next", ar: "التالي" },
    previous: { en: "Previous", ar: "السابق" },
    skipQuestion: { en: "Skip", ar: "تجاوز" },
    showHint: { en: "Show Hint", ar: "إظهار تلميح" },
    checkAnswer: { en: "Check Answer", ar: "تحقق من الإجابة" },
    correct: { en: "Correct!", ar: "صحيح!" },
    incorrect: { en: "Incorrect", ar: "خطأ" },
    tryAgain: { en: "Try Again", ar: "حاول مرة أخرى" },
    wellDone: { en: "Well Done!", ar: "أحسنت!" },
    keepGoing: { en: "Keep Going!", ar: "استمر!" },
    almostThere: { en: "Almost There!", ar: "أوشكت!" },
    yourScore: { en: "Your Score", ar: "نتيجتك" },
    questionsAnswered: { en: "Questions Answered", ar: "الأسئلة المجابة" }
};
