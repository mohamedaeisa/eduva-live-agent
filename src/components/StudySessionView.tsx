import React, { useState } from 'react';
import { StudyWithMeData, Language, StudyNoteSection, GenerationRequest, QuizType, Difficulty, DetailLevel } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import Card from './ui/Card';
import MermaidDiagram from './MermaidDiagram';
import { pdf } from '@react-pdf/renderer';
import { StudySessionPdfDocument } from './PdfTemplates';

const ExportOptionsModal: React.FC<{ 
  onClose: () => void; 
  onConfirm: (mode: 'FOCUS' | 'ECO' | 'CRAM') => void;
  isExporting: boolean;
  isArabic: boolean;
}> = ({ onClose, onConfirm, isExporting, isArabic }) => {
  const [mode, setMode] = useState<'FOCUS' | 'ECO' | 'CRAM'>('FOCUS');

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
      <Card className="w-full max-w-sm bg-white dark:bg-slate-900 border-t-8 border-indigo-600 p-6 md:p-8 relative shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="absolute top-0 right-0 p-4 opacity-5 text-6xl pointer-events-none select-none text-indigo-500">📄</div>
        
        <div className="relative z-10 text-left">
          <div className="mb-6">
            <h4 className="text-[9px] font-black uppercase text-indigo-500 tracking-[0.4em] mb-1 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              PRINT ENGINE
            </h4>
            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight italic">
              {isArabic ? 'تصدير الجلسة' : 'Export Study Pack'}
            </h3>
          </div>

          <div className="space-y-3 mb-8">
            <button 
              onClick={() => setMode('FOCUS')}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all group flex items-center gap-4 ${mode === 'FOCUS' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-md' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-indigo-200'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform ${mode === 'FOCUS' ? 'bg-indigo-600 text-white scale-110' : 'bg-slate-100 dark:bg-slate-800'}`}>💎</div>
              <div className="min-w-0 flex-grow">
                <h5 className={`font-black text-xs uppercase italic ${mode === 'FOCUS' ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-800 dark:text-white'}`}>Focus View</h5>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">One concept per page</p>
              </div>
            </button>

            <button 
              onClick={() => setMode('ECO')}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all group flex items-center gap-4 ${mode === 'ECO' ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/20 shadow-md' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-200'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform ${mode === 'ECO' ? 'bg-indigo-600 text-white scale-110' : 'bg-slate-100 dark:bg-slate-800'}`}>🍃</div>
              <div className="min-w-0 flex-grow">
                <h5 className={`font-black text-xs uppercase italic ${mode === 'ECO' ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-800 dark:text-white'}`}>Eco-Mode</h5>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">High density flow</p>
              </div>
            </button>

            <button 
              onClick={() => setMode('CRAM')}
              className={`w-full text-left p-4 rounded-2xl border-2 transition-all group flex items-center gap-4 ${mode === 'CRAM' ? 'border-amber-600 bg-amber-50/50 dark:bg-amber-900/20 shadow-md' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-amber-200'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform ${mode === 'CRAM' ? 'bg-amber-600 text-white scale-110' : 'bg-slate-100 dark:bg-slate-800'}`}>⚡</div>
              <div className="min-w-0 flex-grow">
                <h5 className={`font-black text-xs uppercase italic ${mode === 'CRAM' ? 'text-amber-900 dark:text-amber-100' : 'text-slate-800 dark:text-white'}`}>Cram Mode</h5>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">3-Column Cheat Sheet</p>
              </div>
            </button>
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button 
              onClick={onClose}
              className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
            >
              {isArabic ? 'إغلاق' : 'Close'}
            </button>
            <Button 
              onClick={() => onConfirm(mode)}
              isLoading={isExporting}
              className={`flex-[2] py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 ${mode === 'CRAM' ? 'bg-amber-600 hover:bg-amber-700' : mode === 'ECO' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
              {isExporting ? (isArabic ? 'تحميل...' : 'PRINTING...') : (isArabic ? 'طباعة' : 'Go Print')}
            </Button>
          </div>

          {isExporting && (
             <div className="mt-4 flex items-center gap-2 animate-pulse justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Neural Assembly in Progress...</p>
             </div>
          )}
        </div>
      </Card>
    </div>
  );
};

interface StudySessionViewProps {
  data: StudyWithMeData;
  onBack: () => void;
  appLanguage: Language;
  userId: string;
  onStartQuiz?: (req: GenerationRequest) => void;
}

const StudySessionView: React.FC<StudySessionViewProps> = ({ data, onBack, appLanguage, userId, onStartQuiz }) => {
  const t = TRANSLATIONS[appLanguage];
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  if (!data) return null;
  
  const isArabic = appLanguage === Language.ARABIC;

  // MISSION DETECTION
  const isRepairMission = !!data.sourceMissionId && data.struggleAtoms && data.struggleAtoms.length > 0;
  const targetTopic = data.struggleAtoms?.[0] || 'Topic';

  const handleProceedToQuiz = () => {
      if (!onStartQuiz) return;
      
      onStartQuiz({
          mode: 'quiz',
          topic: `Practice: ${targetTopic}`,
          subject: data.title.split(':').pop()?.trim() || 'General',
          year: 'Grade 10', // Default or from context
          curriculum: data.title.includes('NEIS') ? 'NEIS' : 'Standard' as any,
          language: appLanguage,
          difficulty: Difficulty.MEDIUM,
          quizType: QuizType.MIX,
          questionCount: 8,
          detailLevel: DetailLevel.DETAILED,
          sourceMissionId: data.sourceMissionId,
          struggleAtoms: data.struggleAtoms,
          contentId: data.contentId,
          studyMaterialUrl: data.contentId,
          strictFormat: true
      });
  };

  const handleExportPDF = async (mode: 'FOCUS' | 'ECO' | 'CRAM') => {
    setIsExporting(true);
    try {
      const doc = <StudySessionPdfDocument data={data} mode={mode} />;
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.title.replace(/\s+/g, '_')}_${mode}_Guide.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch (e) {
      console.error("[PDF_EXPORT_ERROR]", e);
      alert("Failed to generate document-grade PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDOC = () => {
    const brandColor = "#0ea5e9";
    const textColor = "#0f172a";
    const slate600 = "#475569";
    
    // Ensure we capture all text content properly
    const summaryText = data.summaryMarkdown || data.summary || "";
    
    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <style>
          @page { size: A4; margin: 2cm; }
          body { font-family: 'Calibri', 'Arial', sans-serif; color: ${textColor}; line-height: 1.4; }
          .header { border-bottom: 2pt solid ${brandColor}; padding-bottom: 10pt; margin-bottom: 20pt; }
          .logo { color: ${brandColor}; font-size: 18pt; font-weight: bold; }
          .title { font-size: 26pt; font-weight: bold; margin-bottom: 10pt; color: #000000; }
          .summary { font-size: 11pt; color: ${slate600}; font-style: italic; margin-bottom: 20pt; border-left: 2pt solid #e2e8f0; padding-left: 10pt; }
          .section { margin-bottom: 20pt; page-break-inside: avoid; }
          .section-title { background: #f8fafc; border-left: 4pt solid ${brandColor}; padding: 8pt; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 10pt; }
          ul { margin-top: 5pt; }
          li { font-size: 10.5pt; margin-bottom: 6pt; }
          .terms { background-color: #fffbeb; padding: 10pt; border: 0.5pt solid #fde68a; margin-top: 10pt; margin-left: 20pt; }
          .footer { margin-top: 40pt; border-top: 0.5pt solid #cbd5e1; padding-top: 10pt; font-size: 8pt; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class='header'><span class='logo'>EDUVA-Me</span><br><small>Official Study Document • ${new Date().toLocaleDateString()}</small></div>
        <h1 class='title'>${data.title}</h1>
        <div class='summary'>${summaryText}</div>
    `;

    // Map through sections with numbering
    (data.sections || []).forEach((s, i) => {
      html += `
        <div class='section'>
          <div class='section-title'>${i + 1}. ${s.heading}</div>
          <ul>${(s.keyPoints || []).map(p => `<li>${p.replace(/\*\*/g, '')}</li>`).join('')}</ul>
      `;
      
      if ((s.definitions || []).length > 0) {
        html += `<div class='terms'><b>Key Vocabulary & Terms:</b><br/>`;
        html += s.definitions.map(d => `• <b>${d.term}</b>: ${d.definition}`).join('<br/>');
        html += `</div>`;
      }
      
      if ((s.examFacts || []).length > 0) {
        html += `<p style='font-size: 9pt; color: #b45309; margin-top: 10pt; font-weight: bold;'>🎯 Exam High-Focus Facts:</p>`;
        html += `<ul>${s.examFacts.map(f => `<li>${f}</li>`).join('')}</ul>`;
      }
      
      html += `</div>`;
    });

    html += `<div class='footer'>Digitally Authored via EDUVA Core • Precise Academic Reference System</div></body></html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `${data.title.replace(/\s+/g, '_')}_StudyGuide.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const renderSection = (section: StudyNoteSection, i: number) => (
    <div key={i} className="mb-12 bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 overflow-hidden shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 group break-inside-avoid">
      <div className="p-8 bg-gradient-to-r from-indigo-50 to-white dark:from-slate-900/50 dark:to-slate-800 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
            <span className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-indigo-500/30 transition-transform group-hover:scale-110 flex-shrink-0">
                {i+1}
            </span>
            <h3 className="font-black text-2xl text-slate-800 dark:text-white leading-tight break-words min-w-0">
                {section.heading}
            </h3>
        </div>
      </div>

      <div className="p-8 md:p-12 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
           <div className="lg:col-span-8 space-y-8 overflow-hidden text-left">
              <div>
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-5 tracking-[0.2em] flex items-center gap-3">
                   <span className="w-8 h-px bg-slate-200 dark:bg-slate-700"></span> 
                   Core Knowledge
                </h4>
                <ul className="space-y-6">
                    {(section.keyPoints || []).map((p, j) => (
                        <li key={j} className="flex gap-5 text-lg text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                            <span className="mt-3 w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(79,70,229,0.5)]"></span>
                            <span className="min-w-0 flex-grow">{p}</span>
                        </li>
                    ))}
                </ul>
              </div>

              {(section.definitions || []).length > 0 && (
                 <div className="pt-6">
                    <h4 className="text-[10px] font-black uppercase text-slate-400 mb-5 tracking-[0.2em] flex items-center gap-3">
                       <span className="w-8 h-px bg-slate-200 dark:bg-slate-700"></span> 
                       Glossary
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {section.definitions.map((d, j) => (
                           <div key={j} className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                              <p className="font-black text-indigo-700 dark:text-indigo-400 text-sm mb-2 uppercase tracking-wide break-words">{d.term}</p>
                              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium break-words">{d.definition}</p>
                           </div>
                        ))}
                    </div>
                 </div>
              )}
           </div>

           <div className="lg:col-span-4 space-y-8 text-left">
              {(section.examFacts || []).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/10 p-6 rounded-[2.5rem] border-2 border-amber-100 dark:border-amber-900/50 shadow-lg overflow-hidden">
                  <h4 className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 mb-4 tracking-widest">Exam Focus</h4>
                  <div className="space-y-4">
                      {section.examFacts.map((f, j) => (
                        <div key={j} className="flex items-start gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-amber-100 dark:border-amber-900/30 overflow-hidden">
                            <span className="text-xl flex-shrink-0">🎯</span>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug break-words flex-grow">{f}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {section.mnemonic && (
                 <div className="bg-pink-50 dark:bg-pink-900/10 p-6 rounded-[2rem] border-2 border-pink-200 dark:border-pink-900/50 shadow-lg overflow-hidden">
                    <h4 className="text-[10px] font-black uppercase text-pink-700 dark:text-pink-400 mb-3 tracking-widest">Memory Hack</h4>
                    <p className="text-sm font-black italic text-slate-700 dark:text-slate-200 leading-relaxed break-words">"{section.mnemonic}"</p>
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto animate-fade-in pb-24 px-4" dir={isArabic ? 'rtl' : 'ltr'}>
      {showExportModal && <ExportOptionsModal isArabic={isArabic} isExporting={isExporting} onConfirm={handleExportPDF} onClose={() => setShowExportModal(false)} />}
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10 no-print">
          <button onClick={onBack} className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 px-6 py-2.5 transition-all rounded-xl shadow-md font-bold flex items-center gap-2">← {t.back}</button>
          
          <div className="flex gap-4">
              <button 
                  onClick={() => setShowExportModal(true)} 
                  disabled={isExporting} 
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-50"
              >
                  {isExporting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <span>📄 Export PDF</span>}
              </button>
              <button onClick={handleExportDOC} className="px-4 py-2.5 bg-blue-50 text-blue-600 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition-all">Word</button>
          </div>
      </div>

      {isRepairMission && (
          <div className="mb-10 p-8 bg-indigo-600 text-white rounded-[2.5rem] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8 animate-slide-up relative overflow-hidden border-4 border-white/10">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-8xl pointer-events-none">🧪</div>
              <div className="flex items-center gap-6 text-center md:text-left relative z-10">
                  <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-4xl shadow-inner backdrop-blur-md">🧱</div>
                  <div>
                      <h3 className="text-xl font-black uppercase tracking-tight">Step 1 of 2 Complete</h3>
                      <p className="text-indigo-100 text-sm font-medium leading-relaxed max-w-sm">
                          You've reviewed the foundations. Now, let's verify your mastery of <b>{targetTopic}</b> with a focused practice set.
                      </p>
                  </div>
              </div>
              <Button onClick={handleProceedToQuiz} className="w-full md:w-auto px-12 py-5 bg-white text-indigo-900 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:scale-105 active:scale-95 transition-all border-none">
                  Step 2: Verify Mastery →
              </Button>
          </div>
      )}

      <div id="session-print-area" className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="relative rounded-t-[2.5rem] overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-800 to-slate-900 text-white p-10 md:p-16 border-b-8 border-indigo-400 text-left">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-2xl border border-white/40 text-[10px] font-black tracking-with-[0.3em] uppercase mb-8 shadow-inner">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm"></span>
                  Authoritative Study Guide
              </div>
              <h1 className="text-4xl md:text-6xl font-black mb-8 tracking-tight leading-tight break-words">{data.title}</h1>
              <p className="text-indigo-50 text-xl font-medium opacity-100 leading-relaxed max-w-4xl break-words">
                {data.summaryMarkdown}
              </p>
            </div>
          </div>

          <div className="p-10 md:p-16 space-y-12">
               {data.mermaidCode && (
                  <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-inner overflow-hidden break-inside-avoid">
                     <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] text-center mb-8">Conceptual Architecture</h3>
                     <MermaidDiagram code={data.mermaidCode} />
                  </div>
               )}

               <div className="space-y-4">
                  {(data.sections || []).map((s, i) => renderSection(s, i))}
               </div>
          </div>
          <div className="p-8 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.4em] border-t border-slate-800 bg-slate-950/50">
             PRECISION LEARNING REFERENCE SYSTEM v1.0 • EDUVA AI
          </div>
      </div>
    </div>
  );
};

export default StudySessionView;