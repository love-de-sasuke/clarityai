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

    const generateRoadmap = req.body.generateRoadmap === 'true' || req.body.generateRoadmap === true;

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
        generateRoadmap
      },
      metrics: {
        duration_ms: Date.now() - startTime
      }
    });

    await requestDoc.save();

    // Process document asynchronously
    processDocumentAsync(requestId, req.file, generateRoadmap, req.userId).catch(error => {
      logger.error(`Async processing failed for ${requestId}`, error);
    });

    // Return 202 Accepted
    res.status(202).json({
      status: 'processing',
      requestId,
      message: 'Document is being processed. Check status using request ID.',
      estimatedTime: '30-60 seconds depending on document size'
    });
  } catch (error) {
    logger.error('Document upload error', error, { requestId });

    // Try to save error state
    try {
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
    } catch (saveError) {
      logger.error('Failed to save error state', saveError);
    }

    res.status(500).json({
      status: 'error',
      requestId,
      error: 'Document upload failed: ' + error.message
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
      metrics: requestDoc.metrics || null,
      input: requestDoc.input || null
    });
  } catch (error) {
    logger.error('Request status check error', error, { requestId: req.params.requestId });
    res.status(500).json({ error: error.message });
  }
});

/**
 * Async document processing function
 */
async function processDocumentAsync(requestId, file, generateRoadmap, userId) {
  const processStartTime = Date.now();
  
  const updateRequest = async (status, updates) => {
    try {
      await Request.findOneAndUpdate(
        { requestId },
        { status, ...updates },
        { new: true }
      );
    } catch (error) {
      logger.error(`Failed to update request ${requestId}`, error);
    }
  };

  try {
    // Update status to processing
    await updateRequest('processing', {
      metrics: { startTime: processStartTime }
    });

    logger.info(`[Document ${requestId}] Starting document processing`, {
      filename: file.originalname,
      size: file.size,
      roadmap: generateRoadmap
    });

    // Step 1: Extract text from file
    logger.info(`[Document ${requestId}] Extracting text...`);
    const extraction = await fileExtractor.extractText(
      file.buffer,
      file.originalname,
      file.mimetype
    );

    // Validate extraction
    const validation = fileExtractor.validateExtraction(extraction.text);
    if (!validation.valid) {
      throw new Error(`Text extraction failed: ${validation.error}`);
    }

    // Step 2: Clean text
    logger.info(`[Document ${requestId}] Cleaning text (${extraction.text.length} chars)...`);
    const cleanedText = documentProcessor.cleanText(extraction.text);
    
    if (!cleanedText || cleanedText.trim().length < 50) {
      throw new Error('Extracted text is too short or empty');
    }

    // Step 3: Decide on summarization strategy
    const useDirectSummarization = documentProcessor.shouldUseDirectSummarization(cleanedText);
    let result;

    if (useDirectSummarization) {
      // Small document: direct summarization
      logger.info(`[Document ${requestId}] Using direct summarization (small document)`);
      result = await summarizeDirectly(cleanedText, generateRoadmap, requestId);
    } else {
      // Large document: map-reduce summarization
      logger.info(`[Document ${requestId}] Using map-reduce summarization (large document)`);
      result = await summarizeWithMapReduce(cleanedText, generateRoadmap, requestId);
    }

    // Step 4: Generate roadmap if requested
    if (generateRoadmap && result) {
      logger.info(`[Document ${requestId}] Generating roadmap...`);
      try {
        const roadmap = await generateDocumentRoadmap(cleanedText, result, requestId);
        if (roadmap) {
          result.roadmap = roadmap;
          logger.info(`[Document ${requestId}] Roadmap generated successfully`);
        }
      } catch (roadmapError) {
        logger.warn(`[Document ${requestId}] Roadmap generation failed: ${roadmapError.message}`);
        result.roadmap_error = 'Roadmap generation failed: ' + roadmapError.message;
      }
    }

    // Step 5: Sanitize result
    result = postProcessor.sanitize(result);

    // Add metadata
    result.document_metadata = {
      original_filename: file.originalname,
      file_size: file.size,
      text_length: cleanedText.length,
      processing_time_ms: Date.now() - processStartTime,
      strategy: useDirectSummarization ? 'direct' : 'map-reduce'
    };

    // Update request with results
    await updateRequest('complete', {
      result,
      metrics: {
        duration_ms: Date.now() - processStartTime,
        modelProvider: modelAdapter.getProviderName() || 'unknown',
        extractedChars: cleanedText.length,
        confidence: result.confidence || 0.75,
        has_roadmap: generateRoadmap && result.roadmap ? true : false
      }
    });

    logger.info(`[Document ${requestId}] Processing complete`, {
      duration: Date.now() - processStartTime,
      textLength: cleanedText.length
    });
  } catch (error) {
    logger.error(`Document processing failed for ${requestId}`, error, {
      duration: Date.now() - processStartTime
    });

    await updateRequest('failed', {
      errorMessage: error.message,
      metrics: { duration_ms: Date.now() - processStartTime }
    });
  }
}

