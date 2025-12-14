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
import { generateRequestId } from '../utils/helpers.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
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
 */
router.post('/upload', optionalAuth, upload.single('file'), async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const generateRoadmap = req.body.generateRoadmap === 'true' || req.body.generateRoadmap === true;

    // Create initial request document
    const requestDoc = new Request({
      requestId,
      userId: req.userId || null,
      featureType: 'document',
      status: 'pending',
      input: {
        filename: req.file.originalname,
        filesize: req.file.size,
        mimetype: req.file.mimetype,
        generateRoadmap
      },
      metrics: {
        duration_ms: Date.now() - startTime
      }
    });

    await requestDoc.save();

    // Process document asynchronously
    processDocumentAsync(requestId, req.file, generateRoadmap, req.userId);

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
 * Check document processing status
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
 */
async function processDocumentAsync(requestId, file, generateRoadmap, userId) {
  const processStartTime = Date.now();
  
  const updateRequest = async (status, updates) => {
    await Request.findOneAndUpdate(
      { requestId },
      { status, ...updates },
      { new: true }
    );
  };

  try {
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
      result = await summarizeDirectly(cleanedText, requestId);
    } else {
      // Large document: map-reduce summarization
      console.log(`[Document ${requestId}] Using map-reduce summarization...`);
      result = await summarizeWithMapReduce(cleanedText, requestId);
    }

    // Step 4: Generate roadmap if requested
    if (generateRoadmap && result) {
      console.log(`[Document ${requestId}] Generating roadmap...`);
      try {
        const roadmap = await generateDocumentRoadmap(cleanedText, result, requestId);
        if (roadmap) {
          result.roadmap = roadmap;
        }
      } catch (roadmapError) {
        console.warn(`[Document ${requestId}] Roadmap generation failed:`, roadmapError.message);
      }
    }

    // Sanitize result
    result = postProcessor.sanitize(result);

    // Update request with results
    await updateRequest('complete', {
      result,
      metrics: {
        duration_ms: Date.now() - processStartTime,
        modelProvider: modelAdapter.getProviderName() || 'unknown',
        ocrPageCount: extraction.pages,
        extractedChars: cleanedText.length,
        confidence: result.confidence || 0.75
      }
    });

    console.log(`[Document ${requestId}] Processing complete`);
  } catch (error) {
    console.error(`Document processing failed for ${requestId}:`, error);

    await updateRequest('failed', {
      errorMessage: error.message,
      metrics: { duration_ms: Date.now() - processStartTime }
    });
  }
}

/**
 * Direct summarization for small documents
 */
async function summarizeDirectly(text, requestId) {
  const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
    'document',
    { isChunk: false },
    text
  );

  const modelResponse = await modelAdapter.callModel(
    systemPrompt,
    userPrompt,
    metadata.maxTokens,
    metadata.stopSequences
  );

  if (!modelResponse.success) {
    throw new Error(modelResponse.error);
  }

  let result = postProcessor.parseJSON(modelResponse.content);
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
async function summarizeWithMapReduce(text, requestId) {
  // Step 1: Chunk the document
  const chunks = documentProcessor.chunkDocument(text, 2000, 100);
  console.log(`[MapReduce] Processing ${chunks.length} chunks...`);

  // Step 2: Map stage - summarize each chunk
  const chunkResults = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[MapReduce] Processing chunk ${i + 1}/${chunks.length}...`);

    const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
      'document',
      { isChunk: true },
      chunks[i].text
    );

    const modelResponse = await modelAdapter.callModel(
      systemPrompt,
      userPrompt,
      metadata.maxTokens,
      metadata.stopSequences
    );

    if (modelResponse.success) {
      const parsed = postProcessor.parseJSON(modelResponse.content);
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

  // Step 4: Create reduce prompt from combined summaries
  const reducePrompt = documentProcessor.createReducePrompt(chunkResults);
  
  const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
    'document',
    { isChunk: false },
    reducePrompt
  );

  const finalResponse = await modelAdapter.callModel(
    systemPrompt,
    userPrompt,
    3000,
    metadata.stopSequences
  );

  if (!finalResponse.success) {
    throw new Error(finalResponse.error);
  }

  let result = postProcessor.parseJSON(finalResponse.content);
  if (!result) {
    // Fallback: use reduced results
    result = {
      summary_short: reduced.summaries.slice(0, 2).join(' ') || 'Document summary',
      highlights: reduced.highlights || [],
      action_items: reduced.actionItems || [],
      keywords: reduced.keywords || []
    };
  }

  return result;
}

/**
 * Generate roadmap based on document content
 */
async function generateDocumentRoadmap(text, summary, requestId) {
  console.log(`[${requestId}] Generating document roadmap`);
  
  const roadmapPrompt = `Based on this document summary, create a learning roadmap.
  
Document Summary:
${summary.summary_short || 'No summary available'}

Key Topics/Keywords:
${(summary.keywords || []).join(', ')}

Please create a 4-8 week learning roadmap to master the topics covered in this document.
Focus on practical learning with resources and milestones.`;

  const systemPrompt = `You are an expert learning advisor. Create a structured learning roadmap based on document content.
Return ONLY valid JSON with: weeks (array), resources (array), confidence (number 0.0-1.0).
Each week should have: week_number, tasks, estimated_hours, milestone.
Each resource should have: title, url (or "none" if not applicable).`;

  const modelResponse = await modelAdapter.callModel(
    systemPrompt,
    roadmapPrompt,
    2000,
    ['\n}\n', '\n}', '}\n', '}']
  );

  if (!modelResponse.success) {
    throw new Error(`Roadmap generation failed: ${modelResponse.error}`);
  }

  const roadmap = postProcessor.parseJSON(modelResponse.content);
  if (!roadmap) {
    throw new Error('Failed to parse roadmap JSON');
  }

  // Validate roadmap
  const validation = postProcessor.validateSchema(roadmap, 'roadmap');
  if (!validation.valid) {
    console.warn(`[${requestId}] Roadmap validation errors:`, validation.errors);
  }

  return roadmap;
}

export default router;
