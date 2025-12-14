/**
 * PostProcessor - Validates and sanitizes AI model outputs
 * Per markdown.md section 6: Postprocessing, validation & sanitization rules
 */

class PostProcessor {
  /**
   * Extract JSON from markdown code blocks
   */
  _extractFromCodeBlocks(text) {
    // Remove any leading/trailing whitespace first
    const trimmed = text.trim();
    
    // Find all code blocks - use non-greedy match
    const patterns = [
      /```json\s*\n([\s\S]*?)\n```/i,
      /```json\s*([\s\S]*?)```/i,
      /```\s*\n([\s\S]*?)\n```/,
      /```\s*([\s\S]*?)```/,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (extracted.length > 10 && extracted.startsWith('{')) {
          console.log('[PostProcessor] Successfully extracted from code block');
          return extracted;
        }
      }
    }

    // If no match, try finding content between first ``` and last ```
    const firstBacktick = trimmed.indexOf('```');
    const lastBacktick = trimmed.lastIndexOf('```');
    if (firstBacktick !== -1 && lastBacktick !== -1 && lastBacktick > firstBacktick + 3) {
      let content = trimmed.substring(firstBacktick + 3, lastBacktick);
      content = content.replace(/^json\s*\n?/i, '');
      content = content.trim();
      if (content.length > 10 && content.startsWith('{')) {
        console.log('[PostProcessor] Extracted using backtick positions');
        return content;
      }
    }

