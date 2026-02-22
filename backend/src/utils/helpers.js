/**
 * Helper utilities for ID generation and data handling
 */

import { v4 as uuidv4 } from 'uuid';

export function generateRequestId() {
  return `req_${uuidv4()}`;
}

export function generateUserId() {
  return uuidv4();
}

export function chunkText(text, maxTokens = 2000, overlapTokens = 100) {
  // Rough estimate: 1 token ≈ 4 characters
  const charLimit = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const chunks = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + charLimit, text.length);
    const chunk = text.substring(startIndex, endIndex);
    chunks.push(chunk);

    // Move start position with overlap
    startIndex = endIndex - overlapChars;
    if (startIndex < 0) startIndex = 0;
  }

  return chunks;
}

export function truncateText(text, maxLength = 1000) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function parseConfidence(confidenceStr) {
  try {
    const num = parseFloat(confidenceStr);
    if (isNaN(num)) return 0.5;
    return Math.min(1, Math.max(0, num));
  } catch {
    return 0.5;
  }
}

export function safeJsonParse(str, defaultValue = null) {
  if (typeof str !== 'string') {
    return defaultValue;
  }
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}
