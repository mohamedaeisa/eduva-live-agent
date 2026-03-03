
/**
 * Cryptographic utilities for generating deterministic cache keys.
 * Uses native Web Crypto API for performance.
 */

export const sha256 = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

export interface CacheKeyInput {
    source: { fileBase64?: string; url?: string; text?: string, scope?: string };
    mode: string;
    modelName: string;
    promptVersion: string;
    params: Record<string, any>;
}

/**
 * Generates a unique canonical key based on the content source and generation environment.
 * Structure: SHA256({ content_hash, mode, model_version, prompt_version, params_hash })
 */
export const generateCacheKey = async (input: CacheKeyInput): Promise<string> => {
  const { source, mode, modelName, promptVersion, params } = input;

  // 1. Content Fingerprinting (content_hash)
  let contentFingerprint = '';
  if (source.fileBase64) {
    // For files, we use a robust proxy hash (Start + End + Length + Scope)
    const head = source.fileBase64.substring(0, 2000);
    const tail = source.fileBase64.substring(Math.max(0, source.fileBase64.length - 1000));
    contentFingerprint = `FILE:${head}_${tail}_${source.fileBase64.length}_SCOPE:${source.scope || 'full'}`; 
  } else if (source.url) {
    contentFingerprint = `URL:${source.url.trim()}`;
  } else if (source.text) {
    contentFingerprint = `TXT:${source.text.trim()}`;
  } else {
    // Uncacheable state
    return `uncacheable_${Date.now()}_${Math.random()}`;
  }

  // 2. Configuration Fingerprinting (params_hash)
  const sortedParams = Object.keys(params).sort().reduce((obj: any, key) => {
    obj[key] = params[key];
    return obj;
  }, {});
  const paramsFingerprint = JSON.stringify(sortedParams);

  // 3. Assemble Canonical Payload
  const canonicalPayload = {
      content_hash: contentFingerprint,
      mode: mode,
      model_version: modelName,
      prompt_version: promptVersion,
      params_hash: paramsFingerprint
  };

  return await sha256(JSON.stringify(canonicalPayload));
};
