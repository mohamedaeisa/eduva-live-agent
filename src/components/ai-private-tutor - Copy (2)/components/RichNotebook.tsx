import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface RichNotebookProps {
    content: string;
    title: string;
    colorTheme: 'yellow' | 'blue' | 'green' | 'pink';
    fontSize: number;
}

const RichNotebook: React.FC<RichNotebookProps> = ({ content, title, colorTheme, fontSize }) => {
    const getThemeStyles = () => {
        switch (colorTheme) {
            case 'yellow': return 'border-yellow-400 bg-yellow-50/30';
            case 'blue': return 'border-blue-400 bg-blue-50/30';
            case 'green': return 'border-green-400 bg-green-50/30';
            case 'pink': return 'border-pink-400 bg-pink-50/30';
            default: return 'border-slate-200 bg-white';
        }
    };

    return (
        <div className={`p-6 rounded-xl shadow-sm border-l-4 transition-all hover:shadow-md bg-white ${getThemeStyles()} overflow-hidden`}>
            <h3 className="font-bold text-slate-800 mb-4 border-b border-slate-200/50 pb-2" style={{ fontSize: `${fontSize + 4}px` }}>
                {title}
            </h3>

            <div
                className="prose prose-slate max-w-none dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-li:my-0.5"
                style={{ fontSize: `${fontSize}px` }}
            >
                <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        table: ({ node, ...props }) => (
                            <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                                <table className="min-w-full divide-y divide-slate-200" {...props} />
                            </div>
                        ),
                        thead: ({ node, ...props }) => <thead className="bg-slate-50" {...props} />,
                        th: ({ node, ...props }) => <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider" {...props} />,
                        td: ({ node, ...props }) => <td className="px-4 py-2 whitespace-nowrap text-sm text-slate-600 border-t border-slate-100" {...props} />,
                        blockquote: ({ node, ...props }) => (
                            <blockquote className="border-l-4 border-blue-400 pl-4 italic bg-slate-50 py-2 rounded-r my-4" {...props} />
                        ),
                        code: ({ node, inline, className, children, ...props }: any) => {
                            return inline ? (
                                <code className="bg-slate-100 text-pink-600 rounded px-1 py-0.5 text-[0.9em] font-mono" {...props}>{children}</code>
                            ) : (
                                <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm my-4 font-mono">
                                    <code {...props}>{children}</code>
                                </pre>
                            )
                        },
                        img: ({ node, ...props }) => <img className="rounded-lg shadow-md my-4 max-w-full" {...props} alt={props.alt || ''} />,
                        a: ({ node, ...props }) => <a className="text-blue-600 hover:underline" {...props} target="_blank" rel="noreferrer" />
                    }}
                >
                    {content || "*Waiting for notes...*"}
                </ReactMarkdown>
            </div>
        </div>
    );
};

export default RichNotebook;
