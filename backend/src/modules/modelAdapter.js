/**
 * Model Adapter - Handles API calls to AI models with retries and error handling
 */

import axios from 'axios';

class ModelAdapter {
  constructor() {
    this.provider = process.env.AI_MODEL_PROVIDER || 'gemini';
    this.apiKey = this._getApiKey();
    this.modelName = process.env.AI_MODEL_NAME || 'gemini-pro';
    this.maxRetries = 3;
    this.retryDelay = 1000;
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

  /**
   * Get provider name for logging
   */
  getProviderName() {
    return this.provider;
  }

  async callModel(systemPrompt, userPrompt, maxTokens = 2000, stopSequences = [], metadata = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ModelAdapter] Attempt ${attempt}/${this.maxRetries} for model call (${this.provider})`);
        
        const response = await this._callModelAPI(systemPrompt, userPrompt, maxTokens, stopSequences);
        
        return {
          success: true,
          content: response.content,
          tokens: {
            prompt: response.promptTokens || 0,
            completion: response.completionTokens || 0,
            total: response.totalTokens || 0
          },
          model: this.modelName
        };
      } catch (error) {
        lastError = error;
        console.error(`[ModelAdapter] Attempt ${attempt} failed:`, error.message);
        
        if (!this._isRetryable(error) || attempt === this.maxRetries) {
          break;
        }
        
        const delay = this._getRetryDelay(attempt, error);
        console.log(`[ModelAdapter] Retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: lastError ? lastError.message : 'Unknown error',
      errorCode: lastError ? lastError.code : null
    };
  }

  async _callModelAPI(systemPrompt, userPrompt, maxTokens, stopSequences) {
    if (!this.apiKey) {
      const keyName = this._getApiKeyName();
      throw new Error(`${keyName} is not set. Please configure it in your environment variables.`);
    }

    if (this.provider.toLowerCase() === 'gemini') {
      return await this._callGemini(systemPrompt, userPrompt, maxTokens, stopSequences);
    }

    if (this.provider.toLowerCase() === 'deepseek' || this.provider.toLowerCase() === 'openai') {
      return await this._callDeepSeekOrOpenAI(systemPrompt, userPrompt, maxTokens, stopSequences);
    }
    
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

  async _callGemini(systemPrompt, userPrompt, maxTokens, stopSequences) {
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
            topP: 0.9,
            stopSequences: stopSequences.length > 0 ? stopSequences : undefined
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      // Extract text from Gemini response
      const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (!text) {
        throw new Error('Empty response from Gemini API');
      }
      
      const usageMetadata = response.data.usageMetadata || {};
      
      return {
        content: text,
        promptTokens: usageMetadata.promptTokenCount || Math.ceil(fullPrompt.length / 4),
        completionTokens: usageMetadata.candidatesTokenCount || Math.ceil(text.length / 4),
        totalTokens: usageMetadata.totalTokenCount || Math.ceil((fullPrompt.length + text.length) / 4)
      };
    } catch (error) {
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
        
        const errorMessage = errorData?.error?.message || `Gemini API error: ${status}`;
        throw new Error(errorMessage);
      }
      
      if (error.code === 'ECONNABORTED') {
        throw new Error('Gemini API request timeout. Please try again.');
      }
      
      throw error;
    }
  }

  async _callDeepSeekOrOpenAI(systemPrompt, userPrompt, maxTokens, stopSequences) {
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
          top_p: 0.9,
          stop: stopSequences.length > 0 ? stopSequences : undefined
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      const content = response.data.choices?.[0]?.message?.content || '';
      
      if (!content) {
        throw new Error(`Empty response from ${providerName} API`);
      }

      return {
        content: content,
        promptTokens: response.data.usage?.prompt_tokens || Math.ceil((systemPrompt.length + userPrompt.length) / 4),
        completionTokens: response.data.usage?.completion_tokens || Math.ceil(content.length / 4),
        totalTokens: response.data.usage?.total_tokens || Math.ceil((systemPrompt.length + userPrompt.length + content.length) / 4)
      };
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorData = error.response.data;
        
        if (status === 401 || status === 403) {
          const keyName = this._getApiKeyName();
          throw new Error(`Invalid ${providerName} API key. Please check your ${keyName} environment variable.`);
        }
        if (status === 404) {
          const defaultModel = this.provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo';
          throw new Error(`Model '${this.modelName}' not found. Try setting AI_MODEL_NAME=${defaultModel}`);
        }
        if (status === 429) {
          throw new Error(`${providerName} API rate limit exceeded. Please try again later.`);
        }
        if (status === 500 || status === 502 || status === 503) {
          throw new Error(`${providerName} API service is temporarily unavailable. Please try again later.`);
        }
        
        const errorMessage = errorData?.error?.message || errorData?.error?.code || `${providerName} API error: ${status}`;
        throw new Error(errorMessage);
      }
      
      if (error.code === 'ECONNABORTED') {
        throw new Error(`${providerName} API request timeout. Please try again.`);
      }
      
      throw error;
    }
  }

  _isRetryable(error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') return true;
    if (error.response?.status === 429) return true;
    if (error.response?.status >= 500) return true;
    return false;
  }

  _getRetryDelay(attempt, error) {
    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter) * 1000;
      }
      return 5000 * Math.pow(2, attempt - 1);
    }
    return this.retryDelay * Math.pow(2, attempt - 1);
  }
}

export default new ModelAdapter();
