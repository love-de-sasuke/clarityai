/**
 * Model Adapter - Handles API calls to AI models with retries and error handling
 * Per markdown.md section 8: Error handling, retries, and fallback logic
 */

import axios from 'axios';

class ModelAdapter {
  constructor() {
    this.provider = process.env.AI_MODEL_PROVIDER || 'openai';
    this.apiKey = this.provider === 'openai' 
      ? process.env.OPENAI_API_KEY 
      : process.env.CLAUDE_API_KEY;
    this.modelName = process.env.AI_MODEL_NAME || 'gpt-4';
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms
  }

  async callModel(systemPrompt, userPrompt, maxTokens = 2000) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ModelAdapter] Attempt ${attempt}/${this.maxRetries} for model call`);
        
        const response = await this._callOpenAI(systemPrompt, userPrompt, maxTokens);
        
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
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: lastError.message,
      errorCode: lastError.code
    };
  }

  async _callOpenAI(systemPrompt, userPrompt, maxTokens) {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Please configure it in your environment variables.');
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
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
        
        if (status === 401) {
          throw new Error('Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.');
        }
        if (status === 404) {
          throw new Error(`Model '${this.modelName}' not found. Try setting AI_MODEL_NAME=gpt-3.5-turbo in your environment variables.`);
        }
        if (status === 429) {
          throw new Error('OpenAI API rate limit exceeded. Please try again later.');
        }
        if (status === 500 || status === 502 || status === 503) {
          throw new Error('OpenAI API service is temporarily unavailable. Please try again later.');
        }
        
        // Return OpenAI's error message if available
        const errorMessage = errorData?.error?.message || errorData?.error?.code || `OpenAI API error: ${status}`;
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
}

export default new ModelAdapter();
