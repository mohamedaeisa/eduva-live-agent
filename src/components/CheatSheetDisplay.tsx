
import React, { useState } from 'react';
import { CheatSheetData, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import katex from 'katex';
import { pdf } from '@react-pdf/renderer';
import { CheatSheetPdfDocument } from './PdfTemplates';

interface CheatSheetDisplayProps {
  data: CheatSheetData;
  onBack: () => void;
  appLanguage: Language;
}

const CheatSheetDisplay: React.FC<CheatSheetDisplayProps> = ({ data, onBack, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [isExporting, setIsExporting] = useState(false);

  // RTL Detection
  const hasArabicContent = /[\u0600-\u06FF]/.test(data.topic || '') || /[\u0600-\u06FF]/.test(data.content || '');
  const dir = (appLanguage === Language.ARABIC || hasArabicContent) ? 'rtl' : 'ltr';

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = <CheatSheetPdfDocument data={data} />;
      const blob = await pdf(doc).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${data.topic.replace(/[^a-z0-9]/gi, '_')}_Reference.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[PDF_PIPELINE_ERROR]", e);
      alert("Print engine encountered a fault.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTXT = () => {
    const element = document.createElement("a");
    const file = new Blob([data.content || ''], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${data.topic.replace(/[^a-z0-9]/gi, '_')}_CheatSheet.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleExportDOC = () => {
    const contentText = data.content || '';
    const brandColor = "#0ea5e9";

    let html = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <style>
          @page { size: landscape; margin: 1.5cm; }
          body { font-family: 'Arial', sans-serif; font-size: 10pt; line-height: 1.2; }
          .header { border-bottom: 2pt solid ${brandColor}; padding-bottom: 5pt; margin-bottom: 15pt; }
          .title { font-size: 22pt; font-weight: bold; color: ${brandColor}; }
          h2 { font-size: 14pt; background-color: #f1f5f9; padding: 4pt; border-left: 3pt solid #000; margin-top: 15pt; }
          p { margin: 4pt 0; }
          .symbol { color: ${brandColor}; font-weight: bold; }
          .footer { margin-top: 30pt; font-size: 7pt; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class='header'><span class='title'>${data.topic}</span><br/><small>High-Density Academic Reference Layer</small></div>
    `;

    // Process raw markdown-like shorthand into Word HTML
    const lines = contentText.split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('## ')) {
        html += `<h2>${trimmed.replace('## ', '')}</h2>`;
      } else if (trimmed.startsWith('### ')) {
        html += `<p style='font-weight: bold; text-decoration: underline; margin-top: 8pt;'>${trimmed.replace('### ', '')}</p>`;
      } else {
        // Handle bold and arrows for Word compatibility
        let processedLine = trimmed
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
          .replace(/->/g, '<span class="symbol">→</span>')
          .replace(/=>/g, '<span class="symbol">⇒</span>');

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          html += `<p style='margin-left: 15pt;'>• ${processedLine.substring(2)}</p>`;
        } else {
          html += `<p>${processedLine}</p>`;
        }
      }
    });

    html += `<div class='footer'>EDUVA Precision Learning reference engine • v5.1 Core</div></body></html>`;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `${data.topic.replace(/[^a-z0-9]/gi, '_')}_CheatSheet.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const parseInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`[^`]+`|\$[^$]+\$|->|=>)/g);
    return parts.map((part, i) => {
      if (part === '->' || part === '=>') {
        return (
          <span key={i} className="inline-flex items-center justify-center w-5 h-5 mx-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 border border-indigo-100 dark:border-indigo-800 shadow-sm align-middle text-[9px] font-black shrink-0">
            {part === '->' ? '→' : '⇒'}
          </span>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <span key={i} className="inline-block px-1.5 py-0 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 font-black text-[0.85em] shadow-sm mx-0.5 border border-amber-200 dark:border-amber-800 align-baseline">
            {part.slice(2, -2)}
          </span>
        );
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return <code key={i} className="bg-slate-100 dark:bg-slate-700 px-1 py-0 rounded font-mono text-[0.8em] text-pink-600 dark:text-pink-400 border border-slate-200 dark:border-slate-600 shadow-inner mx-0.5">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        try {
          const tex = part.slice(1, -1);
          const html = katex.renderToString(tex, { throwOnError: false });
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} className="font-serif inline-block bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800 mx-0.5 shadow-sm" />;
        } catch {
          return <span key={i} className="italic text-indigo-600 font-bold">{part}</span>;
        }
      }
      return part;
    });
  };

  const styleMnemonic = (text: string) => {
    const parts = text.split(/\s+/);
    return parts.map((part, idx) => {
      if (part.length >= 1 && /^[A-Z]/.test(part)) {
        return (
          <span key={idx} className="inline-flex items-center gap-0.5 mr-1">
            <span className="w-4 h-4 flex items-center justify-center rounded bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-50 font-black text-[9px] shadow-sm">
              {part[0]}
            </span>
            <span className="font-medium text-slate-600 dark:text-slate-400 text-[12px]">{part.slice(1)}</span>
          </span>
        );
      }
      return <span key={idx} className="mr-1 text-[12px]">{part}</span>;
    });
  };

  const renderContentBlocks = (text: string) => {
    if (!text) return null;
    const rawBlocks = text.split(/\n(?=## )/);

    return rawBlocks.map((block, bIdx) => {
      const lines = block.trim().split('\n');
      const headerLine = lines[0].startsWith('## ') ? lines[0].replace('## ', '') : null;
      const contentLines = headerLine ? lines.slice(1) : lines;

      return (
        <div key={bIdx} className="break-inside-avoid mb-4 group animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-brand-400 dark:hover:border-brand-600 transition-colors overflow-hidden">
            {headerLine && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-800 dark:text-white">
                  {headerLine}
                </h2>
                <span className="text-brand-500 text-[8px]">✦</span>
              </div>
            )}
            <div className="p-4 space-y-3">
              {contentLines.map((line, lIdx) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                  const content = trimmed.replace(/^[-*] /, '');
                  const isMnemonic = content.toLowerCase().includes('mnemonic:');

                  return (
                    <div key={lIdx} className={`flex gap-2 text-[12px] leading-relaxed text-slate-700 dark:text-slate-300 ${isMnemonic ? 'bg-amber-50/40 dark:bg-amber-900/10 p-2 rounded-lg border border-amber-100/50 dark:border-amber-900/30' : ''}`}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 shadow-sm"></span>
                      <span className="min-w-0 font-medium">
                        {isMnemonic ? styleMnemonic(content) : parseInline(content)}
                      </span>
                    </div>
                  );
                }
                if (trimmed.match(/^\d+\. /)) {
                  return (
                    <div key={lIdx} className="flex gap-2 text-[12px] leading-relaxed text-slate-800 dark:text-slate-100 font-bold bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm">
                      <span className="font-black text-brand-600 shrink-0 w-4 h-4 flex items-center justify-center bg-white dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700 text-[9px]">{trimmed.match(/^\d+/)?.[0]}</span>
                      <span className="min-w-0">{parseInline(trimmed.replace(/^\d+\. /, ''))}</span>
                    </div>
                  );
                }
                if (trimmed === '') return null;
                if (trimmed.startsWith('### ')) {
                  return <h3 key={lIdx} className="text-[9px] font-black uppercase text-slate-400 tracking-widest mt-2 mb-1 flex items-center gap-2"><span className="w-3 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full"></span> {trimmed.replace('### ', '')}</h3>;
                }
                return (
                  <p key={lIdx} className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug border-l-2 border-brand-100 dark:border-brand-900 pl-3 py-0.5 italic font-medium">
                    {parseInline(trimmed)}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className={`max-w-7xl mx-auto animate-fade-in pb-24 p-4 cheat-sheet-container ${dir === 'rtl' ? 'font-arabic' : ''}`} dir={dir}>
      <style>{`
        .cheat-sheet-container[dir="rtl"] { direction: rtl; text-align: right; }
        .cheat-sheet-container[dir="ltr"] { direction: ltr; text-align: left; }
        .cheat-sheet-container[dir="rtl"] .katex { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }
        /* Fix indentation and borders for RTL */
        .cheat-sheet-container[dir="rtl"] .border-l-2 { border-right-width: 2px !important; border-left-width: 0 !important; }
        .cheat-sheet-container[dir="rtl"] .pl-3 { padding-right: 0.75rem !important; padding-left: 0 !important; }
        .cheat-sheet-container[dir="rtl"] .mr-1 { margin-left: 0.25rem; margin-right: 0; }
        .cheat-sheet-container[dir="rtl"] .text-right { text-align: left !important; } /* Flip header meta */
      `}</style>
      <div className="flex justify-between items-center mb-6 no-print">
        <Button variant="outline" onClick={onBack} className="rounded-xl shadow-md bg-white dark:bg-slate-800">← {t.back}</Button>
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 p-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-10 h-10 flex items-center justify-center bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all active:scale-95 disabled:opacity-50"
              title="Export as PDF"
            >
              {isExporting ? <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div> : <span className="text-[9px] font-black">PDF</span>}
            </button>
            <button
              onClick={handleExportDOC}
              className="w-10 h-10 flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-all active:scale-95"
              title="Export as Word"
            >
              <span className="text-[9px] font-black">DOC</span>
            </button>
            <button
              onClick={handleExportTXT}
              className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition-all active:scale-95"
              title="Export as Text"
            >
              <span className="text-[9px] font-black">TXT</span>
            </button>
          </div>
        </div>
      </div>

      <div id="cheat-sheet-display-area" className="bg-white dark:bg-slate-900 shadow-2xl rounded-[2rem] overflow-hidden border border-slate-200 dark:border-slate-800 relative min-h-[600px]">
        <div className="h-2 bg-gradient-to-r from-brand-400 via-indigo-500 to-purple-600 relative z-10"></div>

        <div className="p-8 md:p-12 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 border-b-2 border-slate-100 dark:border-slate-800 pb-6">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 text-[9px] font-black tracking-widest uppercase mb-3 border border-brand-200/50 dark:border-brand-800">
                <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse shadow-sm"></span>
                High-Density Reference
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                {data.topic}
              </h1>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="flex gap-1.5">
                <span className="text-[8px] font-black bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-0.5 rounded uppercase tracking-wider">Core</span>
                <span className="text-[8px] font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-2 py-0.5 rounded uppercase tracking-wider border border-indigo-100 dark:border-indigo-800">V5.1</span>
              </div>
              <span className="text-[9px] font-bold uppercase text-slate-400">{new Date(data.timestamp).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-2">
            {renderContentBlocks(data.content || '')}
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950/80 border-t border-slate-100 dark:border-slate-800 p-4 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.3em] text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-brand-500 rounded-full"></div>
            <span>Canonical Knowledge Layer Projection</span>
          </div>
          <span className="text-slate-600 dark:text-slate-300">EDUVA PRECISION ENGINE</span>
        </div>
      </div>
    </div>
  );
};

export default CheatSheetDisplay;
