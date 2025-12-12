/**
 * Prompt Manager - Generates prompts based on feature type and user params
 * Per markdown.md section 4: Prompt templates
 */

const SYSTEM_PROMPT = `You are an expert assistant. Return output in valid JSON only with keys exactly as requested. Do not include extra commentary.`;

class PromptManager {
  generatePrompt(featureType, userParams, contextText = '') {
    let userPrompt = '';
    let metadata = {
      maxTokens: 2000,
      stopSequences: [],
      feature: featureType
    };

    switch (featureType) {
      case 'explain':
        userPrompt = this._generateExplainPrompt(userParams);
        metadata.maxTokens = 1500;
        break;

      case 'roadmap':
        userPrompt = this._generateRoadmapPrompt(userParams);
        metadata.maxTokens = 2500;
        break;

      case 'rewrite':
        userPrompt = this._generateRewritePrompt(userParams);
        metadata.maxTokens = 1800;
        break;

      case 'document':
        userPrompt = this._generateDocumentPrompt(userParams, contextText);
        metadata.maxTokens = 3000;
        break;

      default:
        throw new Error(`Unknown feature type: ${featureType}`);
    }

    return {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      metadata
    };
  }

  _generateExplainPrompt(params) {
    const { topic, detailLevel = 'short' } = params;
    return `Explain the topic below for a student and professional audience.
Topic: ${topic}
Detail level: ${detailLevel}
Return JSON keys: summary, examples, bullets, keywords, quiz.
Format quiz as: [{"q":"question","options":["a","b","c","d"],"answer":0}]`;
  }

  _generateRoadmapPrompt(params) {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = params;
    return `Create a ${timeframeWeeks}-week roadmap for the goal: ${goal} at experience level ${level}.
Return JSON keys: weeks, resources, confidence.
For weeks array, include: week_number, tasks (array), estimated_hours, milestone.
For resources: title and url.
Confidence should be 0.0 to 1.0.`;
  }

  _generateRewritePrompt(params) {
    const { text, tone = 'formal' } = params;
    return `Rewrite the following text in the requested tone: ${tone}. Provide 3 variations, subject suggestions, a 10-12 word caption, and a brief changes_summary. 
Text: ${text}
Return JSON keys: rewrites (array with tone and text), subject_suggestions, caption, changes_summary, confidence.`;
  }

  _generateDocumentPrompt(params, textChunk) {
    const { isChunk = false } = params;
    
    if (isChunk) {
      return `Summarize the following chunk (<=2000 tokens). Return JSON: {"chunk_summary":"...","chunk_action_items":[],"chunk_keywords":[...]}
Chunk:
${textChunk}`;
    } else {
      return `Provide a comprehensive summary of the document. Return JSON: {"summary_short":"...","highlights":[],"action_items":[],"keywords":[...]}
Document:
${textChunk}`;
    }
  }
}

export default new PromptManager();
