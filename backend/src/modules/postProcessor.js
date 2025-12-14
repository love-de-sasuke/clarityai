/**
 * PostProcessor - Validates and sanitizes AI model outputs
 * Per markdown.md section 6: Postprocessing, validation & sanitization rules
 */

class PostProcessor {
  /**
   * Parse and validate JSON from LLM output
   */
  parseJSON(output, retryCallback = null, retries = 0) {
    if (!output || typeof output !== 'string') {
      throw new Error('Invalid output: expected string');
    }

    // Clean the output first
    let cleaned = output.trim();

    try {
      // Try direct parse first
      return JSON.parse(cleaned);
    } catch (error) {
      console.log('[PostProcessor] Direct parse failed, attempting extraction...');
      
      // Try extracting JSON from markdown code blocks (multiple patterns)
      // Pattern 1: ```json\n...\n``` (most common with Gemini)
      let jsonMatch = cleaned.match(/```json\s*\n?([\s\S]*?)\n?```/i);
      if (!jsonMatch) {
        // Pattern 2: ```json ... ``` (without newlines)
        jsonMatch = cleaned.match(/```json\s*([\s\S]*?)```/i);
      }
      if (!jsonMatch) {
        // Pattern 3: ``` ... ``` (without json tag)
        jsonMatch = cleaned.match(/```\s*\n?([\s\S]*?)\n?```/);
      }
      if (!jsonMatch) {
        // Pattern 4: ```json\n...``` (ending without newline)
        jsonMatch = cleaned.match(/```json\s*\n([\s\S]*?)```/i);
      }
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          // Clean the extracted content - remove leading/trailing whitespace and newlines
          let jsonContent = jsonMatch[1].trim();
          // Remove any leading/trailing quotes if present
          jsonContent = jsonContent.replace(/^["']|["']$/g, '');
          return JSON.parse(jsonContent);
        } catch (e) {
          console.log('[PostProcessor] Code block parse failed:', e.message);
          console.log('[PostProcessor] Extracted content:', jsonMatch[1].substring(0, 200));
        }
      }

      // Try finding JSON object with balanced braces (more robust)
      // This handles cases where JSON is not in code blocks
      const jsonObjectPattern = /\{[\s\S]*\}/;
      const objectMatch = cleaned.match(jsonObjectPattern);
      if (objectMatch) {
        try {
          // Try to find the complete JSON object by counting braces
          let jsonStr = '';
          let braceCount = 0;
          let startIndex = -1;
          
          for (let i = 0; i < cleaned.length; i++) {
            if (cleaned[i] === '{') {
              if (startIndex === -1) startIndex = i;
              braceCount++;
            } else if (cleaned[i] === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                jsonStr = cleaned.substring(startIndex, i + 1);
                break;
              }
            }
          }
          
          if (jsonStr) {
            return JSON.parse(jsonStr);
          }
          
          // Fallback to simple match
          return JSON.parse(objectMatch[0]);
        } catch (e) {
          console.log('[PostProcessor] Object extraction failed:', e.message);
        }
      }

      // Try removing markdown formatting and extra text
      // Remove any text before the first {
      const firstBrace = cleaned.indexOf('{');
      if (firstBrace !== -1) {
        try {
          const jsonOnly = cleaned.substring(firstBrace);
          // Remove any text after the last }
          const lastBrace = jsonOnly.lastIndexOf('}');
          if (lastBrace !== -1) {
            const finalJson = jsonOnly.substring(0, lastBrace + 1);
            return JSON.parse(finalJson);
          }
        } catch (e) {
          console.log('[PostProcessor] Brace-based extraction failed:', e.message);
        }
      }

      if (retries < 2 && retryCallback) {
        console.log('[PostProcessor] Attempting corrective re-prompt...');
        return null; // Signal for retry
      }

      throw new Error(`Failed to parse JSON after ${retries} retries: ${error.message}`);
    }
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
