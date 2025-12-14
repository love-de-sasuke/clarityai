/**
 * Roadmap Generator route
 */

import express from 'express';
import promptManager from '../modules/promptManager.js';
import modelAdapter from '../modules/modelAdapter.js';
import postProcessor from '../modules/postProcessor.js';
import Request from '../models/Request.js';
import { optionalAuth } from '../middleware/auth.js';
import { generateRequestId, parseConfidence } from '../utils/helpers.js';
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

    // Call model with retry logic
    let modelResponse;
    let result;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        console.log(`[Roadmap] Attempt ${retryCount + 1}/${maxRetries + 1}`);
        
        modelResponse = await modelAdapter.callModel(
          systemPrompt,
          userPrompt,
          metadata.maxTokens
        );

        if (!modelResponse.success) {
          throw new Error(modelResponse.error);
        }

        console.log(`[Roadmap] Model response received, length: ${modelResponse.content.length}`);
        
        // Parse JSON with retry count
        try {
          result = postProcessor.parseJSON(modelResponse.content, retryCount);
          console.log('[Roadmap] JSON parse successful');
          break; // Success!
        } catch (parseError) {
          console.log(`[Roadmap] JSON parse failed on attempt ${retryCount + 1}:`, parseError.message);
          
          if (parseError.message === 'PARSE_RETRY_NEEDED' && retryCount < maxRetries) {
            retryCount++;
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          } else {
            throw parseError;
          }
        }
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`[Roadmap] Retrying (${retryCount}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        } else {
          throw error;
        }
      }
    }

    // If still no result after retries
    if (!result) {
      throw new Error('Failed to get valid response after retries');
    }

    // Validate schema
    const validation = postProcessor.validateSchema(result, 'roadmap');
    if (!validation.valid) {
      console.warn('[Roadmap] Validation warnings:', validation.errors);
      result = validation.data;
    }

    // Sanitize
    result = postProcessor.sanitize(result);

    // Normalize confidence
    if (result.confidence && typeof result.confidence !== 'number') {
      result.confidence = parseConfidence(result.confidence);
    }

    // Ensure required structure
    if (!result.weeks || !Array.isArray(result.weeks)) {
      result.weeks = Array.from({ length: timeframeWeeks }, (_, i) => ({
        week_number: i + 1,
        tasks: [`Study ${goal} concepts`, `Practice exercises`, `Review materials`],
        estimated_hours: 10,
        milestone: `Week ${i + 1} milestone`
      }));
    }

    if (!result.resources || !Array.isArray(result.resources)) {
      result.resources = [
        { title: `${goal} Official Documentation`, url: 'https://example.com/docs' },
        { title: `${goal} Learning Platform`, url: 'https://example.com/learn' }
      ];
    }

    if (!result.confidence) {
      result.confidence = 0.8;
    }

    // Save request
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'roadmap',
      status: 'complete',
      input: { goal, timeframeWeeks, level },
      result,
      metrics: {
        promptTokens: modelResponse?.tokens?.prompt || 0,
        completionTokens: modelResponse?.tokens?.completion || 0,
        totalTokens: modelResponse?.tokens?.total || 0,
        duration_ms: Date.now() - startTime,
        modelProvider: 'openai',
        modelVersion: modelAdapter.modelName,
        confidence: result.confidence || 0.7,
        retries: retryCount
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
      modelProvider: 'openai',
      modelVersion: modelAdapter.modelName,
      promptTokens: modelResponse?.tokens?.prompt || 0,
      completionTokens: modelResponse?.tokens?.completion || 0,
      totalTokens: modelResponse?.tokens?.total || 0,
      confidence: result.confidence || 0.7,
      retries: retryCount
    });

    res.json({
      status: 'ok',
      requestId,
      result,
      metrics: {
        retries: retryCount,
        duration_ms: Date.now() - startTime
      }
    });
  } catch (error) {
    logger.error('Roadmap endpoint error', error, { requestId, goal: req.body.goal });

    // Create fallback response
    const fallbackResult = {
      fallback: true,
      weeks: Array.from({ length: timeframeWeeks || 8 }, (_, i) => ({
        week_number: i + 1,
        tasks: ['Study core concepts', 'Complete practice exercises', 'Review progress'],
        estimated_hours: 12,
        milestone: `Complete Week ${i + 1} learning objectives`
      })),
      resources: [
        { title: 'Official Documentation', url: 'https://example.com/docs' },
        { title: 'Learning Resources', url: 'https://example.com/learn' }
      ],
      confidence: 0.7,
      error_message: error.message
    };

    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'roadmap',
      status: 'complete',
      input: req.body,
      result: fallbackResult,
      errorMessage: error.message,
      metrics: { duration_ms: Date.now() - startTime }
    });
    
    await requestDoc.save();

    res.json({
      status: 'ok',
      requestId,
      result: fallbackResult,
      warning: 'Using fallback response due to error: ' + error.message
    });
  }
});

export default router;
