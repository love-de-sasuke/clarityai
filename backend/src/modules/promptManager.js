/**
 * Prompt Manager - Generates prompts based on feature type and user params
 * Per markdown.md section 4: Prompt templates
 */

const SYSTEM_PROMPT = `You are an expert assistant. You MUST return ONLY valid JSON. Do NOT use markdown code blocks, do NOT wrap JSON in backticks, do NOT add any text before or after the JSON. Return ONLY the raw JSON object starting with { and ending with }. Ensure all arrays have commas between elements.`;

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

Return ONLY valid JSON, using these exact keys: summary, examples (array of 3 strings), bullets (array of strings), keywords (array of strings), quiz (array of 5 objects).

Quiz format: [{"q":"question","options":["a","b","c","d"],"answer":0}]

OUTPUT REQUIREMENTS (IMPORTANT):
- DO NOT return any markdown, code blocks or backticks.
- DO NOT add ANY extra text before or after the JSON object.
- START your output with '{' and END your output with '}'.
- ENSURE every array or object uses proper commas between elements.
- Only valid JSON is accepted.`;
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
