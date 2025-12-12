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
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

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
