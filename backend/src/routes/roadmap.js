/**
 * Roadmap Generator route
 */

import express from 'express';
import promptManager from '../modules/promptManager.js';
import modelAdapter from '../modules/modelAdapter.js';
import postProcessor from '../modules/postProcessor.js';
import Request from '../models/Request.js';
import { optionalAuth } from '../middleware/auth.js';
import { generateRequestId } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/roadmap', optionalAuth, async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = req.body;

    if (!goal) {
      return res.status(400).json({ error: 'Goal required' });
    }

    // Generate prompt
    const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
      'roadmap',
      { goal, timeframeWeeks, level }
    );

    // Call model
    const modelResponse = await modelAdapter.callModel(
      systemPrompt,
      userPrompt,
      metadata.maxTokens,
      metadata.stopSequences
    );

    if (!modelResponse.success) {
      throw new Error(modelResponse.error);
    }

    // Parse and validate
    let result = postProcessor.parseJSON(modelResponse.content);
    if (!result) {
      throw new Error('Failed to parse model response');
    }

    const validation = postProcessor.validateSchema(result, 'roadmap');
    if (!validation.valid) {
      console.warn('Validation errors:', validation.errors);
      result = validation.data;
    }

    result = postProcessor.sanitize(result);

    // Save request
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'roadmap',
      status: 'complete',
      input: { goal, timeframeWeeks, level },
      result,
      metrics: {
        promptTokens: modelResponse.tokens.prompt || 0,
        completionTokens: modelResponse.tokens.completion || 0,
        totalTokens: modelResponse.tokens.total || 0,
        duration_ms: Date.now() - startTime,
        modelProvider: modelAdapter.getProviderName() || 'unknown',
        confidence: result.confidence || 0.7
      }
    });

    await requestDoc.save();

    logger.logRequest({
      requestId,
      featureType: 'roadmap',
      userId: req.userId,
      startTime,
      endTime: Date.now(),
      status: 'success',
      modelProvider: modelAdapter.getProviderName() || 'unknown',
      promptTokens: modelResponse.tokens.prompt || 0,
      completionTokens: modelResponse.tokens.completion || 0,
      totalTokens: modelResponse.tokens.total || 0,
      confidence: result.confidence || 0.7
    });

    res.json({
      status: 'ok',
      requestId,
      result
    });
  } catch (error) {
    logger.error('Roadmap endpoint error', error, { requestId, goal: req.body.goal });

    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'roadmap',
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
