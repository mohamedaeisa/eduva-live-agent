import React, { useEffect, useRef, useState } from 'react';

interface PdfPageProps {
    pageNum: number;
    doc: any;
    isVisible: boolean;
}

const PdfPage: React.FC<PdfPageProps> = ({ pageNum, doc, isVisible }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderTaskRef = useRef<any>(null);
    const [isRendered, setIsRendered] = useState(false);

    // Reset rendered state if document or page changes
    useEffect(() => {
        setIsRendered(false);
    }, [doc, pageNum]);

    useEffect(() => {
        // 🛡️ Guard: Only render if visible and not already rendered
        // If visibility is lost, we cancel the task to save resources
        if (!isVisible) {
            if (renderTaskRef.current) {
                console.debug(`[PDF] Cancelling render for page ${pageNum} (hidden)`);
                renderTaskRef.current.cancel();
                renderTaskRef.current = null;
            }
            return;
        }

        if (isRendered || !doc) return;

        const renderPage = async () => {
            try {
                const page = await doc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.5 }); // High res for AI & User
                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                if (!context) return;

                // 🔒 Canonical Fix: Cancel previous task before starting a new one
                if (renderTaskRef.current) {
                    await renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                }

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                console.debug(`[PDF] Starting render for page ${pageNum}`);
                renderTaskRef.current = page.render({ canvasContext: context, viewport });

                await renderTaskRef.current.promise;
                renderTaskRef.current = null;
                setIsRendered(true);
                console.debug(`[PDF] Finished render for page ${pageNum}`);
            } catch (e: any) {
                if (e.name === 'RenderingCancelledException') {
                    console.debug(`[PDF] Rendering cancelled for page ${pageNum}`);
                } else {
                    console.error(`[PDF] Page ${pageNum} render failed`, e);
                }
            }
        };

        renderPage();

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
                renderTaskRef.current = null;
            }
        };
    }, [isVisible, doc, pageNum, isRendered]);

    return (
        <div
            data-page={pageNum}
            className="pdf-page-placeholder relative w-full flex justify-center mb-8 shadow-2xl rounded-lg overflow-hidden bg-slate-800"
            style={{ minHeight: '800px' }}
        >
            <canvas ref={canvasRef} className="max-w-full h-auto bg-white" />
            {!isRendered && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-xs">
                    {isVisible ? 'RENDERING PAGE...' : `PAGE ${pageNum} (IDLE)`}
                </div>
            )}
        </div>
    );
};

export default React.memo(PdfPage);
