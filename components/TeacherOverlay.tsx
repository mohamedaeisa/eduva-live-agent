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

  // 🖊️ Professional Ink Dynamics: Quadratic Smoothing + Velocity Simulation
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const isEraser = stroke.tool === 'eraser';
  const baseWidth = isEraser ? 20 : stroke.width;
  
  // Start point
  ctx.moveTo(stroke.path[0].x, stroke.path[0].y);

  if (stroke.path.length === 2) {
    ctx.lineTo(stroke.path[1].x, stroke.path[1].y);
    ctx.stroke();
    return;
  }

  for (let i = 1; i < stroke.path.length - 2; i++) {
    const p1 = stroke.path[i];
    const p2 = stroke.path[i + 1];
    
    // Calculate mid-point for quadratic curve smoothing
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // ⚡ Velocity-Based Pressure simulation (Samsung Pen feel)
    // Faster movement (larger distance) = thinner line
    if (stroke.tool === 'pen') {
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const targetWidth = Math.max(baseWidth * 0.4, baseWidth * (1 - Math.min(dist / 20, 0.6)));
      
      // Interpolate width slowly for smoothness
      ctx.lineWidth = (ctx.lineWidth + targetWidth) / 2;
    }

    ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
    
    // Stroke each segment if width is dynamic, otherwise stroke at end
    if (stroke.tool === 'pen') {
       ctx.stroke();
       ctx.beginPath();
       ctx.moveTo(midX, midY);
    }
  }

  // Draw last two segments
  const last = stroke.path.length - 1;
  const pPrev = stroke.path[last - 1];
  const pLast = stroke.path[last];
  ctx.quadraticCurveTo(pPrev.x, pPrev.y, pLast.x, pLast.y);
  ctx.stroke();
};

const TeacherOverlay: React.FC<TeacherOverlayProps> = ({ actions, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    actions.forEach(action => {
      ctx.save();
      ctx.strokeStyle = action.color;
      ctx.lineWidth = action.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (action.tool === 'highlight') {
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = action.width * 5;
      }

      switch (action.tool) {
        case 'circle': {
          const p1 = action.path[0];
          const p2 = action.path[action.path.length - 1];
          const rx = Math.abs(p2.x - p1.x);
          const ry = Math.abs(p2.y - p1.y);
          drawHandCircle(ctx, p1.x, p1.y, rx || 50, ry || 50);
          break;
        }
        case 'arrow': {
          const p1 = action.path[0];
          const p2 = action.path[action.path.length - 1];
          drawHandArrow(ctx, p1.x, p1.y, p2.x, p2.y);
          break;
        }
        case 'pen':
        case 'highlight':
        case 'laser':
          drawStroke(ctx, action);
          break;
        case 'text':
          if (action.text) {
            ctx.font = `bold ${20 * (action.width / 3)}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = action.color;
            ctx.textBaseline = 'top';
            ctx.fillText(action.text, action.path[0].x, action.path[0].y);
          }
          break;
        case 'eraser':
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 20;
          drawStroke(ctx, action);
          break;
      }
      ctx.restore();
    });
  }, [actions, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 pointer-events-none z-50 transition-opacity duration-300"
    />
  );
};

export default TeacherOverlay;