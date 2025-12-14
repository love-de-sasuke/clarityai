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
   * Fix common JSON issues from model outputs
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

      // FIX 1: Fix unterminated strings (common Gemini issue)
      const quoteCount = (repaired.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        // Find the last quote and add closing quote if needed
        const lastQuotePos = repaired.lastIndexOf('"');
        const afterLastQuote = repaired.substring(lastQuotePos + 1);
        
        // If last quote is not preceded by backslash (not escaped) and not followed by proper structure
        if (!repaired[lastQuotePos - 1] === '\\') {
          // Check if we need to add closing quote
          const context = repaired.substring(Math.max(0, lastQuotePos - 50), Math.min(repaired.length, lastQuotePos + 50));
          console.log('[PostProcessor] Context around unmatched quote:', context);
          
          // Try adding closing quote at end if it seems like the string was cut off
          if (repaired.endsWith('"') === false) {
            repaired = repaired + '"';
            console.log('[PostProcessor] Added missing closing quote');
            try {
              return JSON.parse(repaired);
            } catch (e2) {
              // Continue with other repairs
            }
          }
        }
      }

      // FIX 2: Remove trailing commas (safest fix)
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(repaired);
      } catch (e1) {
        // Continue
      }

      // FIX 3: Fix missing commas in arrays/objects (common Gemini issue)
      // First, try to identify where commas are missing using the error position
      const errorMatch = e.message.match(/position (\d+)/);
      if (errorMatch) {
        const errorPos = parseInt(errorMatch[1]);
        console.log('[PostProcessor] Parsing error at position:', errorPos);
        
        // Get context around error
        const contextStart = Math.max(0, errorPos - 20);
        const contextEnd = Math.min(repaired.length, errorPos + 20);
        const context = repaired.substring(contextStart, contextEnd);
        console.log('[PostProcessor] Error context:', context);
        
        // Common pattern: "text1" "text2" without comma
        if (e.message.includes("Expected ','") || e.message.includes("Expected ',' or ']'")) {
          // Look for pattern: quote whitespace quote
          const missingCommaRegex = /"(\s+)"/g;
          if (missingCommaRegex.test(context)) {
            repaired = repaired.replace(/"\s+"/g, '", "');
            console.log('[PostProcessor] Fixed missing comma between quotes');
            try {
              return JSON.parse(repaired);
            } catch (e3) {
              // Continue
            }
          }
          
          // Look for pattern: } whitespace " or ] whitespace "
          const missingCommaAfterBrace = /([}\]])"(\s+")/g;
          if (missingCommaAfterBrace.test(context)) {
            repaired = repaired.replace(/([}\]])"(\s+")/g, '$1", "$2');
            console.log('[PostProcessor] Fixed missing comma after brace/brace');
            try {
              return JSON.parse(repaired);
            } catch (e4) {
              // Continue
            }
          }
        }
      }

      // FIX 4: Fix truncated JSON (common in roadmap output)
      if (repaired.includes('"milest') && !repaired.includes('"milestone"')) {
        // Looks like "milestone" was truncated
        repaired = repaired.replace(/"milest/, '"milestone": "Incomplete milestone"');
        console.log('[PostProcessor] Fixed truncated milestone field');
        try {
          return JSON.parse(repaired);
        } catch (e5) {
          // Continue
        }
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

      // FIX 6: Last resort - clean up any remaining issues
      // Replace single quotes with double quotes (if they're used for JSON keys/values)
      repaired = repaired.replace(/'([^']*)'/g, '"$1"');
      
      // Fix missing colons in objects
      repaired = repaired.replace(/"\s*\{/g, '": {');
      
      // Fix unescaped newlines in strings
      repaired = repaired.replace(/([^\\])\n/g, '$1\\n');

      try {
        const result = JSON.parse(repaired);
        console.log('[PostProcessor] JSON repair successful after multiple attempts');
        return result;
      } catch (finalError) {
        console.log('[PostProcessor] All repair attempts failed:', finalError.message);
        
        // If we made changes but still failed, log the problematic area
        if (repaired !== originalRepaired) {
          console.log('[PostProcessor] Repaired string (first 500 chars):', repaired.substring(0, 500));
        }
        
        return null;
      }
    }
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
            console.log(`[PostProcessor] Parsed confidence string "${conf}" to ${data.confidence}`);
          } else {
            // Default to 0.5 if unrecognized
            data.confidence = 0.5;
            console.log(`[PostProcessor] Could not parse confidence "${conf}", defaulting to 0.5`);
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
   * Complete emergency recovery for severely damaged JSON
   */
  _emergencyJSONRecovery(text) {
    console.log('[PostProcessor] Starting emergency JSON recovery');
    
    // Step 1: Find the main JSON object
    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
      console.log('[PostProcessor] No opening brace found for emergency recovery');
      return null;
    }

    // Step 2: Extract everything from first brace onward
    let extracted = text.substring(firstBrace);
    
    // Step 3: Count braces and auto-close
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
    
    // Step 4: Add missing closing braces
    if (braceCount > 0) {
      extracted += '}'.repeat(braceCount);
      console.log(`[PostProcessor] Added ${braceCount} missing closing braces`);
    }
    
    // Step 5: Fix common truncated patterns
    const fixes = [
      // Fix truncated strings (ends with quote but no closing quote in structure)
      { pattern: /"([^"]*)$/, replacement: '"$1"' },
      // Fix truncated array (ends with [
      { pattern: /\[\s*$/, replacement: '[]' },
      // Fix truncated object key (ends with : without value)
      { pattern: /"([^"]*)":\s*$/, replacement: '"$1": ""' },
      // Fix incomplete milestone (from error logs)
      { pattern: /"milest\s*$/, replacement: '"milestone": "Week completed"' },
      // Fix missing comma before closing brace
      { pattern: /("[^"]*")\s*}/, replacement: '$1 }' }
    ];
    
    for (const fix of fixes) {
      if (fix.pattern.test(extracted)) {
        extracted = extracted.replace(fix.pattern, fix.replacement);
        console.log(`[PostProcessor] Applied fix: ${fix.pattern}`);
      }
    }
    
    // Step 6: Final validation
    try {
      const parsed = JSON.parse(extracted);
      console.log('[PostProcessor] Emergency recovery successful!');
      return parsed;
    } catch (e) {
      console.log('[PostProcessor] Emergency recovery failed:', e.message);
      console.log('[PostProcessor] Final attempt output (first 300 chars):', extracted.substring(0, 300));
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
    
    // Clean the output first
    let cleaned = output.trim();
    
    // Step 1: Try direct parse
    try {
      const parsed = JSON.parse(cleaned);
      console.log('[PostProcessor] Direct parse successful');
      return this._normalizeConfidence(parsed);
    } catch (error) {
      console.log('[PostProcessor] Direct parse failed:', error.message);
    }

    // Step 2: Extract from markdown code blocks (highest priority for Gemini)
    const codeBlockContent = this._extractFromCodeBlocks(cleaned);
    if (codeBlockContent) {
      console.log('[PostProcessor] Extracted from code block, length:', codeBlockContent.length);
      try {
        const parsed = JSON.parse(codeBlockContent);
        console.log('[PostProcessor] Successfully parsed extracted JSON');
        return this._normalizeConfidence(parsed);
      } catch (e) {
        console.log('[PostProcessor] Code block content parse failed:', e.message);
        console.log('[PostProcessor] Attempting JSON repair...');
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
        console.log('[PostProcessor] Extracted object parse failed, attempting repair...');
        const repaired = this._repairJSON(jsonObject);
        if (repaired) {
          console.log('[PostProcessor] JSON repair successful from extracted object');
          return this._normalizeConfidence(repaired);
        }
      }
    }

    // Step 4: Fallback - find first "{" to last "}" and try parsing/repair
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

    // Step 5: Emergency recovery for severely damaged JSON
    console.log('[PostProcessor] All standard methods failed, attempting emergency recovery');
    const emergencyResult = this._emergencyJSONRecovery(cleaned);
    if (emergencyResult) {
      return this._normalizeConfidence(emergencyResult);
    }

    // Step 6: If all else fails and retries available, signal for retry
    if (retries < 2 && retryCallback) {
      console.log('[PostProcessor] All extraction methods failed, attempting corrective re-prompt...');
      return null; // Signal for retry
    }

    // Final error with detailed diagnostics
    console.error('[PostProcessor] ======== ALL JSON EXTRACTION METHODS FAILED ========');
    console.error('[PostProcessor] Output length:', cleaned.length);
    console.error('[PostProcessor] First 500 chars:', cleaned.substring(0, 500));
    console.error('[PostProcessor] Last 500 chars:', cleaned.substring(Math.max(0, cleaned.length - 500)));
    console.error('[PostProcessor] ====================================================');
    
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
