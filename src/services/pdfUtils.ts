
// pdfUtils.ts
// EDUVA v7 – Stable, Text-First PDF Extraction
// 🔒 BULLETPROOF WORKER CONFIGURATION

import * as pdfjsLib from 'pdfjs-dist';
import { logger } from '../utils/logger';

// Named exports from Namespace
const pdfjs = pdfjsLib;

// 🔒 WORKER FIX: Use Version-Locked CDN Worker
let pdfWorkerReady = false;

const initPdfWorker = () => {
  if (pdfWorkerReady) return;
  if (typeof window === 'undefined') return;
  if (!('Worker' in window)) return;

  try {
    // ✅ BULLETPROOF STRATEGY: Use exact version-locked worker
    // This avoids version mismatches and CDN fetch issues

    // Option 1: Try to get actual installed version
    const pdfjsVersion = pdfjsLib.version;

    if (pdfjsVersion) {
      // Use jsDelivr with exact version (most reliable)
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;
      logger.pdf(`[PDF_WORKER] Using jsDelivr worker v${pdfjsVersion}`);
    } else {
      // Fallback: Use latest stable version explicitly
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      logger.pdf('[PDF_WORKER] Using fallback worker v3.11.174');
    }

    pdfWorkerReady = true;
  } catch (e) {
    logger.error('PDF', '[PDF_UTILS] Worker init failed', e);
    // Last resort: try legacy format
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfWorkerReady = true;
      logger.pdf('[PDF_WORKER] Using cloudflare CDN fallback');
    } catch (e2) {
      logger.error('PDF', '[PDF_UTILS] All worker sources failed', e2);
    }
  }
};

/**
 * Base64 → Uint8Array
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
  try {
    const clean = base64.includes(',')
      ? base64.split(',')[1]
      : base64;

    const binary = atob(clean.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch (e) {
    logger.error('PDF', '[PDF_UTILS] Base64 decode failed', e);
    return new Uint8Array(0);
  }
};

/**
 * TEXT-FIRST extraction (EDUVA v7)
 * - Page-accurate
 * - Chunked
 * - Resume-safe
 */
export const getPdfTextBatches = async (
  base64: string,
  batchSize = 15
): Promise<
  { text: string; label: string; pageStart: number; pageEnd: number }[]
> => {
  initPdfWorker(); // ✅ Lazy init only when needed

  if (!base64) {
    logger.pdf('[PDF_EXTRACT] No base64 data provided');
    return [];
  }

  const bytes = base64ToUint8Array(base64);
  if (!bytes.length) {
    logger.pdf('Empty byte array generated from base64.');
    return [];
  }

  logger.pdf(`Starting PDF Extraction. Size: ${(bytes.length / 1024).toFixed(2)} KB`);

  try {
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      // Add these options to prevent worker issues
      isEvalSupported: false,
      useWorkerFetch: false
    });

    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const batches = [];

    logger.pdf(`PDF Loaded Successfully. Total Pages: ${totalPages}. Batch Size: ${batchSize}`);

    for (let start = 1; start <= totalPages; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalPages);
      let text = '';

      logger.pdf(`Processing Batch: Pages ${start}-${end}...`);

      for (let pageNum = start; pageNum <= end; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const content = await page.getTextContent();

          const pageText = content.items
            .map((i: any) => i.str)
            .join(' ')
            .trim();

          text += `\n[PAGE ${pageNum}]\n${pageText}\n`;
        } catch (err) {
          logger.error('PDF', `[PDF_TEXT] Page ${pageNum} extraction failed`, err);
        }
      }

      const textLen = text.trim().length;
      logger.pdf(`Batch ${start}-${end} Processed. Extracted Chars: ${textLen}`);

      if (textLen > 50) {
        batches.push({
          text,
          label: `Pages ${start}-${end}`,
          pageStart: start,
          pageEnd: end,
        });
      } else {
        logger.pdf(`Skipping empty/sparse batch: Pages ${start}-${end} (Length: ${textLen})`);
      }
    }

    logger.pdf(`PDF Splitting Complete. Total Batches: ${batches.length}`);
    return batches;
  } catch (e) {
    logger.error('PDF', '[PDF_TEXT_RECOVERY] Extraction failed', e);
    return [];
  }
};

/**
 * Page count utility
 */
export const getPdfPageCount = async (base64: string): Promise<number> => {
  initPdfWorker(); // ✅ Lazy init only when needed

  try {
    const bytes = base64ToUint8Array(base64);
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      isEvalSupported: false,
      useWorkerFetch: false
    });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (e) {
    logger.error('PDF', '[PDF_PAGE_COUNT] Failed', e);
    return 0;
  }
};
