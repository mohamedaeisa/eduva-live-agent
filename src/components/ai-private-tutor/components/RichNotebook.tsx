import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface RichNotebookProps {
    content: string;
    title: string;
    colorTheme: 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'teal' | 'orange' | 'indigo';
    fontSize: number;
    isWriting?: boolean; // 🎯 Phase 100: Track if AI is actively updating this note
}

const RichNotebook: React.FC<RichNotebookProps> = ({ content, title, colorTheme, fontSize, isWriting }) => {
    console.log(`[RichNotebook] Render title="${title}" contentLen=${content?.length || 0} isWriting=${!!isWriting}`);

    const getThemeStyles = () => {
        // 💎 Phase 100: World-Class Glassmorphism & Glossy UI
        switch (colorTheme) {
            case 'yellow': return 'border-amber-400/60 bg-gradient-to-br from-amber-50/80 via-yellow-50/50 to-orange-50/40 dark:from-amber-900/40 dark:via-yellow-900/30 dark:to-orange-900/20 shadow-[0_8px_30px_rgba(251,191,36,0.15)] backdrop-blur-md dark:border-amber-500/30';
            case 'blue': return 'border-blue-400/60 bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-indigo-50/40 dark:from-blue-900/40 dark:via-sky-900/30 dark:to-indigo-900/20 shadow-[0_8px_30px_rgba(59,130,246,0.15)] backdrop-blur-md dark:border-blue-500/30';
            case 'green': return 'border-emerald-400/60 bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-green-50/40 dark:from-emerald-900/40 dark:via-teal-900/30 dark:to-green-900/20 shadow-[0_8px_30px_rgba(16,185,129,0.15)] backdrop-blur-md dark:border-emerald-500/30';
            case 'pink': return 'border-rose-400/60 bg-gradient-to-br from-rose-50/80 via-pink-50/50 to-fuchsia-50/40 dark:from-rose-900/40 dark:via-pink-900/30 dark:to-fuchsia-900/20 shadow-[0_8px_30px_rgba(244,63,94,0.15)] backdrop-blur-md dark:border-rose-500/30';
            case 'purple': return 'border-purple-400/60 bg-gradient-to-br from-purple-50/80 via-violet-50/50 to-indigo-50/40 dark:from-purple-900/40 dark:via-violet-900/30 dark:to-indigo-900/20 shadow-[0_8px_30px_rgba(168,85,247,0.15)] backdrop-blur-md dark:border-purple-500/30';
            case 'teal': return 'border-teal-400/60 bg-gradient-to-br from-teal-50/80 via-cyan-50/50 to-blue-50/40 dark:from-teal-900/40 dark:via-cyan-900/30 dark:to-blue-900/20 shadow-[0_8px_30px_rgba(20,184,166,0.15)] backdrop-blur-md dark:border-teal-500/30';
            case 'orange': return 'border-orange-400/60 bg-gradient-to-br from-orange-50/80 via-amber-50/50 to-red-50/40 dark:from-orange-900/40 dark:via-amber-900/30 dark:to-red-900/20 shadow-[0_8px_30px_rgba(249,115,22,0.15)] backdrop-blur-md dark:border-orange-500/30';
            case 'indigo': return 'border-indigo-400/60 bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-indigo-100/40 dark:from-indigo-900/40 dark:via-blue-900/30 dark:to-indigo-900/20 shadow-[0_8px_30px_rgba(99,102,241,0.15)] backdrop-blur-md dark:border-indigo-500/30';
            default: return 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 shadow-xl backdrop-blur-sm';
        }
    };

    const getAccentColor = () => {
        switch (colorTheme) {
            case 'yellow': return 'text-amber-700 dark:text-amber-300';
            case 'blue': return 'text-blue-700 dark:text-blue-300';
            case 'green': return 'text-emerald-700 dark:text-emerald-300';
            case 'pink': return 'text-rose-700 dark:text-rose-300';
            case 'purple': return 'text-purple-700 dark:text-purple-300';
            case 'teal': return 'text-teal-700 dark:text-teal-300';
            case 'orange': return 'text-orange-700 dark:text-orange-300';
            case 'indigo': return 'text-indigo-700 dark:text-indigo-300';
            default: return 'text-slate-800 dark:text-slate-200';
        }
    };

    return (
        <div className={`p-6 md:p-8 rounded-[2rem] border-l-[8px] transition-all hover:shadow-2xl hover:-translate-y-1 duration-500 ${getThemeStyles()} overflow-hidden mb-8 group relative`}>
            {/* 💎 Glossy Overlay Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />

            <div className="flex items-center justify-between mb-6 border-b border-slate-200/40 dark:border-slate-700/40 pb-4 relative z-10">
                <h3 className={`font-black tracking-tight drop-shadow-sm ${getAccentColor()}`} style={{ fontSize: `${fontSize + 8}px` }}>
                    {title}
                </h3>
                <div className="flex items-center gap-3">
                    {isWriting && (
                        <div className={`px-3 py-1 rounded-full bg-white/60 backdrop-blur-md border border-white/20 shadow-sm flex items-center gap-2 animate-pulse`}>
                            <div className={`w-2 h-2 rounded-full ${getAccentColor().replace('text-', 'bg-')}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${getAccentColor()}`}>Live Writing...</span>
                        </div>
                    )}
                    <div className={`w-10 h-10 rounded-2xl bg-white/60 backdrop-blur-md flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-500`}>
                        <svg className={`w-5 h-5 ${getAccentColor()}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                    </div>
                </div>
            </div>

            <div
                className={`prose max-w-none text-slate-900 dark:text-slate-100
                    prose-headings:font-black prose-headings:tracking-tight prose-headings:mb-4 prose-headings:text-slate-900 dark:prose-headings:text-slate-50
                    prose-h2:text-2xl prose-h2:mt-8
                    prose-p:leading-relaxed prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:mb-5
                    prose-strong:font-black prose-strong:text-slate-900 dark:prose-strong:text-white
                    prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-li:mb-2
                    prose-table:my-8 prose-table:rounded-2xl
                    /* 📐 Math Excellence: Make Katex pop */
                    [&_.katex-display]:my-8 [&_.katex-display]:p-6 [&_.katex-display]:bg-white/40 dark:[&_.katex-display]:bg-black/20 [&_.katex-display]:rounded-2xl [&_.katex-display]:backdrop-blur-sm [&_.katex-display]:shadow-inner
                    [&_.katex]:text-[1.2em] [&_.katex]:font-bold [&_.katex]:text-slate-900 dark:[&_.katex]:text-slate-100 [&_.katex]:mx-0.5
                    max-h-[600px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-slate-300/50 scrollbar-track-transparent relative z-10
                    ${isWriting ? 'bg-gradient-to-b from-transparent via-white/10 to-transparent animate-shimmer' : ''}`}
                style={{ fontSize: `${fontSize}px` }}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[[rehypeKatex, { strict: false, trust: true, throwOnError: false }]]}
                    components={{
                        table: ({ node, ...props }) => (
                            <div className="overflow-x-auto my-8 rounded-[1.5rem] border border-slate-200 dark:border-slate-700 shadow-xl bg-white/70 dark:bg-slate-900/50 backdrop-blur-md ring-1 ring-black/5">
                                <table className="min-w-full divide-y divide-slate-200/50 dark:divide-slate-700/50" {...props} />
                            </div>
                        ),
                        thead: ({ node, ...props }) => <thead className="bg-slate-100/40 dark:bg-slate-800/40" {...props} />,
                        th: ({ node, ...props }) => <th className="px-6 py-4 text-left text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-200/50 dark:border-slate-700/50" {...props} />,
                        td: ({ node, ...props }) => <td className="px-6 py-4 text-sm font-medium text-slate-700 dark:text-slate-300 border-b border-slate-100/30 dark:border-slate-800/30 group-hover:bg-white/20 dark:group-hover:bg-white/5 transition-colors" {...props} />,
                        tr: ({ node, ...props }) => <tr className="hover:bg-white/40 dark:hover:bg-white/10 transition-colors duration-200" {...props} />,
                        blockquote: ({ node, ...props }) => (
                            <blockquote className={`border-l-8 ${getAccentColor().replace('text-', 'border-')} pl-6 italic bg-white/40 dark:bg-black/20 backdrop-blur-sm py-4 rounded-r-2xl my-8 text-slate-700 dark:text-slate-300 font-semibold shadow-sm`} {...props} />
                        ),
                        code: ({ node, inline, className, children, ...props }: any) => {
                            return inline ? (
                                <code className="bg-slate-900 text-sky-300 rounded-lg px-2 py-1 text-[0.9em] font-black font-mono shadow-sm mx-0.5" {...props}>{children}</code>
                            ) : (
                                <div className="relative group/code my-8">
                                    <div className="absolute -top-3 left-4 px-3 py-1 bg-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-full opacity-0 group-hover/code:opacity-100 transition-opacity duration-300">Code Block</div>
                                    <pre className="bg-slate-900 text-slate-100 p-6 pt-8 rounded-2xl overflow-x-auto text-[14px] font-mono shadow-2xl border border-white/10 ring-1 ring-black/40">
                                        <code {...props}>{children}</code>
                                    </pre>
                                </div>
                            )
                        },
                        img: ({ node, ...props }) => (
                            <div className="relative group/img my-8">
                                <img className="rounded-3xl shadow-2xl max-w-full transform group-hover:scale-[1.02] transition-all duration-700 ease-out z-10 relative" {...props} alt={props.alt || ''} />
                                <div className="absolute inset-0 bg-black/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all duration-700 -z-10 opacity-30" />
                            </div>
                        ),
                        a: ({ node, ...props }) => <a className="text-blue-600 font-black hover:text-blue-700 underline decoration-blue-300 decoration-2 underline-offset-4 hover:decoration-blue-500 transition-all" {...props} target="_blank" rel="noreferrer" />,
                        p: ({ node, children, ...props }: any) => <p className="mb-5 last:mb-0" {...props}>{children}</p>,
                        li: ({ node, ...props }: any) => <li className="marker:text-blue-500 marker:font-black mb-3 pl-2" {...props} />,
                        h2: ({ node, ...props }) => <h2 className={`mt-10 mb-6 pb-2 border-b-2 border-slate-200/30 dark:border-slate-700/30 ${getAccentColor()}`} {...props} />
                    }}
                >
                    {content || "*Waiting for notes...*"}
                </ReactMarkdown>
            </div>
        </div>
    );
};



// ⚡ Phase 50: Memoize to prevent re-renders on every audio frame
export default React.memo(RichNotebook, (prev, next) => {
    return (
        prev.content === next.content &&
        prev.title === next.title &&
        prev.colorTheme === next.colorTheme &&
        prev.fontSize === next.fontSize &&
        prev.isWriting === next.isWriting
    );
});
