/**
 * PostProcessor - Validates and sanitizes AI model outputs
 * Per markdown.md section 6: Postprocessing, validation & sanitization rules
 */

class PostProcessor {
  /**
   * Extract JSON from markdown code blocks
   */
  _extractFromCodeBlocks(text) {
    const trimmed = text.trim();
    
    // Common patterns for code blocks
    const patterns = [
      /```json\s*([\s\S]*?)```/i,
      /```\s*([\s\S]*?)```/,
      /`{3}([\s\S]*?)`{3}/
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (extracted.length > 10 && (extracted.startsWith('{') || extracted.startsWith('['))) {
          console.log('[PostProcessor] Extracted from code block');
          return extracted;
        }
      }
    }

    return null;
  }

  /**
   * Repair common JSON errors
   */
  _repairJSON(jsonStr) {
    let repaired = jsonStr;
    
    // Fix 1: Remove trailing commas in arrays/objects
    repaired = repaired.replace(/,\s*([}\]])/g, '$1');
    
    // Fix 2: Add missing commas between array elements
    // Pattern: "item1" "item2" -> "item1", "item2"
    repaired = repaired.replace(/"\s+"(?=\s*[,\]])/g, '", "');
    
    // Fix 3: Add missing commas: } { -> }, {
    repaired = repaired.replace(/}\s*{/g, '}, {');
    
    // Fix 4: Add missing commas: ] [ -> ], [
    repaired = repaired.replace(/\]\s*\[/g, '], [');
    
    // Fix 5: Fix missing commas between object properties
    repaired = repaired.replace(/("[^"]*":\s*[^,{[]+)\s*("[^"]*":)/g, '$1, $2');
    
    // Fix 6: Add quotes to unquoted keys
    repaired = repaired.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');
    
    // Fix 7: Fix single quotes to double quotes
    repaired = repaired.replace(/'([^']*)'/g, '"$1"');
    
    // Fix 8: Escape unescaped quotes in strings
    repaired = repaired.replace(/([^\\])"/g, '$1\\"');
    
    // Fix 9: Remove control characters
    repaired = repaired.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Fix 10: Balance braces if mismatched
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
    }
    
    // Fix 11: Balance brackets if mismatched
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      repaired += ']'.repeat(openBrackets - closeBrackets);
    }

    try {
      return JSON.parse(repaired);
    } catch (e) {
      console.log('[PostProcessor] Repair failed:', e.message);
      
      // Last resort: Try to find JSON-like structure
      try {
        const start = repaired.indexOf('{');
        const end = repaired.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          const possible = repaired.substring(start, end + 1);
          return JSON.parse(possible);
        }
      } catch (finalError) {
        return null;
      }
      
      return null;
    }
  }

  /**
   * Parse and validate JSON from LLM output with retry logic
   */
  parseJSON(output, retryCount = 0) {
    if (!output || typeof output !== 'string') {
      throw new Error('Invalid output: expected string');
    }

    console.log(`[PostProcessor] Parsing output, attempt ${retryCount + 1}`);
    
    // Clean the output
    let cleaned = output.trim();
    
    // Remove any thinking/explanation text before JSON
    cleaned = cleaned.replace(/^.*?(?={)/s, '');
    cleaned = cleaned.replace(/}\s*.*$/s, '}');
    
    // Step 1: Try direct parse
    try {
      const result = JSON.parse(cleaned);
      console.log('[PostProcessor] Direct parse successful');
      return result;
    } catch (e1) {
      console.log('[PostProcessor] Direct parse failed:', e1.message);
    }
    
    // Step 2: Extract from code blocks
    const codeBlockJSON = this._extractFromCodeBlocks(cleaned);
    if (codeBlockJSON) {
      try {
        const result = JSON.parse(codeBlockJSON);
        console.log('[PostProcessor] Code block parse successful');
        return result;
      } catch (e2) {
        console.log('[PostProcessor] Code block parse failed, attempting repair');
      }
    }
    
    // Step 3: Try repair
    const repaired = this._repairJSON(cleaned);
    if (repaired) {
      console.log('[PostProcessor] Repair successful');
      return repaired;
    }
    
    // Step 4: Try extracting JSON object
    try {
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const extracted = cleaned.substring(start, end + 1);
        const result = JSON.parse(extracted);
        console.log('[PostProcessor] Extracted JSON successful');
        return result;
      }
    } catch (e3) {
      console.log('[PostProcessor] Extraction failed:', e3.message);
    }
    
    // Step 5: If we have retries left, throw error to trigger retry
    if (retryCount < 2) {
      console.log(`[PostProcessor] Parse failed, retry available (${retryCount}/2)`);
      throw new Error('PARSE_RETRY_NEEDED');
    }
    
    // Step 6: Final fallback - create minimal valid JSON
    console.log('[PostProcessor] Creating fallback JSON');
    return this._createFallbackJSON(cleaned);
  }

  /**
   * Create fallback JSON when parsing completely fails
   */
  _createFallbackJSON(text) {
    // Try to extract key information from text
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    return {
      fallback: true,
      summary: lines.slice(0, 3).join(' ').substring(0, 200),
      error: 'Failed to parse structured response, but extracted text',
      raw_preview: text.substring(0, 300)
    };
  }

  /**
   * Validate output against schema
   */
  validateSchema(data, featureType) {
    const validators = {
      explain: this._validateExplain,
      roadmap: this._validateRoadmap,
      rewrite: this._validateRewrite,
      document: this._validateDocument
    };

    const validator = validators[featureType];
    if (!validator) {
      console.warn(`No validator for feature type: ${featureType}`);
      return { valid: true, errors: [], data };
    }

    return validator.call(this, data);
  }

  /**
   * Sanitize output to remove sensitive data
   */
  sanitize(data) {
    const jsonStr = JSON.stringify(data);
    
    const secrets = [
      /AKIA[0-9A-Z]{16}/g,
      /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
      /password\s*[=:]\s*['"][^'"]*['"]/gi,
      /api[_-]?key\s*[=:]\s*['"][^'"]*['"]/gi,
      /token\s*[=:]\s*['"][^'"]*['"]/gi
    ];

    let sanitized = jsonStr;
    secrets.forEach(regex => {
      sanitized = sanitized.replace(regex, '"[REDACTED]"');
    });

    return JSON.parse(sanitized);
  }

  /**
   * Validate URLs in resources
   */
  validateURL(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Disallow private/internal addresses
      const privatePatterns = [
        /^localhost$/i,
        /^127\.\d+\.\d+\.\d+$/,
        /^192\.168\.\d+\.\d+$/,
        /^10\.\d+\.\d+\.\d+$/,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/
      ];
      
      return !privatePatterns.some(pattern => pattern.test(hostname));
    } catch (error) {
      return false;
    }
  }

  // Validators for each feature
  _validateExplain(data) {
    const errors = [];
    
    if (!data.summary || data.summary.length < 20) {
      errors.push('Summary too short (min 20 chars)');
      data.summary = data.summary || 'Summary not provided';
    }
    
    if (!Array.isArray(data.examples)) {
      data.examples = [];
    }
    
    if (!Array.isArray(data.bullets)) {
      data.bullets = [];
    }
    
    if (!Array.isArray(data.keywords)) {
      data.keywords = [];
    }
    
    if (!Array.isArray(data.quiz)) {
      data.quiz = [];
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateRoadmap(data) {
    const errors = [];
    
    if (!Array.isArray(data.weeks)) {
      data.weeks = [];
      errors.push('weeks must be an array');
    }
    
    if (data.confidence && (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1)) {
      data.confidence = 0.7;
      errors.push('confidence must be between 0 and 1');
    }
    
    // Validate resources URLs
    if (data.resources && Array.isArray(data.resources)) {
      data.resources = data.resources.filter(resource => 
        resource && resource.url && this.validateURL(resource.url)
      );
    } else {
      data.resources = [];
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateRewrite(data) {
    const errors = [];
    
    if (!Array.isArray(data.rewrites)) {
      data.rewrites = [];
      errors.push('rewrites must be an array');
    }
    
    if (!Array.isArray(data.subject_suggestions)) {
      data.subject_suggestions = [];
    }
    
    if (!data.caption) {
      data.caption = 'Rewritten text variations';
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateDocument(data) {
    const errors = [];
    
    if (!data.summary_short) {
      data.summary_short = 'Document summary';
    }
    
    if (!Array.isArray(data.highlights)) {
      data.highlights = [];
    }
    
    if (!Array.isArray(data.action_items)) {
      data.action_items = [];
    }
    
    if (!Array.isArray(data.keywords)) {
      data.keywords = [];
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }
}

export default new PostProcessor();
