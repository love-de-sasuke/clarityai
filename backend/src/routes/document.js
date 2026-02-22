/**
 * Document Routes - File upload, processing, and summarization
 */

import express from 'express';
import multer from 'multer';
import fileExtractor from '../modules/fileExtractor.js';
import documentProcessor from '../modules/documentProcessor.js';
import promptManager from '../modules/promptManager.js';
import modelAdapter from '../modules/modelAdapter.js';
import postProcessor from '../modules/postProcessor.js';
import Request from '../models/Request.js';
import { optionalAuth } from '../middleware/auth.js';
import { generateRequestId, safeJsonParse } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp'
    ];

    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|txt|jpg|png|jpeg|gif|bmp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

/**
 * Upload and initiate document processing
 * Returns 202 Accepted with request ID for polling
 */
router.post('/upload', optionalAuth, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { generateRoadmap = false } = req.body;

    // Create initial request document (pending status)
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'document',
      status: 'pending',
      input: {
        filename: req.file.originalname,
        filesize: req.file.size,
        mimetype: req.file.mimetype,
        generateRoadmap: generateRoadmap === 'true' || generateRoadmap === true
      },
      metrics: {
        duration_ms: Date.now() - startTime
      }
    });

    await requestDoc.save();

    // Process document asynchronously (in production, use Redis queue)
    processDocumentAsync(requestId, req.file, generateRoadmap === 'true' || generateRoadmap === true, req.userId);

    // Return 202 Accepted
    res.status(202).json({
      status: 'processing',
      requestId,
      message: 'Document is being processed. Check status using request ID.'
    });
  } catch (error) {
    logger.error('Document upload error', error, { requestId });

    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'document',
      status: 'failed',
      input: { filename: req.file?.originalname },
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

/**
 * Check document processing status and get results
 */
router.get('/request/:requestId', optionalAuth, async (req, res) => {
  try {
    const requestDoc = await Request.findOne({ requestId: req.params.requestId });

    if (!requestDoc) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Check ownership
    if (requestDoc.userId && req.userId && requestDoc.userId.toString() !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      status: requestDoc.status,
      requestId: req.params.requestId,
      result: requestDoc.result || null,
      error: requestDoc.errorMessage || null,
      metrics: requestDoc.metrics || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Async document processing function
 * In production, this should be a Redis job queue
 */
async function processDocumentAsync(requestId, file, generateRoadmap, userId) {
  const processStartTime = Date.now();
  try {
    const updateRequest = async (status, updates) => {
      await Request.findOneAndUpdate(
        { requestId },
        { status, ...updates },
        { new: true }
      );
    };

    // Update status to processing
    await updateRequest('processing', {});

    // Step 1: Extract text from file
    console.log(`[Document ${requestId}] Extracting text...`);
    const extraction = await fileExtractor.extractText(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    // Validate extraction
    const validation = fileExtractor.validateExtraction(extraction.text);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Step 2: Clean text
    console.log(`[Document ${requestId}] Cleaning text...`);
    const cleanedText = documentProcessor.cleanText(extraction.text);

    // Step 3: Decide on summarization strategy
    const useDirectSummarization = documentProcessor.shouldUseDirectSummarization(cleanedText);
    let result;

    if (useDirectSummarization) {
      // Small document: direct summarization
      console.log(`[Document ${requestId}] Using direct summarization...`);
      result = await summarizeDirectly(cleanedText, generateRoadmap);
    } else {
      // Large document: map-reduce summarization
      console.log(`[Document ${requestId}] Using map-reduce summarization...`);
      result = await summarizeWithMapReduce(cleanedText, generateRoadmap);
    }

    // Sanitize result
    result = postProcessor.sanitize(result);

    // Save extracted text reference
    result.extracted_text_path = `s3://clarityai-bucket/documents/${requestId}/extracted.txt`;

    // Update request with results
    await updateRequest('complete', {
      result,
      metrics: {
        duration_ms: Date.now() - processStartTime,
        modelProvider: 'openai',
        modelVersion: modelAdapter.modelName,
        ocrPageCount: extraction.pages,
        extractedChars: cleanedText.length,
        confidence: result.confidence || 0.75
      }
    });

    console.log(`[Document ${requestId}] Processing complete`);
  } catch (error) {
    logger.error(`Document processing failed for ${requestId}`, error);

    await Request.findOneAndUpdate(
      { requestId },
      {
        status: 'failed',
        errorMessage: error.message,
        metrics: { duration_ms: Date.now() - processStartTime }
      }
    );
  }
}

/**
 * Direct summarization for small documents
 */
async function summarizeDirectly(text, generateRoadmap) {
  const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
    'document',
    { isChunk: false },
    text
  );

  const modelResponse = await modelAdapter.callModel(
    systemPrompt,
    userPrompt,
    metadata.maxTokens
  );

  if (!modelResponse.success) {
    throw new Error(modelResponse.error);
  }

  let result = safeJsonParse(modelResponse.content);
  if (!result) {
    throw new Error('Failed to parse model response');
  }

  const validation = postProcessor.validateSchema(result, 'document');
  if (!validation.valid) {
    console.warn('Validation errors:', validation.errors);
    result = validation.data;
  }

  return result;
}

/**
 * Map-reduce summarization for large documents
 */
async function summarizeWithMapReduce(text, generateRoadmap) {
  // Step 1: Chunk the document
  const chunks = documentProcessor.chunkDocument(text, 2000, 100);
  console.log(`[MapReduce] Processing ${chunks.length} chunks...`);

  // Step 2: Map stage - summarize each chunk
  const chunkResults = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[MapReduce] Processing chunk ${i + 1}/${chunks.length}...`);

    const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
      'document',
      { isChunk: true }
    );

    const mapPrompt = userPrompt.replace('<<chunk text>>', chunks[i].text);

    const modelResponse = await modelAdapter.callModel(
      systemPrompt,
      mapPrompt,
      metadata.maxTokens
    );

    if (modelResponse.success) {
      const parsed = safeJsonParse(modelResponse.content);
      chunkResults.push(parsed);
    } else {
      console.warn(`Chunk ${i} failed: ${modelResponse.error}`);
      chunkResults.push({
        chunk_summary: '',
        chunk_action_items: [],
        chunk_keywords: []
      });
    }
  }

  // Step 3: Reduce stage - combine summaries
  console.log('[MapReduce] Reducing chunk summaries...');
  const reduced = documentProcessor.reduceChunkSummaries(chunkResults);

  // Step 4: Generate final summary
  const { systemPrompt } = promptManager.generatePrompt('document', { isChunk: false });
  const reducePrompt = documentProcessor.createReducePrompt(chunkResults, generateRoadmap);

  const finalResponse = await modelAdapter.callModel(
    systemPrompt,
    reducePrompt,
    3000
  );

  if (!finalResponse.success) {
    throw new Error(finalResponse.error);
  }

  let result = safeJsonParse(finalResponse.content);
  if (!result) {
    // Fallback: use reduced results
    console.warn('Failed to parse final summary, using fallback.');
    result = {
      summary_short: reduced.summaries.join(' '),
      highlights: reduced.highlights,
      action_items: reduced.actionItems,
      keywords: reduced.keywords,
      generated_roadmap: null
    };
  }

  return result;
}

export default router;
