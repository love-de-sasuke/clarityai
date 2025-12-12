/**
 * Document Processor - Handles file extraction, chunking, and map-reduce summarization
 * Per markdown.md section 5: Document processing pipeline
 */

import { chunkText } from '../utils/helpers.js';

class DocumentProcessor {
  /**
   * Clean extracted text: remove headers/footers, normalize whitespace
   */
  cleanText(rawText) {
    let text = rawText;

    // Remove common headers/footers
    text = text.replace(/^Page \d+.*$/gm, ''); // Page numbers
    text = text.replace(/^.*?©.*?$/gm, ''); // Copyright
    
    // Normalize whitespace
    text = text.replace(/\n\n\n+/g, '\n\n'); // Multiple newlines
    text = text.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs
    text = text.trim();

    return text;
  }

  /**
   * Split text into chunks for map-reduce processing
   * Returns array of chunks with metadata
   */
  chunkDocument(text, maxTokens = 2000, overlapTokens = 100) {
    const chunks = chunkText(text, maxTokens, overlapTokens);
    
    return chunks.map((chunk, index) => ({
      chunkIndex: index,
      text: chunk,
      tokenEstimate: Math.ceil(chunk.length / 4),
      startPos: this._calculateStartPos(text, chunk)
    }));
  }

  _calculateStartPos(fullText, chunk) {
    return fullText.indexOf(chunk);
  }

  /**
   * Determine if document is small enough to summarize directly
   */
  shouldUseDirectSummarization(text, tokenThreshold = 2000) {
    const estimatedTokens = Math.ceil(text.length / 4);
    return estimatedTokens < tokenThreshold;
  }

  /**
   * Extract key information from chunk summaries (map stage)
   */
  parseChunkResult(chunkResult) {
    try {
      if (typeof chunkResult === 'string') {
        return JSON.parse(chunkResult);
      }
      return chunkResult;
    } catch (error) {
      return {
        chunk_summary: '',
        chunk_action_items: [],
        chunk_keywords: []
      };
    }
  }

  /**
   * Combine chunk summaries into final document summary (reduce stage)
   */
  reduceChunkSummaries(chunkResults) {
    const combined = {
      summaries: [],
      allActionItems: [],
      allKeywords: [],
      allHighlights: []
    };

    // Parse and combine results
    chunkResults.forEach(result => {
      const parsed = this.parseChunkResult(result);
      
      if (parsed.chunk_summary) {
        combined.summaries.push(parsed.chunk_summary);
      }
      
      if (parsed.chunk_action_items && Array.isArray(parsed.chunk_action_items)) {
        combined.allActionItems.push(...parsed.chunk_action_items);
      }
      
      if (parsed.chunk_keywords && Array.isArray(parsed.chunk_keywords)) {
        combined.allKeywords.push(...parsed.chunk_keywords);
      }

      if (parsed.highlights && Array.isArray(parsed.highlights)) {
        combined.allHighlights.push(...parsed.highlights);
      }
    });

    return {
      summaries: combined.summaries,
      actionItems: this._deduplicateAndLimit(combined.allActionItems, 10),
      keywords: this._deduplicateAndLimit(combined.allKeywords, 15),
      highlights: this._deduplicateAndLimit(combined.allHighlights, 8)
    };
  }

  _deduplicateAndLimit(items, limit) {
    const unique = [...new Set(items.map(item => 
      typeof item === 'string' ? item : JSON.stringify(item)
    ))];
    
    return unique
      .slice(0, limit)
      .map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      });
  }

  /**
   * Create a map prompt for chunk summarization
   */
  createMapPrompt(chunk) {
    return `Summarize the following chunk (<=2000 tokens). Extract action items and keywords.
Return ONLY valid JSON with keys: chunk_summary, chunk_action_items, chunk_keywords.
Chunk:
${chunk}`;
  }

  /**
   * Create a reduce prompt for final summarization
   */
  createReducePrompt(chunkResults, generateRoadmap = false) {
    const resultsStr = chunkResults.map((r, i) => 
      `Chunk ${i}: ${typeof r === 'string' ? r : JSON.stringify(r)}`
    ).join('\n\n');

    let prompt = `Combine the following chunk summaries into a final document summary. Deduplicate action items and create global keywords.
Input summaries:
${resultsStr}

Return JSON with keys: summary_short, highlights, action_items, keywords`;

    if (generateRoadmap) {
      prompt += `, generated_roadmap`;
    }

    return prompt;
  }
}

export default new DocumentProcessor();
