/**
 * Model Adapter - Handles API calls to AI models with retries and error handling
 * Per markdown.md section 8: Error handling, retries, and fallback logic
 * Supports: Gemini, DeepSeek, OpenAI, Claude
 */

import axios from 'axios';

class ModelAdapter {
  constructor() {
    this.provider = process.env.AI_MODEL_PROVIDER || 'gemini';
    this.apiKey = this._getApiKey();
    this.modelName = process.env.AI_MODEL_NAME || 'gemini-pro';
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }

  _getApiKey() {
    switch (this.provider.toLowerCase()) {
      case 'gemini':
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      case 'deepseek':
        return process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
      case 'openai':
        return process.env.OPENAI_API_KEY;
      case 'claude':
        return process.env.CLAUDE_API_KEY;
      default:
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    }
  }

  _getApiEndpoint() {
    switch (this.provider.toLowerCase()) {
      case 'gemini':
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
      case 'deepseek':
        return 'https://api.deepseek.com/v1/chat/completions';
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'claude':
        return 'https://api.anthropic.com/v1/messages';
      default:
        return `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
    }
  }

  async callModel(systemPrompt, userPrompt, maxTokens = 2000) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ModelAdapter] Attempt ${attempt}/${this.maxRetries} for model call (${this.provider})`);
        
        const response = await this._callModelAPI(systemPrompt, userPrompt, maxTokens);
        
        return {
          success: true,
          content: response.content,
          tokens: {
            prompt: response.promptTokens,
            completion: response.completionTokens,
            total: response.totalTokens
          },
          model: this.modelName
        };
      } catch (error) {
        lastError = error;
        console.error(`[ModelAdapter] Attempt ${attempt} failed:`, error.message);
        
        // Check if error is retryable
        if (!this._isRetryable(error) || attempt === this.maxRetries) {
          break;
        }
        
        // Calculate delay based on error type
        const delay = this._getRetryDelay(attempt, error);
        console.log(`[ModelAdapter] Retrying in ${delay/1000}s (attempt ${attempt + 1}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: lastError.message,
      errorCode: lastError.code
    };
  }

  async _callModelAPI(systemPrompt, userPrompt, maxTokens) {
    if (!this.apiKey) {
      const keyName = this._getApiKeyName();
      throw new Error(`${keyName} is not set. Please configure it in your environment variables.`);
    }

    // Gemini uses different API format
    if (this.provider.toLowerCase() === 'gemini') {
      return await this._callGemini(systemPrompt, userPrompt, maxTokens);
    }

    // DeepSeek and OpenAI use the same API format
    if (this.provider.toLowerCase() === 'deepseek' || this.provider.toLowerCase() === 'openai') {
      return await this._callDeepSeekOrOpenAI(systemPrompt, userPrompt, maxTokens);
    }
    
    // Claude uses different format (to be implemented if needed)
    throw new Error(`Provider '${this.provider}' is not yet fully supported.`);
  }

  _getApiKeyName() {
    switch (this.provider.toLowerCase()) {
      case 'gemini':
        return 'GEMINI_API_KEY';
      case 'deepseek':
        return 'DEEPSEEK_API_KEY';
      case 'openai':
        return 'OPENAI_API_KEY';
      case 'claude':
        return 'CLAUDE_API_KEY';
      default:
        return 'GEMINI_API_KEY';
    }
  }

  async _callGemini(systemPrompt, userPrompt, maxTokens) {
    // Combine system and user prompts for Gemini
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const endpoint = this._getApiEndpoint();
    
    try {
      const response = await axios.post(
        `${endpoint}?key=${this.apiKey}`,
        {
          contents: [{
            parts: [{
              text: fullPrompt
            }]
          }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            temperature: 0.7,
            topP: 0.9
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      // Extract text from Gemini response
      const text = response.data.candidates[0].content.parts[0].text;
      
      // Gemini provides token counts in usageMetadata
      const usageMetadata = response.data.usageMetadata || {};
      
      return {
        content: text,
        promptTokens: usageMetadata.promptTokenCount || 0,
        completionTokens: usageMetadata.candidatesTokenCount || 0,
        totalTokens: usageMetadata.totalTokenCount || 0
      };
    } catch (error) {
      // Provide more detailed error messages
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 400) {
          const errorMessage = errorData?.error?.message || 'Invalid request to Gemini API';
          throw new Error(`Gemini API error: ${errorMessage}`);
        }
        if (status === 401 || status === 403) {
          throw new Error('Invalid Gemini API key. Please check your GEMINI_API_KEY environment variable.');
        }
        if (status === 429) {
          throw new Error('Gemini API rate limit exceeded. Please try again later.');
        }
        if (status === 500 || status === 502 || status === 503) {
          throw new Error('Gemini API service is temporarily unavailable. Please try again later.');
        }
        
        // Return Gemini's error message if available
        const errorMessage = errorData?.error?.message || `Gemini API error: ${status}`;
        throw new Error(errorMessage);
      }
      
      // Network or other errors
      throw error;
    }
  }

  async _callDeepSeekOrOpenAI(systemPrompt, userPrompt, maxTokens) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    const endpoint = this._getApiEndpoint();
    const providerName = this.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI';

    try {
      const response = await axios.post(
        endpoint,
        {
          model: this.modelName,
          messages,
          max_tokens: maxTokens,
          temperature: 0.7,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        content: response.data.choices[0].message.content,
        promptTokens: response.data.usage.prompt_tokens,
        completionTokens: response.data.usage.completion_tokens,
        totalTokens: response.data.usage.total_tokens
      };
    } catch (error) {
      // Provide more detailed error messages
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 401 || status === 403) {
          const keyName = this._getApiKeyName();
          throw new Error(`Invalid ${providerName} API key. Please check your ${keyName} environment variable.`);
        }
        if (status === 404) {
          const defaultModel = this.provider === 'deepseek' ? 'deepseek-chat' : 
                              this.provider === 'openai' ? 'gpt-3.5-turbo' : 'gemini-pro';
          throw new Error(`Model '${this.modelName}' not found. Try setting AI_MODEL_NAME=${defaultModel} in your environment variables.`);
        }
        if (status === 429) {
          throw new Error(`${providerName} API rate limit exceeded. Please try again later.`);
        }
        if (status === 500 || status === 502 || status === 503) {
          throw new Error(`${providerName} API service is temporarily unavailable. Please try again later.`);
        }
        
        // Return API's error message if available
        const errorMessage = errorData?.error?.message || errorData?.error?.code || `${providerName} API error: ${status}`;
        throw new Error(errorMessage);
      }
      
      // Network or other errors
      throw error;
    }
  }

  _isRetryable(error) {
    // Retry on network errors and rate limits (429, 5xx)
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return true;
    if (error.response?.status === 429) return true;
    if (error.response?.status >= 500) return true;
    return false;
  }

  _getRetryDelay(attempt, error) {
    // For rate limits (429), use longer delays
    if (error.response?.status === 429) {
      // Check if OpenAI provides retry-after header
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
      }
      // Exponential backoff for rate limits: 5s, 10s, 20s
      return 5000 * Math.pow(2, attempt - 1);
    }
    // Regular exponential backoff for other retryable errors
    return this.retryDelay * Math.pow(2, attempt - 1);
  }
}

export default new ModelAdapter();
