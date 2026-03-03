/**
 * EDUVA Pure Anchor Protocol v1.5.5
 * Raw Binary Fingerprinting
 */
export const computeDocFingerprint = async (input: string | Blob | File): Promise<string> => {
  const ANCHOR_SIZE = 4096; // 4KB sampling windows

  try {
    let buffer: ArrayBuffer;
    if (typeof input === 'string') {
      // Handle data URL or network path
      const response = await fetch(input);
      buffer = await response.arrayBuffer();
    } else {
      buffer = await input.arrayBuffer();
    }

    const totalSize = buffer.byteLength;
    const view = new Uint8Array(buffer);

    // EXTRACT ANCHORS: Head, Heart, Tail
    const head = view.subarray(0, Math.min(ANCHOR_SIZE, totalSize));
    
    const mid = Math.floor(totalSize / 2);
    const heart = view.subarray(mid, Math.min(mid + ANCHOR_SIZE, totalSize));
    
    const tailStart = Math.max(0, totalSize - ANCHOR_SIZE);
    const tail = view.subarray(tailStart, totalSize);

    // CONCATENATE SIGNATURE
    const signature = new Uint8Array(head.length + heart.length + tail.length);
    signature.set(head, 0);
    signature.set(heart, head.length);
    signature.set(tail, head.length + heart.length);

    // SHA-256 HASH
    const hashBuffer = await crypto.subtle.digest('SHA-256', signature);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error("[UCCS_FINGERPRINT] Binary sampling failed:", error);
    return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }
};
