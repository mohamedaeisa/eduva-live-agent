
export const studentCompass = {
    // ═══════════════════════════════════════════
    // STUDENT COMPASS (SubjectCompass.tsx)
    // ═══════════════════════════════════════════
    header: {
        neuralBridge: { en: "Neural Bridge", ar: "الجسر العصبي" },
        activeSince: { en: "Active since", ar: "نشط منذ" },
        loadingMetadata: { en: "Loading Grade Metadata...", ar: "جاري تحميل البيانات..." },
        currentLevel: { en: "Current Level", ar: "المستوى الحالي" },
        returnToMatrix: { en: "Return to Matrix", ar: "العودة للمصفوفة" }
    },
    metrics: {
        syllabusCoverage: { en: "Syllabus Coverage", ar: "تغطية المنهج" },
        masteryHealth: { en: "Mastery Health", ar: "صحة الإتقان" },
        weakAreas: { en: "Weak Areas", ar: "نقاظ الضعف" },
        weakConcepts: { en: "Weak Concepts", ar: "مفاهيم ضعيفة" },
        timeSpent: { en: "Time Spent", ar: "الوقت المقضي" },
        breadth: { en: "Breadth", ar: "الشمولية" },
        depth: { en: "Depth", ar: "العمق" },
        clusters: { en: "Clusters", ar: "مجموعات" },
        items: { en: "Items", ar: "عناصر" },
        issues: { en: "Issues", ar: "مشاكل" }
    },
    material: {
        knowledgeCoverage: { en: "Knowledge Coverage by Material", ar: "تغطية المعرفة حسب المصدر" },
        mastered: { en: "Mastered", ar: "متقن" },
        stable: { en: "Stable", ar: "مستقر" },
        needsFocus: { en: "Needs Focus", ar: "يحتاج تركيز" },
        notStarted: { en: "Not Started", ar: "لم يبدأ" },
        processing: { en: "Processing", ar: "جاري المعالجة" },
        knowledgeAtoms: { en: "KNOWLEDGE ATOMS", ar: "ذرات المعرفة" },
        masteryDepth: { en: "MASTERY DEPTH", ar: "عمق الإتقان" },
        repairWeakAtoms: { en: "REPAIR WEAK ATOMS (THIS FILE)", ar: "إصلاح الذرات الضعيفة (هذا الملف)" },
        fixConceptsHint: { en: "Fix concepts only from this material", ar: "إصلاح المفاهيم من هذا المصدر فقط" },
        startWorking: { en: "LET'S START WORKING ON YOUR ATOMS", ar: "لنبدأ العمل على ذراتك" },
        nothingToFixHint: { en: "Nothing started yet to fix", ar: "لا يوجد شيء لإصلاحه بعد" },
        noMaterialsTitle: { en: "No materials detected.", ar: "لم يتم العثور على مصادر." },
        noMaterialsHint: { en: "Go to Library to add and train materials for this subject.", ar: "اذهب للمكتبة لإضافة وتدريب مصادر لهذه المادة." }
    },
    insight: {
        panelTitle: { en: "FOCUS INSIGHT PANEL", ar: "لوحة رؤى التركيز" },
        eduvaInsight: { en: "EDUVA Insight", ar: "تحليل إديوفا" },
        actionRequired: { en: "Action Required", ar: "إجراء مطلوب" },
        analyzing: { en: "Analyzing...", ar: "جاري التحليل..." },
        advice: {
            depthGood: { en: "Your depth is excellent, but coverage is low. Start new topics to expand breadth.", ar: "عمقك ممتاز، لكن التغطية منخفضة. ابدأ مواضيع جديدة لزيادة الشمولية." },
            gapsFound: { en: "Some gaps found. Prioritize fixing weak clusters to stabilize progress.", ar: "تم العثور على فجوات. ركز على إصلاح المجموعات الضعيفة لاستقرار التقدم." },
            solid: { en: "Solid progress. Keep maintaining your momentum.", ar: "تقدم قوي. حافظ على الزخم." }
        }
    },
    missions: {
        selectionTitle: { en: "Mission Selection", ar: "اختيار المهمة" },
        wholeSubject: { en: "Whole Subject", ar: "كامل المادة" },
        types: {
            repair: { label: { en: "Improve Mastery", ar: "تحسين الإتقان" }, sub: { en: "(Fix Depth)", ar: "(إصلاح العمق)" }, description: { en: "Targeted practice for your weakest areas", ar: "تدريب مستهدف لأضعف مناطقك" } },
            expand: { label: { en: "Explore New Concepts", ar: "استكشف مفاهيم جديدة" }, sub: { en: "(Build Breadth)", ar: "(بناء الشمولية)" }, description: { en: "Learn concepts you haven't practiced yet", ar: "تعلم مفاهيم لم تتدرب عليها بعد" } },
            review: { label: { en: "Review Notes", ar: "مراجعة الملاحظات" }, sub: { en: "(Study)", ar: "(مذاكرة)" } },
            challenge: { label: { en: "Challenge Me", ar: "تحداني" }, sub: { en: "(Expert)", ar: "(خبير)" } }
        }
    },
    alerts: {
        masteryVerifiedTitle: { en: "Mastery Verified", ar: "تم التحقق من الإتقان" },
        masteryVerifiedMsg: { en: "No weak concepts detected in your current coverage.", ar: "لم يتم اكتشاف مفاهيم ضعيفة في تغطيتك الحالية." },
        masteryVerifiedTip: { en: "Tip: To increase Syllabus Coverage, start a 'New Concepts' mission.", ar: "نصيحة: لزيادة تغطية المنهج، ابدأ مهمة 'مفاهيم جديدة'." },
        dismiss: { en: "Dismiss", ar: "إغلاق" },
        noMaterialsFoundTitle: { en: "No Materials Found", ar: "لا توجد مصادر" },
        noMaterialsFoundMsg: { en: "Train EDUVA with your materials to unlock adaptive practice sessions.", ar: "درب إديوفا بمصادرك لفتح جلسات التدريب التكيفية." },
        goToLibraryHint: { en: "Go to Library to upload and train your first document.", ar: "اذهب للمكتبة لرفع وتدريب مستندك الأول." },
        btnGoToLibrary: { en: "📚 Go to Library", ar: "📚 اذهب للمكتبة" },
        btnMaybeLater: { en: "Maybe Later", ar: "ربما لاحقاً" }
    },
    errors: {
        syncInterrupted: { en: "Sync Interrupted", ar: "توقف التزامن" },
        returnToHub: { en: "Return to Hub", ar: "العودة للرئيسية" }
    }
};
