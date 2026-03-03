import React, { useEffect, useRef } from 'react';
import { DrawingAction } from '../types';

interface TeacherOverlayProps {
  actions: DrawingAction[];
  width: number;
  height: number;
}

// Helper: Generate a rough, hand-drawn circle with imperfections
const drawHandCircle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.beginPath();

  // Draw slightly more than one full loop to simulate a marker stroke start/end overlap
  const maxAngle = 2 * Math.PI + 0.4;
  const step = 0.2;

  for (let angle = 0; angle <= maxAngle; angle += step) {
    // Add randomness to the radius to create "wobble"
    // The wobble is relative to the size of the circle
    const noiseX = (Math.random() - 0.5) * (rx * 0.1);
    const noiseY = (Math.random() - 0.5) * (ry * 0.1);

    const px = cx + (rx + noiseX) * Math.cos(angle);
    const py = cy + (ry + noiseY) * Math.sin(angle);

    if (angle === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.stroke();
};

// Helper: Generate a rough, hand-drawn arrow
const drawHandArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const length = Math.hypot(toX - fromX, toY - fromY);

  ctx.beginPath();

  // Draw the shaft with a slight quadratic curve for organic feel
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  // Curve perpendicular to direction
  const curveAmt = length * 0.05 * (Math.random() - 0.5);
  const cpX = midX - curveAmt * Math.sin(angle);
  const cpY = midY + curveAmt * Math.cos(angle);

  ctx.moveTo(fromX, fromY);
  ctx.quadraticCurveTo(cpX, cpY, toX, toY);
  ctx.stroke();

  // Draw Arrowhead (roughly)
  const headLen = Math.max(15, length * 0.15); // Scale head with length

  // Left wing
  const angle1 = angle - Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle1), toY - headLen * Math.sin(angle1));
  ctx.stroke();

  // Right wing
  const angle2 = angle + Math.PI / 6 + (Math.random() - 0.5) * 0.2;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headLen * Math.cos(angle2), toY - headLen * Math.sin(angle2));
  ctx.stroke();
};

// Helper: Draw freehand path
const drawFreehand = (ctx: CanvasRenderingContext2D, points: { x: number, y: number }[], width: number, height: number) => {
  if (!points || points.length < 2) return;

  ctx.beginPath();
  // Convert first point percentage to px
  ctx.moveTo((points[0].x / 100) * width, (points[0].y / 100) * height);

  // Draw lines to subsequent points
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo((points[i].x / 100) * width, (points[i].y / 100) * height);
  }
  ctx.stroke();
};

const TeacherOverlay: React.FC<TeacherOverlayProps> = ({ actions, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // console.debug("TeacherOverlay: Rendering actions", actions.length); // Too spammy if animating
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    actions.forEach(action => {
      // Convert percentage coordinates to pixels
      const x = (action.x / 100) * width;
      const y = (action.y / 100) * height;
      const w = action.width ? (action.width / 100) * width : 0;
      const h = action.height ? (action.height / 100) * height : 0;

      ctx.save();

      // Base styles for marker-like appearance
      ctx.strokeStyle = action.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Shadow only for non-eraser/highlight
      if (action.type !== 'eraser' && action.type !== 'highlight') {
        ctx.shadowColor = action.color;
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
      }

      switch (action.type) {
        case 'circle':
          {
            const rx = w ? w / 2 : 50;
            const ry = h ? h / 2 : 50;
            const cx = w ? x + rx : x;
            const cy = h ? y + ry : y;
            drawHandCircle(ctx, cx, cy, rx, ry);
          }
          break;

        case 'arrow':
          {
            const endX = (w === 0 && h === 0) ? x + 60 : x + w;
            const endY = (w === 0 && h === 0) ? y + 60 : y + h;
            drawHandArrow(ctx, x, y, endX, endY);
          }
          break;

        case 'rect':
          ctx.beginPath();
          const j = () => (Math.random() - 0.5) * 4;
          ctx.moveTo(x + j(), y + j());
          ctx.lineTo(x + w + j(), y + j());
          ctx.lineTo(x + w + j(), y + h + j());
          ctx.lineTo(x + j(), y + h + j());
          ctx.closePath();
          ctx.stroke();
          break;

        case 'highlight':
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = action.color;
          ctx.globalAlpha = 0.4;

          ctx.beginPath();
          ctx.moveTo(x, y + 2);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w - 2, y + h);
          ctx.lineTo(x + 2, y + h - 2);
          ctx.fill();

          // No restore needed as ctx.save() wraps the switch
          break;

        case 'freehand':
          if (action.points) {
            drawFreehand(ctx, action.points, width, height);
          }
          break;

        case 'eraser':
          // Eraser logic: "Erase" by using destination-out composite mode
          // This clears pixels from the canvas where the stroke is drawn
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 20; // Thicker stroke for eraser
          if (action.points) {
            drawFreehand(ctx, action.points, width, height);
          }
          break;
      }

      // Draw Label if present (sticky note style) - Not for eraser/freehand typically
      if (action.label && action.type !== 'eraser' && action.type !== 'freehand') {
        ctx.save();
        ctx.font = 'bold 16px "Comic Sans MS", "Chalkboard SE", sans-serif';
        const metrics = ctx.measureText(action.label);
        const padding = 6;

        const labelX = x + 10;
        const labelY = y - 10;

        ctx.translate(labelX, labelY);
        ctx.rotate(-0.03);
        ctx.fillStyle = action.color;
        ctx.fillRect(-padding, -20, metrics.width + padding * 2, 26);

        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillText(action.label, 0, 0);

        ctx.restore();
      }

      ctx.restore(); // End action scope (resets composites, styles)
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