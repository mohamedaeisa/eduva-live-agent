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
  for (let i = 1; i < stroke.path.length; i++) {
    ctx.lineTo(stroke.path[i].x, stroke.path[i].y);
  }
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