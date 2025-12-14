/**
 * Prompt Manager - Generates prompts based on feature type and user params
 * Per markdown.md section 4: Prompt templates
 */

const SYSTEM_PROMPT = `You are an expert assistant. You MUST return ONLY valid JSON. 
CRITICAL RULES:
1. NEVER use markdown code blocks (no \`\`\`)
2. NEVER add text before or after JSON
3. ALWAYS start with { and end with }
4. ALWAYS close all arrays and objects properly
5. NEVER truncate or cut off arrays
6. ALWAYS ensure proper commas between array elements
7. If response is too long, shorten content but NEVER break JSON structure
8. Use this EXACT format with NO deviations

Return ONLY a single, valid JSON object. Example format: {"key": "value", "array": ["item1", "item2"]}`;

class PromptManager {
  generatePrompt(featureType, userParams, contextText = '') {
    let userPrompt = '';
    let metadata = {
      maxTokens: 2000,
      stopSequences: ['```', 'Response:', 'Output:', 'Here is'],
      feature: featureType
    };

    switch (featureType) {
      case 'explain':
        userPrompt = this._generateExplainPrompt(userParams);
        metadata.maxTokens = userParams.detailLevel === 'detailed' ? 3000 : 1500;
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
    return `Explain "${topic}" for student and professional audiences at ${detailLevel} detail level.

IMPORTANT: Return ONLY valid JSON with EXACTLY these keys: summary, examples, bullets, keywords, quiz

REQUIRED FORMAT:
{
  "summary": "string (40-200 chars)",
  "examples": ["example1", "example2", "example3"],
  "bullets": ["bullet1", "bullet2", "bullet3", "bullet4"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "quiz": [
    {"q": "question1", "options": ["a", "b", "c", "d"], "answer": 0},
    {"q": "question2", "options": ["a", "b", "c", "d"], "answer": 1},
    {"q": "question3", "options": ["a", "b", "c", "d"], "answer": 2},
    {"q": "question4", "options": ["a", "b", "c", "d"], "answer": 3},
    {"q": "question5", "options": ["a", "b", "c", "d"], "answer": 0}
  ]
}

CRITICAL: NO markdown, NO backticks, NO extra text. Start with {, end with }. Ensure ALL commas between array elements.`;
  }

  _generateRoadmapPrompt(params) {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = params;
    return `Create a ${timeframeWeeks}-week learning roadmap for "${goal}" at ${level} level.

IMPORTANT: Return ONLY valid JSON with EXACTLY these keys: weeks, resources, confidence

REQUIRED FORMAT:
{
  "weeks": [
    {
      "week_number": 1,
      "tasks": ["task1", "task2", "task3"],
      "estimated_hours": 10,
      "milestone": "string describing milestone"
    },
    {
      "week_number": 2,
      "tasks": ["task1", "task2", "task3"],
      "estimated_hours": 12,
      "milestone": "string describing milestone"
    }
  ],
  "resources": [
    {"title": "Resource 1", "url": "https://valid-url.com"},
    {"title": "Resource 2", "url": "https://another-url.com"}
  ],
  "confidence": 0.85
}

CRITICAL RULES:
1. weeks array MUST have ${timeframeWeeks} items (one per week)
2. Each week MUST have week_number, tasks (array), estimated_hours (number), milestone (string)
3. tasks array items MUST be strings separated by commas
4. NO markdown, NO backticks, NO extra text
5. Start with {, end with }
6. Ensure proper commas: ["item1", "item2"] NOT ["item1" "item2"]`;
  }

  _generateRewritePrompt(params) {
    const { text, tone = 'formal' } = params;
    return `Rewrite the following text in ${tone} tone. Provide 3 variations.

Original text: "${text}"

IMPORTANT: Return ONLY valid JSON with EXACTLY these keys: rewrites, subject_suggestions, caption, changes_summary, confidence

REQUIRED FORMAT:
{
  "rewrites": [
    {"tone": "formal", "text": "rewritten text 1"},
    {"tone": "professional", "text": "rewritten text 2"},
    {"tone": "concise", "text": "rewritten text 3"}
  ],
  "subject_suggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "caption": "10-12 word descriptive caption",
  "changes_summary": "brief summary of changes made",
  "confidence": 0.9
}

CRITICAL: NO markdown, NO backticks, NO extra text. Start with {, end with }. Ensure ALL commas between array elements.`;
  }

  _generateDocumentPrompt(params, textChunk) {
    const { isChunk = false } = params;
    
    if (isChunk) {
      return `Summarize this text chunk (MAX 2000 tokens).

Chunk: ${textChunk}

Return ONLY valid JSON with EXACTLY these keys: chunk_summary, chunk_action_items, chunk_keywords

FORMAT:
{
  "chunk_summary": "summary text",
  "chunk_action_items": ["item1", "item2"],
  "chunk_keywords": ["keyword1", "keyword2", "keyword3"]
}

CRITICAL: NO markdown, NO backticks. Start with {, end with }.`;
    } else {
      return `Summarize this document comprehensively.

Document: ${textChunk}

Return ONLY valid JSON with EXACTLY these keys: summary_short, highlights, action_items, keywords

FORMAT:
{
  "summary_short": "short summary (40-100 chars)",
  "highlights": ["highlight1", "highlight2", "highlight3"],
  "action_items": ["action1", "action2", "action3"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4"]
}

CRITICAL: NO markdown, NO backticks. Start with {, end with }.`;
    }
  }
}

export default new PromptManager();
