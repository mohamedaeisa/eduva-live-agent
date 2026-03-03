import type { VercelResponse } from '@vercel/node';

export function sendError(res: VercelResponse, code: number, error: string, message?: string) {
    return res.status(code).json({ error, message });
}