/**
 * Direct summarization for small documents
 */
async function summarizeDirectly(text, generateRoadmap, requestId) {
  logger.debug(`[${requestId}] Direct summarization, text length: ${text.length}`);
  
  const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
    'document',
    { isChunk: false },
    text
  );

  const modelResponse = await modelAdapter.callModel(
    systemPrompt,
    userPrompt,
    metadata.maxTokens,
    metadata.stopSequences,
    { requestId, feature: 'document' }
  );

  if (!modelResponse.success) {
    throw new Error(`Model call failed: ${modelResponse.error}`);
  }

  let result = postProcessor.parseJSON(modelResponse.content);
  if (!result) {
    throw new Error('Failed to parse model response as JSON');
  }

  // Validate the schema
  const validation = postProcessor.validateSchema(result, 'document');
  if (!validation.valid) {
    logger.warn(`[${requestId}] Document validation errors:`, validation.errors);
    result = validation.data;
  }

  return result;
}

/**
 * Map-reduce summarization for large documents
 */
async function summarizeWithMapReduce(text, generateRoadmap, requestId) {
  logger.info(`[${requestId}] Starting map-reduce summarization`);
  
  // Step 1: Chunk the document
  const chunks = documentProcessor.chunkDocument(text, 2000, 100);
  logger.info(`[${requestId}] Document chunked into ${chunks.length} parts`);

  // Step 2: Map stage - summarize each chunk
  const chunkResults = [];
  const chunkErrors = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    logger.debug(`[${requestId}] Processing chunk ${i + 1}/${chunks.length} (${chunk.text.length} chars)`);

    try {
      const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
        'document',
        { isChunk: true },
        chunk.text
      );

      const modelResponse = await modelAdapter.callModel(
        systemPrompt,
        userPrompt,
        metadata.maxTokens,
        metadata.stopSequences,
        { requestId, feature: 'document_chunk', chunkIndex: i }
      );

      if (modelResponse.success) {
        const parsed = postProcessor.parseJSON(modelResponse.content);
        if (parsed) {
          chunkResults.push({
            ...parsed,
            chunk_index: i,
            chunk_length: chunk.text.length
          });
        } else {
          chunkErrors.push({ chunk: i, error: 'Failed to parse chunk response' });
        }
      } else {
        chunkErrors.push({ chunk: i, error: modelResponse.error });
      }
    } catch (error) {
      chunkErrors.push({ chunk: i, error: error.message });
      logger.warn(`[${requestId}] Chunk ${i} processing error: ${error.message}`);
    }

    // Small delay to prevent rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Log chunk processing results
  logger.info(`[${requestId}] Chunk processing complete: ${chunkResults.length} succeeded, ${chunkErrors.length} failed`);

  // Step 3: Combine chunk summaries for final processing
  const combinedSummary = combineChunkSummaries(chunkResults);
  
  if (!combinedSummary || combinedSummary.trim().length === 0) {
    throw new Error('All chunk processing failed, cannot generate summary');
  }

  // Step 4: Generate final summary from combined chunk summaries
  logger.info(`[${requestId}] Generating final summary from ${chunkResults.length} chunks`);
  
  const { systemPrompt, userPrompt, metadata } = promptManager.generatePrompt(
    'document',
    { isChunk: false },
    combinedSummary
  );

  const finalResponse = await modelAdapter.callModel(
    systemPrompt,
    userPrompt,
    metadata.maxTokens,
    metadata.stopSequences,
    { requestId, feature: 'document_final' }
  );

  if (!finalResponse.success) {
    throw new Error(`Final summary generation failed: ${finalResponse.error}`);
  }

  let result = postProcessor.parseJSON(finalResponse.content);
  if (!result) {
    // Fallback: create a basic summary from chunks
    logger.warn(`[${requestId}] Final parse failed, using fallback summary`);
    result = createFallbackSummary(chunkResults);
  }

  // Add chunk processing metadata
  result.chunk_processing = {
    total_chunks: chunks.length,
    successful_chunks: chunkResults.length,
    failed_chunks: chunkErrors.length,
    errors: chunkErrors.slice(0, 5) // Limit error details
  };

  return result;
}

