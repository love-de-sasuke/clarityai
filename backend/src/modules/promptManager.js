/**
 * Prompt Manager - Generates prompts based on feature type and user params
 */

const SYSTEM_PROMPT = `You are ClarityAI, an expert assistant. You MUST return ONLY valid JSON.

CRITICAL RULES:
1. Output MUST be a single, valid JSON object starting with { and ending with }
2. NEVER use markdown code blocks (no \`\`\`json or \`\`\`)
3. NEVER add any text before or after the JSON
4. For "confidence" field, ALWAYS use a NUMBER between 0.0 and 1.0 (NEVER words like "high", "medium", "low")
5. ALWAYS close all JSON structures properly - no truncated arrays or objects
6. If response would exceed token limit, shorten content but NEVER truncate JSON structure
7. Escape all quotes inside strings properly (use \\" for quotes within strings)
8. Use commas correctly between array elements and object properties
9. Ensure all strings have proper opening and closing quotes`;

class PromptManager {
  generatePrompt(featureType, userParams, contextText = '') {
    let userPrompt = '';
    let metadata = {
      maxTokens: 2000,
      stopSequences: ['\n}\n', '\n}', '}\n', '}', '```'],
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
    return `Explain the topic below for both student and professional audiences.

TOPIC: ${topic}
DETAIL LEVEL: ${detailLevel}

RETURN ONLY VALID JSON with these exact fields:
- summary: string (at least 100 characters)
- examples: array of EXACTLY 3 strings
- bullets: array of strings (5-10 bullet points)
- keywords: array of strings (5-10 relevant keywords)
- quiz: array of EXACTLY 5 objects, each with: "q" (question), "options" (array of 4 strings), "answer" (number 0-3)

QUIZ FORMAT EXAMPLE:
[{"q":"What is 2+2?","options":["3","4","5","6"],"answer":1}]

IMPORTANT:
- Do NOT use markdown or code blocks
- Do NOT wrap JSON in backticks
- Start with { and end with }
- If too long, shorten content but keep JSON structure complete`;
  }

  _generateRoadmapPrompt(params) {
    const { goal, timeframeWeeks = 8, level = 'intermediate' } = params;
    return `Create a ${timeframeWeeks}-week learning roadmap for this goal: "${goal}"
EXPERIENCE LEVEL: ${level}

RETURN ONLY VALID JSON with these exact fields:
- weeks: array of objects, each with:
  * week_number: number (1-${timeframeWeeks})
  * tasks: array of 3-5 strings (specific, actionable tasks)
  * estimated_hours: number (total hours for the week)
  * milestone: string (what will be achieved by week's end)
- resources: array of objects, each with:
  * title: string (resource title)
  * url: string (valid URL starting with http:// or https://)
- confidence: NUMBER between 0.0 and 1.0 (NEVER use words like "high", "medium", "low")

EXAMPLE WEEK FORMAT:
{"week_number":1,"tasks":["Learn basics","Practice examples"],"estimated_hours":10,"milestone":"Understand fundamentals"}

IMPORTANT:
- Return ONLY JSON, no other text
- Confidence MUST be a number (e.g., 0.8 not "high")
- Do NOT truncate or cut off any arrays/objects`;
  }

  _generateRewritePrompt(params) {
    const { text, tone = 'formal' } = params;
    return `Rewrite the following text in a ${tone} tone:

ORIGINAL TEXT:
${text}

RETURN ONLY VALID JSON with these exact fields:
- rewrites: array of EXACTLY 3 objects, each with:
  * tone: string (e.g., "formal", "casual", "persuasive")
  * text: string (the rewritten text)
- subject_suggestions: array of 3-5 strings (alternative subject lines/titles)
- caption: string (10-12 word summary caption)
- changes_summary: string (brief summary of changes made)
- confidence: NUMBER between 0.0 and 1.0 (e.g., 0.7, 0.9, NEVER "high" or "medium")

IMPORTANT:
- Return ONLY plain JSON, no markdown
- All 3 rewrites must be in different tones
- Do NOT cut off any text mid-sentence
- Confidence MUST be a decimal number, not a word`;
  }

  _generateDocumentPrompt(params, textChunk) {
    const { isChunk = false } = params;
    
    if (isChunk) {
      return `Summarize the following document chunk:

CHUNK CONTENT:
${textChunk}

RETURN ONLY VALID JSON with these exact fields:
- chunk_summary: string (100-200 word summary)
- chunk_action_items: array of strings (3-5 actionable items)
- chunk_keywords: array of strings (5-10 key terms)

IMPORTANT:
- Return only JSON, no other text
- Start with { and end with }
- Ensure all arrays are properly closed`;
    } else {
      return `Provide a comprehensive summary of this document:

DOCUMENT CONTENT:
${textChunk}

RETURN ONLY VALID JSON with these exact fields:
- summary_short: string (150-250 word executive summary)
- highlights: array of strings (5-10 key highlights)
- action_items: array of strings (5-7 actionable items)
- keywords: array of strings (10-15 key terms)

IMPORTANT:
- Return only JSON, no markdown or code blocks
- Do NOT wrap in backticks
- Start with { and end with }`;
    }
  }
}

export default new PromptManager();
