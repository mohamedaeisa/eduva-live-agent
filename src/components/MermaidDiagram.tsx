
import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    mermaid: any;
  }
}

export const sanitizeMermaidCode = (code: any): string => {
  // 1. Strict Type Check
  if (!code || typeof code !== 'string') return '';
  
  // 2. Filter out corrupted "object Object" strings
  if (code.includes('[object Object]')) return '';

  let cleaned = code;
  
  // 3. Extract markdown block if present
  const match = code.match(/```(?:mermaid)?([\s\S]*?)```/);
  if (match && match[1]) {
      cleaned = match[1];
  } else {
      cleaned = cleaned.replace(/```mermaid/g, '').replace(/```/g, '');
  }
  
  cleaned = cleaned.trim();

  // 4. Normalize Header
  if (!cleaned.startsWith('mindmap')) {
      cleaned = 'mindmap\n' + cleaned;
  }

  // 5. Process Lines (Split, Clean, Filter)
  const lines = cleaned.split('\n');
  const validLines: { indent: string; content: string }[] = [];
  
  lines.forEach((line, index) => {
      // Skip the header line(s) if encountered again
      if (line.trim() === 'mindmap') return;
      
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      let content = line.trim();
      
      if (!content) return;

      // Strip outer shape wrappers if present (e.g., ((Text)), [Text], etc.)
      if (content.startsWith('((') && content.endsWith('))')) content = content.slice(2, -2);
      else if (content.startsWith('{{') && content.endsWith('}}')) content = content.slice(2, -2);
      else if (content.startsWith('[[') && content.endsWith(']]')) content = content.slice(2, -2);
      else if (content.startsWith('[') && content.endsWith(']')) content = content.slice(1, -1);
      else if (content.startsWith('(') && content.endsWith(')')) content = content.slice(1, -1);

      // Aggressive sanitization of forbidden chars inside the text
      content = content.replace(/[\(\)\[\]\{\}]/g, ''); 
      content = content.trim().replace(/\s+/g, ' '); // Collapse spaces
      content = content.replace(/"/g, "'"); // Normalize quotes

      if (content) {
          validLines.push({ indent, content });
      }
  });

  if (validLines.length === 0) return 'mindmap\n  [Empty Map]';

  // 6. Structural Integrity Check (Root Count)
  const minIndentLen = Math.min(...validLines.map(l => l.indent.length));
  const rootCandidates = validLines.filter(l => l.indent.length === minIndentLen);

  let finalOutput = 'mindmap\n';

  if (rootCandidates.length > 1) {
      // Multiple roots detected: Wrap them in a synthetic "Concept Map" root
      finalOutput += `  [Concept Map]\n`;
      validLines.forEach(l => {
          finalOutput += `    ${l.indent}[${l.content}]\n`;
      });
  } else {
      validLines.forEach(l => {
          finalOutput += `${l.indent}[${l.content}]\n`;
      });
  }

  return finalOutput;
};

const MermaidDiagram: React.FC<{ code: string }> = ({ code }) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  
  // Refs for touch interactions
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef<number>(1);

  useEffect(() => {
    let isMounted = true;
    if (window.mermaid) {
      window.mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'default', 
        securityLevel: 'loose',
        fontFamily: 'sans-serif',
        mindmap: {
            useMaxWidth: false,
        }
      });
      
      const renderDiagram = async () => {
        // Strict check: if code is missing, empty, or "object Object", treat as invalid
        if (!code || typeof code !== 'string' || code.includes('[object Object]') || !code.trim()) {
            return;
        }
        
        try {
            const cleanCode = sanitizeMermaidCode(code);
            
            const id = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const { svg } = await window.mermaid.render(id, cleanCode);
            
            if (isMounted) {
                setSvgContent(svg);
                setError(null);
                setScale(1);
                setPosition({ x: 0, y: 0 });
            }
        } catch (e: any) {
            console.error("Mermaid Render Error:", e);
            if (isMounted) {
                setError("Visual map could not be rendered due to syntax complexity.");
            }
        }
      };
      renderDiagram();
    } else {
        setError("Visual library missing.");
    }
    return () => { isMounted = false; };
  }, [code]);

  // --- Mouse Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault(); // Prevent text selection
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => { setIsDragging(false); };
  
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    // Limit scale between 0.2x and 5x
    setScale(s => Math.min(Math.max(s + delta, 0.2), 5));
  };

  // --- Touch Handlers ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      // Prepare for pinch
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistRef.current = dist;
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Important to prevent page scrolling

    if (e.touches.length === 1 && isDragging && lastTouchRef.current) {
        // Pan
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        setPosition(p => ({ x: p.x + dx, y: p.y + dy }));
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && initialPinchDistRef.current) {
        // Pinch Zoom
        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = dist / initialPinchDistRef.current;
        setScale(Math.min(Math.max(initialScaleRef.current * ratio, 0.2), 5));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    lastTouchRef.current = null;
    initialPinchDistRef.current = null;
  };

  // --- Controls ---
  const zoomIn = () => setScale(s => Math.min(s * 1.2, 5));
  const zoomOut = () => setScale(s => Math.max(s / 1.2, 0.2));
  const resetView = () => { setScale(1); setPosition({ x: 0, y: 0 }); };
  const pan = (dx: number, dy: number) => setPosition(p => ({ x: p.x + dx, y: p.y + dy }));

  return (
    <div className="my-6 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm bg-slate-50 dark:bg-slate-800/50 relative group h-[500px]">
      {/* Controls - Always visible on small screens (opacity-100), fade on hover for large */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 transition-opacity duration-200 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
         <div className="flex gap-1 justify-center">
            <button onClick={() => pan(0, 50)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Pan Down">⬇️</button>
            <button onClick={() => pan(0, -50)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Pan Up">⬆️</button>
         </div>
         <div className="flex gap-1 justify-center">
            <button onClick={() => pan(50, 0)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Pan Right">➡️</button>
            <button onClick={() => pan(-50, 0)} className="p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Pan Left">⬅️</button>
         </div>
         <div className="h-px bg-slate-200 dark:bg-slate-700 my-1"></div>
         <div className="flex gap-1">
            <button onClick={zoomOut} className="w-8 p-1 font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-lg" title="Zoom Out">-</button>
            <button onClick={resetView} className="p-1 text-xs font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Reset View">100%</button>
            <button onClick={zoomIn} className="w-8 p-1 font-bold rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-lg" title="Zoom In">+</button>
         </div>
      </div>
      
      {error ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
              <span className="text-2xl mb-2">⚠️</span>
              <p className="text-xs">{error}</p>
          </div>
      ) : !svgContent ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
              <div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full mr-2"></div>
              <span className="text-xs">Generating Map...</span>
          </div>
      ) : (
          <div 
            ref={containerRef}
            className={`w-full h-full overflow-hidden cursor-${isDragging ? 'grabbing' : 'grab'} bg-dot-pattern`} 
            onMouseDown={handleMouseDown} 
            onMouseMove={handleMouseMove} 
            onMouseUp={handleMouseUp} 
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
              <div 
                className="w-full h-full flex items-center justify-center origin-center will-change-transform" 
                style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, 
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out' 
                }} 
                dangerouslySetInnerHTML={{ __html: svgContent }} 
              />
          </div>
      )}
    </div>
  );
};

export default MermaidDiagram;
