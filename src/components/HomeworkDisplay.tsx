
import React, { useState } from 'react';
import { HomeworkData, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import Button from './ui/Button';
import katex from 'katex';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface HomeworkDisplayProps {
  data: HomeworkData;
  onBack: () => void;
  appLanguage: Language;
}

const HomeworkDisplay: React.FC<HomeworkDisplayProps> = ({ data, onBack, appLanguage }) => {
  const t = TRANSLATIONS[appLanguage];
  const [isZoomed, setIsZoomed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const container = document.getElementById('homework-report');
      if (!container) throw new Error("Content element not found");

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgProps = pdf.getImageProperties(imgData);
      
      let remainingHeight = imgProps.height;
      let page = 0;
      const pxToMm = pdfWidth / canvas.width;
      const pageHeightCanvasPx = pdfHeight / pxToMm;
      let currentSourceY = 0;

      while (remainingHeight > 0) {
        if (page > 0) pdf.addPage();
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(pageHeightCanvasPx, remainingHeight);
        const ctx = sliceCanvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(canvas, 0, currentSourceY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
            const sliceData = sliceCanvas.toDataURL('image/png');
            const sliceHeightMm = (sliceCanvas.height * pdfWidth) / sliceCanvas.width;
            pdf.addImage(sliceData, 'PNG', 0, 0, pdfWidth, sliceHeightMm);
        }
        remainingHeight -= pageHeightCanvasPx;
        currentSourceY += pageHeightCanvasPx;
        page++;
      }

      pdf.save(`Homework_Report.pdf`);
    } catch (e) {
      console.error(e);
      alert("Failed to export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTXT = () => {
    const element = document.createElement("a");
    const file = new Blob([data.feedback || ''], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `Homework_Report.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleExportDOC = () => {
    const feedbackText = data.feedback || '';
    // Convert markdown roughly to HTML
    const contentHtml = feedbackText
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*?)\*/gim, '<i>$1</i>')
        .replace(/\n/gim, '<br/>');

    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${data.title}</title></head><body>`;
    const postHtml = "</body></html>";
    const html = preHtml + contentHtml + postHtml;

    const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement("a");
    element.href = url;
    element.download = `Homework_Report.doc`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const parseInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|\$[^$]+\$)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 px-1 rounded mx-0.5">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
         try {
             const html = katex.renderToString(part.slice(1, -1), { throwOnError: false });
             return <span key={i} dangerouslySetInnerHTML={{__html: html}} className="mx-1" />;
         } catch {
             return <span key={i}>{part}</span>;
         }
      }
      return part;
    });
  };

  const renderContent = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      if (line.startsWith('# ')) return null;
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-lg font-bold mt-4 mb-2 text-slate-800 dark:text-slate-200">{line.replace('### ', '')}</h3>;
      }
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <li key={idx} className="ltr:ml-4 rtl:mr-4 list-none relative ltr:pl-5 rtl:pr-5 mb-2 text-slate-700 dark:text-slate-300">
             <span className="absolute ltr:left-0 rtl:right-0 top-1.5 w-1.5 h-1.5 bg-brand-400 rounded-full"></span>
             {parseInline(line.replace(/^[-*] /, ''))}
          </li>
        );
      }
      if (line.match(/^\d+\. /)) {
         return <li key={idx} className="ltr:ml-5 rtl:mr-5 list-decimal mb-2 font-medium text-slate-700 dark:text-slate-300">{parseInline(line.replace(/^\d+\. /, ''))}</li>;
      }
      if (line.trim() === '') return <br key={idx} />;
      return <p key={idx} className="mb-2 leading-relaxed text-slate-600 dark:text-slate-400">{parseInline(line)}</p>;
    });
  };

  const sections = (data.feedback || '').split(/\n(?=## )/);

  return (
    <div className="max-w-7xl mx-auto animate-slide-up pb-20">
      {isZoomed && data.originalImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm animate-fade-in" onClick={() => setIsZoomed(false)}>
          <img src={data.originalImage} alt="Zoomed Homework" className="max-w-full max-h-full rounded-lg shadow-2xl"/>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <Button variant="outline" onClick={onBack} className="rounded-full w-10 h-10 p-0 flex items-center justify-center">←</Button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Homework Report</h1>
        </div>
        <div className="flex gap-2 w-full md:w-auto justify-center">
            {/* PDF Button */}
            <button 
                onClick={handleExportPDF} 
                disabled={isExporting}
                className="group flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title={t.exportPdf}
            >
                {isExporting ? <span className="text-xs animate-pulse font-bold">...</span> : (
                    <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                      <path d="M20 4H8C6.89543 4 6 4.89543 6 6V26C6 27.1046 6.89543 28 8 28H24C25.1046 28 26 27.1046 26 26V10L20 4Z" fill="#EF4444"/>
                      <path d="M20 4V10H26" fill="#DC2626"/>
                      <text x="9" y="20" fill="white" fontSize="8" fontWeight="900" fontFamily="sans-serif">PDF</text>
                    </svg>
                )}
            </button>
            {/* Word Button */}
            <button 
                onClick={handleExportDOC}
                className="group flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm active:scale-95"
                title="Export as Word Doc"
            >
                <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                  <path d="M20 4H8C6.89543 4 6 4.89543 6 6V26C6 27.1046 6.89543 28 8 28H24C25.1046 28 26 27.1046 26 26V10L20 4Z" fill="#3B82F6"/>
                  <path d="M20 4V10H26" fill="#1D4ED8"/>
                  <text x="9.5" y="20" fill="white" fontSize="8" fontWeight="900" fontFamily="sans-serif">W</text>
                </svg>
            </button>
            {/* Text Button */}
            <button 
                onClick={handleExportTXT}
                className="group flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all shadow-sm active:scale-95"
                title="Export as Plain Text"
            >
                <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                  <path d="M20 4H8C6.89543 4 6 4.89543 6 6V26C6 27.1046 6.89543 28 8 28H24C25.1046 28 26 27.1046 26 26V10L20 4Z" fill="#94A3B8"/>
                  <path d="M20 4V10H26" fill="#64748B"/>
                  <rect x="10" y="14" width="12" height="2" rx="1" fill="white"/>
                  <rect x="10" y="18" width="12" height="2" rx="1" fill="white"/>
                  <rect x="10" y="22" width="8" height="2" rx="1" fill="white"/>
                </svg>
            </button>
        </div>
      </div>

      <div id="homework-report" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-white dark:bg-slate-900 p-4">
        <div className="lg:col-span-4 lg:sticky lg:top-24">
           <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-slate-100 dark:border-slate-700">
             <div className="flex justify-between items-center mb-4">
               <span className="text-xs font-mono text-brand-600 bg-brand-50 dark:bg-brand-900/30 px-2 py-1 rounded">{new Date(data.timestamp).toLocaleDateString()}</span>
             </div>
             {data.originalImage ? (
               <div className="relative group overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900 cursor-zoom-in" onClick={() => setIsZoomed(true)}>
                 <img src={data.originalImage} alt="Submitted Homework" className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-105 opacity-90 group-hover:opacity-100"/>
               </div>
             ) : (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700">
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">No Image</span>
                </div>
             )}
           </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {sections.length > 0 ? sections.map((section, index) => {
            if (!section.trim()) return null;
            const lines = section.split('\n');
            const firstLine = lines[0].trim();
            let type: 'default' | 'success' | 'error' | 'warning' | 'info' = 'default';
            let title = '';
            let content = section;
            let icon = '📝';

            if (firstLine.startsWith('## ')) {
              title = firstLine.replace('## ', '');
              content = lines.slice(1).join('\n');
              if (title.includes('✅') || title.includes('Correct') || title.includes('Strength')) { type = 'success'; icon = '✅'; }
              else if (title.includes('❌') || title.includes('Improvement') || title.includes('Correction')) { type = 'error'; icon = '🔧'; }
              else if (title.includes('💡') || title.includes('Action') || title.includes('Recommend')) { type = 'warning'; icon = '💡'; }
              else if (title.includes('🔍') || title.includes('Analysis')) { type = 'info'; icon = '🔍'; }
            } else {
               // Fallback if no header but content exists
               if (!content.trim()) return null;
               return <div key={index} className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-sm mb-6 border border-slate-100 dark:border-slate-700"><div className="prose dark:prose-invert max-w-none prose-h1:text-4xl prose-h1:font-black prose-h1:text-transparent prose-h1:bg-clip-text prose-h1:bg-gradient-to-r prose-h1:from-brand-600 prose-h1:to-purple-600">{renderContent(content)}</div></div>;
            }

            let bgClass = "bg-white dark:bg-slate-800";
            let borderClass = "border-l-4 rtl:border-l-0 rtl:border-r-4 border-slate-200";
            let titleColor = "text-slate-800 dark:text-white";
            let iconBg = "bg-slate-100 dark:bg-slate-700";

            switch(type) {
              case 'success': bgClass = "bg-green-50/50 dark:bg-green-900/10"; borderClass = "border-l-4 rtl:border-l-0 rtl:border-r-4 border-green-500"; titleColor = "text-green-800 dark:text-green-300"; iconBg = "bg-green-100 dark:bg-green-900/30 text-green-600"; break;
              case 'error': bgClass = "bg-red-50/50 dark:bg-red-900/10"; borderClass = "border-l-4 rtl:border-l-0 rtl:border-r-4 border-red-500"; titleColor = "text-red-800 dark:text-red-300"; iconBg = "bg-red-100 dark:bg-red-900/30 text-red-600"; break;
              case 'warning': bgClass = "bg-amber-50/50 dark:bg-amber-900/10"; borderClass = "border-l-4 rtl:border-l-0 rtl:border-r-4 border-amber-500"; titleColor = "text-amber-800 dark:text-amber-300"; iconBg = "bg-amber-100 dark:bg-amber-900/30 text-amber-600"; break;
              case 'info': bgClass = "bg-blue-50/50 dark:bg-blue-900/10"; borderClass = "border-l-4 rtl:border-l-0 rtl:border-r-4 border-blue-500"; titleColor = "text-blue-800 dark:text-blue-300"; iconBg = "bg-blue-100 dark:bg-blue-900/30 text-blue-600"; break;
            }

            return (
              <div key={index} className={`${bgClass} rounded-2xl p-6 shadow-sm mb-6 ${borderClass}`}>
                 <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${iconBg} text-xl flex-shrink-0`}>{icon}</div>
                    <div className="flex-grow">
                       {title && <h3 className={`font-bold text-lg mb-2 ${titleColor}`}>{title}</h3>}
                       <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">{renderContent(content)}</div>
                    </div>
                 </div>
              </div>
            );
          }) : (
            <div className="text-center py-12 text-slate-400 italic">No feedback content generated.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeworkDisplay;