    return null;
  }

  /**
   * Extract JSON object by finding balanced braces
   */
  _extractJSONObject(text) {
    let startIndex = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          if (startIndex === -1) startIndex = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && startIndex !== -1) {
            return text.substring(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Normalize confidence value - convert string to number
   */
  _normalizeConfidence(data) {
    if (data && typeof data === 'object' && 'confidence' in data) {
      const conf = data.confidence;
      
      if (typeof conf === 'string') {
        const confidenceMap = {
          'high': 0.9,
          'medium': 0.6,
          'low': 0.3,
          'very high': 0.95,
          'very low': 0.1,
          'very-high': 0.95,
          'very-low': 0.1
        };
        
        const lowerConf = conf.toLowerCase().trim();
        const mappedValue = confidenceMap[lowerConf];
        
        if (mappedValue !== undefined) {
          data.confidence = mappedValue;
          console.log(`[PostProcessor] Normalized confidence from "${conf}" to ${mappedValue}`);
        } else {
          // Try to parse as float
          const parsed = parseFloat(conf);
          if (!isNaN(parsed)) {
            data.confidence = Math.max(0, Math.min(1, parsed));
          } else {
            // Default to 0.5 if unrecognized
            data.confidence = 0.5;
          }
        }
      } else if (typeof conf === 'number') {
        // Ensure it's between 0 and 1
        data.confidence = Math.max(0, Math.min(1, conf));
      } else {
        // Invalid type, default to 0.5
        data.confidence = 0.5;
      }
    }
    return data;
  }

  /**
   * Attempt to repair common JSON syntax errors
   */
  _repairJSON(jsonStr) {
    console.log('[PostProcessor] Starting JSON repair on string of length:', jsonStr.length);
    
    try {
      // Try parsing first - if it works, no repair needed
      return JSON.parse(jsonStr);
    } catch (e) {
      console.log('[PostProcessor] Initial parse failed:', e.message);
      
      let repaired = jsonStr;
      let originalRepaired = repaired;

      // FIX 1: Fix unterminated strings
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        if (!repaired.endsWith('"')) {
          repaired = repaired + '"';
          console.log('[PostProcessor] Added missing closing quote');
          try {
            return JSON.parse(repaired);
          } catch (e2) {}
        }
      }

      // FIX 2: Remove trailing commas
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(repaired);
      } catch (e1) {}

      // FIX 3: Fix missing commas
      const errorMatch = e.message.match(/position (\d+)/);
      if (errorMatch) {
        const errorPos = parseInt(errorMatch[1]);
        console.log('[PostProcessor] Parsing error at position:', errorPos);
        
        if (e.message.includes("Expected ','") || e.message.includes("Expected ',' or ']'")) {
          // Look for pattern: quote whitespace quote
          repaired = repaired.replace(/"\s+"/g, '", "');
          try {
            return JSON.parse(repaired);
          } catch (e3) {}
          
          // Look for pattern: } whitespace " or ] whitespace "
          repaired = repaired.replace(/([}\]])"(\s+")/g, '$1", "$2');
          try {
            return JSON.parse(repaired);
          } catch (e4) {}
        }
      }

      // FIX 4: Fix truncated JSON
      if (repaired.includes('"milest') && !repaired.includes('"milestone"')) {
        repaired = repaired.replace(/"milest/, '"milestone": "Incomplete milestone"');
        console.log('[PostProcessor] Fixed truncated milestone field');
        try {
          return JSON.parse(repaired);
        } catch (e5) {}
      }

      // FIX 5: Auto-close incomplete arrays/objects
      const openBraces = (repaired.match(/{/g) || []).length;
      const closeBraces = (repaired.match(/}/g) || []).length;
      const openArrays = (repaired.match(/\[/g) || []).length;
      const closeArrays = (repaired.match(/\]/g) || []).length;

      if (openBraces > closeBraces) {
        const missingBraces = openBraces - closeBraces;
        repaired = repaired + '}'.repeat(missingBraces);
        console.log(`[PostProcessor] Added ${missingBraces} missing closing braces`);
      }

      if (openArrays > closeArrays) {
        const missingArrays = openArrays - closeArrays;
        repaired = repaired + ']'.repeat(missingArrays);
        console.log(`[PostProcessor] Added ${missingArrays} missing closing brackets`);
      }

      // FIX 6: Last resort cleanup
      repaired = repaired.replace(/'([^']*)'/g, '"$1"');
      repaired = repaired.replace(/"\s*\{/g, '": {');
      repaired = repaired.replace(/([^\\])\n/g, '$1\\n');

      try {
        const result = JSON.parse(repaired);
        console.log('[PostProcessor] JSON repair successful after multiple attempts');
        return result;
      } catch (finalError) {
        console.log('[PostProcessor] All repair attempts failed:', finalError.message);
        return null;
      }
    }
  }

  /**
   * Complete emergency recovery for severely damaged JSON
   */
  _emergencyJSONRecovery(text) {
    console.log('[PostProcessor] Starting emergency JSON recovery');
    
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
      console.log('[PostProcessor] No opening brace found for emergency recovery');
      return null;
    }

    let extracted = text.substring(firstBrace);
    
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < extracted.length; i++) {
      const char = extracted[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
      }
    }
    
    if (braceCount > 0) {
      extracted += '}'.repeat(braceCount);
      console.log(`[PostProcessor] Added ${braceCount} missing closing braces`);
    }
    
    const fixes = [
      { pattern: /"([^"]*)$/, replacement: '"$1"' },
      { pattern: /\[\s*$/, replacement: '[]' },
      { pattern: /"([^"]*)":\s*$/, replacement: '"$1": ""' },
      { pattern: /"milest\s*$/, replacement: '"milestone": "Week completed"' },
      { pattern: /("[^"]*")\s*}/, replacement: '$1 }' }
    ];
    
    for (const fix of fixes) {
      if (fix.pattern.test(extracted)) {
        extracted = extracted.replace(fix.pattern, fix.replacement);
      }
    }
    
    try {
      const parsed = JSON.parse(extracted);
      console.log('[PostProcessor] Emergency recovery successful!');
      return parsed;
    } catch (e) {
      console.log('[PostProcessor] Emergency recovery failed:', e.message);
      return null;
    }
  }

  /**
   * Parse and validate JSON from LLM output
   */
  parseJSON(output, retryCallback = null, retries = 0) {
    if (!output || typeof output !== 'string') {
      throw new Error('Invalid output: expected string');
    }

    console.log(`[PostProcessor] Parsing JSON output (length: ${output.length})`);
    
    let cleaned = output.trim();
    
    // Step 1: Try direct parse
    try {
      const parsed = JSON.parse(cleaned);
      console.log('[PostProcessor] Direct parse successful');
      return this._normalizeConfidence(parsed);
    } catch (error) {
      console.log('[PostProcessor] Direct parse failed:', error.message);
    }

    // Step 2: Extract from markdown code blocks
    const codeBlockContent = this._extractFromCodeBlocks(cleaned);
    if (codeBlockContent) {
      console.log('[PostProcessor] Extracted from code block, length:', codeBlockContent.length);
      try {
        const parsed = JSON.parse(codeBlockContent);
        console.log('[PostProcessor] Successfully parsed extracted JSON');
        return this._normalizeConfidence(parsed);
      } catch (e) {
        console.log('[PostProcessor] Code block content parse failed:', e.message);
        const repaired = this._repairJSON(codeBlockContent);
        if (repaired) {
          console.log('[PostProcessor] JSON repair successful from code block');
          return this._normalizeConfidence(repaired);
        }
      }
    }

    // Step 3: Extract JSON object using balanced brace matching
    const jsonObject = this._extractJSONObject(cleaned);
    if (jsonObject) {
      console.log('[PostProcessor] Extracted JSON object, length:', jsonObject.length);
      try {
        const parsed = JSON.parse(jsonObject);
        return this._normalizeConfidence(parsed);
      } catch (e) {
        const repaired = this._repairJSON(jsonObject);
        if (repaired) {
          console.log('[PostProcessor] JSON repair successful from extracted object');
          return this._normalizeConfidence(repaired);
        }
      }
    }

    // Step 4: Fallback - find first "{" to last "}"
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = cleaned.substring(firstBrace, lastBrace + 1);
      console.log('[PostProcessor] Trying first-to-last brace extraction');
      try {
        const parsed = JSON.parse(possibleJson);
        return this._normalizeConfidence(parsed);
      } catch (e) {
        const repaired = this._repairJSON(possibleJson);
        if (repaired) {
          return this._normalizeConfidence(repaired);
        }
      }
    }

    // Step 5: Emergency recovery
    console.log('[PostProcessor] All standard methods failed, attempting emergency recovery');
    const emergencyResult = this._emergencyJSONRecovery(cleaned);
    if (emergencyResult) {
      return this._normalizeConfidence(emergencyResult);
    }

    // Step 6: If all else fails and retries available
    if (retries < 2 && retryCallback) {
      console.log('[PostProcessor] All extraction methods failed, attempting corrective re-prompt...');
      return null;
    }

    console.error('[PostProcessor] ======== ALL JSON EXTRACTION METHODS FAILED ========');
    console.error('[PostProcessor] Output length:', cleaned.length);
    console.error('[PostProcessor] First 500 chars:', cleaned.substring(0, 500));
    
    throw new Error(`Failed to parse JSON after ${retries + 1} attempts. Model output is not valid JSON.`);
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
      throw new Error(`No validator for feature type: ${featureType}`);
    }

    return validator.call(this, data);
  }

  /**
   * Sanitize output to remove sensitive data
   */
  sanitize(data) {
    const secrets = [
      /AKIA[0-9A-Z]{16}/g,
      /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
      /password\s*[=:]\s*[^\s]*/gi,
      /api[_-]?key\s*[=:]\s*[^\s]*/gi,
      /[a-zA-Z0-9]{40,}/g
    ];

    const jsonStr = JSON.stringify(data);
    let sanitized = jsonStr;

    secrets.forEach(regex => {
      sanitized = sanitized.replace(regex, '[REDACTED_SECRET]');
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
      if (hostname === 'localhost' || hostname === '127.0.0.1' || 
          hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Validators for each feature
  _validateExplain(data) {
    const required = ['summary', 'examples', 'bullets', 'keywords', 'quiz'];
    const errors = [];

    required.forEach(field => {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (data.summary && data.summary.length < 40) {
      errors.push('Summary too short (min 40 chars)');
    }

    if (data.examples && data.examples.length !== 3) {
      errors.push('Must provide exactly 3 examples');
    }

    if (data.quiz && data.quiz.length !== 5) {
      errors.push('Must provide exactly 5 quiz questions');
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateRoadmap(data) {
    const required = ['weeks', 'resources', 'confidence'];
    const errors = [];

    required.forEach(field => {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (data.weeks && !Array.isArray(data.weeks)) {
      errors.push('weeks must be an array');
    }

    // Normalize confidence if not already done
    data = this._normalizeConfidence(data);
    
    if (data.confidence && (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1)) {
      errors.push('confidence must be a number between 0 and 1');
    }

    // Validate resources URLs
    if (data.resources && Array.isArray(data.resources)) {
      data.resources = data.resources.filter(resource => {
        return this.validateURL(resource.url);
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateRewrite(data) {
    const required = ['rewrites', 'subject_suggestions', 'caption', 'changes_summary', 'confidence'];
    const errors = [];

    required.forEach(field => {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (data.rewrites && data.rewrites.length !== 3) {
      errors.push('Must provide exactly 3 rewrite variations');
    }

    // Normalize confidence if not already done
    data = this._normalizeConfidence(data);
    
    if (data.confidence && (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1)) {
      errors.push('confidence must be a number between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }

  _validateDocument(data) {
    const required = ['summary_short', 'highlights', 'action_items', 'keywords'];
    const errors = [];

    required.forEach(field => {
      if (!(field in data)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (data.summary_short && data.summary_short.length < 40) {
      errors.push('Summary too short (min 40 chars)');
    }

    return {
      valid: errors.length === 0,
      errors,
      data
    };
  }
}

export default new PostProcessor();
