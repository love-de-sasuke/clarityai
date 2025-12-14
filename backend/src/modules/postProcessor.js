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
    
    // Find all code blocks - use non-greedy match to get content between first ``` and last ```
    // Pattern: ```json\n...\n``` or ```\n...\n```
    const patterns = [
      /```json\s*\n([\s\S]*?)\n```/i,        // ```json\n...\n```
      /```json\s*([\s\S]*?)```/i,             // ```json...```
      /```\s*\n([\s\S]*?)\n```/,             // ```\n...\n```
      /```\s*([\s\S]*?)```/,                  // ```...```
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        // Make sure we actually extracted something (not just whitespace)
        if (extracted.length > 10 && extracted.startsWith('{')) {
          console.log('[PostProcessor] Successfully extracted from code block using pattern');
          return extracted;
        }
      }
    }

    // If no match, try finding content between first ``` and last ```
    const firstBacktick = trimmed.indexOf('```');
    const lastBacktick = trimmed.lastIndexOf('```');
    if (firstBacktick !== -1 && lastBacktick !== -1 && lastBacktick > firstBacktick + 3) {
      // Extract content between the backticks
      let content = trimmed.substring(firstBacktick + 3, lastBacktick);
      // Remove "json" tag if present
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
   * Attempt to repair common JSON syntax errors
   */
  _repairJSON(jsonStr) {
    try {
      // Try parsing first - if it works, no repair needed
      return JSON.parse(jsonStr);
    } catch (e) {
      console.log('[PostProcessor] JSON repair attempt, error:', e.message);
      
      let repaired = jsonStr;

      // Step 1: Fix unterminated strings (common issue seen in logs)
      // Count quotes to ensure they're balanced
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        // Add missing closing quote at the end
        if (!repaired.endsWith('"')) {
          repaired = repaired + '"';
        }
        try {
          return JSON.parse(repaired);
        } catch (e1) {
          // Continue with other repairs
        }
      }

      // Step 2: Remove trailing commas (safest fix)
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(repaired);
      } catch (e1) {
        // Continue
      }

      // Step 3: Fix missing commas in arrays/objects
      let arrayFixed = repaired;
      
      // Fix missing commas - be very specific to avoid breaking valid JSON
      // Pattern 1: "item1" "item2" in arrays
      arrayFixed = arrayFixed.replace(/"\s+"(?=\s*[,\]])/g, '", "');
      
      // Pattern 2: number "text" or number number (in arrays)
      arrayFixed = arrayFixed.replace(/(\d+)\s+(")(?=\s*[,\]])/g, '$1, $2');
      arrayFixed = arrayFixed.replace(/(\d+)\s+(\d+)(?=\s*[,\]])/g, '$1, $2');
      
      // Pattern 3: } "key" or ] "key" (object/array followed by quote - missing comma)
      arrayFixed = arrayFixed.replace(/([}\]])\s*(")/g, '$1, $2');
      
      // Pattern 4: "value" "key": (in objects - missing comma between properties)
      arrayFixed = arrayFixed.replace(/"\s+"([a-zA-Z_][a-zA-Z0-9_]*":)/g, '", "$1');
      
      if (arrayFixed !== repaired) {
        try {
          console.log('[PostProcessor] Array/object comma fixes applied');
          return JSON.parse(arrayFixed);
        } catch (e2) {
          repaired = arrayFixed;
        }
      }

      // Step 4: Try using error position to fix missing commas
      const errorMatch = e.message.match(/position (\d+)/);
      if (errorMatch) {
        const errorPos = parseInt(errorMatch[1]);
        console.log('[PostProcessor] Error at position:', errorPos);
        
        // If error is about missing comma, try adding one
        if (e.message.includes("Expected ','") || e.message.includes("Expected ',' or ']'")) {
          // Look for natural break points around error position
          const searchWindow = 50;
          const start = Math.max(0, errorPos - searchWindow);
          const end = Math.min(repaired.length, errorPos + searchWindow);
          const context = repaired.substring(start, end);
          
          // Try to find a good place to insert comma
          const patterns = [
            { regex: /("\s*")/, insert: '"', "'" },
            { regex: /(\]\s*")/, insert: ']"', ",'" },
            { regex: /(}\s*")/, insert: '}"', ",'" },
            { regex: /(\d\s*")/, insert: /\d/, ",'" },
          ];
          
          for (const pattern of patterns) {
            const match = context.match(pattern.regex);
            if (match) {
              const replacement = context.replace(pattern.regex, (match, p1) => {
                return match.replace(/\s+"/, '", "');
              });
              const newRepaired = repaired.substring(0, start) + replacement + repaired.substring(end);
              try {
                console.log('[PostProcessor] Pattern-based comma insertion');
                return JSON.parse(newRepaired);
              } catch (e3) {
                // Continue
              }
            }
          }
        }
      }

      console.log('[PostProcessor] All repair attempts failed');
      return null;
    }
  }

  /**
   * Normalize confidence value - convert string "high"/"medium"/"low" to numbers
   */
  _normalizeConfidence(data) {
    if (data.confidence) {
      if (typeof data.confidence === 'string') {
        const confidenceMap = {
          'high': 0.9,
          'medium': 0.6,
          'low': 0.3,
          'very high': 0.95,
          'very low': 0.1
        };
        const normalized = confidenceMap[data.confidence.toLowerCase()];
        if (normalized !== undefined) {
          data.confidence = normalized;
          console.log('[PostProcessor] Normalized confidence from string to number:', normalized);
        } else {
          // Try to parse as number
          const parsed = parseFloat(data.confidence);
          if (!isNaN(parsed)) {
            data.confidence = parsed;
          } else {
            // Default to 0.5 if unrecognized
            data.confidence = 0.5;
          }
        }
      }
      
      // Ensure confidence is within bounds
      if (typeof data.confidence === 'number') {
        data.confidence = Math.max(0, Math.min(1, data.confidence));
      }
    }
    return data;
  }

  /**
   * Parse and validate JSON from LLM output
   */
  parseJSON(output, retryCallback = null, retries = 0) {
    if (!output || typeof output !== 'string') {
      throw new Error('Invalid output: expected string');
    }

    // Clean the output first
    let cleaned = output.trim();

    // Step 1: Try direct parse
    try {
      const parsed = JSON.parse(cleaned);
      return this._normalizeConfidence(parsed);
    } catch (error) {
      console.log('[PostProcessor] Direct parse failed, attempting extraction...');
    }

    // Step 2: Extract from markdown code blocks (highest priority for Gemini)
    const codeBlockContent = this._extractFromCodeBlocks(cleaned);
    if (codeBlockContent) {
      console.log('[PostProcessor] Extracted from code block, length:', codeBlockContent.length);
      console.log('[PostProcessor] First 200 chars of extracted:', codeBlockContent.substring(0, 200));
      try {
        const parsed = JSON.parse(codeBlockContent);
        console.log('[PostProcessor] Successfully parsed extracted JSON');
        return this._normalizeConfidence(parsed);
      } catch (e) {
        console.log('[PostProcessor] Code block content parse failed:', e.message);
        console.log('[PostProcessor] Attempting JSON repair...');
        const repaired = this._repairJSON(codeBlockContent);
        if (repaired) {
          console.log('[PostProcessor] JSON repair successful');
          return this._normalizeConfidence(repaired);
        }
        console.log('[PostProcessor] JSON repair also failed');
      }
    } else {
      console.log('[PostProcessor] No code block found in output');
    }

    // Step 3: Extract JSON object using balanced brace matching
    const jsonObject = this._extractJSONObject(cleaned);
    if (jsonObject) {
      console.log('[PostProcessor] Extracted JSON object, length:', jsonObject.length);
      try {
        const parsed = JSON.parse(jsonObject);
        return this._normalizeConfidence(parsed);
      } catch (e) {
        console.log('[PostProcessor] Extracted object parse failed, attempting repair...');
        const repaired = this._repairJSON(jsonObject);
        if (repaired) {
          console.log('[PostProcessor] JSON repair successful');
          return this._normalizeConfidence(repaired);
        }
        console.log('[PostProcessor] Object extraction error:', e.message);
      }
    }

    // Step 4: Fallback - find first "{" to last "}" and try parsing/repair
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const possibleJson = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(possibleJson);
        return this._normalizeConfidence(parsed);
      } catch (e) {
        // Try to fix common issues
        let fixed = possibleJson.replace(/,\s*([}\]])/g, '$1');
        // Fix unterminated strings
        if (!fixed.endsWith('"') && (fixed.match(/"/g) || []).length % 2 !== 0) {
          fixed = fixed + '"';
        }
        try {
          const parsed = JSON.parse(fixed);
          return this._normalizeConfidence(parsed);
        } catch (err) {
          // Try final repair step
          const repaired = this._repairJSON(possibleJson);
          if (repaired) {
            return this._normalizeConfidence(repaired);
          }
        }
      }
    }

    // Step 5: Emergency recovery - if output starts with '{' but is truncated
    if (cleaned.startsWith('{')) {
      const trimmedForRecovery = cleaned;
      const openBraces = (trimmedForRecovery.match(/{/g) || []).length;
      const closeBraces = (trimmedForRecovery.match(/}/g) || []).length;
      
      if (openBraces > closeBraces) {
        // Add missing closing braces
        let recovered = trimmedForRecovery;
        for (let i = 0; i < openBraces - closeBraces; i++) {
          recovered += '}';
        }
        
        // Fix unterminated strings
        const quoteCount = (recovered.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
          recovered = recovered + '"';
        }
        
        // Close any open arrays
        const openArrays = (recovered.match(/\[/g) || []).length;
        const closeArrays = (recovered.match(/\]/g) || []).length;
        for (let i = 0; i < openArrays - closeArrays; i++) {
          recovered += ']';
        }
        
        try {
          console.log('[PostProcessor] EMERGENCY RECOVERY: Attempting to salvage truncated JSON');
          const parsed = JSON.parse(recovered);
          console.log('[PostProcessor] Emergency recovery successful');
          return this._normalizeConfidence(parsed);
        } catch (e) {
          console.log('[PostProcessor] EMERGENCY RECOVERY failed:', e.message);
        }
      }
    }

    // If all else fails and retries available, signal for retry
    if (retries < 2 && retryCallback) {
      console.log('[PostProcessor] All extraction methods failed, attempting corrective re-prompt...');
      return null; // Signal for retry
    }

    // Final error - log the original output for debugging
    console.error('[PostProcessor] All JSON extraction methods failed');
    console.error('[PostProcessor] Output preview (first 1000 chars):', cleaned.substring(0, 1000));
    console.error('[PostProcessor] Output length:', cleaned.length);
    throw new Error(`Failed to parse JSON after ${retries} retries. Output may contain invalid JSON or be in an unexpected format.`);
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
      /AKIA[0-9A-Z]{16}/g,  // AWS keys
      /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,  // Private keys
      /password\s*[=:]\s*[^\s]*/gi,  // Passwords (case-insensitive)
      /api[_-]?key\s*[=:]\s*[^\s]*/gi,  // API keys (case-insensitive)
      /[a-zA-Z0-9]{40,}/g  // Long token-like strings
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
      
      // Disallow private/internal addresses
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
