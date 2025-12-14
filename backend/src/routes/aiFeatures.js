
/**
 * AI Features routes - Explain and Rewrite
 */

import express from 'express';
import promptManager from '../modules/promptManager.js';
import modelAdapter from '../modules/modelAdapter.js';
import postProcessor from '../modules/postProcessor.js';
import Request from '../models/Request.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { generateRequestId } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Explain Anything endpoint
router.post('/explain', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { topic, detailLevel = 'short', includeQuiz = true } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic required' });
    }

    // Generate prompt
    const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
      'explain',
      { topic, detailLevel }
    );

    // Call model
    const modelResponse = await modelAdapter.callModel(
      systemPrompt,
      userPrompt,
      metadata.maxTokens
    );

    if (!modelResponse.success) {
      throw new Error(modelResponse.error);
    }

    // Parse and validate JSON
    let result = postProcessor.parseJSON(modelResponse.content);
    if (!result) {
      throw new Error('Failed to parse model response');
    }

    const validation = postProcessor.validateSchema(result, 'explain');
    if (!validation.valid) {
      console.warn('Validation errors:', validation.errors);
      result = validation.data;
    }

    // Sanitize
    result = postProcessor.sanitize(result);

    // Save request to DB
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'explain',
      status: 'complete',
      input: { topic, detailLevel },
      result,
      metrics: {
        promptTokens: modelResponse.tokens.prompt,
        completionTokens: modelResponse.tokens.completion,
        totalTokens: modelResponse.tokens.total,
        duration_ms: Date.now() - startTime,
        modelProvider: 'openai',
        modelVersion: modelAdapter.modelName,
        confidence: result.confidence || 0.8
      }
    });

    await requestDoc.save();

    // Log metrics
    logger.logRequest({
      requestId,
      featureType: 'explain',
      userId: req.userId,
      startTime,
      endTime: Date.now(),
      status: 'success',
      modelProvider: 'openai',
      modelVersion: modelAdapter.modelName,
      promptTokens: modelResponse.tokens.prompt,
      completionTokens: modelResponse.tokens.completion,
      totalTokens: modelResponse.tokens.total,
      confidence: result.confidence || 0.8
    });

    res.json({
      status: 'ok',
      requestId,
      result
    });
  } catch (error) {
    logger.error('Explain endpoint error', error, { requestId, topic: req.body.topic });

    // Save failed request
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'explain',
      status: 'failed',
      input: req.body,
      errorMessage: error.message,
      metrics: {
        duration_ms: Date.now() - startTime
      }
    });
    await requestDoc.save();
    // Try to save failed request (but don't fail if DB save fails)
    try {
      const requestDoc = new Request({
        requestId,
        userId: req.userId || null,
        featureType: 'explain',
        status: 'failed',
        input: req.body,
        errorMessage: error.message,
        metrics: {
          duration_ms: Date.now() - startTime
        }
      });
      await requestDoc.save();
    } catch (dbError) {
      console.error('[ERROR] Failed to save request to DB:', dbError.message);
    }

    // Return detailed error message (we want to see what's wrong)
    let errorMessage = error.message;
    
    // Provide helpful messages for common errors
    if (error.message.includes('OPENAI_API_KEY')) {
      errorMessage = 'OpenAI API key is not configured. Please check your environment variables.';
    } else if (error.message.includes('not found') || error.message.includes('Model')) {
      errorMessage = `Model error: ${error.message}. Try setting AI_MODEL_NAME=gpt-3.5-turbo`;
    } else if (error.message.includes('Invalid OpenAI API key')) {
      errorMessage = 'Invalid OpenAI API key. Please verify your API key is correct.';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'OpenAI API rate limit exceeded. Please try again in a moment.';
    }
    
    // In production, still show the error but make it user-friendly
    if (process.env.NODE_ENV === 'production' && !errorMessage.includes('OpenAI') && !errorMessage.includes('Model')) {
      errorMessage = 'An error occurred while processing your request. Please try again.';
    }

    res.status(500).json({
      status: 'error',
      requestId,
      error: error.message
      error: errorMessage
    });
  }
});

// Rewrite Text endpoint
router.post('/rewrite', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { text, tone = 'formal' } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }

    // Generate prompt
    const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
      'rewrite',
      { text, tone }
    );

    // Call model
    const modelResponse = await modelAdapter.callModel(
      systemPrompt,
      userPrompt,
      metadata.maxTokens
    );

    if (!modelResponse.success) {
      throw new Error(modelResponse.error);
    }

    // Parse and validate
    let result = postProcessor.parseJSON(modelResponse.content);
    if (!result) {
      throw new Error('Failed to parse model response');
    }

    const validation = postProcessor.validateSchema(result, 'rewrite');
    if (!validation.valid) {
      console.warn('Validation errors:', validation.errors);
      result = validation.data;
    }

    result = postProcessor.sanitize(result);

    // Save request
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'rewrite',
      status: 'complete',
      input: { text, tone },
      result,
      metrics: {
        promptTokens: modelResponse.tokens.prompt,
        completionTokens: modelResponse.tokens.completion,
        totalTokens: modelResponse.tokens.total,
        duration_ms: Date.now() - startTime,
        modelProvider: 'openai',
        modelVersion: modelAdapter.modelName,
        confidence: result.confidence || 0.85
      }
    });

    await requestDoc.save();

    logger.logRequest({
      requestId,
      featureType: 'rewrite',
      userId: req.userId,
      startTime,
      endTime: Date.now(),
      status: 'success',
      modelProvider: 'openai',
      modelVersion: modelAdapter.modelName,
      promptTokens: modelResponse.tokens.prompt,
      completionTokens: modelResponse.tokens.completion,
      totalTokens: modelResponse.tokens.total,
      confidence: result.confidence || 0.85
    });

    res.json({
      status: 'ok',
      requestId,
      result
    });
  } catch (error) {
    logger.error('Rewrite endpoint error', error, { requestId, tone: req.body.tone });

    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'rewrite',
      status: 'failed',
      input: req.body,
      errorMessage: error.message,
      metrics: { duration_ms: Date.now() - startTime }
    });
    await requestDoc.save();

    res.status(500).json({
      status: 'error',
      requestId,
      error: error.message
    });
  }
});

export default router;