/**
 * Combine chunk summaries into a single text
 */
function combineChunkSummaries(chunkResults) {
  if (!chunkResults || chunkResults.length === 0) {
    return '';
  }

  const parts = [];
  
  // Add chunk summaries
  const summaries = chunkResults
    .filter(chunk => chunk.chunk_summary && chunk.chunk_summary.trim())
    .map(chunk => chunk.chunk_summary.trim());
  
  parts.push('## Document Chunk Summaries\n\n' + summaries.join('\n\n'));

  // Add action items
  const allActionItems = chunkResults
    .flatMap(chunk => chunk.chunk_action_items || [])
    .filter(item => item && item.trim())
    .map(item => `- ${item.trim()}`);
  
  if (allActionItems.length > 0) {
    parts.push('## Key Action Items\n\n' + allActionItems.join('\n'));
  }

  // Add keywords
  const allKeywords = chunkResults
    .flatMap(chunk => chunk.chunk_keywords || [])
    .filter(keyword => keyword && keyword.trim())
    .map(keyword => keyword.trim());
  
  const uniqueKeywords = [...new Set(allKeywords)];
  if (uniqueKeywords.length > 0) {
    parts.push('## Keywords\n\n' + uniqueKeywords.join(', '));
  }

  return parts.join('\n\n');
}

/**
 * Create fallback summary when final processing fails
 */
function createFallbackSummary(chunkResults) {
  const summaries = chunkResults
    .filter(chunk => chunk.chunk_summary)
    .map(chunk => chunk.chunk_summary.trim())
    .filter(summary => summary.length > 0);

  const actionItems = chunkResults
    .flatMap(chunk => chunk.chunk_action_items || [])
    .filter(item => item && item.trim());

  const keywords = chunkResults
    .flatMap(chunk => chunk.chunk_keywords || [])
    .filter(keyword => keyword && keyword.trim());

  // Deduplicate keywords
  const uniqueKeywords = [...new Set(keywords)];

  return {
    summary_short: summaries.slice(0, 3).join(' ') || 'Document processed but summary generation failed.',
    highlights: summaries.slice(0, 5),
    action_items: actionItems.slice(0, 7),
    keywords: uniqueKeywords.slice(0, 10),
    is_fallback: true
  };
}

/**
 * Generate roadmap based on document content
 */
async function generateDocumentRoadmap(text, summary, requestId) {
  logger.debug(`[${requestId}] Generating document roadmap`);
  
  // Extract main topics/keywords for roadmap
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
    ['\n}\n', '\n}', '}\n', '}'],
    { requestId, feature: 'document_roadmap' }
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
    logger.warn(`[${requestId}] Roadmap validation errors:`, validation.errors);
  }

  return roadmap;
}

export default router;
