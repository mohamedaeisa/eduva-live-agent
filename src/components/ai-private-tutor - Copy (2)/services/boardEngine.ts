import { ViewportState, Rect, Stroke } from '../types';

/**
 * BOARD ENGINE (Pure Logic)
 * ──────────────────────────────────────────────────────────
 * No React. No DOM. No Side Effects.
 * 
 * World Space: PDF pixels at scale=1.
 * Screen Space: Actual pixels on the device.
 */
export class BoardEngine {
    /**
     * World -> Screen
     */
    static worldToScreen(worldX: number, worldY: number, viewport: ViewportState) {
        return {
            x: worldX * viewport.scale + viewport.offsetX,
            y: worldY * viewport.scale + viewport.offsetY
        };
    }

    /**
     * Screen -> World
     */
    static screenToWorld(screenX: number, screenY: number, viewport: ViewportState) {
        return {
            x: (screenX - viewport.offsetX) / viewport.scale,
            y: (screenY - viewport.offsetY) / viewport.scale
        };
    }

    /**
     * Checks if a point (world coordinates) is within a set of visible rectangles.
     */
    static isPointVisible(x: number, y: number, visibleRects: Rect[]) {
        return visibleRects.some(r =>
            x >= r.x && x <= r.x + r.w &&
            y >= r.y && y <= r.y + r.h
        );
    }

    /**
     * Validates if an AI drawing intent is within bounds.
     */
    static validateIntent(rect: Rect, visibleRects: Rect[]) {
        // A simplified validation: is any corner of the intent-rect visible?
        const corners = [
            { x: rect.x, y: rect.y },
            { x: rect.x + rect.w, y: rect.y },
            { x: rect.x, y: rect.y + rect.h },
            { x: rect.x + rect.w, y: rect.y + rect.h }
        ];
        return corners.some(c => this.isPointVisible(c.x, c.y, visibleRects));
    }

    /**
     * Distance between two points (world coordinates)
     */
    static distance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
        return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    }

    /**
     * Simplified Stroke Intersection (for eraser)
     * Returns true if point p is "close enough" to any point in the stroke.
     */
    static intersectsStroke(p: { x: number; y: number }, stroke: Stroke, threshold: number = 10) {
        return stroke.path.some(pt => this.distance(p, pt) < threshold);
    }
}
