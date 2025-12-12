/**
 * PostProcessor - Validates and sanitizes AI model outputs
 * Per markdown.md section 6: Postprocessing, validation & sanitization rules
 */

class PostProcessor {
  /**
   * Parse and validate JSON from LLM output
   */
  parseJSON(output, retryCallback = null, retries = 0) {
    try {
      // Try direct parse
      return JSON.parse(output);
    } catch (error) {
      console.log('[PostProcessor] Direct parse failed, attempting extraction...');
      
      // Try extracting JSON from code blocks
      const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (e) {
          console.log('[PostProcessor] Code block parse failed');
        }
      }

      // Try finding JSON object
      const objectMatch = output.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch (e) {
          console.log('[PostProcessor] Object extraction failed');
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
