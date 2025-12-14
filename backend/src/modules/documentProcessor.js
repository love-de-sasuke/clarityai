/**
 * Document Processor - Handles file extraction, chunking, and map-reduce summarization
 */

import { chunkText } from '../utils/helpers.js';

class DocumentProcessor {
  /**
   * Clean extracted text: remove headers/footers, normalize whitespace
   */
  cleanText(rawText) {
    let text = rawText;

    // Remove common headers/footers
    text = text.replace(/^Page \d+.*$/gm, '');
    text = text.replace(/^.*?©.*?$/gm, '');
    
    // Normalize whitespace
    text = text.replace(/\n\n\n+/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.trim();

    return text;
  }

  /**
   * Split text into chunks for map-reduce processing
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
      typeof item === 'string' ? item.trim() : JSON.stringify(item)
    ))];
    
    return unique
      .slice(0, limit)
      .map(item => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      })
      .filter(item => item && item.toString().trim().length > 0);
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
    const combinedText = this._createCombinedText(chunkResults);
    
    let prompt = `Based on the following combined document summaries, create a comprehensive final summary:

${combinedText}

Return ONLY valid JSON with these exact keys:
- summary_short: string (executive summary, 150-250 words)
- highlights: array of strings (5-10 key highlights)
- action_items: array of strings (5-7 actionable items)
- keywords: array of strings (10-15 key terms)`;

    if (generateRoadmap) {
      prompt += `\n- roadmap: optional learning roadmap based on document content`;
    }

    return prompt;
  }

  _createCombinedText(chunkResults) {
    const summaries = [];
    const actionItems = [];
    const keywords = [];
    
    chunkResults.forEach((result, index) => {
      const parsed = this.parseChunkResult(result);
      
      if (parsed.chunk_summary && parsed.chunk_summary.trim()) {
        summaries.push(`Chunk ${index + 1} Summary: ${parsed.chunk_summary.trim()}`);
      }
      
      if (parsed.chunk_action_items && Array.isArray(parsed.chunk_action_items)) {
        parsed.chunk_action_items.forEach(item => {
          if (item && item.trim()) {
            actionItems.push(item.trim());
          }
        });
      }
      
      if (parsed.chunk_keywords && Array.isArray(parsed.chunk_keywords)) {
        parsed.chunk_keywords.forEach(keyword => {
          if (keyword && keyword.trim()) {
            keywords.push(keyword.trim());
          }
        });
      }
    });
    
    let combined = '';
    if (summaries.length > 0) {
      combined += '## Document Summaries\n\n' + summaries.join('\n\n') + '\n\n';
    }
    
    if (actionItems.length > 0) {
      const uniqueActions = [...new Set(actionItems)];
      combined += '## Action Items\n\n' + uniqueActions.map(item => `- ${item}`).join('\n') + '\n\n';
    }
    
    if (keywords.length > 0) {
      const uniqueKeywords = [...new Set(keywords)];
      combined += '## Keywords\n\n' + uniqueKeywords.join(', ');
    }
    
    return combined || 'No content extracted from document chunks.';
  }
}

export default new DocumentProcessor();
