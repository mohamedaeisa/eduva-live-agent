import React, { useEffect, useRef } from 'react';
import { Stroke } from '../types';

interface TeacherOverlayProps {
  actions: Stroke[];
  width: number;
  height: number;
}

const drawHandCircle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.beginPath();
  const maxAngle = 2 * Math.PI + 0.4;
  const step = 0.2;
  for (let angle = 0; angle <= maxAngle; angle += step) {
    const noiseX = (Math.random() - 0.5) * (rx * 0.1);
    const noiseY = (Math.random() - 0.5) * (ry * 0.1);
    const px = cx + (rx + noiseX) * Math.cos(angle);
    const py = cy + (ry + noiseY) * Math.sin(angle);
    if (angle === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
};

const drawHandArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const length = Math.hypot(toX - fromX, toY - fromY);
  ctx.beginPath();
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const curveAmt = length * 0.05 * (Math.random() - 0.5);
  const cpX = midX - curveAmt * Math.sin(angle);
  const cpY = midY + curveAmt * Math.cos(angle);
  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo(cpX, cpY, toX, toY);
  ctx.stroke();
  const headLen = Math.max(15, length * 0.15);
  const angle1 = angle - Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle1), toY - headLen * Math.sin(angle1));
  ctx.stroke();
  const angle2 = angle + Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle2), toY - headLen * Math.sin(angle2));
  ctx.stroke();
};

const drawStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  if (stroke.path.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(stroke.path[0].x, stroke.path[0].y);

  // 🎯 AI Freehand paths might have sharp angles, use simple lineTo instead of trying to smooth 
  // with Quadratic curves, which can cause rendering glitches if points are too sparse.
  for (let i = 1; i < stroke.path.length; i++) {
    ctx.lineTo(stroke.path[i].x, stroke.path[i].y);
  }

  ctx.stroke();
  console.log(`🎨 [DRAW][RENDER] Drew path with ${stroke.path.length} points. Color: ${ctx.strokeStyle}, Width: ${ctx.lineWidth}`);
};

const CHUNK_SIZE = 8192; // 8k pixel height limit per canvas to prevent crashes

const TeacherOverlay: React.FC<TeacherOverlayProps> = ({ actions, width, height }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 🛡️ Safety: Early return if dimensions are invalid or no container
    if (!width || !height || width <= 0 || height <= 0 || !containerRef.current) return;

    // Get all chunk canvases
    const canvases = containerRef.current.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    // Render each chunk
    canvases.forEach((canvas) => {
      const chunkIndex = parseInt(canvas.dataset.chunkIndex || '0', 10);
      const startY = chunkIndex * CHUNK_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear the specific chunk
      ctx.clearRect(0, 0, width, Math.min(CHUNK_SIZE, height - startY));

      // ⚡ Optimization: Translate context so world-coordinates map to this chunk
      // e.g. Drawing at y=10000 on chunk 1 (starts 8192) -> draws at y=1808
      ctx.save();
      ctx.translate(0, -startY);

      // Render strokes
      actions.forEach(action => {
        ctx.save();
        ctx.strokeStyle = action.color;

        // Adjust line width logic
        let lineWidth = action.width;
        if (action.tool === 'highlight') {
          ctx.globalAlpha = 0.4;
          lineWidth = action.width * 5;
        } else {
          ctx.globalAlpha = 1.0;
        }

        if (action.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          lineWidth = 20;
        }

        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (action.tool) {
          case 'circle': {
            if (action.path.length < 1) break;
            const p1 = action.path[0];
            const p2 = action.path[action.path.length - 1];
            const rx = Math.abs(p2.x - p1.x);
            const ry = Math.abs(p2.y - p1.y);
            drawHandCircle(ctx, p1.x, p1.y, rx || 50, ry || 50);
            break;
          }
          case 'arrow': {
            if (action.path.length < 2) break;
            const p1 = action.path[0];
            const p2 = action.path[action.path.length - 1];
            drawHandArrow(ctx, p1.x, p1.y, p2.x, p2.y);
            break;
          }
          case 'text': {
            if (action.path.length < 1) break;
            const p = action.path[0];
            ctx.font = 'bold 24px "Inter", sans-serif';
            ctx.fillStyle = action.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const textContent = action.text || "";
            const maxWidth = action.textMaxWidth || width - p.x - 20;
            const lineHeight = 30; // 24px + 6px padding

            // Manual wrapping logic for canvas
            const paragraphs = textContent.split('\n');
            let currentY = p.y;

            paragraphs.forEach(paragraph => {
              const words = paragraph.split(' ');
              let line = '';

              for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                const testWidth = metrics.width;

                if (testWidth > maxWidth && n > 0) {
                  ctx.fillText(line, p.x, currentY);
                  line = words[n] + ' ';
                  currentY += lineHeight;
                } else {
                  line = testLine;
                }
              }
              ctx.fillText(line, p.x, currentY);
              currentY += lineHeight;
            });
            break;
          }
          case 'pen':
          case 'freehand':
          case 'highlight':
          case 'laser':
          case 'eraser':
            drawStroke(ctx, action);
            break;
        }
        ctx.restore();
      });

      ctx.restore();
    });
  }, [actions, width, height]);

  // Calculate number of chunks needed
  const chunkCount = Math.ceil(height / CHUNK_SIZE) || 1;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-50 transition-opacity duration-300"
      style={{ width, height }}
    >
      {Array.from({ length: chunkCount }).map((_, i) => (
        <canvas
          key={i}
          className="teacher-overlay-chunk absolute left-0"
          data-chunk-index={i}
          width={width}
          height={Math.min(CHUNK_SIZE, height - (i * CHUNK_SIZE))}
          style={{
            top: i * CHUNK_SIZE,
            width: width,
            height: Math.min(CHUNK_SIZE, height - (i * CHUNK_SIZE))
          }}
        />
      ))}
    </div>
  );
};

export default TeacherOverlay;